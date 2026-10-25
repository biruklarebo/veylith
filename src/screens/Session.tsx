import { useEffect, useRef, useState } from 'react';
import { useNav } from '../nav';
import { findExercise, useStore } from '../store';
import { fmtClock, fmtHMS, fromDisplay, logBest1RM, toDisplay } from '../lib/calc';
import { beep, useNow } from '../lib/alarm';
import { Figure, exerciseHeat } from '../components/BodyMap';
import { ActionSheet, Sheet } from '../components/Sheet';
import { Empty } from '../components/ui';
import type { ExerciseLog, LoggedSet, Session, SetType } from '../types';

export const SET_TYPES: { id: SetType; short: string; label: string; help: string }[] = [
  { id: 'regular', short: '', label: 'Working', help: 'A normal set that counts toward volume and records.' },
  { id: 'warmup', short: 'W', label: 'Warm-up', help: 'Lighter prep set. Not counted in volume or 1RM.' },
  { id: 'drop', short: 'D', label: 'Drop', help: 'Weight reduced right after the previous set, little or no rest.' },
  { id: 'failure', short: 'F', label: 'Failure', help: 'Taken to the point where another rep is not possible.' },
];

const firstOpen = (l: ExerciseLog) => l.sets.findIndex((x) => !x.done);

