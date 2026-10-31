import { fromDisplay, toDisplay } from './calc';
import type { DayItem, Exercise, ExerciseLog, LogTarget, LoggedSet, ProgressionRule, Routine, Session, Settings } from '../types';

// Automatic progression. The next prescription is derived from the logged history every time
// it is needed, so editing a past set or switching rule immediately gives the right target.
//
// A session is read honestly: a set counts as hit only if it was logged with at least the
// prescribed reps; a missing set is a miss. A session that fell apart never adds load.

export const RULES: { id: ProgressionRule; name: string; desc: string }[] = [
  { id: 'off', name: 'Off', desc: 'Weights come from last time, targets stay where the plan puts them.' },
  { id: 'linear', name: 'Linear', desc: 'Hit every rep of every set and the weight goes up next time. Three misses in a row at the same weight trigger a 10% deload.' },
  { id: 'double', name: 'Double', desc: 'Stay at a weight and add reps until every set reaches the top of the range, then add weight and go back to the bottom.' },
  { id: 'triple', name: 'Triple', desc: 'Reps climb to the top of the range, then a set is added (up to two extra). When every set is at the top, the weight goes up and sets and reps reset.' },
];
export const RULE_NAME = Object.fromEntries(RULES.map((r) => [r.id, r.name])) as Record<ProgressionRule, string>;

export function ruleFor(r?: Routine): ProgressionRule {
  if (!r) return 'off';
  return r.progression ?? (r.focus === 'strength' ? 'linear' : 'double');
}

// Smallest sensible jump for the exercise, in lbs.
export function increment(ex: Exercise | undefined, s: Settings): number {
  const kg = s.unit === 'kg';
  if (ex?.equipment === 'Dumbbell' || ex?.equipment === 'Kettlebell') return kg ? fromDisplay(2, s) : 5;
  if (ex?.equipment === 'Barbell' && ex.bodyPart === 8) return kg ? fromDisplay(5, s) : 10; // squats/deadlifts move faster
  return kg ? fromDisplay(2.5, s) : 5;
}

// Snap to what can actually be loaded: 2.5 lb or 0.5 kg.
export function roundLoad(lbs: number, s: Settings, dir: 'near' | 'down' = 'near'): number {
  const step = s.unit === 'kg' ? 0.5 : 2.5;
  const v = toDisplay(lbs, s) / step;
  return fromDisplay((dir === 'down' ? Math.floor(v) : Math.round(v)) * step, s);
}

// The rep range a planned rep count opens: 10 -> 10-14, 5 -> 5-7.
export function repRange(reps: number): [number, number] {
  return [reps, reps + (reps <= 5 ? 2 : 4)];
}

const working = (l: ExerciseLog) => l.sets.filter((x) => x.done && x.type !== 'warmup');
const topWeight = (l: ExerciseLog) => Math.max(0, ...working(l).map((x) => x.weightLbs));

// Did this log meet what was asked? Old logs without a stored target are judged against the plan.
function hit(l: ExerciseLog, fallbackReps: number[]): boolean {
  const asked = l.target?.reps ?? fallbackReps;
  const w = working(l);
  return w.length >= asked.length && asked.every((r, i) => (w[i]?.reps ?? 0) >= r);
}

const sameWeight = (a: number, b: number) => Math.abs(a - b) < 0.6;

export interface Target extends LogTarget {
  sets: Pick<LoggedSet, 'type' | 'weightLbs' | 'reps'>[];
}

