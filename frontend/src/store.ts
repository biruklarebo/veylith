import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';
import { SEED_EXERCISES } from './data/exercises';
import { SEED_ROUTINES } from './data/routines';
import { logBest1RM, uid } from './lib/calc';
import { applyPhase, phaseOf } from './lib/plans';
import { nextTarget, ruleFor } from './lib/progression';
import { blockFor, currentWeek, daysForWeek, guessExercise, matchExercise, nameKey, parseProgram, type ParsedProgram } from './lib/programImport';
import { SEED_PROGRAMS } from './data/programs';
import type {
  BodyStat, CuratedProgram, DayItem, ProgressPhoto, Exercise, ExerciseLog, ExerciseRecord, LoggedSet, ProgressionRule, Routine, Session, Settings, WorkoutDay,
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
  curated: CuratedProgram[];
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
  importProgram: (p: ParsedProgram, source: string) => CuratedProgram;
  deleteProgram: (id: string) => void;
  startGuided: (programId: string, choices: Record<string, string>) => Routine | null;
  refreshGuided: () => void;
  setGuidedChoice: (routineId: string, slotKey: string, exerciseId: string) => void;
  setGuidedWeek: (routineId: string, week: number) => void;
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
  const base = { exerciseId: item.exerciseId, supersetId: item.supersetId, rest: working?.rest ?? 90, alternatives: item.alternatives, note: item.note };
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

// Match every exercise name to the library; names it doesn't know become custom exercises.
function buildProgram(parsed: ParsedProgram, source: string, customExercises: Exercise[], id = uid(), builtin?: true) {
  const library = [...SEED_EXERCISES, ...customExercises];
  const ids: Record<string, string> = {};
  const added: Exercise[] = [];
  for (const b of parsed.blocks)
    for (const d of b.days)
      for (const slot of d.slots)
        for (const name of slot.options) {
          const k = nameKey(name);
          if (ids[k]) continue;
          const known = [...library, ...added].find((e) => nameKey(e.name) === k) ?? matchExercise(name, library);
          if (known) ids[k] = known.id;
          else {
            const ex: Exercise = { ...guessExercise(name), id: `custom-${uid()}`, custom: true };
            added.push(ex);
            ids[k] = ex.id;
          }
        }
  const program: CuratedProgram = { id, name: parsed.name, source, weeks: parsed.weeks, blocks: parsed.blocks, ids, imported: Date.now(), builtin };
  return { program, added };
}

// Programs that ship with the app, added to Curated on first run (and for existing users by
// migration). Removing one keeps it removed.
function seedPrograms(customExercises: Exercise[], after = 0) {
  let custom = customExercises;
  const programs = SEED_PROGRAMS.filter((p) => p.since > after).map(({ id, name, csv }) => {
    const { program, added } = buildProgram({ ...parseProgram(csv, name), name }, 'Veylith', custom, id, true);
    custom = [...custom, ...added];
    return program;
  });
  return { curated: programs, customExercises: custom };
}
const seeded = seedPrograms([]);

export const useStore = create<State>()(
  persist(
    (setState, getState) => ({
      customExercises: seeded.customExercises,
      routines: SEED_ROUTINES,
      activeRoutineId: 'ppl',
      sessions: [],
      activeSession: null,
      records: {},
      bodyStats: [],
      photos: [],
      curated: seeded.curated,
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
        getState().refreshGuided();
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
      deleteSession: (id) =>
        setState((s) => {
          const gone = s.sessions.find((x) => x.id === id);
          const sessions = s.sessions.filter((x) => x.id !== id);
          // A record set in the deleted workout goes with it: fall back to the best one left.
          const records = { ...s.records };
          for (const l of gone?.logs ?? []) {
            let best = 0;
            let bestAt = 0;
            for (const x of sessions)
              for (const y of x.logs) {
                const v = y.exerciseId === l.exerciseId ? logBest1RM(y) : 0;
                if (v > best) {
                  best = v;
                  bestAt = x.end ?? x.start;
                }
              }
            records[l.exerciseId] = { ...records[l.exerciseId], best1RM: best, bestAt };
          }
          return { sessions, records };
        }),

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
      importProgram: (parsed, source) => {
        const { program, added } = buildProgram(parsed, source, getState().customExercises);
        setState((s) => ({ curated: [...s.curated, program], customExercises: [...s.customExercises, ...added] }));
        return program;
      },
      deleteProgram: (id) => setState((s) => ({ curated: s.curated.filter((p) => p.id !== id) })),
      startGuided: (programId, choices) => {
        const p = getState().curated.find((x) => x.id === programId);
        if (!p) return null;
        const base: Routine = {
          id: uid(),
          name: p.name,
          description: `${p.builtin ? 'Curated program' : `Imported from ${p.source}`}. ${p.weeks} weeks, follows the week you're on.`,
          difficulty: 2,
          focus: 'general',
          daysPerWeek: p.blocks[0].days.length,
          days: [],
          author: p.builtin ? 'Veylith' : 'Imported',
          progression: 'off',
          guided: { programId, start: new Date().setHours(0, 0, 0, 0), choices, block: blockFor(p, 1).label },
        };
        const r = { ...base, days: daysForWeek(p, base, 1) };
        setState((s) => ({ routines: [...s.routines, r], activeRoutineId: r.id }));
        return r;
      },
      refreshGuided: () =>
        setState((s) => {
          let changed = false;
          const routines = s.routines.map((r) => {
            const p = r.guided && s.curated.find((x) => x.id === r.guided!.programId);
            if (!p || !r.guided) return r;
            const label = blockFor(p, currentWeek(r)).label;
            if (label === r.guided.block) return r;
            changed = true;
            const next = { ...r, guided: { ...r.guided, block: label } };
            return { ...next, days: daysForWeek(p, next, currentWeek(r)) };
          });
          return changed ? { routines } : {};
        }),
      setGuidedChoice: (routineId, slotKey, exerciseId) =>
        setState((s) => ({
          routines: s.routines.map((r) => {
            const p = r.guided && s.curated.find((x) => x.id === r.guided!.programId);
            if (r.id !== routineId || !p || !r.guided) return r;
            const next = { ...r, guided: { ...r.guided, choices: { ...r.guided.choices, [slotKey]: exerciseId } } };
            return { ...next, days: daysForWeek(p, next, currentWeek(next)) };
          }),
        })),
      setGuidedWeek: (routineId, week) =>
        setState((s) => ({
          routines: s.routines.map((r) => {
            const p = r.guided && s.curated.find((x) => x.id === r.guided!.programId);
            if (r.id !== routineId || !p || !r.guided) return r;
            const w = Math.max(1, Math.min(p.weeks, week));
            const start = new Date().setHours(0, 0, 0, 0) - (w - 1) * 7 * 864e5;
            const next = { ...r, guided: { ...r.guided, start, block: blockFor(p, w).label } };
            return { ...next, days: daysForWeek(p, next, w) };
          }),
        })),
      updateSettings: (p) => setState((s) => ({ settings: { ...s.settings, ...p } })),
    }),
    {
      name: 'veylith',
      storage: createJSONStorage(() => idbStorage),
      version: 5,
      migrate: (state, version) => {
        let s = state as State;
        if (version < 5) {
          const seed = seedPrograms(s.customExercises ?? [], version);
          const names = Object.fromEntries(SEED_PROGRAMS.map((p) => [p.id, p.name]));
          const curated = (s.curated ?? []).map((p) => (p.builtin && names[p.id] ? { ...p, name: names[p.id] } : p));
          s = { ...s, curated: [...seed.curated, ...curated], customExercises: seed.customExercises };
        }
        return s;
      },
    },
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