export function SessionScreen() {
  const nav = useNav();
  const { activeSession: s, updateActive, endSession, records, sessions, customExercises, settings } = useStore();
  const now = useNow();
  const [sel, setSel] = useState<number | null>(null);
  const [restOpen, setRestOpen] = useState(false);
  const [timerBar, setTimerBar] = useState(false);
  const [restRow, setRestRow] = useState<number | null>(null);
  const [typeFor, setTypeFor] = useState<{ set: number; top: number } | null>(null);
  const [typeHelp, setTypeHelp] = useState(false);
  const [repsHelp, setRepsHelp] = useState(false);
  const [more, setMore] = useState(false);
  const [notes, setNotes] = useState(false);
  const [interval, setIntervalOpen] = useState(false);
  const touch = useRef<number | null>(null);

  const idx = s ? Math.min(Math.max(0, s.current ?? 0), Math.max(0, s.logs.length - 1)) : 0;
  useEffect(() => setSel(null), [idx]);

  if (!s) {
    return (
      <div className="page">
        <Empty title="No workout in progress">
          <button className="btn" onClick={nav.pop}>
            Back
          </button>
        </Empty>
      </div>
    );
  }

  const log = s.logs[idx];
  const ex = log && findExercise(log.exerciseId, customExercises);
  const cardio = ex?.recordType === 'cardio';
  const bw = ex?.recordType === 'bodyweight';
  const open = log ? firstOpen(log) : -1;
  const cur = sel ?? open;
  const allDone = !!log && log.sets.length > 0 && open < 0;
  const last = idx === s.logs.length - 1;
  const restLeft = s.rest ? (s.rest.pausedLeft ?? Math.max(0, (s.rest.endsAt - now) / 1000)) : 0;
  const nudgeRest = (d: number) =>
    updateActive((x) =>
      x.rest
        ? {
            ...x,
            rest: {
              ...x.rest,
              endsAt: x.rest.endsAt + d * 1000,
              total: Math.max(1, x.rest.total + d),
              pausedLeft: x.rest.pausedLeft !== undefined ? Math.max(0, x.rest.pausedLeft + d) : undefined,
            },
          }
        : x,
    );
  const togglePause = () =>
    updateActive((x) => {
      if (!x.rest) return x;
      if (x.rest.pausedLeft !== undefined) return { ...x, rest: { ...x.rest, endsAt: Date.now() + x.rest.pausedLeft * 1000, pausedLeft: undefined } };
      return { ...x, rest: { ...x.rest, pausedLeft: Math.max(0, (x.rest.endsAt - Date.now()) / 1000) } };
    });
  const restartRest = () => updateActive((x) => (x.rest ? { ...x, rest: { ...x.rest, endsAt: Date.now() + x.rest.total * 1000, pausedLeft: undefined } } : x));
  const skipRestNow = () => {
    updateActive((x) => ({ ...x, rest: null }));
    setTimerBar(false);
  };

  const go = (i: number) => {
    if (i < 0 || i >= s.logs.length) return;
    updateActive((x) => ({ ...x, current: i }));
  };
  const patchLog = (fn: (l: ExerciseLog) => ExerciseLog, i = idx) =>
    updateActive((x) => ({ ...x, logs: x.logs.map((l, k) => (k === i ? fn(l) : l)) }));
  const patchSet = (j: number, p: Partial<LoggedSet>) => patchLog((l) => ({ ...l, sets: l.sets.map((x, k) => (k === j ? { ...x, ...p } : x)) }));

  const end = () => {
    endSession();
    nav.replace({ kind: 'review' });
  };

  const logSet = (j = cur) => {
    if (!log) return;
    if (j < 0 || j >= log.sets.length) return last ? end() : go(idx + 1);
    const set = log.sets[j];
    const restSec = set.rest ?? log.rest;
    updateActive((x: Session) => {
      const logs = x.logs.map((l, k) => (k === idx ? { ...l, sets: l.sets.map((y, m) => (m === j ? { ...y, done: true } : y)) } : l));
      // Supersets: hop to the partner exercise and rest only after the round.
      const next = logs[idx + 1];
      if (log.supersetId && next?.supersetId === log.supersetId && firstOpen(next) >= 0) return { ...x, logs, current: idx + 1 };
      let current = idx;
      if (log.supersetId) {
        const first = logs.findIndex((l) => l.supersetId === log.supersetId);
        if (first !== idx && firstOpen(logs[first]) >= 0) current = first;
      }
      const resting = !x.skipRest && settings.restTimerOn && restSec > 0;
      return {
        ...x,
        logs,
        current,
        rest: resting ? { endsAt: Date.now() + restSec * 1000, total: restSec, start: restSec, log: idx, set: j } : x.rest,
      };
    });
    setSel(null);
    if (!s.skipRest && settings.restTimerOn && restSec > 0) setRestRow(j);
  };

  const addSet = () =>
    patchLog((l) => ({ ...l, sets: [...l.sets, { ...(l.sets.at(-1) ?? { type: 'regular', weightLbs: 0, reps: 10, rest: l.rest }), done: false }] }));
  const deleteSet = () =>
    patchLog((l) => {
      const j = l.sets.map((x) => x.done).lastIndexOf(false);
      return { ...l, sets: l.sets.filter((_, k) => k !== (j >= 0 ? j : l.sets.length - 1)) };
    });

  const pickExercises = (title: string, fn: (ids: string[]) => void) => nav.push({ kind: 'picker', title, onPick: fn });
  const freshLog = (exerciseId: string, template?: ExerciseLog): ExerciseLog => {
    const prev = sessions.find((x) => x.logs.some((l) => l.exerciseId === exerciseId))?.logs.find((l) => l.exerciseId === exerciseId);
    const n = template?.sets.length ?? 3;
    return {
      exerciseId,
      supersetId: 0,
      rest: template?.rest ?? settings.defaultRest,
      sets: Array.from({ length: n }, (_, k) => ({
        type: template?.sets[k]?.type ?? 'regular',
        weightLbs: prev?.sets[k]?.weightLbs ?? prev?.sets.at(-1)?.weightLbs ?? 0,
        reps: template?.sets[k]?.reps ?? prev?.sets[k]?.reps ?? 10,
        done: false,
      })),
    };
  };
  const addExercises = () =>
    pickExercises('Add to workout', (ids) =>
      useStore.getState().updateActive((x) => ({ ...x, logs: [...x.logs, ...ids.map((id) => freshLog(id))], current: x.logs.length })),
    );
  const swap = () =>
    pickExercises('Replace exercise', (ids) => {
      if (!ids[0]) return;
      useStore.getState().updateActive((x) => ({ ...x, logs: x.logs.map((l, k) => (k === idx ? freshLog(ids[0], l) : l)) }));
    });
  const remove = () =>
    updateActive((x) => ({ ...x, logs: x.logs.filter((_, k) => k !== idx), current: Math.max(0, idx - (idx === x.logs.length - 1 ? 1 : 0)) }));

  const best = Math.max(records[log?.exerciseId ?? '']?.best1RM ?? 0, log ? logBest1RM(log) : 0);
  const tmpl = log?.sets.at(-1);

  return (
    <div
      className="logger"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if ((e.target as HTMLElement).closest('input, .sheet')) return;
        if (dx < -70) go(idx + 1);
        if (dx > 70) go(idx - 1);
      }}
    >
      <section className="lg-hero">
        {ex && <Figure view={[1, 5, 7].includes(ex.bodyPart) ? 'back' : 'front'} heat={exerciseHeat(ex)} fit="meet" className="lg-art" />}
        <div className="lg-top">
          <button className="icon-btn glass" onClick={nav.pop} aria-label="Back to plan">
            ‹
          </button>
          <span className="grow" />
          <button className="icon-btn glass" onClick={() => log && nav.push({ kind: 'exercise', id: log.exerciseId })} aria-label="Exercise history">
            ▥
          </button>
          <button className="icon-btn glass" onClick={swap} disabled={!log} aria-label="Replace exercise">
            ⇄
          </button>
          <button className="icon-btn glass" onClick={() => setMore(true)} aria-label="More">
            •••
          </button>
        </div>
        <div className="lg-clock">
          <span>⏱ {fmtHMS(now - s.start)}</span>
          <span>
            {s.logs.reduce((n, l) => n + l.sets.filter((x) => x.done).length, 0)}/{s.logs.reduce((n, l) => n + l.sets.length, 0)} sets
          </span>
        </div>
        <Segments s={s} idx={idx} onPick={go} />
      </section>

      {!log ? (
        <Empty title="No exercises in this workout">
          <button className="btn primary" onClick={addExercises}>
            + Add exercise
          </button>
        </Empty>
      ) : (
        <>
          <div className="lg-title">
            <h2>{ex?.name ?? 'Exercise'}</h2>
            {!cardio && (
              <span className="lg-1rm">
                1RM: <b>{best ? toDisplay(best, settings).toFixed(2) : '--'}</b>
              </span>
            )}
          </div>
          {log.supersetId > 0 && <p className="ss-note accent small">Superset · alternates with the next exercise</p>}
          <div className="lg-chips">
            <button className={`chip-btn ${s.rest ? 'resting' : ''}`} onClick={() => (s.rest ? setTimerBar((v) => !v) : setRestOpen(true))}>
              ◷ Rest <b className="accent">{s.skipRest ? 'Skipped' : fmtClock(s.rest ? restLeft : (log.sets[Math.max(0, cur)]?.rest ?? log.rest)).padStart(5, '0')}</b>
            </button>
            <button className="chip-btn" onClick={() => setIntervalOpen(true)}>
              ⏲ Interval
            </button>
          </div>

          {timerBar && s.rest && (
            <div className="timer-bar">
              <div className="tb-top">
                <span className="muted">Rest</span>
                <b>{fmtClock(restLeft).padStart(5, '0')}</b>
                <span className="muted">/ {fmtClock(s.rest.total).padStart(5, '0')}</span>
                <span className="grow" />
                <button className="link small" onClick={() => setRestOpen(true)}>
                  Edit
                </button>
              </div>
              <div className="tb-progress">
                <span style={{ width: `${(restLeft / s.rest.total) * 100}%` }} />
              </div>
              <div className="tb-btns">
                <button className="btn small" onClick={() => nudgeRest(-15)}>
                  −15s
                </button>
                <button className="btn small" onClick={togglePause} aria-label={s.rest.pausedLeft !== undefined ? 'Resume timer' : 'Pause timer'}>
                  {s.rest.pausedLeft !== undefined ? '▶' : '❚❚'}
                </button>
                <button className="btn small" onClick={restartRest} aria-label="Restart timer">
                  ↺
                </button>
                <button className="btn small" onClick={() => nudgeRest(15)}>
                  +15s
                </button>
              </div>
              {s.rest.total !== s.rest.start && (
                <button
                  className="link small"
                  onClick={() => {
                    const secs = s.rest!.total;
                    patchLog(
                      (l) => ({ ...l, rest: secs, sets: l.sets.map((x) => (x.done ? x : { ...x, rest: secs })) }),
                      s.rest!.log,
                    );
                    updateActive((x) => (x.rest ? { ...x, rest: { ...x.rest, start: secs } } : x));
                  }}
                >
                  Save {fmtClock(s.rest.total)} to current exercise
                </button>
              )}
            </div>
          )}

          <div className="lg-table" role="table">
            <div className="lg-row head" role="row">
              <span>Set</span>
              <span>{cardio ? 'Min' : bw ? `+${settings.unit === 'kg' ? 'Kg' : 'Lbs'}` : settings.unit === 'kg' ? 'Kg' : 'Lbs'}</span>
              <span>
                {cardio ? 'Dist' : 'Reps'}{' '}
                <button className="info" onClick={() => setRepsHelp(true)} aria-label="About these numbers">
                  ⓘ
                </button>
              </span>
              <span />
            </div>
            {log.sets.map((set, j) => {
              const t = SET_TYPES.find((x) => x.id === set.type)!;
              const state = set.done ? 'logged' : j === cur ? 'current' : 'pending';
              return (
                <div key={j} className={`lg-row ${state}`} role="row" onClick={() => !set.done && setSel(j)}>
                  <button
                    className={`set-tag t-${set.type}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTypeFor({ set: j, top: (e.currentTarget as HTMLElement).getBoundingClientRect().top });
                    }}
                    aria-label={`Set ${j + 1}, ${t.label}. Change set type`}
                  >
                    {t.short || j + 1}
                  </button>
                  {cardio ? (
                    <NumInput value={set.durationSec ? Math.round(set.durationSec / 60) : set.reps} onChange={(v) => patchSet(j, { reps: v, durationSec: v * 60 })} onFocus={() => !set.done && setSel(j)} label="Minutes" />
                  ) : (
                    <NumInput
                      value={toDisplay(set.weightLbs, settings)}
                      decimal
                      onChange={(v) => patchSet(j, { weightLbs: fromDisplay(v, settings) })}
                      onFocus={() => !set.done && setSel(j)}
                      label={`Set ${j + 1} weight`}
                    />
                  )}
                  {cardio ? <span className="muted">—</span> : <NumInput value={set.reps} onChange={(v) => patchSet(j, { reps: v })} onFocus={() => !set.done && setSel(j)} label={`Set ${j + 1} reps`} />}
                  <button
                    className={`tick ${set.done ? 'on' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (set.done) patchSet(j, { done: false });
                      else logSet(j);
                    }}
                    aria-label={set.done ? `Unlog set ${j + 1}` : `Log set ${j + 1}`}
                  >
                    ✓
                  </button>
                </div>
              );
            })}
            <div className="lg-row ghost">
              <button className="set-tag plus" onClick={addSet} aria-label="Add set">
                +
              </button>
              <span>{tmpl && !cardio ? toDisplay(tmpl.weightLbs, settings) : ''}</span>
              <span>{tmpl ? tmpl.reps : ''}</span>
              <button className="del" onClick={deleteSet} disabled={!log.sets.length}>
                Delete
              </button>
            </div>
          </div>
        </>
      )}

      <footer className="lg-foot">
        <button className="icon-btn square" onClick={() => setNotes(true)} aria-label="Workout notes">
          ✎
        </button>
        {s.rest ? (
          <div className="rest-run grow">
            <button className="rest-run-main" onClick={() => setTimerBar((v) => !v)} style={{ ['--p' as string]: restLeft / s.rest.total }}>
              <span>Rest</span>
              <b>{fmtClock(restLeft).padStart(5, '0')}</b>
            </button>
            <button className="rest-run-skip" onClick={skipRestNow}>
              Skip rest
            </button>
          </div>
        ) : (
          <button className="btn primary big grow" onClick={() => logSet()} disabled={!log}>
            {!allDone ? 'Log Set' : last ? 'End Workout' : 'Next Exercise'}
          </button>
        )}
      </footer>

      {typeFor && log && (
        <div className="popover-wrap" onClick={() => setTypeFor(null)}>
          <div className="popover" style={{ top: Math.min(typeFor.top - 10, window.innerHeight - 330) }} onClick={(e) => e.stopPropagation()}>
            <header>
              <b>Set type</b>
              <button className="info" onClick={() => setTypeHelp((v) => !v)} aria-label="About set types">
                ⓘ
              </button>
            </header>
            {SET_TYPES.map((t) => (
              <button
                key={t.id}
                className="pop-item"
                onClick={() => {
                  patchSet(typeFor.set, { type: t.id });
                  setTypeFor(null);
                }}
              >
                <span className={`set-letter t-${t.id}`}>{t.short || typeFor.set + 1}</span>
                <span className="grow">
                  {t.label}
                  {typeHelp && <small className="muted block">{t.help}</small>}
                </span>
                {log.sets[typeFor.set]?.type === t.id && <span>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <Sheet open={restOpen && !!log} onClose={() => setRestOpen(false)} title="Rest timer" sub={ex?.name}>
        {log && (
          <div className="rest-list">
            {log.sets.map((set, j) => {
              const running = s.rest && s.rest.log === idx && s.rest.set === j;
              const secs = set.rest ?? log.rest;
              return (
                <div key={j} className={`rest-row ${restRow === j ? 'sel' : ''}`}>
                  <b>{j + 1}</b>
                  <button className={`rest-box ${running ? 'running' : ''}`} onClick={() => setRestRow(j)} style={running ? { ['--p' as string]: restLeft / s.rest!.total } : undefined}>
                    {fmtClock(running ? restLeft : secs).padStart(5, '0')}
                  </button>
                  <span className={`tick ${set.done ? 'on' : ''}`}>✓</span>
                </div>
              );
            })}
            {restRow !== null && log.sets[restRow] && (
              <div className="row gap center-row">
                {[-15, 15].map((d) => (
                  <button
                    key={d}
                    className="btn small"
                    onClick={() => {
                      const j = restRow;
                      const secs = Math.max(0, (log.sets[j].rest ?? log.rest) + d);
                      updateActive((x) => ({
                        ...x,
                        logs: x.logs.map((l, k) => (k === idx ? { ...l, sets: l.sets.map((y, m) => (m === j ? { ...y, rest: secs } : y)) } : l)),
                        rest: x.rest && x.rest.log === idx && x.rest.set === j ? { ...x.rest, endsAt: x.rest.endsAt + d * 1000, total: Math.max(1, x.rest.total + d), start: Math.max(1, x.rest.total + d) } : x.rest,
                      }));
                    }}
                  >
                    {d > 0 ? '+15s' : '−15s'}
                  </button>
                ))}
                {s.rest && (
                  <button
                    className="btn small primary"
                    onClick={() => {
                      skipRestNow();
                      setRestOpen(false);
                    }}
                  >
                    Skip rest
                  </button>
                )}
              </div>
            )}
            <button
              className="link"
              onClick={() => {
                updateActive((x) => ({ ...x, skipRest: !x.skipRest, rest: x.skipRest ? x.rest : null }));
                setRestOpen(false);
              }}
            >
              {s.skipRest ? 'Turn rest timer back on' : 'Skip rest timer for this workout'}
            </button>
          </div>
        )}
      </Sheet>

      <IntervalSheet open={interval} onClose={() => setIntervalOpen(false)} />

      <Sheet open={notes} onClose={() => setNotes(false)} title="Workout notes">
        <textarea
          className="field"
          rows={5}
          placeholder="How did it feel? Machine settings, cues…"
          value={s.note ?? ''}
          onChange={(e) => updateActive((x) => ({ ...x, note: e.target.value }))}
        />
        <button className="btn primary block" onClick={() => setNotes(false)}>
          Done
        </button>
      </Sheet>

      <Sheet open={repsHelp} onClose={() => setRepsHelp(false)} title="Weights and reps">
        <p className="muted">
          Numbers are prefilled from your last time doing this exercise, or from the plan. Tap any number to change it. The faded row at the
          bottom is what a new set would start with. Warm-up sets don't count toward volume or your 1RM.
        </p>
      </Sheet>

      <ActionSheet
        open={more}
        onClose={() => setMore(false)}
        title={ex?.name}
        actions={[
          { label: 'Add exercise', onClick: addExercises },
          { label: 'Replace exercise', onClick: swap, disabled: !log },
          { label: 'Exercise history', onClick: () => log && nav.push({ kind: 'exercise', id: log.exerciseId }), disabled: !log },
          { label: 'Remove from workout', danger: true, onClick: remove, disabled: !log },
          { label: 'End workout', onClick: end },
        ]}
      />
    </div>
  );
}

function Segments({ s, idx, onPick }: { s: Session; idx: number; onPick: (i: number) => void }) {
  return (
    <div className="segments" role="tablist" aria-label="Exercises">
      {s.logs.map((l, i) => {
        const done = l.sets.length > 0 && l.sets.every((x) => x.done);
        return (
          <button
            key={i}
            role="tab"
            aria-selected={i === idx}
            aria-label={`Exercise ${i + 1}`}
            className={`seg ${i === idx ? 'cur' : done ? 'done' : ''}`}
            onClick={() => onPick(i)}
          />
        );
      })}
    </div>
  );
}

function NumInput({ value, onChange, onFocus, decimal, label }: { value: number; onChange: (v: number) => void; onFocus: () => void; decimal?: boolean; label: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="num"
      inputMode={decimal ? 'decimal' : 'numeric'}
      aria-label={label}
      value={text ?? (Number.isFinite(value) ? String(value) : '')}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => {
        onFocus();
        setText(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value);
        onChange(Number.isNaN(v) ? 0 : decimal ? v : Math.round(v));
      }}
      onBlur={() => setText(null)}
    />
  );
}

// Work/rest interval timer (e.g. for cardio or timed holds).
function IntervalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const now = useNow(250);
  const [work, setWork] = useState(40);
  const [rest, setRest] = useState(20);
  const [rounds, setRounds] = useState(8);
  const [run, setRun] = useState<{ phase: 'work' | 'rest'; round: number; endsAt: number } | null>(null);

  useEffect(() => {
    if (!run || now < run.endsAt) return;
    if (run.phase === 'work' && run.round < rounds) {
      beep(1);
      setRun({ phase: 'rest', round: run.round, endsAt: Date.now() + rest * 1000 });
    } else if (run.phase === 'rest') {
      beep(2);
      setRun({ phase: 'work', round: run.round + 1, endsAt: Date.now() + work * 1000 });
    } else {
      beep(3);
      setRun(null);
    }
  }, [now, run, rest, work, rounds]);

  const stepper = (label: string, v: number, set: (n: number) => void, step: number) => (
    <div className="iv-field">
      <span className="muted small">{label}</span>
      <div className="row gap">
        <button className="btn small" onClick={() => set(Math.max(step, v - step))} aria-label={`Less ${label}`}>
          −
        </button>
        <b>{label === 'Rounds' ? v : fmtClock(v)}</b>
        <button className="btn small" onClick={() => set(v + step)} aria-label={`More ${label}`}>
          +
        </button>
      </div>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Interval timer">
      {run ? (
        <div className={`iv-run ${run.phase}`}>
          <span className="muted">
            Round {run.round}/{rounds}
          </span>
          <b>{fmtClock((run.endsAt - now) / 1000)}</b>
          <span>{run.phase === 'work' ? 'Work' : 'Rest'}</span>
          <button className="btn block" onClick={() => setRun(null)}>
            Stop
          </button>
        </div>
      ) : (
        <>
          <div className="grid3">
            {stepper('Work', work, setWork, 5)}
            {stepper('Rest', rest, setRest, 5)}
            {stepper('Rounds', rounds, setRounds, 1)}
          </div>
          <button className="btn primary block" onClick={() => setRun({ phase: 'work', round: 1, endsAt: Date.now() + work * 1000 })}>
            Start
          </button>
        </>
      )}
    </Sheet>
  );
}

