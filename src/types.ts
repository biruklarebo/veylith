// Data model: routines -> days -> planned sets; sessions -> exercise logs -> logged sets.
// Weights are stored in lbs and converted for display.

export const BODY_PARTS = [
  'Abs', 'Back', 'Biceps', 'Chest', 'Forearms', 'Glutes',
  'Shoulders', 'Triceps', 'Upper Legs', 'Lower Legs', 'Cardio',
] as const;

export type Equipment =
  | 'Barbell' | 'Dumbbell' | 'Machine' | 'Cable'
  | 'Bodyweight' | 'Kettlebell' | 'Band' | 'Other';

export const EQUIPMENT: Equipment[] = [
  'Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Band', 'Other',
];

export type RecordType = 'weight' | 'bodyweight' | 'cardio';

export interface Exercise {
  id: string;
  name: string;
  bodyPart: number; // index into BODY_PARTS
  secondary?: number[];
  equipment: Equipment;
  recordType: RecordType;
  custom?: boolean;
}

export type SetType = 'regular' | 'warmup' | 'drop' | 'failure';

export interface PlanSet {
  type: SetType;
  weightLbs: number | null;
  reps: number;
  rest: number; // seconds
}

export interface DayItem {
  id: string;
  exerciseId: string;
  supersetId: number; // 0 = not in a superset
  sets: PlanSet[];
}

export interface WorkoutDay {
  id: string;
  name: string;
  weekday?: number; // 0 = Mon … 6 = Sun; unset = any day
  items: DayItem[];
}

export type Focus = 'general' | 'bulking' | 'cutting' | 'strength' | 'maintaining';
export type Location = 'gym' | 'home';

export interface Routine {
  id: string;
  name: string;
  description: string;
  difficulty: 1 | 2 | 3;
  focus: Focus;
  daysPerWeek: number;
  days: WorkoutDay[];
  author?: string;
  templateId?: string; // catalog plan this was copied from
  location?: Location;
  // Adaptive mesocycle: phases advance weekly from `start`.
  adaptive?: { start: number; weeks: number };
}

export interface LoggedSet {
  type: SetType;
  weightLbs: number;
  reps: number;
  durationSec?: number;
  rest?: number; // seconds after this set; falls back to the log's rest
  done: boolean;
}

export interface ExerciseLog {
  exerciseId: string;
  supersetId: number;
  rest: number;
  sets: LoggedSet[];
}

export interface Session {
  id: string;
  name: string;
  routineId?: string;
  dayId?: string;
  start: number;
  end?: number;
  logs: ExerciseLog[];
  note?: string;
  rpe?: number; // index into RPE_LABELS
  current?: number; // exercise being logged
  skipRest?: boolean;
  // Running rest timer. `start` is the planned rest for that set; `pausedLeft` is set while paused.
  rest?: { endsAt: number; total: number; start: number; log: number; set: number; pausedLeft?: number } | null;
}

// 10-step exertion scale shown as a 1–10 slider.
export const RPE_LABELS = [
  'Very light', 'Light', 'Moderate', 'Slightly tiring', 'Tiring',
  'Challenging', 'Hard', 'Very hard', 'Extremely hard', 'Maximal effort',
];
export const RPE_HINTS = [
  'Barely any effort, warm-up territory.',
  'Easy going, could keep this up for a long time.',
  'Comfortable and controlled.',
  'Noticeable effort, but steady.',
  'Starting to work, still manageable.',
  'Had to concentrate to hold form.',
  'Tough reps, kept pushing through.',
  'Every rep took real grit.',
  'Fought for each rep.',
  'Nothing left in the tank.',
];
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface ExerciseRecord {
  best1RM: number;
  bestAt: number;
  target1RM?: number;
}

export const BODY_FIELDS = [
  'weight', 'fat', 'chest', 'arms', 'waist', 'hips', 'thighs', 'calves', 'shoulders', 'neck', 'forearms',
] as const;
export type BodyField = (typeof BODY_FIELDS)[number];

export interface BodyStat {
  id: string;
  date: string; // YYYY-MM-DD
  values: Partial<Record<BodyField, number>>;
}

export interface Settings {
  unit: 'lb' | 'kg';
  defaultRest: number;
  restTimerOn: boolean;
}
