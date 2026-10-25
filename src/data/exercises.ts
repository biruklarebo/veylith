import type { Equipment, Exercise, RecordType } from '../types';

// Built-in exercise library.
// Body part indices: 0 Abs, 1 Back, 2 Biceps, 3 Chest, 4 Forearms, 5 Glutes,
// 6 Shoulders, 7 Triceps, 8 Upper Legs, 9 Lower Legs, 10 Cardio.
type Row = [string, number, Equipment, number[]?, RecordType?];

const rows: Row[] = [
  ['Barbell Bench Press', 3, 'Barbell', [7, 6]],
  ['Incline Barbell Bench Press', 3, 'Barbell', [6, 7]],
  ['Dumbbell Bench Press', 3, 'Dumbbell', [7, 6]],
  ['Incline Dumbbell Press', 3, 'Dumbbell', [6, 7]],
  ['Dumbbell Fly', 3, 'Dumbbell'],
  ['Cable Crossover', 3, 'Cable'],
  ['Machine Chest Press', 3, 'Machine', [7]],
  ['Pec Deck', 3, 'Machine'],
  ['Push-Up', 3, 'Bodyweight', [7, 6], 'bodyweight'],
  ['Chest Dip', 3, 'Bodyweight', [7], 'bodyweight'],

  ['Barbell Deadlift', 1, 'Barbell', [8, 5, 4]],
  ['Barbell Bent-Over Row', 1, 'Barbell', [2]],
  ['Pull-Up', 1, 'Bodyweight', [2], 'bodyweight'],
  ['Chin-Up', 1, 'Bodyweight', [2], 'bodyweight'],
  ['Lat Pulldown', 1, 'Cable', [2]],
  ['Seated Cable Row', 1, 'Cable', [2]],
  ['One-Arm Dumbbell Row', 1, 'Dumbbell', [2]],
  ['T-Bar Row', 1, 'Barbell', [2]],
  ['Straight-Arm Pulldown', 1, 'Cable'],
  ['Back Extension', 1, 'Bodyweight', [5], 'bodyweight'],

  ['Barbell Overhead Press', 6, 'Barbell', [7]],
  ['Seated Dumbbell Press', 6, 'Dumbbell', [7]],
  ['Arnold Press', 6, 'Dumbbell', [7]],
  ['Dumbbell Lateral Raise', 6, 'Dumbbell'],
  ['Cable Lateral Raise', 6, 'Cable'],
  ['Dumbbell Front Raise', 6, 'Dumbbell'],
  ['Reverse Pec Deck', 6, 'Machine', [1]],
  ['Face Pull', 6, 'Cable', [1]],
  ['Barbell Upright Row', 6, 'Barbell', [1]],
  ['Barbell Shrug', 1, 'Barbell', [4]],

  ['Barbell Curl', 2, 'Barbell', [4]],
  ['Dumbbell Curl', 2, 'Dumbbell', [4]],
  ['Hammer Curl', 2, 'Dumbbell', [4]],
  ['Preacher Curl', 2, 'Machine'],
  ['Cable Curl', 2, 'Cable'],
  ['Incline Dumbbell Curl', 2, 'Dumbbell'],
  ['Concentration Curl', 2, 'Dumbbell'],

  ['Close-Grip Bench Press', 7, 'Barbell', [3]],
  ['Cable Triceps Pushdown', 7, 'Cable'],
  ['Overhead Cable Extension', 7, 'Cable'],
  ['Skull Crusher', 7, 'Barbell'],
  ['Dumbbell Kickback', 7, 'Dumbbell'],
  ['Bench Dip', 7, 'Bodyweight', [3], 'bodyweight'],

  ['Wrist Curl', 4, 'Barbell'],
  ['Reverse Wrist Curl', 4, 'Barbell'],
  ['Farmer\'s Walk', 4, 'Dumbbell', [1]],

  ['Barbell Back Squat', 8, 'Barbell', [5, 0]],
  ['Barbell Front Squat', 8, 'Barbell', [5, 0]],
  ['Leg Press', 8, 'Machine', [5]],
  ['Romanian Deadlift', 8, 'Barbell', [5, 1]],
  ['Walking Lunge', 8, 'Dumbbell', [5]],
  ['Bulgarian Split Squat', 8, 'Dumbbell', [5]],
  ['Leg Extension', 8, 'Machine'],
  ['Lying Leg Curl', 8, 'Machine'],
  ['Seated Leg Curl', 8, 'Machine'],
  ['Goblet Squat', 8, 'Kettlebell', [5]],
  ['Hack Squat', 8, 'Machine', [5]],

  ['Barbell Hip Thrust', 5, 'Barbell', [8]],
  ['Glute Bridge', 5, 'Bodyweight', [8], 'bodyweight'],
  ['Cable Kickback', 5, 'Cable'],
  ['Kettlebell Swing', 5, 'Kettlebell', [8, 1]],
  ['Hip Abduction Machine', 5, 'Machine'],

  ['Standing Calf Raise', 9, 'Machine'],
  ['Seated Calf Raise', 9, 'Machine'],
  ['Dumbbell Calf Raise', 9, 'Dumbbell'],

  ['Crunch', 0, 'Bodyweight', [], 'bodyweight'],
  ['Hanging Leg Raise', 0, 'Bodyweight', [], 'bodyweight'],
  ['Cable Crunch', 0, 'Cable'],
  ['Plank', 0, 'Bodyweight', [], 'cardio'],
  ['Russian Twist', 0, 'Bodyweight', [], 'bodyweight'],
  ['Ab Wheel Rollout', 0, 'Other', [], 'bodyweight'],

  ['Treadmill Run', 10, 'Machine', [], 'cardio'],
  ['Stationary Bike', 10, 'Machine', [], 'cardio'],
  ['Rowing Machine', 10, 'Machine', [1], 'cardio'],
  ['Elliptical', 10, 'Machine', [], 'cardio'],
  ['Jump Rope', 10, 'Other', [9], 'cardio'],
  ['Stair Climber', 10, 'Machine', [8], 'cardio'],

  // Home / no-gym
  ['Bodyweight Squat', 8, 'Bodyweight', [5], 'bodyweight'],
  ['Reverse Lunge', 8, 'Bodyweight', [5], 'bodyweight'],
  ['Pike Push-Up', 6, 'Bodyweight', [7], 'bodyweight'],
  ['Diamond Push-Up', 7, 'Bodyweight', [3], 'bodyweight'],
  ['Inverted Row', 1, 'Bodyweight', [2], 'bodyweight'],
  ['Superman Hold', 1, 'Bodyweight', [5], 'bodyweight'],
  ['Band Pull-Apart', 6, 'Band', [1]],
  ['Band Row', 1, 'Band', [2]],
  ['Band Curl', 2, 'Band'],
  ['Dumbbell Romanian Deadlift', 8, 'Dumbbell', [5, 1]],
  ['Dumbbell Thruster', 8, 'Dumbbell', [6]],
  ['Mountain Climber', 0, 'Bodyweight', [10], 'bodyweight'],
  ['Bicycle Crunch', 0, 'Bodyweight', [], 'bodyweight'],
  ['Lying Leg Raise', 0, 'Bodyweight', [], 'bodyweight'],
  ['Dead Bug', 0, 'Bodyweight', [], 'bodyweight'],
  ['Burpee', 10, 'Bodyweight', [3, 8], 'bodyweight'],
  ['Jumping Jack', 10, 'Bodyweight', [], 'cardio'],
  ['High Knees', 10, 'Bodyweight', [8], 'cardio'],

  // Mobility (timed, logged in minutes)
  ['Hamstring Stretch', 8, 'Bodyweight', [], 'cardio'],
  ['Quad Stretch', 8, 'Bodyweight', [], 'cardio'],
  ['Hip Flexor Stretch', 5, 'Bodyweight', [8], 'cardio'],
  ['Doorway Chest Stretch', 3, 'Bodyweight', [6], 'cardio'],
  ['Cross-Body Shoulder Stretch', 6, 'Bodyweight', [], 'cardio'],
  ["Child's Pose", 1, 'Bodyweight', [], 'cardio'],
  ['Cat-Cow', 1, 'Bodyweight', [0], 'cardio'],
  ['Cobra Stretch', 0, 'Bodyweight', [1], 'cardio'],
  ['Calf Stretch', 9, 'Bodyweight', [], 'cardio'],
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const SEED_EXERCISES: Exercise[] = rows.map(([name, bodyPart, equipment, secondary, recordType]) => ({
  id: slug(name),
  name,
  bodyPart,
  equipment,
  secondary: secondary ?? [],
  recordType: recordType ?? 'weight',
}));
