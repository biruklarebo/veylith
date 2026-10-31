import { useEffect, useState, type ReactNode } from 'react';
import { useNav } from '../nav';
import { doneLogs, findExercise, findPRs, previousLog, useStore, type FinishResult } from '../store';
import { itemForLog, nextTarget } from '../lib/progression';
import { fmtHMS, muscleHeat, oneRepMax, ordinal, sessionVolume, toDisplay, volumeComparison, weekStreak } from '../lib/calc';
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

// Counts up to `to` once on mount (instant under reduced motion).
function useCountUp(to: number, ms = 700) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setV(to);
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(to * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return v;
}

function CountTile({ label, value, fmt, delay }: { label: string; value: number; fmt: (n: number) => string; delay: number }) {
  const v = useCountUp(value);
  return (
    <div className="done-tile" style={{ animationDelay: `${delay}ms` }}>
      <b>{fmt(v)}</b>
      <span>{label}</span>
    </div>
  );
}

const CONFETTI = Array.from({ length: 22 }, (_, i) => ({
  x: (i * 37) % 100,
  d: (i % 7) * 70,
  r: (i * 53) % 360,
  c: ['var(--accent)', 'var(--good)', 'var(--info)', 'var(--warn)', '#fff'][i % 5],
}));

// Draws a shareable summary image (no external assets) and hands it to the share sheet,
// or downloads it when sharing files isn't supported.
async function shareImage(opts: { title: string; sub: string; stats: [string, string][]; footer: string }) {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#ff8a3d';
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#16224a');
  bg.addColorStop(1, '#070b18');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.035)';
  g.lineWidth = 18;
  for (let x = -H; x < W; x += 60) {
    g.beginPath();
    g.moveTo(x, H);
    g.lineTo(x + H, 0);
    g.stroke();
  }
  g.fillStyle = accent;
  g.beginPath();
  g.arc(140, 170, 56, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1a0e05';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(112, 172);
  g.lineTo(134, 194);
  g.lineTo(170, 150);
  g.stroke();
  g.fillStyle = '#fff';
  g.font = '800 84px system-ui, -apple-system, sans-serif';
  g.fillText(opts.title, 84, 340, W - 168);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.font = '500 40px system-ui, -apple-system, sans-serif';
  g.fillText(opts.sub, 84, 405, W - 168);
  opts.stats.forEach(([label, value], i) => {
    const x = 84 + (i % 2) * 468;
    const y = 520 + Math.floor(i / 2) * 260;
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.beginPath();
    g.roundRect(x, y, 444, 220, 36);
    g.fill();
    g.fillStyle = '#fff';
    g.font = '800 88px system-ui, -apple-system, sans-serif';
    g.fillText(value, x + 36, y + 120, 380);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = '600 34px system-ui, -apple-system, sans-serif';
    g.fillText(label, x + 36, y + 178);
  });
  g.fillStyle = accent;
  g.font = '700 40px system-ui, -apple-system, sans-serif';
  g.fillText(opts.footer, 84, H - 150, W - 168);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.font = '800 36px system-ui, -apple-system, sans-serif';
  g.fillText('VEYLITH', 84, H - 84);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) return 'failed';
  const file = new File([blob], 'veylith-workout.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: opts.title });
      return 'shared';
    } catch {
      return 'dismissed';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'downloaded';
}

