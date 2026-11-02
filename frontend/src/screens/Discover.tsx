import { useState } from 'react';
import { useNav, useUI } from '../nav';
import { findExercise, useStore } from '../store';
import { dayKey, estDaySeconds, fmtEst, fmtHMS, muscleHeat, weekStreak } from '../lib/calc';
import { plannedOn, todayPlan } from '../lib/plans';
import { useNow } from '../lib/alarm';
import { BodyMap } from '../components/BodyMap';
import { weeklyCheckIn, type CheckAction } from '../lib/checkin';
import { BodyWeightCard } from '../components/BodyWeightCard';
import { DaySheet } from '../components/DaySheet';
import { Sheet } from '../components/Sheet';
import { useStartDay } from './Workouts';
import type { Exercise, WorkoutDay } from '../types';


const dayHeat = (d: WorkoutDay, custom: Exercise[]) =>
  muscleHeat(d.items.flatMap((it) => {
    const ex = findExercise(it.exerciseId, custom);
    return ex ? [{ bodyPart: ex.bodyPart, secondary: ex.secondary, sets: it.sets.length }] : [];
  }));

export function Discover() {
  const nav = useNav();
  const now = new Date();
  return (
    <div className="page">
      <header className="home-head">
        <div>
          <h1 className="title">Home</h1>
          <p className="muted">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button className="icon-btn" onClick={() => nav.push({ kind: 'settings' })} aria-label="Settings">
          ⚙
        </button>
      </header>

      <TodayCard />

      <CheckInCard />

      <BodyWeightCard />
    </div>
  );
}

// Moves through weeks or months without limit, past or future. Any day opens its sheet to review
// or plan it.
function DayCalendar({ now, streak }: { now: number; streak: number }) {
  const { routines, activeRoutineId, sessions, schedule } = useStore();
  const [month, setMonth] = useState(false);
  const [off, setOff] = useState(0);
  const [picked, setPicked] = useState<Date | null>(null);
  const routine = routines.find((r) => r.id === activeRoutineId);

  const first = new Date(now);
  first.setHours(0, 0, 0, 0);
  if (month) first.setMonth(first.getMonth() + off, 1);
  else first.setDate(first.getDate() + off * 7);
  const inMonth = first.getMonth();
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const count = month ? Math.ceil(((first.getDay() + 6) % 7 + new Date(first.getFullYear(), inMonth + 1, 0).getDate()) / 7) * 7 : 7;

  const done = new Set(sessions.map((s) => dayKey(s.start)));
  const todayKey = dayKey(now);
  const weekLabel = off === 0 ? 'This week' : off === -1 ? 'Last week' : off === 1 ? 'Next week' : start.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const noun = month ? 'month' : 'week';

  return (
    <>
      <div className="week-nav">
        <button className="icon-btn" onClick={() => setOff((o) => o - 1)} aria-label={`Previous ${noun}`}>
          ‹
        </button>
        <span className="grow center muted">{month ? first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : weekLabel}</span>
        {off !== 0 ? (
          <button className="btn small" onClick={() => setOff(0)}>
            Today
          </button>
        ) : (
          streak > 0 && <span className="streak-chip">🔥 {streak}</span>
        )}
        <button
          className="btn small"
          onClick={() => {
            setMonth((m) => !m);
            setOff(0);
          }}
        >
          {month ? 'Week' : 'Month'}
        </button>
        <button className="icon-btn" onClick={() => setOff((o) => o + 1)} aria-label={`Next ${noun}`}>
          ›
        </button>
      </div>
      <div className={`week-strip ${month ? 'month' : ''}`} key={`${noun}${off}`}>
        {Array.from({ length: count }, (_, i) => {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const k = dayKey(d);
          const logged = done.has(k);
          const planned = !logged && plannedOn(d, routine, schedule, sessions).length > 0;
          const cls = [k === todayKey ? 'today' : '', logged ? 'done' : '', planned ? 'planned' : '', month && d.getMonth() !== inMonth ? 'out' : ''].join(' ');
          return (
            <button key={k} className={`ws-day ${cls}`} style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }} onClick={() => setPicked(d)} aria-label={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) + (logged ? ', workout logged' : planned ? ', workout planned' : '')}>
              {i < 7 && <span>{d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2).toUpperCase()}</span>}
              <b>{d.getDate()}</b>
              <i />
            </button>
          );
        })}
      </div>
      <DaySheet date={picked} onClose={() => setPicked(null)} />
    </>
  );
}

