import type { DayItem, PlanSet, Routine } from '../types';

const sets = (n: number, reps: number, rest = 90, warmup = 0): PlanSet[] => [
  ...Array.from({ length: warmup }, () => ({ type: 'warmup' as const, weightLbs: null, reps: 10, rest: 60 })),
  ...Array.from({ length: n }, () => ({ type: 'regular' as const, weightLbs: null, reps, rest })),
];

let n = 0;
const item = (exerciseId: string, s: PlanSet[], supersetId = 0): DayItem => ({
  id: `seed-${++n}`,
  exerciseId,
  supersetId,
  sets: s,
});

export const SEED_ROUTINES: Routine[] = [
  {
    id: 'ppl',
    name: 'Push Pull Legs',
    description: 'Classic 3-day split hitting each movement pattern once a week. Run it twice for a 6-day week.',
    difficulty: 2,
    focus: 'bulking',
    daysPerWeek: 3,
    days: [
      {
        id: 'ppl-push',
        name: 'Push',
        items: [
          item('barbell-bench-press', sets(4, 8, 120, 1)),
          item('seated-dumbbell-press', sets(3, 10)),
          item('incline-dumbbell-press', sets(3, 10)),
          item('dumbbell-lateral-raise', sets(3, 15, 60), 1),
          item('cable-triceps-pushdown', sets(3, 12, 60), 1),
        ],
      },
      {
        id: 'ppl-pull',
        name: 'Pull',
        items: [
          item('barbell-deadlift', sets(3, 5, 180, 1)),
          item('pull-up', sets(3, 8)),
          item('seated-cable-row', sets(3, 10)),
          item('face-pull', sets(3, 15, 60), 1),
          item('hammer-curl', sets(3, 12, 60), 1),
        ],
      },
      {
        id: 'ppl-legs',
        name: 'Legs',
        items: [
          item('barbell-back-squat', sets(4, 6, 180, 1)),
          item('romanian-deadlift', sets(3, 10, 120)),
          item('leg-press', sets(3, 12)),
          item('lying-leg-curl', sets(3, 12, 60)),
          item('standing-calf-raise', sets(4, 15, 45)),
        ],
      },
    ],
  },
  {
    id: 'full-body',
    name: 'Full Body Beginner',
    description: 'Three full-body sessions a week built around the big compound lifts.',
    difficulty: 1,
    focus: 'general',
    daysPerWeek: 3,
    days: [
      {
        id: 'fb-a',
        name: 'Day A',
        items: [
          item('barbell-back-squat', sets(3, 8, 120)),
          item('barbell-bench-press', sets(3, 8, 120)),
          item('barbell-bent-over-row', sets(3, 8, 120)),
          item('plank', [{ type: 'regular', weightLbs: null, reps: 1, rest: 60 }]),
        ],
      },
      {
        id: 'fb-b',
        name: 'Day B',
        items: [
          item('barbell-deadlift', sets(3, 5, 180)),
          item('barbell-overhead-press', sets(3, 8, 120)),
          item('lat-pulldown', sets(3, 10)),
          item('walking-lunge', sets(3, 10)),
        ],
      },
    ],
  },
];
