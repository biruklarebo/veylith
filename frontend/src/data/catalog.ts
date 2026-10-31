import type { Focus, Location } from '../types';

// Plan catalog for the Find tab.
export const CATEGORIES = [
  { id: 'muscle-gain', name: 'Muscle Gain', icon: 'muscle' },
  { id: 'fat-loss', name: 'Fat Loss', icon: 'flame' },
  { id: 'push-pull', name: 'Push/Pull', icon: 'pushpull' },
  { id: 'abs', name: 'Abs', icon: 'abs' },
  { id: 'full-body', name: 'Full Body', icon: 'body' },
  { id: 'at-home', name: 'At Home', icon: 'home' },
  { id: '3-day-split', name: '3 Day Split', icon: 'three' },
  { id: 'stretch', name: 'Stretch', icon: 'stretch' },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]['id'];

// [exerciseId, sets, reps, rest seconds]
type Ex = [string, number, number, number?];

export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  goal: Focus;
  level: 1 | 2 | 3;
  location: Location;
  categories: CategoryId[];
  hue: number; // card art colour
  trending?: boolean;
  days: [string, Ex[]][];
}

export const CATALOG: PlanTemplate[] = [
  {
    id: 'ppl-foundations',
    name: 'Push Pull Legs Foundations',
    description: 'A six-day push/pull/legs rotation built on steady weekly progression. Add a little weight whenever you hit the top of the rep range.',
    goal: 'general',
    level: 1,
    location: 'gym',
    categories: ['push-pull', 'muscle-gain'],
    hue: 218,
    trending: true,
    days: [
      ['Push', [['barbell-bench-press', 3, 8, 120], ['barbell-overhead-press', 3, 8, 120], ['incline-dumbbell-press', 3, 10], ['dumbbell-lateral-raise', 3, 15, 60], ['cable-triceps-pushdown', 3, 12, 60]]],
      ['Pull', [['barbell-deadlift', 1, 5, 180], ['pull-up', 3, 8], ['seated-cable-row', 3, 10], ['face-pull', 3, 15, 60], ['dumbbell-curl', 3, 12, 60]]],
      ['Legs', [['barbell-back-squat', 3, 6, 150], ['romanian-deadlift', 3, 10], ['leg-press', 3, 12], ['lying-leg-curl', 3, 12, 60], ['standing-calf-raise', 4, 12, 60]]],
      ['Push 2', [['barbell-overhead-press', 3, 6, 120], ['dumbbell-bench-press', 3, 10], ['cable-crossover', 3, 12, 60], ['cable-lateral-raise', 3, 15, 60], ['skull-crusher', 3, 10, 60]]],
      ['Pull 2', [['barbell-bent-over-row', 3, 8, 120], ['lat-pulldown', 3, 10], ['one-arm-dumbbell-row', 3, 10], ['reverse-pec-deck', 3, 15, 60], ['hammer-curl', 3, 12, 60]]],
      ['Legs 2', [['barbell-front-squat', 3, 8, 150], ['bulgarian-split-squat', 3, 10], ['leg-extension', 3, 12, 60], ['seated-leg-curl', 3, 12, 60], ['seated-calf-raise', 4, 15, 60]]],
    ],
  },
  {
    id: 'mass-five',
    name: 'Five-Day Mass Builder',
    description: 'One muscle group per day with plenty of volume. Classic bodybuilding split for putting on size.',
    goal: 'bulking',
    level: 2,
    location: 'gym',
    categories: ['muscle-gain'],
    hue: 350,
    trending: true,
    days: [
      ['Chest', [['barbell-bench-press', 4, 8, 120], ['incline-dumbbell-press', 4, 10], ['machine-chest-press', 3, 12], ['pec-deck', 3, 15, 60], ['chest-dip', 3, 10]]],
      ['Back', [['barbell-deadlift', 3, 5, 180], ['pull-up', 4, 8], ['t-bar-row', 4, 10], ['lat-pulldown', 3, 12], ['straight-arm-pulldown', 3, 15, 60]]],
      ['Shoulders', [['seated-dumbbell-press', 4, 10], ['arnold-press', 3, 10], ['dumbbell-lateral-raise', 4, 15, 60], ['face-pull', 3, 15, 60], ['barbell-shrug', 4, 12, 60]]],
      ['Legs', [['barbell-back-squat', 4, 8, 150], ['leg-press', 4, 12], ['romanian-deadlift', 3, 10], ['leg-extension', 3, 15, 60], ['standing-calf-raise', 4, 12, 60]]],
      ['Arms', [['barbell-curl', 4, 10, 60], ['close-grip-bench-press', 4, 8], ['incline-dumbbell-curl', 3, 12, 60], ['overhead-cable-extension', 3, 12, 60], ['hammer-curl', 3, 12, 60], ['cable-triceps-pushdown', 3, 15, 60]]],
    ],
  },
  {
    id: 'lean-basics',
    name: 'Lean Muscle Basics',
    description: 'Three full-body sessions a week. Simple, repeatable, and enough stimulus to grow while staying lean.',
    goal: 'maintaining',
    level: 1,
    location: 'gym',
    categories: ['muscle-gain', 'full-body', '3-day-split'],
    hue: 290,
    days: [
      ['Full Body A', [['goblet-squat', 3, 10], ['dumbbell-bench-press', 3, 10], ['lat-pulldown', 3, 10], ['dumbbell-lateral-raise', 2, 15, 60], ['plank', 3, 1, 45]]],
      ['Full Body B', [['romanian-deadlift', 3, 10], ['seated-dumbbell-press', 3, 10], ['seated-cable-row', 3, 10], ['dumbbell-curl', 2, 12, 60], ['crunch', 3, 15, 45]]],
      ['Full Body C', [['leg-press', 3, 12], ['incline-dumbbell-press', 3, 10], ['one-arm-dumbbell-row', 3, 10], ['cable-triceps-pushdown', 2, 12, 60], ['hanging-leg-raise', 3, 10, 45]]],
    ],
  },
  {
    id: 'upper-lower',
    name: 'Upper / Lower Builder',
    description: 'Four days alternating upper and lower body. Each muscle is trained twice a week, one heavier day and one lighter.',
    goal: 'bulking',
    level: 2,
    location: 'gym',
    categories: ['muscle-gain'],
    hue: 200,
    days: [
      ['Upper Heavy', [['barbell-bench-press', 4, 6, 150], ['barbell-bent-over-row', 4, 6, 150], ['barbell-overhead-press', 3, 8, 120], ['chin-up', 3, 8], ['skull-crusher', 3, 10, 60]]],
      ['Lower Heavy', [['barbell-back-squat', 4, 6, 180], ['romanian-deadlift', 3, 8, 120], ['leg-press', 3, 10], ['standing-calf-raise', 4, 10, 60], ['cable-crunch', 3, 12, 60]]],
      ['Upper Volume', [['incline-dumbbell-press', 4, 10], ['lat-pulldown', 4, 12], ['cable-lateral-raise', 3, 15, 60], ['seated-cable-row', 3, 12], ['cable-curl', 3, 12, 60]]],
      ['Lower Volume', [['hack-squat', 4, 10], ['bulgarian-split-squat', 3, 10], ['lying-leg-curl', 3, 12, 60], ['leg-extension', 3, 15, 60], ['seated-calf-raise', 4, 15, 60]]],
    ],
  },
  {
    id: 'big-lift-strength',
    name: 'Big Lift Strength',
    description: 'Low reps on the squat, bench and deadlift with a few accessories. Rest fully between heavy sets.',
    goal: 'strength',
    level: 2,
    location: 'gym',
    categories: ['3-day-split'],
    hue: 30,
    days: [
      ['Squat Day', [['barbell-back-squat', 5, 5, 180], ['barbell-front-squat', 3, 5, 150], ['lying-leg-curl', 3, 10, 60], ['plank', 3, 1, 45]]],
      ['Bench Day', [['barbell-bench-press', 5, 5, 180], ['close-grip-bench-press', 3, 6, 150], ['barbell-bent-over-row', 4, 8, 120], ['face-pull', 3, 15, 60]]],
      ['Deadlift Day', [['barbell-deadlift', 5, 3, 210], ['barbell-overhead-press', 4, 5, 150], ['pull-up', 3, 6], ['hanging-leg-raise', 3, 10, 60]]],
    ],
  },
  {
    id: 'burn-circuit',
    name: 'Burn Circuit',
    description: 'Higher reps, short rest and a cardio finisher each session. Built to keep your heart rate up.',
    goal: 'cutting',
    level: 1,
    location: 'gym',
    categories: ['fat-loss'],
    hue: 12,
    trending: true,
    days: [
      ['Circuit A', [['goblet-squat', 3, 15, 45], ['push-up', 3, 15, 45], ['seated-cable-row', 3, 15, 45], ['kettlebell-swing', 3, 20, 45], ['rowing-machine', 1, 10, 0]]],
      ['Circuit B', [['walking-lunge', 3, 12, 45], ['machine-chest-press', 3, 15, 45], ['lat-pulldown', 3, 15, 45], ['mountain-climber', 3, 30, 30], ['stationary-bike', 1, 12, 0]]],
      ['Circuit C', [['leg-press', 3, 15, 45], ['dumbbell-lateral-raise', 3, 15, 45], ['one-arm-dumbbell-row', 3, 15, 45], ['burpee', 3, 10, 45], ['stair-climber', 1, 10, 0]]],
    ],
  },
  {
    id: 'home-sweat',
    name: 'Home Sweat',
    description: 'No equipment needed. Three quick bodyweight sessions you can do in a living room.',
    goal: 'cutting',
    level: 1,
    location: 'home',
    categories: ['fat-loss', 'at-home'],
    hue: 160,
    days: [
      ['Day 1', [['bodyweight-squat', 3, 20, 30], ['push-up', 3, 12, 30], ['mountain-climber', 3, 30, 30], ['reverse-lunge', 3, 12, 30], ['jumping-jack', 1, 3, 0]]],
      ['Day 2', [['burpee', 3, 10, 45], ['inverted-row', 3, 10, 30], ['glute-bridge', 3, 20, 30], ['bicycle-crunch', 3, 20, 30], ['high-knees', 1, 3, 0]]],
      ['Day 3', [['reverse-lunge', 3, 15, 30], ['pike-push-up', 3, 10, 30], ['superman-hold', 3, 12, 30], ['plank', 3, 1, 30], ['jumping-jack', 1, 3, 0]]],
    ],
  },
  {
    id: 'core-crusher',
    name: 'Core Crusher',
    description: 'Two dedicated core sessions to add to any program. Mix of flexion, anti-extension and rotation.',
    goal: 'general',
    level: 1,
    location: 'gym',
    categories: ['abs'],
    hue: 45,
    trending: true,
    days: [
      ['Core A', [['cable-crunch', 3, 15, 45], ['hanging-leg-raise', 3, 12, 45], ['russian-twist', 3, 20, 45], ['plank', 3, 1, 45]]],
      ['Core B', [['ab-wheel-rollout', 3, 10, 45], ['lying-leg-raise', 3, 15, 45], ['dead-bug', 3, 12, 45], ['bicycle-crunch', 3, 20, 45]]],
    ],
  },
  {
    id: 'abs-at-home',
    name: 'Abs at Home',
    description: 'A short floor routine for the midsection. Ten to fifteen minutes, no equipment.',
    goal: 'general',
    level: 1,
    location: 'home',
    categories: ['abs', 'at-home'],
    hue: 60,
    days: [['Abs', [['crunch', 3, 20, 30], ['bicycle-crunch', 3, 20, 30], ['lying-leg-raise', 3, 15, 30], ['mountain-climber', 3, 30, 30], ['plank', 3, 1, 30]]]],
  },
  {
    id: 'full-body-starter',
    name: 'Full Body Starter',
    description: 'The first plan to run if you are new to lifting. Machines and dumbbells, moderate reps, three days a week.',
    goal: 'general',
    level: 1,
    location: 'gym',
    categories: ['full-body', '3-day-split'],
    hue: 190,
    days: [
      ['Day A', [['leg-press', 3, 12], ['machine-chest-press', 3, 12], ['lat-pulldown', 3, 12], ['dumbbell-lateral-raise', 2, 15, 60], ['plank', 2, 1, 45]]],
      ['Day B', [['goblet-squat', 3, 12], ['dumbbell-bench-press', 3, 12], ['seated-cable-row', 3, 12], ['dumbbell-curl', 2, 12, 60], ['crunch', 2, 15, 45]]],
      ['Day C', [['lying-leg-curl', 3, 12], ['incline-dumbbell-press', 3, 12], ['one-arm-dumbbell-row', 3, 12], ['cable-triceps-pushdown', 2, 12, 60], ['glute-bridge', 2, 15, 45]]],
    ],
  },
  {
    id: 'full-body-power',
    name: 'Full Body Power',
    description: 'Four demanding full-body days pairing a heavy compound lift with supporting work. For experienced lifters.',
    goal: 'strength',
    level: 3,
    location: 'gym',
    categories: ['full-body'],
    hue: 260,
    days: [
      ['Power A', [['barbell-back-squat', 5, 5, 180], ['barbell-bench-press', 4, 6, 150], ['barbell-bent-over-row', 4, 6, 120], ['hanging-leg-raise', 3, 12, 60]]],
      ['Power B', [['barbell-deadlift', 4, 4, 210], ['barbell-overhead-press', 4, 6, 150], ['pull-up', 4, 8, 120], ['walking-lunge', 3, 10, 90]]],
      ['Power C', [['barbell-front-squat', 4, 6, 180], ['incline-barbell-bench-press', 4, 8, 120], ['t-bar-row', 4, 8, 120], ['ab-wheel-rollout', 3, 10, 60]]],
      ['Power D', [['barbell-hip-thrust', 4, 8, 120], ['chest-dip', 4, 10, 90], ['chin-up', 4, 8, 90], ['barbell-shrug', 3, 12, 60]]],
    ],
  },
  {
    id: 'dumbbell-home',
    name: 'Dumbbell Home Builder',
    description: 'A four-day upper/lower plan that needs only a pair of dumbbells and a resistance band.',
    goal: 'bulking',
    level: 2,
    location: 'home',
    categories: ['at-home', 'muscle-gain'],
    hue: 140,
    days: [
      ['Upper A', [['dumbbell-bench-press', 4, 10], ['one-arm-dumbbell-row', 4, 10], ['seated-dumbbell-press', 3, 10], ['band-pull-apart', 3, 20, 45], ['dumbbell-curl', 3, 12, 60]]],
      ['Lower A', [['goblet-squat', 4, 12], ['dumbbell-romanian-deadlift', 4, 10], ['reverse-lunge', 3, 12], ['dumbbell-calf-raise', 4, 15, 45], ['dead-bug', 3, 12, 45]]],
      ['Upper B', [['push-up', 4, 15], ['band-row', 4, 15], ['arnold-press', 3, 10], ['dumbbell-kickback', 3, 12, 60], ['hammer-curl', 3, 12, 60]]],
      ['Lower B', [['bulgarian-split-squat', 4, 10], ['glute-bridge', 4, 15], ['dumbbell-thruster', 3, 10], ['dumbbell-calf-raise', 4, 15, 45], ['plank', 3, 1, 45]]],
    ],
  },
  {
    id: 'three-day-split',
    name: 'Three-Day Split',
    description: 'Push, pull and legs once each per week. Heavier compounds first, then isolation work.',
    goal: 'bulking',
    level: 2,
    location: 'gym',
    categories: ['3-day-split', 'push-pull'],
    hue: 230,
    days: [
      ['Push', [['incline-barbell-bench-press', 4, 8, 120], ['seated-dumbbell-press', 3, 10], ['dumbbell-fly', 3, 12, 60], ['dumbbell-lateral-raise', 3, 15, 60], ['overhead-cable-extension', 3, 12, 60]]],
      ['Pull', [['barbell-bent-over-row', 4, 8, 120], ['lat-pulldown', 3, 10], ['seated-cable-row', 3, 12], ['face-pull', 3, 15, 60], ['barbell-curl', 3, 10, 60]]],
      ['Legs', [['barbell-back-squat', 4, 8, 150], ['romanian-deadlift', 3, 10], ['walking-lunge', 3, 12], ['leg-extension', 3, 15, 60], ['standing-calf-raise', 4, 12, 60]]],
    ],
  },
  {
    id: 'glute-emphasis',
    name: 'Lower Body: Glute Emphasis',
    description: 'Three lower-focused days with extra glute work, plus one upper day to stay balanced.',
    goal: 'bulking',
    level: 2,
    location: 'gym',
    categories: ['muscle-gain'],
    hue: 320,
    trending: true,
    days: [
      ['Glutes & Hamstrings', [['barbell-hip-thrust', 4, 10, 120], ['romanian-deadlift', 4, 10], ['cable-kickback', 3, 15, 60], ['seated-leg-curl', 3, 12, 60]]],
      ['Upper', [['lat-pulldown', 3, 12], ['seated-dumbbell-press', 3, 10], ['seated-cable-row', 3, 12], ['dumbbell-lateral-raise', 3, 15, 60]]],
      ['Glutes & Quads', [['barbell-back-squat', 4, 8, 150], ['bulgarian-split-squat', 3, 10], ['hip-abduction-machine', 3, 15, 60], ['leg-extension', 3, 12, 60]]],
    ],
  },
  {
    id: 'daily-mobility',
    name: 'Daily Mobility Flow',
    description: 'Gentle stretches for hips, hamstrings, chest and spine. Hold each position for the listed minutes.',
    goal: 'general',
    level: 1,
    location: 'home',
    categories: ['stretch', 'at-home'],
    hue: 175,
    days: [
      ['Lower Body Flow', [['hip-flexor-stretch', 2, 1, 0], ['hamstring-stretch', 2, 1, 0], ['quad-stretch', 2, 1, 0], ['calf-stretch', 2, 1, 0], ['child-s-pose', 1, 2, 0]]],
      ['Upper Body Flow', [['cat-cow', 1, 2, 0], ['doorway-chest-stretch', 2, 1, 0], ['cross-body-shoulder-stretch', 2, 1, 0], ['cobra-stretch', 2, 1, 0], ['child-s-pose', 1, 2, 0]]],
    ],
  },
  {
    id: 'post-lift-cooldown',
    name: 'Post-Lift Cooldown',
    description: 'A ten-minute cooldown to finish any session.',
    goal: 'general',
    level: 1,
    location: 'gym',
    categories: ['stretch'],
    hue: 205,
    days: [['Cooldown', [['stationary-bike', 1, 3, 0], ['hamstring-stretch', 1, 1, 0], ['hip-flexor-stretch', 1, 1, 0], ['doorway-chest-stretch', 1, 1, 0], ['child-s-pose', 1, 2, 0]]]],
  },
];
