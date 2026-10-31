import { logBest1RM, toDisplay } from './calc';
import { daysSince, volume } from './recovery';
import { BODY_PARTS, type BodyStat, type Exercise, type Routine, type Session, type Settings } from '../types';

// Weekly check-in, worked out from the training log with plain rules: what went well, what
// to keep an eye on, and a few concrete tips. Every number here is computed, never guessed.

export type CheckAction =
  | { kind: 'exercise'; id: string }
  | { kind: 'program' }
  | { kind: 'start' }
  | { kind: 'progress' };

export interface CheckItem {
  tone: 'win' | 'watch' | 'tip';
  text: string;
  action?: { label: string; to: CheckAction };
}

export interface CheckIn {
  from: number; // Monday of this week
  done: number;
  planned: number;
  items: CheckItem[];
}

const DAY = 864e5;
const MAJOR = [0, 1, 3, 5, 6, 8]; // abs, back, chest, glutes, shoulders, upper legs

export function weeklyCheckIn(
  sessions: Session[], // newest first
  find: (id: string) => Exercise | undefined,
  routine: Routine | undefined,
  bodyStats: BodyStat[],
  settings: Settings,
  now = Date.now(),
): CheckIn {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const from = monday.getTime();
  const week = sessions.filter((s) => s.start >= from);
  const planned = routine ? Math.max(1, routine.daysPerWeek || routine.days.length) : 0;
  const wins: CheckItem[] = [];
  const watch: CheckItem[] = [];
  const tips: CheckItem[] = [];
  const name = (id: string) => find(id)?.name ?? 'This lift';
  const w = (lbs: number) => `${toDisplay(lbs, settings)} ${settings.unit}`;

  // Per-exercise history: best estimated 1RM, top working weight and total reps per session.
  const hist = new Map<string, { t: number; e1rm: number; top: number; reps: number }[]>();
  for (const s of sessions) {
    if (now - s.start > 56 * DAY) break;
    for (const l of s.logs) {
      const work = l.sets.filter((x) => x.done && x.type !== 'warmup');
      if (!work.length || find(l.exerciseId)?.recordType === 'cardio') continue;
      const list = hist.get(l.exerciseId) ?? [];
      list.push({ t: s.start, e1rm: logBest1RM(l), top: Math.max(...work.map((x) => x.weightLbs)), reps: work.reduce((a, x) => a + x.reps, 0) });
      hist.set(l.exerciseId, list);
    }
  }

  // Wins: strength trend over the month, consistency.
  const ups: { id: string; pct: number }[] = [];
  for (const [id, list] of hist) {
    const recent = Math.max(0, ...list.filter((x) => now - x.t <= 14 * DAY).map((x) => x.e1rm));
    const before = Math.max(0, ...list.filter((x) => now - x.t > 14 * DAY && now - x.t <= 42 * DAY).map((x) => x.e1rm));
    if (recent > 0 && before > 0 && recent / before >= 1.03) ups.push({ id, pct: (recent / before - 1) * 100 });
  }
  ups.sort((a, b) => b.pct - a.pct);
  for (const u of ups.slice(0, 2))
    wins.push({ tone: 'win', text: `${name(u.id)}: estimated max up ${Math.round(u.pct)}% in the last month.`, action: { label: 'See lift', to: { kind: 'exercise', id: u.id } } });
  if (planned && week.length >= planned) wins.push({ tone: 'win', text: `All ${planned} planned workouts done this week.` });
  else if (week.length) wins.push({ tone: 'win', text: `${week.length} workout${week.length > 1 ? 's' : ''} logged this week.` });

  // Watch: lifts stuck at the same weight without more reps for 3 sessions.
  for (const [id, list] of hist) {
    const last3 = list.slice(0, 3);
    if (last3.length < 3 || now - last3[0].t > 21 * DAY) continue;
    const sameWeight = last3.every((x) => Math.abs(x.top - last3[0].top) < 0.6);
    const noMoreReps = last3[0].reps <= last3[2].reps;
    if (sameWeight && noMoreReps && last3[0].top > 0) {
      watch.push({ tone: 'watch', text: `${name(id)} has stayed at ${w(last3[0].top)} for 3 sessions without extra reps.`, action: { label: 'See lift', to: { kind: 'exercise', id } } });
      tips.push({ tone: 'tip', text: `For ${name(id)}: keep the weight and add a set, or drop about 10% and build back up over 2–3 weeks.` });
    }
  }

  // Watch: muscles getting much less work than usual (last 7 days vs the 4 weeks before).
  const last7 = volume(sessions, find, 7, now);
  const prior = volume(sessions, find, 35, now).map((v, i) => (v - last7[i]) / 4);
  const dayOfWeek = Math.floor((now - from) / DAY);
  if (dayOfWeek >= 4 || now - (sessions[0]?.start ?? 0) > 3 * DAY) {
    for (const p of MAJOR) {
      if (prior[p] >= 6 && last7[p] < prior[p] * 0.6) {
        watch.push({ tone: 'watch', text: `${BODY_PARTS[p]}: ${Math.round(last7[p])} hard sets this week vs your usual ${Math.round(prior[p])}.` });
        tips.push({ tone: 'tip', text: `Add 2–3 sets for ${BODY_PARTS[p].toLowerCase()} on your next session that trains it.`, action: { label: 'Open program', to: { kind: 'program' } } });
        break;
      }
    }
  }

  // Watch: a major muscle not trained for 10+ days that you normally train.
  const since = daysSince(sessions, find, now);
  const idle = MAJOR.filter((p) => (since[p] ?? -1) >= 10);
  if (idle.length) watch.push({ tone: 'watch', text: `Not trained in 10+ days: ${idle.map((p) => BODY_PARTS[p]).join(', ')}.` });

  // Effort: average reps in reserve on rated working sets this week.
  const rated = week.flatMap((s) => s.logs.flatMap((l) => l.sets.filter((x) => x.done && x.type !== 'warmup' && x.rir !== undefined)));
  if (rated.length >= 6) {
    const avg = rated.reduce((a, x) => a + x.rir!, 0) / rated.length;
    if (avg >= 4) tips.push({ tone: 'tip', text: `Your sets averaged ${avg.toFixed(1)} reps in reserve. Take the last set of each exercise closer to failure (1–2 left).` });
    else if (avg <= 0.6) tips.push({ tone: 'tip', text: `Most sets went to failure. Leaving 1–2 reps on big lifts helps recovery without costing progress.` });
  }

  // Adherence: behind on the week with days still left.
  const daysLeft = 7 - dayOfWeek - 1;
  const behind = planned - week.length;
  if (planned && behind > 0 && daysLeft >= 0 && dayOfWeek >= 2) {
    if (behind <= daysLeft + 1)
      tips.push({ tone: 'tip', text: `${week.length} of ${planned} workouts done, ${daysLeft + 1} day${daysLeft ? 's' : ''} left. Today is a good day for the next one.`, action: { label: 'Start', to: { kind: 'start' } } });
    else watch.push({ tone: 'watch', text: `${week.length} of ${planned} workouts this week. A lighter week is fine, just pick back up.` });
  }

  // Body weight: trend over 4 weeks vs the goal direction.
  const goal = settings.goalWeightLbs;
  const ws = bodyStats.filter((b) => b.values.weight).map((b) => ({ t: new Date(`${b.date}T12:00`).getTime(), v: b.values.weight! }));
  const recentW = ws.filter((x) => now - x.t <= 28 * DAY);
  if (goal && recentW.length >= 3) {
    const change = recentW.at(-1)!.v - recentW[0].v;
    const toGo = recentW.at(-1)!.v - goal;
    if (Math.abs(toGo) > 1 && Math.abs(change) >= 0.5) {
      const right = Math.sign(change) === -Math.sign(toGo);
      (right ? wins : watch).push({
        tone: right ? 'win' : 'watch',
        text: `Body weight ${change < 0 ? 'down' : 'up'} ${w(Math.abs(change))} this month, ${right ? 'toward' : 'away from'} your ${w(goal)} goal.`,
        action: { label: 'Weight', to: { kind: 'progress' } },
      });
    }
  }

  return { from, done: week.length, planned, items: [...wins.slice(0, 3), ...watch.slice(0, 3), ...tips.slice(0, 3)] };
}