export function Celebrate({ result }: { result: FinishResult }) {
  const nav = useNav();
  const { sessions, customExercises, settings } = useStore();
  const [note, setNote] = useState('');
  const s = result.session;
  const volume = sessionVolume(s);
  const sets = s.logs.reduce((n, l) => n + l.sets.length, 0);
  const reps = s.logs.reduce((n, l) => n + l.sets.reduce((a, x) => a + x.reps, 0), 0);
  const minutes = Math.max(1, Math.round((s.end! - s.start) / 60000));
  const cmp = volumeComparison(volume, s.start);
  const heat = sessionHeat(s.logs, customExercises);
  const u = unitLabel(settings);
  const streak = weekStreak(sessions);
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const thisWeek = new Set(sessions.filter((x) => x.start >= monday.getTime()).map((x) => (new Date(x.start).getDay() + 6) % 7));
  const lifted = volume > 0;

  const share = async () => {
    const r = await shareImage({
      title: s.name,
      sub: `${ordinal(result.number)} workout · ${new Date(s.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`,
      stats: [
        ['minutes', String(minutes)],
        ['sets', String(sets)],
        lifted ? [`${u} lifted`, Math.round(toDisplay(volume, settings)).toLocaleString()] : ['reps', String(reps)],
        ['new records', String(result.prs.length)],
      ],
      footer: streak > 1 ? `${streak}-week streak` : lifted && cmp.count >= 1 ? `That's about ${Math.round(cmp.count)} ${cmp.name.toLowerCase()} ${cmp.emoji}` : 'Showed up. That counts.',
    });
    if (r === 'downloaded') setNote('Image saved to your downloads');
    if (r === 'failed') setNote("Couldn't create the image");
  };

  return (
    <div className="page done">
      <section className="done-hero">
        <div className="confetti" aria-hidden>
          {CONFETTI.map((p, i) => (
            <i key={i} style={{ left: `${p.x}%`, animationDelay: `${p.d}ms`, background: p.c, ['--r' as string]: `${p.r}deg` }} />
          ))}
        </div>
        <svg viewBox="0 0 100 100" className="done-ring" aria-hidden>
          <circle cx="50" cy="50" r="44" className="ring-bg" />
          <circle cx="50" cy="50" r="44" className="ring-fg" />
          <path d="M33 51l11 11 23-25" className="ring-check" />
        </svg>
        <span className="eyebrow">{ordinal(result.number)} workout</span>
        <h1>{s.name}</h1>
        <p className="muted">
          {new Date(s.start).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · {minutes} min
        </p>
      </section>

      <div className="done-tiles">
        <CountTile label="minutes" value={minutes} fmt={(n) => String(Math.round(n))} delay={0} />
        <CountTile label="sets" value={sets} fmt={(n) => String(Math.round(n))} delay={60} />
        {lifted ? (
          <CountTile label={`${u} lifted`} value={toDisplay(volume, settings)} fmt={(n) => Math.round(n).toLocaleString()} delay={120} />
        ) : (
          <CountTile label="reps" value={reps} fmt={(n) => String(Math.round(n))} delay={120} />
        )}
        <CountTile label="new records" value={result.prs.length} fmt={(n) => String(Math.round(n))} delay={180} />
      </div>

      {lifted && cmp.count >= 1 && (
        <p className="done-fun">
          <span aria-hidden>{cmp.emoji}</span> That's about <b>{Math.round(cmp.count)}</b> {cmp.name.toLowerCase()}
        </p>
      )}

      {result.prs.length > 0 && (
        <section className="card done-prs">
          <h3>New records</h3>
          {result.prs.map((p) => (
            <div key={p.exerciseId} className="row gap">
              <span className="pr-medal" aria-hidden>
                ★
              </span>
              <span className="grow">{findExercise(p.exerciseId, customExercises)?.name}</span>
              <span className="muted small">{toDisplay(p.previous, settings)} →</span>
              <b className="accent">
                {toDisplay(p.oneRm, settings)} {u}
              </b>
            </div>
          ))}
          <small className="muted">Estimated one-rep max</small>
        </section>
      )}

      <section className="card done-muscles">
        <h3>Muscles worked</h3>
        <div className="row gap">
          <BodyMap heat={heat} className="done-map" />
          <div className="grow">
            <MuscleShares heat={heat} />
          </div>
        </div>
      </section>

      <section className="card done-week">
        <div className="row">
          <h3 className="grow">This week</h3>
          {streak > 0 && <span className="streak-chip">🔥 {streak} week{streak > 1 ? 's' : ''}</span>}
        </div>
        <div className="done-days">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i} className={thisWeek.has(i) ? 'on' : ''} style={{ animationDelay: `${300 + i * 40}ms` }}>
              {thisWeek.has(i) ? '✓' : d}
            </span>
          ))}
        </div>
      </section>

      {note && <p className="muted small center">{note}</p>}

      <div className="done-foot">
        <button className="btn outline big" onClick={share}>
          Share
        </button>
        <button className="btn primary big grow" onClick={() => nav.reset('workout')}>
          Done
        </button>
      </div>
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