export function nextTarget(
  item: DayItem,
  history: Session[], // newest first
  ex: Exercise | undefined,
  rule: ProgressionRule,
  s: Settings,
  opts: { deload?: boolean } = {},
): Target | null {
  if (rule === 'off' || !ex || ex.recordType === 'cardio') return null;
  const logs = history
    .flatMap((x) => x.logs.filter((l) => l.exerciseId === item.exerciseId && working(l).length))
    .slice(0, 6);
  const last = logs[0];
  const plannedWork = item.sets.filter((x) => x.type !== 'warmup');
  const warm = item.sets.filter((x) => x.type === 'warmup');
  if (!last || !plannedWork.length) return null;

  const fmt = (lbs: number) => `${toDisplay(lbs, s)} ${s.unit}`;
  const bw = ex.recordType === 'bodyweight';
  const [lo, hi] = repRange(plannedWork[0].reps);
  const W = topWeight(last);
  const lastReps = working(last).map((x) => x.reps);
  const inc = increment(ex, s);

  const build = (weight: number, reps: number[], kind: Target['kind'], reason: string): Target => {
    const warmLast = last.sets.filter((x) => x.type === 'warmup');
    return {
      rule,
      kind,
      reason,
      weightLbs: weight,
      reps,
      sets: [
        ...warm.map((p, i) => ({ type: 'warmup' as const, weightLbs: warmLast[i]?.weightLbs ?? roundLoad(weight * 0.5, s), reps: p.reps })),
        ...reps.map((r, i) => ({ type: plannedWork[i]?.type ?? 'regular', weightLbs: weight, reps: r })),
      ],
    };
  };

  if (opts.deload) {
    const w = bw ? 0 : roundLoad(W * 0.9, s, 'down');
    return build(w, plannedWork.map((p) => p.reps), 'deload', 'Deload week: about 10% lighter so you recover.');
  }

  // Bodyweight with nothing added: progress by reps alone.
  if (bw && W === 0) {
    const reps = plannedWork.map((p, i) => Math.max(p.reps, (lastReps[i] ?? p.reps) + (hit(last, plannedWork.map((x) => x.reps)) ? 1 : 0)));
    return build(0, reps, 'reps', 'Bodyweight: one more rep per set than last time.');
  }
  if (W === 0) return null;

  // Consecutive recent sessions at this weight that missed.
  const misses = (asked: number[]) => {
    let n = 0;
    for (const l of logs) {
      if (!sameWeight(topWeight(l), W) || hit(l, asked)) break;
      n++;
    }
    return n;
  };

  if (rule === 'linear') {
    const asked = plannedWork.map((p) => p.reps);
    if (hit(last, asked)) return build(W + inc, asked, 'up', `Every rep last time, so ${fmt(inc)} more.`);
    if (misses(asked) >= 3) return build(roundLoad(W * 0.9, s, 'down'), asked, 'deload', 'Missed reps three sessions running: back off 10% and build up again.');
    return build(W, asked, 'hold', `Missed reps last time: same ${fmt(W)}, go for every rep.`);
  }

  const maxSets = plannedWork.length + (rule === 'triple' ? 2 : 0);
  const n = Math.max(plannedWork.length, Math.min(maxSets, working(last).length));
  const allTop = lastReps.length >= n && lastReps.slice(0, n).every((r) => r >= hi);
  if (allTop && rule === 'triple' && n < maxSets) {
    return build(W, Array(n + 1).fill(lo), 'set', `Top of the range on every set: add a set (${n + 1} × ${lo}).`);
  }
  if (allTop) {
    return build(W + inc, Array(plannedWork.length).fill(lo), 'up', `Hit ${hi} on every set, so ${fmt(inc)} more and back to ${lo} reps.`);
  }
  const reps = Array.from({ length: n }, (_, i) => Math.min(hi, Math.max(lo, (lastReps[i] ?? lo - 1) + 1)));
  // Stalled: three sessions at this weight without adding a rep.
  const totals = logs.filter((l) => sameWeight(topWeight(l), W)).slice(0, 3).map((l) => working(l).reduce((a, x) => a + x.reps, 0));
  if (totals.length === 3 && totals[0] <= totals[1] && totals[1] <= totals[2]) {
    return build(roundLoad(W * 0.9, s, 'down'), Array(plannedWork.length).fill(lo), 'deload', 'No new reps in three sessions: back off 10% and climb again.');
  }
  return build(W, reps, 'reps', `Working up ${lo}–${hi} reps at ${fmt(W)}: one more rep per set.`);
}

// The plan item a finished log would be judged against next time: its plan day when there is
// one, otherwise the log itself.
export function itemForLog(log: ExerciseLog, session: Session, routines: Routine[]): { item: DayItem; rule: ProgressionRule } {
  const routine = routines.find((r) => r.id === session.routineId);
  const planned = routine?.days.find((d) => d.id === session.dayId)?.items.find((i) => i.exerciseId === log.exerciseId);
  const item: DayItem = planned ?? {
    id: '',
    exerciseId: log.exerciseId,
    supersetId: 0,
    sets: (log.target ? log.target.reps : log.sets.map((x) => x.reps)).map((reps) => ({ type: 'regular', weightLbs: null, reps, rest: log.rest })),
  };
  return { item, rule: log.target?.rule ?? ruleFor(routine) };
}
