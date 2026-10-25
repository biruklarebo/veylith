import { useState } from 'react';
import { useNav, useUI } from '../nav';
import { findExercise, useExercises, useStore } from '../store';
import { estDaySeconds, fmtEst, muscleHeat, timeAgo, uid } from '../lib/calc';
import { useDragReorder } from '../lib/useDragReorder';
import { BodyMap, ExerciseThumb, MuscleThumb } from '../components/BodyMap';
import { ActionSheet, Sheet, type Action } from '../components/Sheet';
import { Empty } from '../components/ui';
import { FindHome } from './Find';
import { BODY_PARTS, EQUIPMENT, WEEKDAYS, type DayItem, type Equipment, type Exercise, type Routine, type WorkoutDay } from '../types';


function dayHeat(day: WorkoutDay, custom: Exercise[]) {
  return muscleHeat(
    day.items.flatMap((it) => {
      const ex = findExercise(it.exerciseId, custom);
      return ex ? [{ bodyPart: ex.bodyPart, secondary: ex.secondary, sets: it.sets.length }] : [];
    }),
  );
}

const repsSummary = (it: DayItem) => {
  const reps = it.sets.map((s) => s.reps);
  return `${it.sets.length} × ${reps.every((r) => r === reps[0]) ? reps[0] : reps.join(',')} reps`;
};

// Start a day, replacing any other workout in progress after confirmation.
export function useStartDay() {
  const nav = useNav();
  const { activeSession, startSession } = useStore();
  const [pending, setPending] = useState<{ routineId: string; dayId: string } | null>(null);
  const go = (routineId: string, dayId: string) => {
    startSession(routineId, dayId);
    nav.push({ kind: 'session' });
  };
  const start = (routineId: string, dayId: string) => {
    if (activeSession?.dayId === dayId) return nav.push({ kind: activeSession.end ? 'review' : 'session' });
    if (activeSession) return setPending({ routineId, dayId });
    go(routineId, dayId);
  };
  const confirm = (
    <ActionSheet
      open={!!pending}
      onClose={() => setPending(null)}
      title="Another workout is in progress"
      actions={[{ label: 'Discard it and start this day', danger: true, onClick: () => pending && go(pending.routineId, pending.dayId) }]}
    />
  );
  return { start, confirm };
}

export function Workouts() {
  const { workoutTab, set } = useUI();
  return (
    <div className="wk">
      <nav className="seg-top">
        {(['find', 'planned', 'instant'] as const).map((t) => (
          <button key={t} className={workoutTab === t ? 'on' : ''} onClick={() => set({ workoutTab: t })}>
            {t === 'find' ? 'Find' : t === 'planned' ? 'Planned' : 'Instant'}
            {t === 'instant' && <span className="sparkle">✦</span>}
          </button>
        ))}
      </nav>
      {workoutTab === 'find' && <FindHome />}
      {workoutTab === 'planned' && <Planned />}
      {workoutTab === 'instant' && <Instant />}
    </div>
  );
}

function Planned() {
  const nav = useNav();
  const ui = useUI();
  const { routines, activeRoutineId, saveRoutine, deleteRoutine, customExercises } = useStore();
  const [menu, setMenu] = useState(false);
  const r = routines.find((x) => x.id === activeRoutineId);

  if (!r)
    return (
      <Empty title="No plan selected">
        <p className="muted small">Pick a plan or build your own.</p>
        <button className="btn primary" onClick={() => ui.set({ workoutTab: 'find' })}>
          Find a plan
        </button>
      </Empty>
    );

  const heat = muscleHeat(
    r.days.flatMap((d) =>
      d.items.flatMap((it) => {
        const ex = findExercise(it.exerciseId, customExercises);
        return ex ? [{ bodyPart: ex.bodyPart, secondary: ex.secondary, sets: it.sets.length }] : [];
      }),
    ),
  );

  const planActions: Action[] = [
    { label: 'Edit plan details', onClick: () => nav.push({ kind: 'routine', id: r.id }) },
    {
      label: 'Duplicate plan',
      onClick: () => saveRoutine({ ...r, id: uid(), name: `${r.name} (copy)`, days: r.days.map((d) => ({ ...d, id: uid() })) }),
    },
    { label: 'Delete plan', danger: true, onClick: () => deleteRoutine(r.id) },
  ];

  return (
    <>
      {!ui.heroCollapsed && (
        <section className="plan-hero">
          <BodyMap heat={heat} className="plan-hero-art" />
          <button className="icon-btn hero-more" onClick={() => setMenu(true)} aria-label="Plan options">
            •••
          </button>
          <h1>{r.name}</h1>
          <button className="btn glass" onClick={() => ui.set({ workoutTab: 'find' })}>
            All Plans
          </button>
        </section>
      )}
      <div className="plan-tabs">
        <button className={ui.planTab === 'overview' ? 'on' : ''} onClick={() => ui.set({ planTab: 'overview' })}>
          <span className="lines" aria-hidden>
            ≡
          </span>{' '}
          Overview
        </button>
        <button className={ui.planTab === 'details' ? 'on' : ''} onClick={() => ui.set({ planTab: 'details' })}>
          Day Details
        </button>
        <button
          className={`icon-btn collapse ${ui.heroCollapsed ? 'down' : ''}`}
          onClick={() => ui.set({ heroCollapsed: !ui.heroCollapsed })}
          aria-label={ui.heroCollapsed ? 'Show plan banner' : 'Hide plan banner'}
        >
          ︽
        </button>
      </div>
      {ui.planTab === 'overview' ? <Overview r={r} /> : <DayDetails r={r} />}
      <ActionSheet open={menu} onClose={() => setMenu(false)} title={r.name} actions={planActions} />
    </>
  );
}

