import type { EffortScale, LoggedSet, Settings } from '../types';

// Effort is stored as reps in reserve (RIR has a real zero: failure) and shown in the scale
// the user picked. RPE = 10 - RIR.

export const effortScale = (s: Settings): EffortScale => s.effort ?? 'rir';

export const EFFORT_LEVELS: { rir: number; line: string }[] = [
  { rir: 0, line: 'Failure. Another rep was not happening.' },
  { rir: 1, line: 'One more rep, maybe, with everything you had.' },
  { rir: 2, line: 'Two left. Hard, form still clean.' },
  { rir: 3, line: 'Three left. Solid working set.' },
  { rir: 4, line: 'Four left. Comfortable.' },
  { rir: 5, line: 'Five or more left. Warm-up pace.' },
];

export function effortLabel(rir: number, scale: EffortScale): string {
  if (scale === 'rpe') return `${10 - rir}${rir >= 5 ? '−' : ''}`;
  return `${rir}${rir >= 5 ? '+' : ''}`;
}

// 0 (failure) is hot, 5+ is cool.
export const effortHue = (rir: number) => [4, 22, 38, 60, 110, 150][Math.min(5, Math.max(0, rir))];

export function fmtSetsWithEffort(sets: LoggedSet[], fmtW: (lbs: number) => string, scale: EffortScale): string {
  return sets
    .map((x) => `${fmtW(x.weightLbs)}×${x.reps}${x.rir !== undefined && scale !== 'off' ? ` (${scale.toUpperCase()} ${effortLabel(x.rir, scale)})` : ''}`)
    .join(', ');
}
