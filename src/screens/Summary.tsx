import { useState, type ReactNode } from 'react';
import { useNav } from '../nav';
import { doneLogs, findExercise, findPRs, previousLog, useStore, type FinishResult } from '../store';
import { itemForLog, nextTarget } from '../lib/progression';
import { dayKey, fmtHMS, muscleHeat, oneRepMax, ordinal, sessionVolume, toDisplay, volumeComparison, weekStreak } from '../lib/calc';
import { BodyMap, ExerciseThumb } from '../components/BodyMap';
import { ActionSheet, Sheet } from '../components/Sheet';
import { MuscleShares } from './Workouts';
import { SET_TYPES } from './Session';
import { Header } from '../components/ui';
import { RPE_HINTS, RPE_LABELS, type Exercise, type ExerciseLog, type Session, type Settings } from '../types';

function sessionHeat(logs: ExerciseLog[], custom: Exercise[]) {
  return muscleHeat(
    logs.flatMap((l) => {
      const ex = findExercise(l.exerciseId, custom);
      return ex ? [{ bodyPart: ex.bodyPart, secondary: ex.secondary, sets: l.sets.filter((x) => x.done).length }] : [];
    }),
  );
}

const unitLabel = (s: Settings) => (s.unit === 'kg' ? 'kg' : 'lbs');

