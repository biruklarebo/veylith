import { CATALOG, type PlanTemplate } from '../data/catalog';
import { SEED_EXERCISES } from '../data/exercises';
import { estDaySeconds, muscleHeat, uid } from './calc';
import type { DayItem, Equipment, Exercise, Focus, Location, PlanSet, Routine, Session, WorkoutDay } from '../types';

const byId = new Map(SEED_EXERCISES.map((e) => [e.id, e]));
export const HOME_EQUIPMENT: Equipment[] = ['Bodyweight', 'Dumbbell', 'Band', 'Kettlebell', 'Other'];

export const GOAL_LABEL: Record<Focus, string> = {
  general: 'General',
  bulking: 'Bulking',
  cutting: 'Cutting',
  strength: 'Strength',
  maintaining: 'Maintaining',
};
export const LEVEL_LABEL = ['', 'Beginner', 'Intermediate', 'Advanced'];

const sets = (n: number, reps: number, rest: number): PlanSet[] =>
  Array.from({ length: n }, () => ({ type: 'regular' as const, weightLbs: null, reps, rest }));

export function templateDays(t: PlanTemplate): WorkoutDay[] {
  return t.days.map(([name, items]) => ({
    id: uid(),
    name,
    items: items.map(([exerciseId, n, reps, rest]) => ({ id: uid(), exerciseId, supersetId: 0, sets: sets(n, reps, rest ?? 90) })),
  }));
}

export function templateToRoutine(t: PlanTemplate): Routine {
  return {
    id: uid(),
    name: t.name,
    description: t.description,
    difficulty: t.level,
    focus: t.goal,
    daysPerWeek: t.days.length,
    days: templateDays(t),
    author: 'Veylith Team',
    templateId: t.id,
    location: t.location,
  };
}

export const findTemplate = (id: string) => CATALOG.find((t) => t.id === id);

// Summary facts used by cards and the detail page.
export function planFacts(days: WorkoutDay[], custom: Exercise[] = []) {
  const find = (id: string) => byId.get(id) ?? custom.find((e) => e.id === id);
  const equipment = new Set<Equipment>();
  const heatItems: { bodyPart: number; secondary?: number[]; sets: number }[] = [];
  for (const d of days)
    for (const it of d.items) {
      const ex = find(it.exerciseId);
      if (!ex) continue;
      equipment.add(ex.equipment);
      heatItems.push({ bodyPart: ex.bodyPart, secondary: ex.secondary, sets: it.sets.length });
    }
  const avgSec = days.length ? days.reduce((n, d) => n + estDaySeconds(d), 0) / days.length : 0;
  return { equipment: [...equipment], heat: muscleHeat(heatItems), avgMinutes: Math.round(avgSec / 60) };
}

// Swap exercises that need gym equipment for a home-friendly one hitting the same muscle.
function adaptToLocation(items: DayItem[], location: Location): DayItem[] {
  if (location === 'gym') return items;
  const used = new Set<string>();
  const out: DayItem[] = [];
  for (const it of items) {
    const ex = byId.get(it.exerciseId);
    let id = it.exerciseId;
    if (ex && !HOME_EQUIPMENT.includes(ex.equipment)) {
      const alt = SEED_EXERCISES.find(
        (e) => e.bodyPart === ex.bodyPart && HOME_EQUIPMENT.includes(e.equipment) && e.recordType === ex.recordType && !used.has(e.id),
      );
      if (!alt) continue;
      id = alt.id;
    }
    if (used.has(id)) continue;
    used.add(id);
    out.push({ ...it, id: uid(), exerciseId: id });
  }
  return out;
}

export interface BuildPrefs {
  days: number;
  location: Location;
  level: 1 | 2 | 3;
}

