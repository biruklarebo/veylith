import { useState } from 'react';
import { useNav, useUI } from '../nav';
import { findExercise, useExercises, useStore } from '../store';
import { dayKey, estDaySeconds, fmtEst, fmtHMS, muscleHeat, weekStreak } from '../lib/calc';
import { todayPlan } from '../lib/plans';
import { useNow } from '../lib/alarm';
import { BodyMap, Figure } from '../components/BodyMap';
import { BodyWeightCard } from '../components/BodyWeightCard';
import { Sheet } from '../components/Sheet';
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

      <BodyWeightCard />

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
