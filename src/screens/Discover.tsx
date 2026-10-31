import { useNav, useUI } from '../nav';
import { findExercise, useExercises, useStore } from '../store';
import { dayKey, estDaySeconds, fmtEst, fmtHMS, muscleHeat, weekStreak } from '../lib/calc';
import { todayPlan } from '../lib/plans';
import { useNow } from '../lib/alarm';
import { Figure, MuscleThumb } from '../components/BodyMap';
import { useStartDay } from './Workouts';
import { BODY_PARTS, type Exercise, type WorkoutDay } from '../types';

const LEGS = new Set([5, 8, 9]);
const BACK = new Set([1, 5, 7]);

const dayHeat = (d: WorkoutDay, custom: Exercise[]) =>
  muscleHeat(d.items.flatMap((it) => {
    const ex = findExercise(it.exerciseId, custom);
    return ex ? [{ bodyPart: ex.bodyPart, secondary: ex.secondary, sets: it.sets.length }] : [];
  }));

export function Discover() {
  const nav = useNav();
  const exercises = useExercises();
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

      <button className="search fake" onClick={() => nav.push({ kind: 'library' })}>
        ⌕ Search {exercises.length} exercises
      </button>

      <h3 className="section-title">Train by muscle</h3>
      <div className="muscle-grid">
        {BODY_PARTS.map((name, i) => {
          const heat = Array(11).fill(0);
          heat[i] = 1;
          const n = exercises.filter((e) => e.bodyPart === i).length;
          return (
            <button key={name} className="muscle-tile" onClick={() => nav.push({ kind: 'library', part: i })}>
              {i === 10 ? (
                <span className="cardio-ico">♥</span>
              ) : (
                <Figure view={BACK.has(i) ? 'back' : 'front'} crop={LEGS.has(i) ? 'lower' : 'upper'} heat={heat} />
              )}
              <b>{name}</b>
              <span className="muted small">{n} exercises</span>
            </button>
          );
        })}
      </div>

      <h3 className="section-title">Tools</h3>
      <ul className="list">
        <li>
          <button className="list-item" onClick={() => nav.push({ kind: 'library' })}>
            <span className="grow">
              <b>Create a custom exercise</b>
              <span className="muted small block">Add anything missing from the library</span>
            </span>
            <span className="chev">›</span>
          </button>
        </li>
      </ul>
    </div>
  );
}

// This week at a glance plus what the plan says to do today.
function TodayCard() {
  const nav = useNav();
  const { routines, activeRoutineId, sessions, activeSession, customExercises } = useStore();
  const { start, confirm } = useStartDay();
  const now = useNow(activeSession ? 1000 : 60000);
  const routine = routines.find((r) => r.id === activeRoutineId);
  const plan = todayPlan(routine, sessions);
  const streak = weekStreak(sessions);

  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const done = new Map<string, string>();
  for (const s of sessions) if (!done.has(dayKey(s.start))) done.set(dayKey(s.start), s.id);
  const pinned = new Set(routine?.days.filter((d) => d.weekday !== undefined).map((d) => d.weekday!));
  const todayKey = dayKey(now);

  const day = plan.day;
  return (
    <section className="card today-card">
      <div className="row">
        <h3 className="grow">This week</h3>
        {streak > 0 && <span className="streak-chip">🔥 {streak} week{streak > 1 ? 's' : ''}</span>}
      </div>
      <div className="week-strip">
        {Array.from({ length: 7 }, (_, i) => {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          const k = dayKey(d);
          const sid = done.get(k);
          const cls = [k === todayKey ? 'today' : '', sid ? 'done' : '', !sid && pinned.has(i) && k >= todayKey ? 'planned' : ''].join(' ');
          return (
            <button key={i} className={`ws-day ${cls}`} style={{ animationDelay: `${i * 30}ms` }} disabled={!sid} onClick={() => sid && nav.push({ kind: 'history', id: sid })} aria-label={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric' }) + (sid ? ', workout logged' : '')}>
              <span>{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
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
          <MuscleThumb heat={dayHeat(day, customExercises)} className="today-thumb" />
          <div className="grow">
            <span className="eyebrow">{plan.doneToday ? 'Done today ✓' : 'Today'}</span>
            <b className="block">{day.name}</b>
            <span className="muted small">
              {day.items.length} exercises · ~{fmtEst(estDaySeconds(day))} · {routine.name}
            </span>
          </div>
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
          <button className="btn today-go" onClick={() => start(routine.id, plan.next!.day.id)}>
            Train anyway
          </button>
        </div>
      ) : (
        <div className="today-row">
          <span className="today-ico">✦</span>
          <div className="grow">
            <span className="eyebrow">No program yet</span>
            <b className="block">Pick a program or go instant</b>
          </div>
          <button className="btn primary today-go" onClick={() => {
              useUI.getState().set({ workoutTab: 'find' });
              nav.reset('workout');
            }}>
            Discover
          </button>
        </div>
      )}
      {confirm}
    </section>
  );
}