// "Build for me": a personal copy of a catalog plan fitted to the user's schedule, equipment and level.
export function personalize(t: PlanTemplate, p: BuildPrefs): Routine {
  const base = templateDays(t);
  const days: WorkoutDay[] = Array.from({ length: p.days }, (_, i) => {
    const src = base[i % base.length];
    const round = Math.floor(i / base.length);
    return {
      id: uid(),
      name: round ? `${src.name} (${round + 1})` : src.name,
      // One set fewer per level below the plan's, one more per level above.
      items: adaptToLocation(src.items, p.location).map((it) => {
        const n = Math.max(1, it.sets.length + p.level - t.level);
        return { ...it, sets: Array.from({ length: n }, (_, k) => it.sets[Math.min(k, it.sets.length - 1)]) };
      }),
    };
  });
  return {
    ...templateToRoutine(t),
    name: `My ${t.name}`,
    days,
    daysPerWeek: p.days,
    difficulty: p.level,
    location: p.location,
    author: 'Built for you',
  };
}

// ---------- Adaptive plan (mesocycle) ----------

export type Phase = 'Accumulation' | 'Intensification' | 'Deload';
export const MESO_WEEKS = 5;
const PHASES: Phase[] = ['Accumulation', 'Accumulation', 'Accumulation', 'Intensification', 'Deload'];

export function phaseOf(r: Routine, now = Date.now()): { phase: Phase; week: number; weeks: number } | null {
  if (!r.adaptive) return null;
  const week = Math.floor((now - r.adaptive.start) / (7 * 864e5)) % r.adaptive.weeks;
  return { phase: PHASES[Math.min(week, PHASES.length - 1)], week: week + 1, weeks: r.adaptive.weeks };
}

// Week-by-week adjustments: build volume, then heavier/lower reps, then back off.
export function applyPhase(day: WorkoutDay, p: { phase: Phase; week: number }): WorkoutDay {
  return {
    ...day,
    items: day.items.map((it) => {
      let s = it.sets;
      if (p.phase === 'Accumulation' && p.week >= 3 && s.length) s = [...s, s[s.length - 1]];
      if (p.phase === 'Intensification') s = s.map((x) => ({ ...x, reps: Math.max(3, x.reps - 2), rest: x.rest + 30 }));
      if (p.phase === 'Deload') s = s.slice(0, Math.max(1, Math.ceil(s.length / 2)));
      return { ...it, sets: s };
    }),
  };
}

export interface AdaptivePrefs extends BuildPrefs {
  goal: Focus;
}

const SPLITS: Record<number, [string, number[]][]> = {
  // [day name, body-part slots]
  2: [['Full Body A', [8, 3, 1, 6, 0]], ['Full Body B', [5, 3, 1, 2, 7, 9]]],
  3: [['Push', [3, 3, 6, 6, 7]], ['Pull', [1, 1, 1, 2, 6]], ['Legs', [8, 8, 5, 8, 9, 0]]],
  4: [['Upper A', [3, 1, 6, 2, 7]], ['Lower A', [8, 5, 8, 9, 0]], ['Upper B', [3, 1, 6, 2, 7]], ['Lower B', [8, 5, 8, 9, 0]]],
  5: [['Push', [3, 3, 6, 6, 7]], ['Pull', [1, 1, 1, 2, 6]], ['Legs', [8, 8, 5, 8, 9]], ['Upper', [3, 1, 6, 2, 7]], ['Lower', [8, 5, 8, 9, 0]]],
  6: [['Push', [3, 3, 6, 6, 7]], ['Pull', [1, 1, 1, 2, 6]], ['Legs', [8, 8, 5, 8, 9]], ['Push 2', [3, 3, 6, 6, 7]], ['Pull 2', [1, 1, 1, 2, 6]], ['Legs 2', [8, 8, 5, 8, 0]]],
};

const GOAL_SCHEME: Record<Focus, { sets: number; reps: number; rest: number }> = {
  bulking: { sets: 4, reps: 10, rest: 90 },
  cutting: { sets: 3, reps: 15, rest: 45 },
  strength: { sets: 4, reps: 6, rest: 150 },
  general: { sets: 3, reps: 10, rest: 75 },
  maintaining: { sets: 3, reps: 10, rest: 75 },
};

