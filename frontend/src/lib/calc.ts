import type { ExerciseLog, LoggedSet, Session, Settings, WorkoutDay } from '../types';

const LB_PER_KG = 2.20462;

// Epley: reps == 1 -> weight, else weight * (1 + reps/30).
export function oneRepMax(weightLbs: number, reps: number): number {
  if (reps <= 0 || weightLbs <= 0) return 0;
  if (reps === 1) return weightLbs;
  return weightLbs * (1 + reps / 30);
}

export function weightForReps(oneRm: number, reps: number): number {
  if (reps <= 1) return oneRm;
  return oneRm / (1 + reps / 30);
}

export function toDisplay(lbs: number, s: Settings): number {
  const v = s.unit === 'kg' ? lbs / LB_PER_KG : lbs;
  return Math.round(v * 10) / 10;
}

export function fromDisplay(v: number, s: Settings): number {
  return s.unit === 'kg' ? v * LB_PER_KG : v;
}

// Decimal keypads type a comma in many locales.
export const parseNum = (t: string) => parseFloat(t.replace(',', '.'));

export function fmtWeight(lbs: number, s: Settings): string {
  return `${toDisplay(lbs, s)} ${s.unit}`;
}

const countsForVolume = (set: LoggedSet) => set.done && set.type !== 'warmup';

export function logBest1RM(log: ExerciseLog): number {
  return Math.max(0, ...log.sets.filter(countsForVolume).map((x) => oneRepMax(x.weightLbs, x.reps)));
}

export function sessionVolume(s: Session): number {
  return s.logs.reduce(
    (sum, l) => sum + l.sets.filter(countsForVolume).reduce((a, x) => a + x.weightLbs * x.reps, 0),
    0,
  );
}

export function sessionSetCount(s: Session): number {
  return s.logs.reduce((n, l) => n + l.sets.filter((x) => x.done).length, 0);
}

export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h) return `${h}h ${m}m`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function dayKey(t: number | Date): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Consecutive weeks (Mon-start) with at least one workout, ending this week or last.
export function weekStreak(sessions: Session[]): number {
  const weekOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  };
  // Step by calendar date: a week is not always 7 × 24 hours when the clocks change.
  const prevWeek = (t: number) => new Date(t).setDate(new Date(t).getDate() - 7);
  const weeks = new Set(sessions.filter((s) => s.end).map((s) => weekOf(s.start)));
  let cur = weekOf(Date.now());
  if (!weeks.has(cur)) cur = prevWeek(cur);
  let n = 0;
  while (weeks.has(cur)) {
    n++;
    cur = prevWeek(cur);
  }
  return n;
}

export function fmtHMS(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
}

// Rough time to complete a planned day: ~40s under load per set plus its rest.
export function estDaySeconds(day: WorkoutDay): number {
  return day.items.reduce((n, it) => n + it.sets.reduce((m, s) => m + 40 + s.rest, 0), 0);
}

export function fmtEst(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Whole calendar days between `t` and `now`: last night is 1, however few hours ago it was.
export function daysAgo(t: number, now = Date.now()): number {
  return Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 864e5);
}

export function timeAgo(t: number): string {
  const d = daysAgo(t);
  if (d <= 0) return 'Today';
  if (d < 14) return `${d}d ago`;
  if (d < 60) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const THINGS = [
  { name: 'Elephants', emoji: '🐘', lbs: 12000 },
  { name: 'Cars', emoji: '🚗', lbs: 3500 },
  { name: 'Grand Pianos', emoji: '🎹', lbs: 990 },
  { name: 'Golden Retrievers', emoji: '🐕', lbs: 65 },
  { name: 'Bowling Balls', emoji: '🎳', lbs: 14 },
];

// "That's like N <things>" — pumpkins in October, otherwise the largest thing that fits 3+ times.
export function volumeComparison(lbs: number, when = Date.now()) {
  const pick =
    new Date(when).getMonth() === 9
      ? { name: 'Pumpkins', emoji: '🎃', lbs: 10 }
      : THINGS.find((t) => lbs / t.lbs >= 3) ?? THINGS[THINGS.length - 1];
  return { ...pick, count: Math.round((lbs / pick.lbs) * 100) / 100 };
}

// Per-body-part share of working sets, normalised so the busiest part is 1.
export function muscleHeat(items: { bodyPart: number; secondary?: number[]; sets: number }[]): number[] {
  const heat = Array(11).fill(0);
  for (const it of items) {
    heat[it.bodyPart] += it.sets;
    for (const p of it.secondary ?? []) heat[p] += it.sets * 0.4;
  }
  const max = Math.max(...heat);
  return max ? heat.map((h) => h / max) : heat;
}
