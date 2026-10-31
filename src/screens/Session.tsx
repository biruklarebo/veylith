import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNav } from '../nav';
import { findExercise, previousLog, useStore } from '../store';
import { fmtClock, fmtHMS, fromDisplay, logBest1RM, toDisplay } from '../lib/calc';
import { beep, tap, useNow } from '../lib/alarm';
import { RULE_NAME } from '../lib/progression';
import { fmtPlates, loadBar, usesPlates, warmupRamp } from '../lib/plates';
import { EFFORT_LEVELS, effortHue, effortLabel, effortScale, fmtSetsWithEffort } from '../lib/effort';
import { Figure, exerciseHeat } from '../components/BodyMap';
import { ExerciseArt, hasArt } from '../components/ExerciseArt';
import { ActionSheet, Sheet } from '../components/Sheet';
import { Empty, Toast, type ToastMsg } from '../components/ui';
import type { EffortScale, ExerciseLog, LogTarget, LoggedSet, Session, SetType, Settings } from '../types';

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
  const [plateFor, setPlateFor] = useState<number | null>(null);
  const [effortFor, setEffortFor] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [subsOpen, setSubsOpen] = useState(false);
  const [flashRow, setFlashRow] = useState<number | null>(null);
  const [washRow, setWashRow] = useState<number | null>(null);
  const [drag, setDrag] = useState(0);
  const [enterDir, setEnterDir] = useState(0);
  const touch = useRef<{ x: number; y: number; t: number; lock?: 'x' | 'y' } | null>(null);

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
    setEnterDir(i > idx ? 1 : -1);
    updateActive((x) => ({ ...x, current: i }));
  };
  const patchLog = (fn: (l: ExerciseLog) => ExerciseLog, i = idx) =>
    updateActive((x) => ({ ...x, logs: x.logs.map((l, k) => (k === i ? fn(l) : l)) }));
  const patchSet = (j: number, p: Partial<LoggedSet>) => patchLog((l) => ({ ...l, sets: l.sets.map((x, k) => (k === j ? { ...x, ...p } : x)) }));
  // Functional update so a held stepper reads the latest value on every repeat.
  const patchSetFn = (j: number, fn: (x: LoggedSet) => Partial<LoggedSet>) => {
    tap();
    patchLog((l) => ({ ...l, sets: l.sets.map((x, k) => (k === j ? { ...x, ...fn(x) } : x)) }));
  };
  const wStep = fromDisplay(settings.unit === 'kg' ? 2.5 : 5, settings);

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
    setWashRow(j);
    setTimeout(() => setWashRow(null), 700);
    tap();
    if (!s.skipRest && settings.restTimerOn && restSec > 0) setRestRow(j);
  };

  // Swipe actions on a set row: left deletes (with undo), right copies it below.
  const removeSet = (j: number) => {
    const at = idx;
    const before = s.logs[at];
    patchLog((l) => ({ ...l, sets: l.sets.filter((_, k) => k !== j) }), at);
    setSel(null);
    setToast({ id: Date.now(), text: `Set ${j + 1} deleted`, action: 'Undo', onAction: () => patchLog(() => before, at) });
  };
  const copySet = (j: number) => {
    patchLog((l) => ({ ...l, sets: [...l.sets.slice(0, j + 1), { ...l.sets[j], done: false, rir: undefined }, ...l.sets.slice(j + 1)] }));
    setFlashRow(j + 1);
    setTimeout(() => setFlashRow(null), 600);
  };
  const addWarmups = () => {
    if (!log) return;
    const work = log.sets.find((x) => x.type !== 'warmup')?.weightLbs ?? 0;
    const ramp = warmupRamp(work, ex, settings);
    if (!ramp.length) {
      setToast({ id: Date.now(), text: work ? 'Weight is too light for a warm-up ramp' : 'Enter a working weight first' });
      return;
    }
    patchLog((l) => ({ ...l, sets: [...ramp.map((x) => ({ ...x, done: false })), ...l.sets.filter((x) => x.type !== 'warmup' || x.done)] }));
    setToast({ id: Date.now(), text: `Added ${ramp.length} warm-up sets` });
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
  const swapTo = (exerciseId: string) => {
    useStore.getState().updateActive((x) => ({ ...x, logs: x.logs.map((l, k) => (k === idx ? { ...freshLog(exerciseId, l), alternatives: l.alternatives, note: l.note } : l)) }));
    // Remember the pick for imported programs so the next session uses it too.
    const r = useStore.getState().routines.find((x) => x.id === s.routineId);
    const first = log?.alternatives?.[0];
    if (r?.guided && first) {
      const p = useStore.getState().curated.find((x) => x.id === r.guided!.programId);
      const slotKey = p && Object.entries(p.ids).find(([, v]) => v === first)?.[0];
      if (slotKey) useStore.getState().setGuidedChoice(r.id, slotKey, exerciseId);
    }
  };
  const swap = () =>
    log?.alternatives?.length ? setSubsOpen(true) : pickExercises('Replace exercise', (ids) => {
      if (!ids[0]) return;
      useStore.getState().updateActive((x) => ({ ...x, logs: x.logs.map((l, k) => (k === idx ? freshLog(ids[0], l) : l)) }));
    });
  const remove = () =>
    updateActive((x) => ({ ...x, logs: x.logs.filter((_, k) => k !== idx), current: Math.max(0, idx - (idx === x.logs.length - 1 ? 1 : 0)) }));

  const best = Math.max(records[log?.exerciseId ?? '']?.best1RM ?? 0, log ? logBest1RM(log) : 0);
  const tmpl = log?.sets.at(-1);
  const scale = effortScale(settings);
  const prev = log ? previousLog(sessions, log.exerciseId) : null;
  const curSet = log?.sets[Math.max(0, cur)] ?? log?.sets.at(-1);
  const bar = usesPlates(ex) && curSet && curSet.weightLbs > 0 ? loadBar(curSet.weightLbs, settings) : null;

  return (
    <div
      className="logger"
      // Swiping between exercises: the body follows the finger (rubber-band at the ends) and
      // commits past a quarter of the screen or on a quick flick. Set rows own their own swipe.
      onTouchStart={(e) => {
        const t = e.target as HTMLElement;
        touch.current = t.closest('input, .sheet, .lg-row, .stepper-strip, .popover-wrap, .lg-foot') ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
      }}
      onTouchMove={(e) => {
        const st = touch.current;
        if (!st) return;
        const dx = e.touches[0].clientX - st.x;
        const dy = e.touches[0].clientY - st.y;
        if (!st.lock && Math.hypot(dx, dy) > 10) st.lock = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
        if (st.lock !== 'x') return;
        const edge = (dx > 0 && idx === 0) || (dx < 0 && idx === s.logs.length - 1);
        setDrag(edge ? dx * 0.3 : dx);
      }}
      onTouchEnd={(e) => {
        const st = touch.current;
        touch.current = null;
        setDrag(0);
        if (!st || st.lock !== 'x') return;
        const dx = e.changedTouches[0].clientX - st.x;
        const fast = Math.abs(dx) / Math.max(1, Date.now() - st.t) > 0.5 && Math.abs(dx) > 30;
        if (Math.abs(dx) < window.innerWidth * 0.25 && !fast) return;
        go(dx < 0 ? idx + 1 : idx - 1);
      }}
    >
      <section className="lg-hero">
        {ex && hasArt(ex.id) ? (
          <>
            <ExerciseArt exerciseId={ex.id} className="lg-ek" key={ex.id} />
            <Figure view={[1, 5, 7].includes(ex.bodyPart) ? 'back' : 'front'} heat={exerciseHeat(ex)} fit="meet" className="lg-mini" />
          </>
        ) : (
          ex && <Figure view={[1, 5, 7].includes(ex.bodyPart) ? 'back' : 'front'} heat={exerciseHeat(ex)} fit="meet" className="lg-art" />
        )}
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

      <div
        key={idx}
        className={`lg-body ${enterDir > 0 ? 'enter-r' : enterDir < 0 ? 'enter-l' : ''}`}
        style={drag ? { transform: `translateX(${drag}px)`, transition: 'none' } : undefined}
      >
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
          <div className="lg-info">
            {prev && (
              <p className="muted">
                Last time ({new Date(prev.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}):{' '}
                {cardio
                  ? prev.log.sets.filter((x) => x.done).map((x) => `${x.reps} min`).join(', ')
                  : fmtSetsWithEffort(prev.log.sets.filter((x) => x.done && x.type !== 'warmup'), (w) => `${toDisplay(w, settings)}`, scale)}
              </p>
            )}
            {bar && (
              <button className="lg-plates" onClick={() => setPlateFor(Math.max(0, cur))}>
                <PlateIcon /> Bar {bar.bar} · {bar.perSide.length ? `${fmtPlates(bar.perSide)} per side` : 'empty bar'}{bar.left > 0 ? ` (${bar.left} short per side)` : ''}
              </button>
            )}
            {log.target && <TargetLine t={log.target} />}
            {log.note && <p className="lg-note">{log.note}</p>}
          </div>
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

          <div className={`lg-table ${scale !== 'off' && !cardio ? 'with-effort' : ''}`} role="table">
            <div className="lg-row head" role="row">
              <span>Set</span>
              <span>{cardio ? 'Min' : bw ? `+${settings.unit === 'kg' ? 'Kg' : 'Lbs'}` : settings.unit === 'kg' ? 'Kg' : 'Lbs'}</span>
              <span>
                {cardio ? 'Dist' : 'Reps'}{' '}
                <button className="info" onClick={() => setRepsHelp(true)} aria-label="About these numbers">
                  ⓘ
                </button>
              </span>
              {scale !== 'off' && !cardio && <span className="eff-h">{scale.toUpperCase()}</span>}
              <span />
            </div>
            {log.sets.map((set, j) => {
              const t = SET_TYPES.find((x) => x.id === set.type)!;
              const state = set.done ? 'logged' : j === cur ? 'current' : 'pending';
              return (
                <Fragment key={j}>
                <SwipeRow
                  className={`lg-row ${state} ${flashRow === j ? 'flash-copy' : ''} ${washRow === j ? 'wash' : ''}`}
                  onClick={() => !set.done && setSel(j)}
                  onDelete={() => removeSet(j)}
                  onCopy={() => copySet(j)}
                >
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
                  {scale !== 'off' && !cardio && (
                    <button
                      className={`eff-btn ${set.rir !== undefined ? 'set' : ''}`}
                      style={set.rir !== undefined ? { ['--h' as string]: effortHue(set.rir) } : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEffortFor(j);
                      }}
                      aria-label={`Set ${j + 1} effort`}
                    >
                      {set.rir !== undefined ? effortLabel(set.rir, scale) : scale.toUpperCase()}
                    </button>
                  )}
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
                </SwipeRow>
                {j === cur && !set.done && !cardio && (
                  <div className="stepper-strip">
                    <div className="st-group">
                      <HoldButton label={`Less weight, set ${j + 1}`} onStep={() => patchSetFn(j, (x) => ({ weightLbs: Math.max(0, x.weightLbs - wStep) }))}>−</HoldButton>
                      <span className="muted small">{settings.unit}</span>
                      <HoldButton label={`More weight, set ${j + 1}`} onStep={() => patchSetFn(j, (x) => ({ weightLbs: x.weightLbs + wStep }))}>+</HoldButton>
                    </div>
                    <div className="st-group">
                      <HoldButton label={`Fewer reps, set ${j + 1}`} onStep={() => patchSetFn(j, (x) => ({ reps: Math.max(0, x.reps - 1) }))}>−</HoldButton>
                      <span className="muted small">reps</span>
                      <HoldButton label={`More reps, set ${j + 1}`} onStep={() => patchSetFn(j, (x) => ({ reps: x.reps + 1 }))}>+</HoldButton>
                    </div>
                  </div>
                )}
                </Fragment>
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

      </div>

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
          <button className="btn primary big grow log-btn" onClick={() => logSet()} disabled={!log}>
            {!allDone ? 'Log Set' : last ? 'End Workout' : 'Next Exercise'}
            {!allDone && curSet && !cardio && (
              <small>
                Set {Math.max(0, cur) + 1} · {toDisplay(curSet.weightLbs, settings)} {settings.unit} × {curSet.reps}
              </small>
            )}
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

      <PlateSheet open={plateFor !== null} weightLbs={log?.sets[plateFor ?? 0]?.weightLbs ?? 0} settings={settings} onClose={() => setPlateFor(null)} />

      <EffortSheet
        open={effortFor !== null}
        scale={scale}
        value={log?.sets[effortFor ?? 0]?.rir}
        title={effortFor !== null ? `Set ${effortFor + 1}` : undefined}
        onClose={() => setEffortFor(null)}
        onPick={(rir) => {
          patchSet(effortFor!, { rir });
          setEffortFor(null);
        }}
      />

      <ActionSheet
        open={subsOpen}
        onClose={() => setSubsOpen(false)}
        title="Swap for"
        actions={[
          ...(log?.alternatives ?? [])
            .filter((id) => id !== log?.exerciseId)
            .map((id) => ({ label: findExercise(id, customExercises)?.name ?? id, onClick: () => swapTo(id) })),
          { label: 'Search all exercises…', onClick: () => pickExercises('Replace exercise', (ids) => ids[0] && swapTo(ids[0])) },
        ]}
      />

      <Toast msg={toast} onDone={() => setToast(null)} />

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
          Numbers come from your plan's progression rule, or from your last time doing this exercise. Tap any number to change it. The
          faded row at the bottom is what a new set would start with. Warm-up sets don't count toward volume or your 1RM. Swipe a set left to
          delete it or right to copy it.
        </p>
      </Sheet>

      <ActionSheet
        open={more}
        onClose={() => setMore(false)}
        title={ex?.name}
        actions={[
          { label: 'Add exercise', onClick: addExercises },
          { label: 'Add warm-up sets', onClick: addWarmups, disabled: !log || cardio },
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
  // A stepper can change the value while this field is focused: show the new number.
  useEffect(() => setText((t) => (t !== null && parseFloat(t) !== value ? String(value) : t)), [value]);
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


const KIND_ICON: Record<LogTarget['kind'], string> = { first: '•', up: '↑', reps: '↗', set: '＋', hold: '→', deload: '↓' };

function TargetLine({ t }: { t: LogTarget }) {
  return (
    <p className={`lg-target k-${t.kind}`}>
      <span aria-hidden>{KIND_ICON[t.kind]}</span> <b>{RULE_NAME[t.rule]} progression</b> · {t.reason}
    </p>
  );
}

function PlateIcon() {
  return (
    <svg viewBox="0 0 24 12" width="22" height="11" aria-hidden className="plate-ico">
      <rect x="0" y="5" width="24" height="2" rx="1" />
      <rect x="4" y="1" width="3" height="10" rx="1" />
      <rect x="17" y="1" width="3" height="10" rx="1" />
    </svg>
  );
}

const PLATE_HUE: Record<number, number> = { 45: 4, 25: 4, 35: 45, 20: 215, 15: 45, 10: 140, 5: 0, 2.5: 0, 1.25: 0 };

function PlateSheet({ open, weightLbs, settings, onClose }: { open: boolean; weightLbs: number; settings: Settings; onClose: () => void }) {
  const r = loadBar(weightLbs, settings);
  const biggest = r ? Math.max(1, ...r.perSide) : 1;
  return (
    <Sheet open={open} onClose={onClose} title={`${toDisplay(weightLbs, settings)} ${settings.unit}`} sub="Plates on each side">
      {!r ? (
        <p className="muted">Lighter than the bar ({settings.unit === 'kg' ? '20 kg' : '45 lb'}).</p>
      ) : (
        <>
          <svg className="plate-art" viewBox="0 0 300 120" role="img" aria-label={`${fmtPlates(r.perSide)} per side`}>
            <rect x="0" y="54" width="300" height="12" rx="4" className="pa-bar" />
            <rect x="96" y="44" width="10" height="32" rx="2" className="pa-collar" />
            {r.perSide.reduce<{ x: number; el: ReactNode[] }>(
              (acc, p, i) => {
                const h = 30 + 80 * (p / biggest);
                const w = p >= 10 ? 16 : 10;
                acc.el.push(
                  <rect
                    key={i}
                    x={acc.x}
                    y={60 - h / 2}
                    width={w}
                    height={h}
                    rx="3"
                    className="pa-plate"
                    style={{ ['--h' as string]: PLATE_HUE[p] ?? 200, animationDelay: `${i * 40}ms` }}
                  />,
                );
                return { x: acc.x + w + 2, el: acc.el };
              },
              { x: 108, el: [] },
            ).el}
          </svg>
          <p className="center">
            <b>{r.bar}</b> bar + <b>{fmtPlates(r.perSide)}</b> per side
          </p>
          {r.left > 0 && <p className="muted small center">{r.left} {settings.unit} per side can't be made with your plates.</p>}
          <p className="muted small center">Change the bar and plates you own in Settings.</p>
        </>
      )}
    </Sheet>
  );
}

function EffortSheet({ open, scale, value, title, onClose, onPick }: { open: boolean; scale: EffortScale; value?: number; title?: string; onClose: () => void; onPick: (rir: number | undefined) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={scale === 'rpe' ? 'Rate of perceived exertion' : 'Reps in reserve'} sub={title}>
      <div className="eff-list">
        {EFFORT_LEVELS.map((l) => (
          <button key={l.rir} className={`eff-item ${value === l.rir ? 'on' : ''}`} onClick={() => onPick(l.rir)}>
            <span className="eff-badge" style={{ ['--h' as string]: effortHue(l.rir) }}>
              {effortLabel(l.rir, scale)}
            </span>
            <span className="grow">{l.line}</span>
          </button>
        ))}
        {value !== undefined && (
          <button className="link" onClick={() => onPick(undefined)}>
            Clear
          </button>
        )}
      </div>
    </Sheet>
  );
}

// A row that follows a horizontal drag: past the threshold, left deletes and right copies.
function SwipeRow({ className, onClick, onDelete, onCopy, children }: { className: string; onClick: () => void; onDelete: () => void; onCopy: () => void; children: ReactNode }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; lock?: 'x' | 'y' } | null>(null);
  const LIMIT = 84;
  return (
    <div className="swipe" data-dir={dx > 0 ? 'copy' : dx < 0 ? 'del' : undefined}>
      <div className="swipe-under" aria-hidden>
        <span className={dx > LIMIT ? 'armed' : ''}>⧉ Copy</span>
        <span className={dx < -LIMIT ? 'armed' : ''}>Delete ✕</span>
      </div>
      <div
        className={className}
        role="row"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dragging ? 'none' : undefined }}
        onClick={onClick}
        onTouchStart={(e) => {
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchMove={(e) => {
          const st = start.current;
          if (!st) return;
          const mx = e.touches[0].clientX - st.x;
          const my = e.touches[0].clientY - st.y;
          if (!st.lock && Math.hypot(mx, my) > 10) st.lock = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
          if (st.lock !== 'x' || (e.target as HTMLElement).closest('input:focus')) return;
          setDragging(true);
          setDx(Math.max(-130, Math.min(130, mx)));
        }}
        onTouchEnd={() => {
          const d = dx;
          start.current = null;
          setDragging(false);
          setDx(0);
          if (d < -LIMIT) {
            tap();
            onDelete();
          } else if (d > LIMIT) {
            tap();
            onCopy();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Tap to step once; hold to repeat, speeding up after a moment.
function HoldButton({ onStep, label, children }: { onStep: () => void; label: string; children: ReactNode }) {
  const timer = useRef<number | null>(null);
  const step = useRef(onStep);
  step.current = onStep;
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const run = (delay: number, n: number) => {
    timer.current = window.setTimeout(() => {
      step.current();
      run(n > 6 ? 60 : 120, n + 1);
    }, delay);
  };
  return (
    <button
      className="st-btn"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        step.current();
        run(450, 0);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && step.current()}
    >
      {children}
    </button>
  );
}