export function generateAdaptive(p: AdaptivePrefs, exercises: Exercise[] = SEED_EXERCISES): Routine {
  const split = SPLITS[Math.min(6, Math.max(2, p.days))];
  const scheme = GOAL_SCHEME[p.goal];
  const pool = exercises.filter(
    (e) => e.recordType !== 'cardio' && (p.location === 'gym' || HOME_EQUIPMENT.includes(e.equipment)),
  );
  const days: WorkoutDay[] = split.map(([name, slots], di) => {
    const used = new Set<string>();
    const count = slots.length + (p.level === 3 ? 0 : p.level === 1 ? -1 : 0);
    const items: DayItem[] = [];
    slots.slice(0, Math.max(3, count)).forEach((part, k) => {
      const options = pool.filter((e) => e.bodyPart === part && !used.has(e.id));
      const ex = options[(di + k) % Math.max(1, options.length)];
      if (!ex) return;
      used.add(ex.id);
      const first = k === 0 && p.goal === 'strength';
      items.push({
        id: uid(),
        exerciseId: ex.id,
        supersetId: 0,
        sets: sets(
          Math.max(2, scheme.sets - (p.level === 1 ? 1 : 0)),
          first ? 5 : ex.bodyPart === 0 ? 15 : scheme.reps,
          first ? 180 : scheme.rest,
        ),
      });
    });
    if (p.goal === 'cutting') {
      const cardio = exercises.find((e) => e.recordType === 'cardio' && e.bodyPart === 10 && (p.location === 'gym' || HOME_EQUIPMENT.includes(e.equipment)));
      if (cardio) items.push({ id: uid(), exerciseId: cardio.id, supersetId: 0, sets: sets(1, 10, 0) });
    }
    return { id: uid(), name, items };
  });
  return {
    id: uid(),
    name: 'Your Adaptive Plan',
    description: `A ${MESO_WEEKS}-week cycle: three weeks building volume, one heavier week, then a deload. It restarts automatically.`,
    difficulty: p.level,
    focus: p.goal,
    daysPerWeek: p.days,
    days,
    author: 'Built for you',
    location: p.location,
    adaptive: { start: Date.now(), weeks: MESO_WEEKS },
  };
}

// What the plan says for today. Days pinned to weekdays follow the calendar (no match = rest
// day, with the next pinned day); otherwise the plan rotates: the day after the last one done.
export function todayPlan(r: Routine | undefined, sessions: Session[], now = new Date()): { day?: WorkoutDay; rest?: boolean; next?: { day: WorkoutDay; inDays: number }; doneToday: boolean } {
  if (!r?.days.length) return { doneToday: false };
  const dow = (now.getDay() + 6) % 7;
  const today = new Date(now).setHours(0, 0, 0, 0);
  const pinned = r.days.filter((d) => d.weekday !== undefined);
  let day: WorkoutDay | undefined;
  if (pinned.length) {
    day = pinned.find((d) => d.weekday === dow);
    if (!day) {
      const inDays = (d: WorkoutDay) => (d.weekday! - dow + 7) % 7 || 7;
      const nextDay = [...pinned].sort((a, b) => inDays(a) - inDays(b))[0];
      return { rest: true, next: { day: nextDay, inDays: inDays(nextDay) }, doneToday: sessions.some((s) => s.start >= today) };
    }
  } else {
    const last = sessions.find((s) => s.routineId === r.id && s.dayId);
    const doneTodayLast = last && last.start >= today;
    const i = last ? r.days.findIndex((d) => d.id === last.dayId) : -1;
    // Finished today's already: keep showing it as done rather than jumping ahead.
    day = doneTodayLast && i >= 0 ? r.days[i] : r.days[(i + 1) % r.days.length];
  }
  return { day, doneToday: sessions.some((s) => s.dayId === day!.id && s.start >= today) };
}

export { CATALOG };
