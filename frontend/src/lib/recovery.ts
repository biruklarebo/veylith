import type { Exercise, Session } from '../types';

// Muscle fatigue measured in hard sets rather than tonnage: growth stimulus tracks sets taken
// reasonably close to failure, so a heavy leg press and a light fly count about the same.
// About 8 hard sets in a session is one full dose; past ~10 extra sets add nothing. Each dose
// fades with a half-life that is longer for big muscles. Secondary movers count 0.4.

const HALF_LIFE_H = [20, 40, 28, 36, 20, 40, 30, 28, 44, 20, 12];
const DOSE = 8;
const CAP = 10;
const SCAN_DAYS = 14;

type Find = (id: string) => Exercise | undefined;

function setsPerPart(s: Session, find: Find): number[] {
  const parts = Array(11).fill(0);
  for (const l of s.logs) {
    const ex = find(l.exerciseId);
    if (!ex) continue;
    // A set far from failure (RIR 5+) still costs something, just less.
    const n = l.sets.filter((x) => x.done && x.type !== 'warmup').reduce((a, x) => a + (x.rir !== undefined && x.rir >= 5 ? 0.5 : 1), 0);
    parts[ex.bodyPart] += n;
    for (const p of ex.secondary ?? []) parts[p] += n * 0.4;
  }
  return parts.map((n) => Math.min(CAP, n));
}

// 0 = fresh, 1 = a full session's worth of fatigue (or more) still on the muscle.
export function fatigue(sessions: Session[], find: Find, now = Date.now()): number[] {
  const out = Array(11).fill(0);
  for (const s of sessions) {
    const t = s.end ?? s.start;
    const h = (now - t) / 36e5;
    if (h > SCAN_DAYS * 24) break;
    setsPerPart(s, find).forEach((n, p) => (out[p] += (n / DOSE) * 0.5 ** (h / HALF_LIFE_H[p])));
  }
  return out.map((v) => Math.min(1, v));
}

// Hard sets per body part in the last `days` days.
export function volume(sessions: Session[], find: Find, days: number, now = Date.now()): number[] {
  const out = Array(11).fill(0);
  for (const s of sessions) {
    if (now - s.start > days * 864e5) break;
    setsPerPart(s, find).forEach((n, p) => (out[p] += n));
  }
  return out;
}

// Days since each body part was last worked directly, or null if never.
export function daysSince(sessions: Session[], find: Find, now = Date.now()): (number | null)[] {
  const out: (number | null)[] = Array(11).fill(null);
  for (const s of sessions) {
    for (const l of s.logs) {
      const p = find(l.exerciseId)?.bodyPart;
      if (p !== undefined && out[p] === null && l.sets.some((x) => x.done)) out[p] = Math.floor((now - s.start) / 864e5);
    }
  }
  return out;
}

// Hours until a fatigue level decays below the "ready" line (0.25).
export function hoursToReady(f: number, part: number): number {
  return f <= 0.25 ? 0 : Math.ceil(HALF_LIFE_H[part] * Math.log2(f / 0.25));
}
