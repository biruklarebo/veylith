import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';
import { SEED_EXERCISES } from './data/exercises';
import { SEED_ROUTINES } from './data/routines';
import { logBest1RM, uid } from './lib/calc';
import { applyPhase, phaseOf } from './lib/plans';
import { nextTarget, ruleFor } from './lib/progression';
import type {
  BodyStat, DayItem, ProgressPhoto, Exercise, ExerciseLog, ExerciseRecord, LoggedSet, ProgressionRule, Routine, Session, Settings, WorkoutDay,
} from './types';

const idbStorage: StateStorage = {
  getItem: async (k) => (await get(k)) ?? null,
  setItem: (k, v) => set(k, v),
  removeItem: (k) => del(k),
};

export interface FinishResult {
  session: Session;
  prs: { exerciseId: string; oneRm: number; previous: number }[];
  number: number; // lifetime workout count including this one
}

// Exercises whose best estimated 1RM in these logs beats the stored record.
export function findPRs(logs: ExerciseLog[], records: Record<string, ExerciseRecord>): FinishResult['prs'] {
  const prs: FinishResult['prs'] = [];
  for (const l of logs) {
    const best = logBest1RM(l);
    const prev = records[l.exerciseId]?.best1RM ?? 0;
    if (best > prev && prev > 0) prs.push({ exerciseId: l.exerciseId, oneRm: best, previous: prev });
  }
  return prs;
}

// Only checked-off sets are kept when a workout is saved.
export const doneLogs = (s: Session) =>
  s.logs.map((l) => ({ ...l, sets: l.sets.filter((x) => x.done) })).filter((l) => l.sets.length);

interface State {
  customExercises: Exercise[];
  routines: Routine[];
  activeRoutineId: string | null;
  sessions: Session[];
  activeSession: Session | null;
  records: Record<string, ExerciseRecord>;
  bodyStats: BodyStat[];
  photos: ProgressPhoto[];
  settings: Settings;

  addCustomExercise: (e: Omit<Exercise, 'id' | 'custom'>) => Exercise;
  saveRoutine: (r: Routine) => void;
  deleteRoutine: (id: string) => void;
  setActiveRoutine: (id: string | null) => void;
  adoptPlan: (r: Routine) => void;
  updateDay: (routineId: string, day: WorkoutDay) => void;
  moveDay: (routineId: string, from: number, to: number) => void;

  startSession: (routineId?: string, dayId?: string) => void;
  startInstant: (name: string, items: DayItem[]) => void;
  updateActive: (fn: (s: Session) => Session) => void;
  endSession: () => void;
  resumeSession: () => void;
  finishSession: (opts?: { updatePlan?: boolean }) => FinishResult | null;
  discardSession: () => void;
  deleteSession: (id: string) => void;

  setTarget1RM: (exerciseId: string, target: number | undefined) => void;
  saveBodyStat: (b: BodyStat) => void;
  deleteBodyStat: (id: string) => void;
  addPhoto: (p: ProgressPhoto) => void;
  updatePhoto: (id: string, p: Partial<ProgressPhoto>) => void;
  deletePhoto: (id: string) => void;
  updateSettings: (p: Partial<Settings>) => void;
}

interface Prefill {
  sessions: Session[];
  settings: Settings;
  custom: Exercise[];
  rule: ProgressionRule;
  deload?: boolean;
}

// Numbers for a planned exercise: the progression engine's target when a rule is on and there
// is history, otherwise the most recent weights for this exercise, otherwise the plan.
function logFromPlan(item: DayItem, p: Prefill): ExerciseLog {
  const working = item.sets.find((x) => x.type !== 'warmup') ?? item.sets[0];
  const base = { exerciseId: item.exerciseId, supersetId: item.supersetId, rest: working?.rest ?? 90 };
  const target = nextTarget(item, p.sessions, findExercise(item.exerciseId, p.custom), p.rule, p.settings, { deload: p.deload });
  if (target) {
    const { sets, ...t } = target;
    return {
      ...base,
      target: t,
      sets: sets.map((x, i) => ({ ...x, rest: item.sets[Math.min(i, item.sets.length - 1)]?.rest ?? base.rest, done: false })),
    };
  }
  const prev = p.sessions.find((s) => s.logs.some((l) => l.exerciseId === item.exerciseId))
    ?.logs.find((l) => l.exerciseId === item.exerciseId);
  const sets: LoggedSet[] = item.sets.map((x, i) => ({
    type: x.type,
    weightLbs: x.weightLbs ?? prev?.sets[i]?.weightLbs ?? prev?.sets.at(-1)?.weightLbs ?? 0,
    reps: x.reps,
    rest: x.rest,
    done: false,
  }));
  return { ...base, sets };
}

