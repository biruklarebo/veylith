import type { BodyStat, CuratedProgram, Exercise, ExerciseRecord, ProgressPhoto, Routine, ScheduledDay, Session, Settings } from '../types';

// What sync reads and writes. Each collection maps an item's key to its data.
export interface Synced {
  sessions: Session[];
  routines: Routine[];
  customExercises: Exercise[];
  curated: CuratedProgram[];
  bodyStats: BodyStat[];
  photos: ProgressPhoto[];
  schedule: ScheduledDay[];
  records: Record<string, ExerciseRecord>;
  settings: Settings;
  activeRoutineId: string | null;
  activeSession: Session | null;
}

export const COLLECTIONS = ['sessions', 'routines', 'exercises', 'programs', 'body_stats', 'photos', 'scheduled_days', 'exercise_records', 'user_state'] as const;
export type Collection = (typeof COLLECTIONS)[number];
export type Items = Record<string, unknown>;

// Real history. On a device's first sync it is kept alongside the account's data; everything
// else on a new device is only the starter content.
export const HISTORY: Collection[] = ['sessions', 'body_stats', 'photos'];

// JSON with sorted keys, so the same item always compares equal after a round trip.
export const canon = (v: unknown) =>
  JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

const scheduleKey = (x: ScheduledDay) => `${x.date}|${x.routineId}|${x.dayId}`;
const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x]));

export function toItems(s: Synced): Record<Collection, Items> {
  const state: Items = { settings: s.settings };
  if (s.activeRoutineId) state.activeRoutineId = s.activeRoutineId;
  if (s.activeSession) state.activeSession = s.activeSession;
  return {
    sessions: byId(s.sessions),
    routines: byId(s.routines),
    exercises: byId(s.customExercises),
    programs: byId(s.curated),
    body_stats: byId(s.bodyStats),
    photos: byId(s.photos),
    scheduled_days: Object.fromEntries(s.schedule.map((x) => [scheduleKey(x), x])),
    exercise_records: s.records,
    user_state: state,
  };
}

// Items back to arrays, keeping the order the device already has and adding new ones after.
function ordered<T>(list: T[], items: Items, key: (x: T) => string): T[] {
  const known = new Set(list.map(key));
  return [...list.filter((x) => key(x) in items).map((x) => items[key(x)] as T), ...Object.keys(items).filter((k) => !known.has(k)).map((k) => items[k] as T)];
}

export function fromItems(items: Record<Collection, Items>, s: Synced): Synced {
  const id = (x: { id: string }) => x.id;
  return {
    sessions: ordered(s.sessions, items.sessions, id).sort((a, b) => b.start - a.start),
    routines: ordered(s.routines, items.routines, id),
    customExercises: ordered(s.customExercises, items.exercises, id),
    curated: ordered(s.curated, items.programs, id),
    bodyStats: ordered(s.bodyStats, items.body_stats, id).sort((a, b) => a.date.localeCompare(b.date)),
    photos: ordered(s.photos, items.photos, id).sort((a, b) => a.date.localeCompare(b.date)),
    schedule: ordered(s.schedule, items.scheduled_days, scheduleKey),
    records: items.exercise_records as Record<string, ExerciseRecord>,
    settings: (items.user_state.settings as Settings | undefined) ?? s.settings,
    activeRoutineId: (items.user_state.activeRoutineId as string | undefined) ?? null,
    activeSession: (items.user_state.activeSession as Session | undefined) ?? null,
  };
}

// Combines the device's items with the server's. `base` is what they last agreed on: an item
// unchanged since then takes the server's version, and one changed here keeps this device's.
// With no `base` this device has never synced: the server wins, and items only it has are kept
// when `keepLocal` is set. Whatever differs from `remote` afterwards gets pushed.
export function merge(local: Items, remote: Items, base: Record<string, string> | null, keepLocal: boolean): Items {
  const out: Items = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const inLocal = k in local;
    const inRemote = k in remote;
    const keep = base
      ? (inLocal ? canon(local[k]) : undefined) !== base[k]
      : !inRemote && keepLocal;
    if (keep) {
      if (inLocal) out[k] = local[k];
    } else if (inRemote) out[k] = remote[k];
  }
  return out;
}
