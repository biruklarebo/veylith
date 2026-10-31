import { useState } from 'react';
import { useNav, useUI } from '../nav';
import { findExercise, useStore } from '../store';
import { dayKey, estDaySeconds, fmtEst, fmtHMS, muscleHeat, weekStreak } from '../lib/calc';
import { todayPlan } from '../lib/plans';
import { useNow } from '../lib/alarm';
import { BodyMap } from '../components/BodyMap';
import { weeklyCheckIn, type CheckAction } from '../lib/checkin';
import { BodyWeightCard } from '../components/BodyWeightCard';
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

// This week at a glance plus what the plan says to do today.
function TodayCard() {
  const nav = useNav();
  const { routines, activeRoutineId, sessions, activeSession, customExercises } = useStore();
  const { start, confirm } = useStartDay();
  const now = useNow(activeSession ? 1000 : 60000);
  const [weekOff, setWeekOff] = useState(0);
  const [choose, setChoose] = useState(false);
  const routine = routines.find((r) => r.id === activeRoutineId);
  const plan = todayPlan(routine, sessions);
  const streak = weekStreak(sessions);

  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + weekOff * 7);
  const done = new Map<string, string>();
  for (const s of sessions) if (!done.has(dayKey(s.start))) done.set(dayKey(s.start), s.id);
  const pinned = new Set(routine?.days.filter((d) => d.weekday !== undefined).map((d) => d.weekday!));
  const todayKey = dayKey(now);
  const label = weekOff === 0 ? 'This week' : weekOff === -1 ? 'Last week' : weekOff === 1 ? 'Next week' : monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  const day = plan.day;
  return (
    <section className="card today-card">
      <div className="week-nav">
        <button className="icon-btn" onClick={() => setWeekOff((w) => w - 1)} aria-label="Previous week">
          ‹
        </button>
        <span className="grow center muted">{label}</span>
        {streak > 0 && weekOff === 0 && <span className="streak-chip">🔥 {streak}</span>}
        <button className="icon-btn" onClick={() => setWeekOff((w) => w + 1)} aria-label="Next week">
          ›
        </button>
      </div>
      <div className="week-strip" key={weekOff}>
        {Array.from({ length: 7 }, (_, i) => {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          const k = dayKey(d);
          const sid = done.get(k);
          const cls = [k === todayKey ? 'today' : '', sid ? 'done' : '', !sid && pinned.has(i) && k >= todayKey ? 'planned' : ''].join(' ');
          return (
            <button key={i} className={`ws-day ${cls}`} style={{ animationDelay: `${i * 30}ms` }} disabled={!sid} onClick={() => sid && nav.push({ kind: 'history', id: sid })} aria-label={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) + (sid ? ', workout logged' : '')}>
              <span>{d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2).toUpperCase()}</span>
              <b>{d.getDate()}</b>
              <i />
            </button>
          );
        })}
      </div>

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
  const { sessions, customExercises, routines, activeRoutineId, bodyStats, settings } = useStore();
  const { start, confirm } = useStartDay();
  const [open, setOpen] = useState(true);
  const routine = routines.find((r) => r.id === activeRoutineId);
  const c = weeklyCheckIn(sessions, (id) => findExercise(id, customExercises), routine, bodyStats, settings);
  const end = new Date(c.from + 6 * 864e5);
  const range = `${new Date(c.from).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  const act = (to: CheckAction) => {
    if (to.kind === 'exercise') nav.push({ kind: 'exercise', id: to.id });
    if (to.kind === 'progress') nav.reset('progress');
    if (to.kind === 'program') {
      useUI.getState().set({ workoutTab: 'planned', planTab: 'overview', dayId: null });
      nav.reset('workout');
    }
    if (to.kind === 'start') {
      const day = todayPlan(routine, sessions).day;
      if (routine && day) start(routine.id, day.id);
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