export const useStore = create<State>()(
  persist(
    (setState, getState) => ({
      customExercises: [],
      routines: SEED_ROUTINES,
      activeRoutineId: 'ppl',
      sessions: [],
      activeSession: null,
      records: {},
      bodyStats: [],
      photos: [],
      settings: { unit: 'lb', defaultRest: 90, restTimerOn: true },

      addCustomExercise: (e) => {
        const ex: Exercise = { ...e, id: `custom-${uid()}`, custom: true };
        setState((s) => ({ customExercises: [...s.customExercises, ex] }));
        return ex;
      },
      saveRoutine: (r) =>
        setState((s) => ({
          routines: s.routines.some((x) => x.id === r.id)
            ? s.routines.map((x) => (x.id === r.id ? r : x))
            : [...s.routines, r],
        })),
      deleteRoutine: (id) =>
        setState((s) => ({
          routines: s.routines.filter((r) => r.id !== id),
          activeRoutineId: s.activeRoutineId === id ? null : s.activeRoutineId,
        })),
      setActiveRoutine: (id) => setState({ activeRoutineId: id }),
      adoptPlan: (r) => setState((s) => ({ routines: [...s.routines, r], activeRoutineId: r.id })),
      updateDay: (routineId, day) =>
        setState((s) => ({
          routines: s.routines.map((r) =>
            r.id === routineId ? { ...r, days: r.days.map((d) => (d.id === day.id ? day : d)) } : r,
          ),
        })),

      moveDay: (routineId, from, to) =>
        setState((s) => ({
          routines: s.routines.map((r) => {
            if (r.id !== routineId) return r;
            const days = [...r.days];
            days.splice(to, 0, ...days.splice(from, 1));
            return { ...r, days };
          }),
        })),

      startSession: (routineId, dayId) => {
        const { routines, sessions, settings, customExercises } = getState();
        const routine = routines.find((r) => r.id === routineId);
        const planned = routine?.days.find((d) => d.id === dayId);
        // Adaptive plans adjust sets/reps for the current mesocycle week.
        const phase = routine && phaseOf(routine);
        const day = planned && phase ? applyPhase(planned, phase) : planned;
        setState({
          activeSession: {
            id: uid(),
            name: day ? `${day.name} Workout` : 'Quick Workout',
            routineId,
            dayId,
            start: Date.now(),
            current: 0,
            logs: day
              ? day.items.map((it) =>
                  logFromPlan(it, { sessions, settings, custom: customExercises, rule: ruleFor(routine), deload: phase?.phase === 'Deload' }),
                )
              : [],
          },
        });
      },
      startInstant: (name, items) =>
        setState((s) => ({
          activeSession: {
            id: uid(),
            name,
            start: Date.now(),
            current: 0,
            logs: items.map((it) => logFromPlan(it, { sessions: s.sessions, settings: s.settings, custom: s.customExercises, rule: 'off' })),
          },
        })),
      updateActive: (fn) => setState((s) => (s.activeSession ? { activeSession: fn(s.activeSession) } : {})),
      endSession: () =>
        setState((s) => (s.activeSession ? { activeSession: { ...s.activeSession, end: s.activeSession.end ?? Date.now(), rest: null } } : {})),
      resumeSession: () => setState((s) => (s.activeSession ? { activeSession: { ...s.activeSession, end: undefined } } : {})),
      finishSession: (opts) => {
        const { activeSession, records, sessions, routines } = getState();
        if (!activeSession) return null;
        const logs = doneLogs(activeSession);
        const session: Session = { ...activeSession, logs, end: activeSession.end ?? Date.now(), rest: null, current: undefined, skipRest: undefined };
        const prs = findPRs(logs, records);
        const nextRecords = { ...records };
        for (const l of logs) {
          const best = logBest1RM(l);
          if (best > (nextRecords[l.exerciseId]?.best1RM ?? 0))
            nextRecords[l.exerciseId] = { ...nextRecords[l.exerciseId], best1RM: best, bestAt: session.end! };
        }
        // Optionally write today's weights and reps back into the planned day.
        let nextRoutines = routines;
        if (opts?.updatePlan && session.routineId && session.dayId) {
          nextRoutines = routines.map((r) =>
            r.id !== session.routineId
              ? r
              : {
                  ...r,
                  days: r.days.map((d) =>
                    d.id !== session.dayId
                      ? d
                      : {
                          ...d,
                          items: d.items.map((it) => {
                            const l = logs.find((x) => x.exerciseId === it.exerciseId);
                            if (!l) return it;
                            return {
                              ...it,
                              sets: l.sets.map((x, i) => ({
                                type: x.type,
                                weightLbs: x.weightLbs,
                                reps: x.reps,
                                rest: x.rest ?? it.sets[i]?.rest ?? l.rest,
                              })),
                            };
                          }),
                        },
                  ),
                },
          );
        }
        setState({
          sessions: logs.length ? [session, ...sessions] : sessions,
          records: nextRecords,
          routines: nextRoutines,
          activeSession: null,
        });
        return { session, prs, number: sessions.length + (logs.length ? 1 : 0) };
      },
      discardSession: () => setState({ activeSession: null }),
      deleteSession: (id) => setState((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),

      setTarget1RM: (exerciseId, target) =>
        setState((s) => ({
          records: {
            ...s.records,
            [exerciseId]: {
              best1RM: s.records[exerciseId]?.best1RM ?? 0,
              bestAt: s.records[exerciseId]?.bestAt ?? 0,
              target1RM: target,
            },
          },
        })),
      saveBodyStat: (b) =>
        setState((s) => ({
          bodyStats: [...s.bodyStats.filter((x) => x.id !== b.id && x.date !== b.date), b].sort((a, c) =>
            a.date.localeCompare(c.date),
          ),
        })),
      deleteBodyStat: (id) => setState((s) => ({ bodyStats: s.bodyStats.filter((x) => x.id !== id) })),
      addPhoto: (p) => setState((s) => ({ photos: [...s.photos, p].sort((a, b) => a.date.localeCompare(b.date)) })),
      updatePhoto: (id, p) =>
        setState((s) => ({ photos: s.photos.map((x) => (x.id === id ? { ...x, ...p } : x)).sort((a, b) => a.date.localeCompare(b.date)) })),
      deletePhoto: (id) => setState((s) => ({ photos: s.photos.filter((x) => x.id !== id) })),
      updateSettings: (p) => setState((s) => ({ settings: { ...s.settings, ...p } })),
    }),
    { name: 'veylith', storage: createJSONStorage(() => idbStorage), version: 1 },
  ),
);

export function useExercises(): Exercise[] {
  const custom = useStore((s) => s.customExercises);
  return custom.length ? [...SEED_EXERCISES, ...custom] : SEED_EXERCISES;
}

const seedById = new Map(SEED_EXERCISES.map((e) => [e.id, e]));
export function findExercise(id: string, custom: Exercise[]): Exercise | undefined {
  return seedById.get(id) ?? custom.find((e) => e.id === id);
}

export function useExercise(id: string): Exercise | undefined {
  const custom = useStore((s) => s.customExercises);
  return findExercise(id, custom);
}

// The most recent finished log of an exercise, before `before` when given.
export function previousLog(sessions: Session[], exerciseId: string, before?: number): { log: ExerciseLog; at: number } | null {
  for (const s of sessions) {
    if (before !== undefined && s.start >= before) continue;
    const log = s.logs.find((l) => l.exerciseId === exerciseId && l.sets.some((x) => x.done));
    if (log) return { log, at: s.start };
  }
  return null;
}