function ExerciseTables({ logs, onMore, note }: { logs: ExerciseLog[]; onMore?: (i: number) => void; note?: (l: ExerciseLog) => ReactNode }) {
  const nav = useNav();
  const { customExercises, settings } = useStore();
  const u = unitLabel(settings);
  return (
    <ul className="done-list">
      {logs.map((l, i) => {
        const ex = findExercise(l.exerciseId, customExercises);
        const cardio = ex?.recordType === 'cardio';
        return (
          <li key={i}>
            <div className="row gap">
              <button onClick={() => nav.push({ kind: 'exercise', id: l.exerciseId })} aria-label={`${ex?.name} history`}>
                <ExerciseThumb ex={ex} size={64} />
              </button>
              <b className="grow done-name">{ex?.name ?? 'Exercise'}</b>
              {onMore && (
                <button className="icon-btn" onClick={() => onMore(i)} aria-label={`${ex?.name} options`}>
                  •••
                </button>
              )}
            </div>
            <table className="done-table">
              <thead>
                <tr>
                  <th>Set</th>
                  <th>{cardio ? 'Minutes' : 'Weight x reps'}</th>
                  {!cardio && <th className="r">1RM</th>}
                </tr>
              </thead>
              <tbody>
                {l.sets.map((x, j) => {
                  const t = SET_TYPES.find((y) => y.id === x.type)!;
                  return (
                    <tr key={j}>
                      <td className={`t-${x.type}`}>{t.short || j + 1}</td>
                      <td>{cardio ? `${x.reps} min` : `${toDisplay(x.weightLbs, settings)} ${u} x ${x.reps}`}</td>
                      {!cardio && <td className="r">{x.type === 'warmup' || !x.weightLbs ? '—' : `${toDisplay(oneRepMax(x.weightLbs, x.reps), settings).toFixed(2)}${u}`}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {note?.(l)}
          </li>
        );
      })}
    </ul>
  );
}

// "Workout Complete!" — review before saving. The session is still active (with `end` set),
// so going back resumes it.
export function Review() {
  const nav = useNav();
  const { activeSession: s, records, customExercises, settings, updateActive, resumeSession, finishSession, discardSession } = useStore();
  const [rpeOpen, setRpeOpen] = useState(false);
  const [saveOpts, setSaveOpts] = useState(false);
  const [updatePlan, setUpdatePlan] = useState(false);
  const [trash, setTrash] = useState(false);
  const [exMenu, setExMenu] = useState<number | null>(null);

  if (!s) return <Header title="No workout to save" />;
  const logs = doneLogs(s);
  const volume = sessionVolume({ ...s, logs });
  const prs = findPRs(logs, records);
  const heat = sessionHeat(logs, customExercises);
  const { sessions, routines } = useStore.getState();
  const finished: Session = { ...s, logs };

  // Last time vs today, and what the next session will open with (same engine Start uses).
  const compare = (l: ExerciseLog) => {
    const ex = findExercise(l.exerciseId, customExercises);
    if (!ex || ex.recordType === 'cardio') return null;
    const w = (x: number) => toDisplay(x, settings);
    const work = (sets: ExerciseLog['sets']) => sets.filter((x) => x.type !== 'warmup');
    const prev = previousLog(sessions, l.exerciseId, s.start);
    const { item, rule } = itemForLog(l, finished, routines);
    const next = nextTarget(item, [finished, ...sessions], ex, rule, settings);
    const fmt = (sets: { weightLbs: number; reps: number }[]) => {
      const same = sets.every((x) => x.weightLbs === sets[0]?.weightLbs);
      return same && sets.length ? `${w(sets[0].weightLbs)} × ${sets.map((x) => x.reps).join(', ')}` : sets.map((x) => `${w(x.weightLbs)}×${x.reps}`).join(', ');
    };
    const vol = (sets: ExerciseLog['sets']) => work(sets).reduce((a, x) => a + x.weightLbs * x.reps, 0);
    const delta = prev ? vol(l.sets) - vol(prev.log.sets.filter((x) => x.done)) : 0;
    return (
      <div className="cmp">
        {prev && (
          <p>
            <span className="muted">Last time</span> {fmt(work(prev.log.sets.filter((x) => x.done)))}
            {delta !== 0 && <span className={delta > 0 ? 'good' : 'muted'}> {delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(w(delta)))} {unitLabel(settings)} volume</span>}
          </p>
        )}
        {next && (
          <p>
            <span className="muted">Next time</span> <b className="accent">{fmt(next.sets.filter((x) => x.type !== 'warmup'))}</b>
            <small className="muted block">{next.reason}</small>
          </p>
        )}
      </div>
    );
  };

  const back = () => {
    resumeSession();
    nav.replace({ kind: 'session' });
  };

  return (
    <div className="page review">
      <header className="rv-top">
        <button className="icon-btn boxed" onClick={back} aria-label="Back to workout">
          ‹
        </button>
        <span className="grow" />
        <button
          className="btn outline small"
          onClick={() => {
            resumeSession();
            nav.replace({ kind: 'session' });
            nav.push({
              kind: 'picker',
              title: 'Add to workout',
              onPick: (ids) =>
                useStore.getState().updateActive((x) => ({
                  ...x,
                  current: x.logs.length,
                  logs: [
                    ...x.logs,
                    ...ids.map((exerciseId) => ({
                      exerciseId,
                      supersetId: 0,
                      rest: settings.defaultRest,
                      sets: Array.from({ length: 3 }, () => ({ type: 'regular' as const, weightLbs: 0, reps: 10, done: false })),
                    })),
                  ],
                })),
            });
          }}
        >
          ＋ ADD EXERCISE
        </button>
      </header>
      <div className="segments flat">
        {s.logs.map((l, i) => (
          <span key={i} className={`seg ${l.sets.some((x) => x.done) ? 'done' : ''}`} />
        ))}
      </div>

      <div className="row">
        <h1 className="rv-title grow">Workout Complete!</h1>
      </div>
      <div className="rv-name">
        <input value={s.name} onChange={(e) => updateActive((x) => ({ ...x, name: e.target.value }))} aria-label="Workout name" placeholder="Workout name" />
        {s.name && (
          <button className="clear" onClick={() => updateActive((x) => ({ ...x, name: '' }))} aria-label="Clear name">
            ✕
          </button>
        )}
      </div>

      <div className="rv-stats">
        <div>
          <span>Duration</span>
          <b>{fmtHMS((s.end ?? Date.now()) - s.start)}</b>
        </div>
        <div>
          <span>Volume</span>
          <b>
            {Math.round(toDisplay(volume, settings))} {unitLabel(settings)}
          </b>
        </div>
        <div>
          <span>New Record</span>
          <b>{prs.length}</b>
        </div>
        <div>
          <span>Sets</span>
          <b>{logs.reduce((n, l) => n + l.sets.length, 0)}</b>
        </div>
        <div />
        <button onClick={() => setRpeOpen(true)}>
          <span className="accent">RPE</span>
          <b className="accent">{s.rpe !== undefined ? RPE_LABELS[s.rpe] : 'Rate effort'}</b>
        </button>
      </div>

      <BodyMap heat={heat} className="rv-map" />

      <div className="row">
        <h3 className="grow muted-h">{logs.length} Exercises</h3>
      </div>
      {logs.length === 0 ? (
        <p className="muted">No sets were logged, so there's nothing to save yet.</p>
      ) : (
        <ExerciseTables logs={logs} onMore={setExMenu} note={compare} />
      )}

      <div className="rv-foot">
        <button className="save-opts" onClick={() => setSaveOpts((v) => !v)} aria-expanded={saveOpts}>
          <span className="grow">Workout Save Setting</span>
          <span className={`chev-d ${saveOpts ? 'up' : ''}`}>⌄</span>
        </button>
        {saveOpts && (
          <div className="save-body">
            <label className="toggle-row">
              <span className="grow">
                Save workout changes
                <small className="muted block">
                  {s.dayId ? 'Save this session’s weights and reps to your plan.' : 'Only for workouts started from a plan day.'}
                </small>
              </span>
              <input type="checkbox" className="switch" checked={updatePlan} disabled={!s.dayId} onChange={(e) => setUpdatePlan(e.target.checked)} />
            </label>
            <p className="muted small">Sets you didn't log aren't saved.</p>
          </div>
        )}
        <div className="row gap">
          <button className="icon-btn square" onClick={() => setTrash(true)} aria-label="Discard workout">
            🗑
          </button>
          <button
            className="btn primary big grow"
            disabled={!logs.length}
            onClick={() => {
              const result = finishSession({ updatePlan });
              if (result) nav.replace({ kind: 'celebrate', result });
            }}
          >
            Save Workout
          </button>
        </div>
      </div>

      <RpeSheet
        open={rpeOpen}
        value={s.rpe}
        onClose={() => setRpeOpen(false)}
        onSave={(i) => {
          updateActive((x) => ({ ...x, rpe: i }));
          setRpeOpen(false);
        }}
      />
      <ActionSheet
        open={trash}
        onClose={() => setTrash(false)}
        title="Discard this workout? Nothing will be saved."
        actions={[
          {
            label: 'Discard workout',
            danger: true,
            onClick: () => {
              discardSession();
              nav.reset('workout');
            },
          },
        ]}
      />
      <ActionSheet
        open={exMenu !== null}
        onClose={() => setExMenu(null)}
        actions={[
          {
            label: 'Remove from workout',
            danger: true,
            onClick: () => {
              const id = logs[exMenu!]?.exerciseId;
              updateActive((x) => ({ ...x, logs: x.logs.filter((l) => l.exerciseId !== id) }));
            },
          },
        ]}
      />
    </div>
  );
}

function RpeSheet({ open, value, onClose, onSave }: { open: boolean; value?: number; onClose: () => void; onSave: (i: number) => void }) {
  const [v, setV] = useState(value ?? 4);
  return (
    <Sheet open={open} onClose={onClose} title="Rate of Perceived Exertion (RPE)">
      <div className="rpe">
        <b className="rpe-num accent">{v + 1}</b>
        <b className="rpe-label">{RPE_LABELS[v]}</b>
        <p className="muted">{RPE_HINTS[v]}</p>
        <input
          type="range"
          min={0}
          max={9}
          step={1}
          value={v}
          onChange={(e) => setV(+e.target.value)}
          aria-label="Exertion"
          aria-valuetext={`${v + 1}, ${RPE_LABELS[v]}`}
          style={{ ['--p' as string]: v / 9 }}
        />
        <div className="rpe-ends muted small">
          <span>{RPE_LABELS[0]}</span>
          <span>{RPE_LABELS[9]}</span>
        </div>
      </div>
      <button className="btn primary block big" onClick={() => onSave(v)}>
        Save
      </button>
    </Sheet>
  );
}

type CardKind = 'compare' | 'calendar' | 'muscles' | 'list';

export function Celebrate({ result }: { result: FinishResult }) {
  const nav = useNav();
  const { sessions, customExercises, settings } = useStore();
  const s = result.session;
  const [card, setCard] = useState<CardKind>('compare');
  const [picked, setPicked] = useState<CardKind[]>(['compare', 'calendar', 'muscles', 'list']);
  const [shared, setShared] = useState('');
  const volume = sessionVolume(s);
  const cmp = volumeComparison(volume, s.start);
  const heat = sessionHeat(s.logs, customExercises);
  const vol = `${Math.round(toDisplay(volume, settings))} ${unitLabel(settings)}`;

  const share = async () => {
    const lines = [`${s.name} — ${ordinal(result.number)} workout`];
    if (picked.includes('compare')) lines.push(`${vol} lifted, that's like ${cmp.count} ${cmp.name} ${cmp.emoji}`);
    lines.push(`Duration ${fmtHMS(s.end! - s.start)} · ${s.logs.length} exercises · ${result.prs.length} records`);
    if (picked.includes('calendar')) lines.push(`${weekStreak(sessions)}-week streak`);
    if (picked.includes('list'))
      lines.push(...s.logs.map((l) => `• ${findExercise(l.exerciseId, customExercises)?.name} ${l.sets.length}x`));
    const text = lines.join('\n');
    try {
      if (navigator.share) await navigator.share({ title: s.name, text });
      else {
        await navigator.clipboard.writeText(text);
        setShared('Copied to clipboard');
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  const cards: { id: CardKind; node: React.ReactNode }[] = [
    { id: 'compare', node: <CompareCard s={s} vol={vol} cmp={cmp} records={result.prs.length} /> },
    { id: 'calendar', node: <CalendarCard sessions={sessions} /> },
    {
      id: 'muscles',
      node: (
        <div className="share-card pad">
          <p className="muted small">{new Date(s.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          <b className="accent">{s.name}</b>
          <BodyMap heat={heat} />
          <MuscleShares heat={heat} />
        </div>
      ),
    },
    {
      id: 'list',
      node: (
        <div className="share-card pad">
          <b className="accent">{s.name}</b>
          <p className="muted small">
            {fmtHMS(s.end! - s.start)} · {vol}
          </p>
          <ul className="mini-list">
            {s.logs.map((l, i) => (
              <li key={i}>
                <ExerciseThumb ex={findExercise(l.exerciseId, customExercises)} size={28} />
                <span className="grow">{findExercise(l.exerciseId, customExercises)?.name}</span>
                <span className="accent">{l.sets.length}x</span>
              </li>
            ))}
          </ul>
        </div>
      ),
    },
  ];

  return (
    <div className="page celebrate">
      <button className="insight" onClick={() => nav.reset('progress')}>
        <span className="sparkles">✦</span>
        <span className="grow">
          <b>Great job!</b>
          <span className="muted block">See how this workout moved your progress</span>
        </span>
        <span>→</span>
      </button>
      <span className="count-chip">{ordinal(result.number)} workout</span>

      <div className="share-main">{cards.find((c) => c.id === card)!.node}</div>

      <div className="thumbs">
        {cards.map((c) => (
          <div key={c.id} className={`thumb ${card === c.id ? 'on' : ''}`}>
            <button className="thumb-view" onClick={() => setCard(c.id)} aria-label={`Show ${c.id} card`}>
              <div className="thumb-scale">{c.node}</div>
            </button>
            <button
              className={`thumb-check ${picked.includes(c.id) ? 'on' : ''}`}
              onClick={() => setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))}
              aria-label={`Include ${c.id} card when sharing`}
            >
              ✓
            </button>
          </div>
        ))}
      </div>
      {shared && <p className="muted small center">{shared}</p>}

      <div className="row gap cel-foot">
        <button className="btn soft big" onClick={share}>
          Share
        </button>
        <button className="btn primary big grow" onClick={() => nav.reset('workout')}>
          Done
        </button>
      </div>
    </div>
  );
}

function CompareCard({ s, vol, cmp, records }: { s: Session; vol: string; cmp: ReturnType<typeof volumeComparison>; records: number }) {
  return (
    <div className="share-card">
      <div className="cmp-art">
        <span>{cmp.emoji}</span>
      </div>
      <p className="cmp-line">
        <b>{vol}</b> <span className="muted">lifted, that's like</span>
      </p>
      <p className="cmp-big accent">
        {cmp.count} {cmp.name}
      </p>
      <div className="cmp-stats">
        <div>
          <span>Duration</span>
          <b>{fmtHMS(s.end! - s.start)}</b>
        </div>
        <div>
          <span>Exercises</span>
          <b>{s.logs.length}</b>
        </div>
        <div>
          <span>Records</span>
          <b>{records}</b>
        </div>
      </div>
    </div>
  );
}

function CalendarCard({ sessions }: { sessions: Session[] }) {
  const d = new Date();
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const lead = first.getDay();
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const on = new Set(sessions.map((s) => dayKey(s.start)));
  return (
    <div className="share-card pad">
      <p className="muted small">{d.getFullYear()}</p>
      <b className="accent">{d.toLocaleDateString(undefined, { month: 'long' })}</b>
      <div className="dots-cal">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => (
          <span key={i} className="muted small">
            {x}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const k = dayKey(new Date(d.getFullYear(), d.getMonth(), i + 1));
          return <span key={i} className={`dot ${on.has(k) ? 'on' : ''}`}>{on.has(k) ? '✓' : ''}</span>;
        })}
      </div>
      <p className="muted small">
        Current streak <b>{weekStreak(sessions)} weeks</b>
      </p>
    </div>
  );
}

export function HistoryDetail({ id }: { id: string }) {
  const nav = useNav();
  const { sessions, deleteSession, customExercises, settings } = useStore();
  const [del, setDel] = useState(false);
  const s = sessions.find((x) => x.id === id);
  if (!s) return <Header title="Workout not found" />;
  const heat = sessionHeat(s.logs, customExercises);
  return (
    <div className="page review">
      <Header
        title={new Date(s.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
        right={
          <button className="icon-btn danger" aria-label="Delete workout" onClick={() => setDel(true)}>
            🗑
          </button>
        }
      />
      <h1 className="rv-title">{s.name}</h1>
      <div className="rv-stats">
        <div>
          <span>Duration</span>
          <b>{fmtHMS((s.end ?? s.start) - s.start)}</b>
        </div>
        <div>
          <span>Volume</span>
          <b>
            {Math.round(toDisplay(sessionVolume(s), settings))} {unitLabel(settings)}
          </b>
        </div>
        <div>
          <span>RPE</span>
          <b>{s.rpe !== undefined ? RPE_LABELS[s.rpe] : '—'}</b>
        </div>
      </div>
      {s.note && <p className="note">{s.note}</p>}
      <BodyMap heat={heat} className="rv-map" />
      <h3 className="muted-h">{s.logs.length} Exercises</h3>
      <ExerciseTables logs={s.logs} />
      <ActionSheet
        open={del}
        onClose={() => setDel(false)}
        title="Delete this workout log?"
        actions={[
          {
            label: 'Delete',
            danger: true,
            onClick: () => {
              deleteSession(s.id);
              nav.pop();
            },
          },
        ]}
      />
    </div>
  );
}