// The calendar plus what the plan says to do today.
function TodayCard() {
  const nav = useNav();
  const { routines, activeRoutineId, sessions, activeSession, customExercises, schedule } = useStore();
  const { start, confirm } = useStartDay();
  const now = useNow(activeSession ? 1000 : 60000);
  const [choose, setChoose] = useState(false);
  const routine = routines.find((r) => r.id === activeRoutineId);
  const plan = todayPlan(routine, sessions, schedule);

  const day = plan.day;
  return (
    <section className="card today-card">
      <DayCalendar now={now} streak={weekStreak(sessions)} />

      {activeSession ? (
        <div className="today-row">
          <span className="today-ico live">●</span>
          <div className="grow">
            <span className="eyebrow">In progress</span>
            <b className="block">{activeSession.name}</b>
            <span className="muted small">{fmtHMS(now - activeSession.start)}</span>
          </div>
          <button className="btn primary today-go" onClick={() => nav.push({ kind: activeSession.end ? 'review' : 'session' })}>
            Resume
          </button>
        </div>
      ) : routine && day ? (
        <div className="today-row">
          <div className="grow">
            <span className="eyebrow">{plan.doneToday ? 'Done today ✓' : 'Today'}</span>
            <b className="block today-name">{day.name}</b>
            <span className="muted small">
              {day.items.length} exercises · ~{fmtEst(estDaySeconds(day))}
            </span>
          </div>
          <BodyMap heat={dayHeat(day, customExercises)} className="today-map" />
          <button className={`btn today-go ${plan.doneToday ? '' : 'primary'}`} disabled={!day.items.length} onClick={() => start(routine.id, day.id)}>
            {plan.doneToday ? 'Again' : 'Start'}
          </button>
        </div>
      ) : routine && plan.rest && plan.next ? (
        <div className="today-row">
          <span className="today-ico">☾</span>
          <div className="grow">
            <span className="eyebrow">Rest day</span>
            <b className="block">Next: {plan.next.day.name}</b>
            <span className="muted small">{plan.next.inDays === 1 ? 'Tomorrow' : `In ${plan.next.inDays} days`}</span>
          </div>
        </div>
      ) : (
        <div className="today-row">
          <span className="today-ico">✦</span>
          <div className="grow">
            <span className="eyebrow">No program yet</span>
            <b className="block">Pick a program or quickstart</b>
          </div>
          <button
            className="btn primary today-go"
            onClick={() => {
              useUI.getState().set({ workoutTab: 'find' });
              nav.reset('workout');
            }}
          >
            Discover
          </button>
        </div>
      )}

      {!activeSession && (
        <button className="link small choose-other" onClick={() => setChoose(true)}>
          ⇄ Choose a different workout
        </button>
      )}

      <Sheet open={choose} onClose={() => setChoose(false)} title="Start a workout" sub={routine?.name}>
        <ul className="prog-rows">
          {routine?.days.map((d) => (
            <li key={d.id}>
              <button
                className={`prog-row ${d.id === day?.id ? 'is-current' : ''}`}
                disabled={!d.items.length}
                onClick={() => {
                  setChoose(false);
                  start(routine.id, d.id);
                }}
              >
                <BodyMap heat={dayHeat(d, customExercises)} className="choose-map" />
                <span className="grow">
                  <b>{d.name}</b>
                  <small className="muted block">
                    {d.items.length} exercises · ~{fmtEst(estDaySeconds(d))}
                  </small>
                </span>
                {d.id === day?.id && <span className="pill">Today</span>}
              </button>
            </li>
          ))}
        </ul>
        <button
          className="btn block"
          onClick={() => {
            setChoose(false);
            useUI.getState().set({ workoutTab: 'instant' });
            nav.reset('workout');
          }}
        >
          Quickstart a custom workout
        </button>
      </Sheet>
      {confirm}
    </section>
  );
}

const TONE_ICON = { win: '★', watch: '!', tip: '→' } as const;

// Rules-based weekly review: wins, things to watch and tips, each optionally one tap from a fix.
function CheckInCard() {
  const nav = useNav();
  const { sessions, customExercises, routines, activeRoutineId, bodyStats, settings, schedule } = useStore();
  const { start, confirm } = useStartDay();
  const [open, setOpen] = useState(true);
  const routine = routines.find((r) => r.id === activeRoutineId);
  const c = weeklyCheckIn(sessions, (id) => findExercise(id, customExercises), routine, bodyStats, settings);
  const end = new Date(c.from + 6 * 864e5);
  const range = `${new Date(c.from).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  const openProgram = () => {
    useUI.getState().set({ workoutTab: 'planned', planTab: 'overview', dayId: null });
    nav.reset('workout');
  };
  const act = (to: CheckAction) => {
    if (to.kind === 'exercise') nav.push({ kind: 'exercise', id: to.id });
    if (to.kind === 'progress') nav.reset('progress');
    if (to.kind === 'program') openProgram();
    if (to.kind === 'start') {
      // A rest day has nothing to start: open the program so another day can be picked.
      const day = todayPlan(routine, sessions, schedule).day;
      if (routine && day) start(routine.id, day.id);
      else openProgram();
    }
  };

  return (
    <section className="card checkin">
      <button className="checkin-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="checkin-ico" aria-hidden>
          ✓
        </span>
        <span className="grow">
          <b className="block">Weekly check-in</b>
          <small className="muted">
            {range}
            {c.planned ? ` · ${c.done}/${c.planned} workouts` : ''}
          </small>
        </span>
        <span className={`chev-d ${open ? 'up' : ''}`}>⌄</span>
      </button>
      {open &&
        (c.items.length ? (
          <ul className="checkin-list">
            {c.items.map((it, i) => (
              <li key={i} className={`ci ${it.tone}`} style={{ animationDelay: `${i * 40}ms` }}>
                <span className="ci-ico" aria-hidden>
                  {TONE_ICON[it.tone]}
                </span>
                <span className="grow">{it.text}</span>
                {it.action && (
                  <button className="ci-act" onClick={() => act(it.action!.to)}>
                    {it.action.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Log a few workouts and your check-in fills in: progress on your lifts, stalls, weak spots and what to do next.</p>
        ))}
      {confirm}
    </section>
  );
}
