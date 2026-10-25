import { fromDisplay, toDisplay } from './calc';
import { roundLoad } from './progression';
import type { Exercise, LoggedSet, Settings } from '../types';

// Plate loading is display only: logged weights stay the total on the bar.

export const DEFAULT_PLATES = { lb: [45, 35, 25, 10, 5, 2.5], kg: [25, 20, 15, 10, 5, 2.5, 1.25] };
export const DEFAULT_BAR = { lb: 45, kg: 20 };

export const barOf = (s: Settings) => (s.bar ?? DEFAULT_BAR)[s.unit];
export const platesOf = (s: Settings) => [...(s.plates ?? DEFAULT_PLATES)[s.unit]].sort((a, b) => b - a);

export const usesPlates = (ex?: Exercise) => ex?.equipment === 'Barbell';

// Plates per side for a total in lbs, greedy from the largest plate owned (pairs unlimited).
// `left` is what could not be matched with the plates owned, per side, in display units.
export function loadBar(totalLbs: number, s: Settings): { bar: number; perSide: number[]; left: number } | null {
  const bar = barOf(s);
  let side = (toDisplay(totalLbs, s) - bar) / 2;
  if (side < 0) return null;
  const perSide: number[] = [];
  for (const p of platesOf(s)) {
    while (side >= p - 1e-6) {
      perSide.push(p);
      side -= p;
    }
  }
  return { bar, perSide, left: Math.round(side * 100) / 100 };
}

export function fmtPlates(perSide: number[]): string {
  if (!perSide.length) return 'empty bar';
  const out: string[] = [];
  for (let i = 0; i < perSide.length; ) {
    let j = i;
    while (perSide[j] === perSide[i]) j++;
    out.push(j - i > 1 ? `${j - i}×${perSide[i]}` : `${perSide[i]}`);
    i = j;
  }
  return out.join(' + ');
}

// Warm-up ramp for a working weight: lighter sets with falling reps, snapped to loadable
// weights. Barbells start with the empty bar.
export function warmupRamp(workLbs: number, ex: Exercise | undefined, s: Settings): Pick<LoggedSet, 'type' | 'weightLbs' | 'reps' | 'rest'>[] {
  if (workLbs <= 0) return [];
  const plates = usesPlates(ex);
  const bar = fromDisplay(barOf(s), s);
  const steps: [number, number][] = plates ? [[0.4, 8], [0.6, 5], [0.8, 3]] : [[0.5, 10], [0.75, 5]];
  const out: { type: 'warmup'; weightLbs: number; reps: number; rest: number }[] = [];
  if (plates && workLbs > bar * 1.4) out.push({ type: 'warmup', weightLbs: bar, reps: 10, rest: 60 });
  for (const [pct, reps] of steps) {
    const w = Math.max(plates ? bar : 0, roundLoad(workLbs * pct, s));
    if (w <= 0 || w >= workLbs || out.some((x) => Math.abs(x.weightLbs - w) < 0.6)) continue;
    out.push({ type: 'warmup', weightLbs: w, reps, rest: 60 });
  }
  return out;
}