function DayMenu({ r, day, open, onClose, onStart }: { r: Routine; day: WorkoutDay; open: boolean; onClose: () => void; onStart: () => void }) {
  const nav = useNav();
  const { saveRoutine, updateDay } = useStore();
  const [weekday, setWeekday] = useState(false);
  return (
    <>
      <ActionSheet
        open={open}
        onClose={onClose}
        title={day.name}
        actions={[
          { label: 'Start workout', onClick: onStart, disabled: !day.items.length },
          { label: 'Edit exercises & sets', onClick: () => nav.push({ kind: 'day', routineId: r.id, dayId: day.id }) },
          { label: 'Assign weekday', onClick: () => setWeekday(true) },
          {
            label: 'Duplicate day',
            onClick: () => {
              const i = r.days.findIndex((d) => d.id === day.id);
              const copy = { ...day, id: uid(), name: `${day.name} (copy)`, items: day.items.map((it) => ({ ...it, id: uid() })) };
              saveRoutine({ ...r, days: [...r.days.slice(0, i + 1), copy, ...r.days.slice(i + 1)] });
            },
          },
          { label: 'Delete day', danger: true, onClick: () => saveRoutine({ ...r, days: r.days.filter((d) => d.id !== day.id) }) },
        ]}
      />
      <Sheet open={weekday} onClose={() => setWeekday(false)} title="Train this day on">
        <div className="weekday-pick">
          {[undefined, 0, 1, 2, 3, 4, 5, 6].map((w) => (
            <button
              key={w ?? 'any'}
              className={`chip ${day.weekday === w ? 'on' : ''}`}
              onClick={() => {
                updateDay(r.id, { ...day, weekday: w });
                setWeekday(false);
              }}
            >
              {w === undefined ? 'Any' : WEEKDAYS[w]}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

function Overview({ r }: { r: Routine }) {
  const nav = useNav();
  const ui = useUI();
  const { sessions, activeSession, customExercises, saveRoutine, moveDay } = useStore();
  const { start, confirm } = useStartDay();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const drag = useDragReorder(r.days.length, (a, b) => moveDay(r.id, a, b));

  const addDay = () => {
    const day: WorkoutDay = { id: uid(), name: `Day ${r.days.length + 1}`, items: [] };
    saveRoutine({ ...r, days: [...r.days, day] });
    nav.push({ kind: 'day', routineId: r.id, dayId: day.id });
  };

  return (
    <div className="day-list">
      {r.days.map((d, i) => {
        const last = sessions.find((s) => s.dayId === d.id);
        const live = activeSession?.dayId === d.id;
        return (
          <div key={d.id} data-drag-row className={`day-card ${live ? 'live' : ''}`} style={drag.style(i)}>
            <span className="handle" onPointerDown={drag.start(i)} aria-label="Drag to reorder">
              ⠿
            </span>
            <button className="day-main" onClick={() => ui.set({ planTab: 'details', dayId: d.id })}>
              <MuscleThumb heat={dayHeat(d, customExercises)} />
              <div className="grow">
                <span className="wd-badge">{d.weekday === undefined ? 'Any' : WEEKDAYS[d.weekday]}</span>
                <b className="day-name">{d.name}</b>
                <p className="muted">
                  Est. {fmtEst(estDaySeconds(d))}, {d.items.length} exercises
                </p>
              </div>
            </button>
            <button className="icon-btn card-more" onClick={() => setMenuFor(d.id)} aria-label={`${d.name} options`}>
              •••
            </button>
            <span className={`day-when ${live ? 'accent' : 'muted'}`}>{live ? 'In progress' : last ? timeAgo(last.start) : 'New'}</span>
            <DayMenu r={r} day={d} open={menuFor === d.id} onClose={() => setMenuFor(null)} onStart={() => start(r.id, d.id)} />
          </div>
        );
      })}
      <button className="add-day" onClick={addDay}>
        <span>＋</span> Add a day
      </button>
      {confirm}
    </div>
  );
}

function DayDetails({ r }: { r: Routine }) {
  const nav = useNav();
  const ui = useUI();
  const { activeSession, customExercises, updateDay, updateActive } = useStore();
  const { start, confirm } = useStartDay();
  const [menu, setMenu] = useState(false);
  const [muscles, setMuscles] = useState(false);
  const day = r.days.find((d) => d.id === ui.dayId) ?? r.days.find((d) => d.id === activeSession?.dayId) ?? r.days[0];
  const drag = useDragReorder(day?.items.length ?? 0, (a, b) => {
    const items = [...day.items];
    items.splice(b, 0, ...items.splice(a, 1));
    updateDay(r.id, { ...day, items });
  });

  if (!day) return <Empty title="This plan has no days yet" />;
  const live = activeSession?.dayId === day.id;
  const heat = dayHeat(day, customExercises);

  const openItem = (it: DayItem) => {
    if (live) {
      const idx = activeSession!.logs.findIndex((l) => l.exerciseId === it.exerciseId);
      if (idx >= 0) {
        updateActive((s) => ({ ...s, current: idx }));
        return nav.push({ kind: activeSession!.end ? 'review' : 'session' });
      }
    }
    nav.push({ kind: 'exercise', id: it.exerciseId });
  };

  return (
    <>
      {r.days.length > 1 && (
        <div className="chips day-chips">
          {r.days.map((d) => (
            <button key={d.id} className={`chip ${d.id === day.id ? 'on' : ''}`} onClick={() => ui.set({ dayId: d.id })}>
              {d.name}
            </button>
          ))}
        </div>
      )}
      <section className="detail-card">
        <header className="detail-head">
          <div className="grow">
            <div className="row gap-sm">
              <span className="wd-badge">{day.weekday === undefined ? 'Any' : WEEKDAYS[day.weekday]}</span>
              <b className="day-name">{day.name}</b>
            </div>
            <p className="accent">
              {day.items.length} exercises, Est. {fmtEst(estDaySeconds(day))} {live && <span className="wip">WIP</span>}
            </p>
          </div>
          <button className="icon-btn boxed" onClick={() => setMuscles(true)} aria-label="Muscles worked">
            <span className="figure-ico">⛹</span>
          </button>
          <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Day options">
            •••
          </button>
        </header>
        {day.items.length === 0 ? (
          <Empty title="No exercises yet">
            <button className="btn" onClick={() => nav.push({ kind: 'day', routineId: r.id, dayId: day.id })}>
              Add exercises
            </button>
          </Empty>
        ) : (
          <ul className="ex-list">
            {day.items.map((it, i) => {
              const ex = findExercise(it.exerciseId, customExercises);
              const log = live ? activeSession!.logs.find((l) => l.exerciseId === it.exerciseId) : undefined;
              const done = log && log.sets.length > 0 && log.sets.every((x) => x.done);
              return (
                <li key={it.id} data-drag-row style={drag.style(i)} className={done ? 'done' : ''}>
                  <span className="handle" onPointerDown={drag.start(i)} aria-label="Drag to reorder">
                    ⠿
                  </span>
                  <button className="ex-row" onClick={() => openItem(it)}>
                    <ExerciseThumb ex={ex} size={60} />
                    <div className="grow">
                      <b>{ex?.name ?? 'Exercise'}</b>
                      <p className="muted">
                        {repsSummary(it)}
                        {it.supersetId > 0 && ' · Superset'}
                      </p>
                    </div>
                    {done && <span className="good">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {!live && day.items.length > 0 && (
        <button className="btn primary block big" onClick={() => start(r.id, day.id)}>
          Start Workout
        </button>
      )}
      <DayMenu r={r} day={day} open={menu} onClose={() => setMenu(false)} onStart={() => start(r.id, day.id)} />
      <Sheet open={muscles} onClose={() => setMuscles(false)} title="Muscles worked" sub={day.name}>
        <BodyMap heat={heat} />
        <MuscleShares heat={heat} />
      </Sheet>
      {confirm}
    </>
  );
}

export function MuscleShares({ heat }: { heat: number[] }) {
  const total = heat.reduce((a, b) => a + b, 0) || 1;
  return (
    <ul className="shares">
      {heat
        .map((h, i) => [i, h] as const)
        .filter(([, h]) => h > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([i, h]) => (
          <li key={i}>
            <span>{BODY_PARTS[i]}</span>
            <span className="bar">
              <span style={{ width: `${(h / total) * 100}%` }} />
            </span>
            <span className="muted">{Math.round((h / total) * 100)}%</span>
          </li>
        ))}
    </ul>
  );
}

// Builds a one-off workout from chosen muscles and a time budget.
function Instant() {
  const nav = useNav();
  const exercises = useExercises();
  const { startInstant, activeSession, settings, routines, activeRoutineId, saveRoutine } = useStore();
  const [parts, setParts] = useState<number[]>([3, 7, 6]);
  const [minutes, setMinutes] = useState(45);
  const [equip, setEquip] = useState<Equipment[]>([]);
  const [seed, setSeed] = useState(0);
  const [saved, setSaved] = useState(false);

  // ~8 minutes per exercise at 3 sets with rest.
  const count = Math.max(2, Math.round(minutes / 8));
  const pool = parts.map((p) => exercises.filter((e) => e.bodyPart === p && (!equip.length || equip.includes(e.equipment))));
  const picks: Exercise[] = [];
  for (let k = 0; picks.length < count && k < 40; k++) {
    const list = pool[k % pool.length] ?? [];
    const e = list[(Math.floor(k / pool.length) + seed) % (list.length || 1)];
    if (e && !picks.includes(e)) picks.push(e);
  }
  const items: DayItem[] = picks.map((e) => ({
    id: uid(),
    exerciseId: e.id,
    supersetId: 0,
    sets: Array.from({ length: 3 }, () => ({
      type: 'regular' as const,
      weightLbs: null,
      reps: e.recordType === 'cardio' ? 10 : 10,
      rest: settings.defaultRest,
    })),
  }));
  const name = parts.length ? `${parts.map((p) => BODY_PARTS[p]).join(' & ')} Workout` : 'Instant Workout';
  const plan = routines.find((r) => r.id === activeRoutineId);

  return (
    <div className="day-list">
      <section className="detail-card pad">
        <h3>Target muscles</h3>
        <div className="weekday-pick">
          {BODY_PARTS.map((b, i) => (
            <button
              key={b}
              className={`chip ${parts.includes(i) ? 'on' : ''}`}
              onClick={() => {
                setSaved(false);
                setParts((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
              }}
            >
              {b}
            </button>
          ))}
        </div>
        <h3>Equipment</h3>
        <div className="weekday-pick">
          <button className={`chip ${equip.length === 0 ? 'on' : ''}`} onClick={() => setEquip([])}>
            Any
          </button>
          {EQUIPMENT.map((e) => (
            <button key={e} className={`chip ${equip.includes(e) ? 'on' : ''}`} onClick={() => setEquip((q) => (q.includes(e) ? q.filter((x) => x !== e) : [...q, e]))}>
              {e}
            </button>
          ))}
        </div>
        <h3>Duration</h3>
        <div className="weekday-pick">
          {[20, 30, 45, 60, 90].map((m) => (
            <button key={m} className={`chip ${minutes === m ? 'on' : ''}`} onClick={() => setMinutes(m)}>
              {m} min
            </button>
          ))}
        </div>
      </section>
      {parts.length > 0 && (
        <section className="detail-card">
          <header className="detail-head">
            <div className="grow">
              <b className="day-name">{name}</b>
              <p className="accent">
                {items.length} exercises, Est. {fmtEst(items.reduce((n, it) => n + it.sets.reduce((m, s) => m + 40 + s.rest, 0), 0))}
              </p>
            </div>
            <button className="btn small" onClick={() => setSeed((s) => s + 1)}>
              ↻ Shuffle
            </button>
          </header>
          <ul className="ex-list">
            {picks.map((e) => (
              <li key={e.id}>
                <button className="ex-row" onClick={() => nav.push({ kind: 'exercise', id: e.id })}>
                  <ExerciseThumb ex={e} size={52} />
                  <div className="grow">
                    <b>{e.name}</b>
                    <p className="muted">3 × 10 reps</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="row gap">
        {plan && (
          <button
            className="btn big"
            disabled={!items.length || saved}
            onClick={() => {
              saveRoutine({ ...plan, days: [...plan.days, { id: uid(), name, items }] });
              setSaved(true);
            }}
          >
            {saved ? 'Saved to plan' : 'Save to plan'}
          </button>
        )}
        <button
          className="btn primary big grow"
          disabled={!items.length || !!activeSession}
          onClick={() => {
            startInstant(name, items);
            nav.push({ kind: 'session' });
          }}
        >
          {activeSession ? 'Workout in progress' : 'Start Workout'}
        </button>
      </div>
    </div>
  );
}
