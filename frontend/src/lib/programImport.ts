import { parseCsv } from './csv';
import type { CuratedProgram, DayItem, Equipment, Exercise, PlanSet, ProgramBlock, ProgramSlot, Routine, WorkoutDay } from '../types';

// Reads a training program exported from a spreadsheet (CSV). Columns are found by their
// header names, so different layouts work as long as there is an "Exercise" column:
//   Workout/Day, Exercise, Working Sets, Reps, RPE, Rest, Warm-up Sets, Notes,
//   Substitution Option N, and week grouping as a "Block" column ("Weeks 1-4") or a
//   "Week N" marker on the header row.

export interface ParsedProgram {
  name: string;
  weeks: number;
  blocks: ProgramBlock[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function weekRange(label: string): [number, number] | null {
  const m = label.match(/weeks?\s*(\d+)\s*(?:[-–to]+\s*(\d+))?/i);
  return m ? [+m[1], +(m[2] ?? m[1])] : null;
}

const firstInt = (s: string | undefined, d = 0) => {
  const m = s?.match(/\d+/);
  return m ? +m[0] : d;
};

export function parseProgram(text: string, fileName: string): ParsedProgram {
  const rows = parseCsv(text);
  const hi = rows.findIndex((r) => r.some((c) => norm(c) === 'exercise'));
  if (hi < 0) throw new Error('No "Exercise" column found. Export the sheet that lists the exercises as CSV.');
  const head = rows[hi].map(norm);
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const C = {
    ex: head.indexOf('exercise'),
    day: col('workout', 'day', 'session'),
    sets: col('working sets', 'sets'),
    warm: col('warm up sets', 'warmup sets', 'warm up'),
    reps: col('reps'),
    rpe: col('rpe', 'rir'),
    rest: col('rest'),
    notes: col('notes', 'note', 'cues'),
    block: col('block', 'phase'),
  };
  const subs = head.map((h, i) => (/^(substitution|sub|alternative)/.test(h) ? i : -1)).filter((i) => i >= 0);

  // A title above the header row, if the sheet has one ("ACME PROGRAM - SPREADSHEET").
  const title = rows
    .slice(0, hi)
    .flat()
    .find((c) => c.length > 6 && /[a-z]/i.test(c) && !/copyright|type|cell|kg|lbs/i.test(c));
  const name = (title ?? fileName.replace(/\.[^.]+$/, ''))
    .replace(/\s*-\s*(spreadsheet|program)\s*$/i, '')
    .replace(/spreadsheet/i, '')
    .trim();

  const blocks: ProgramBlock[] = [];
  let block: ProgramBlock | null = null;
  let day: ProgramBlock['days'][number] | null = null;
  let lastDayCell = '';
  const startBlock = (label: string) => {
    const r = weekRange(label) ?? [blocks.length + 1, blocks.length + 1];
    block = { label, from: r[0], to: r[1], days: [] };
    blocks.push(block);
    day = null;
    lastDayCell = '';
  };

  const sparse = C.day >= 0 && sparseDays(rows, hi, C.day);
  rows.forEach((r, i) => {
    if (i < hi) return;
    // Repeated header rows can carry the week ("Week 2, Workout, Exercise, ...").
    if (r.some((c) => norm(c) === 'exercise')) {
      const wk = r.find((c) => weekRange(c));
      if (wk) startBlock(wk);
      return;
    }
    const exName = r[C.ex];
    if (!exName) return;
    const blockCell = C.block >= 0 ? r[C.block] : '';
    if (blockCell && (!block || (block as ProgramBlock).label !== blockCell)) startBlock(blockCell);
    if (!block) startBlock('Week 1');
    const dayCell = C.day >= 0 ? r[C.day] : '';
    // A filled workout cell starts a new day: every time when the column is filled only on
    // each day's first row, otherwise when it differs from the row above.
    const newDay = !day || (dayCell && (sparse || dayCell !== lastDayCell));
    if (newDay) {
      day = { name: tidy(dayCell || `Day ${block!.days.length + 1}`), slots: [] };
      block!.days.push(day);
    }
    if (dayCell) lastDayCell = dayCell;
    // "A1: Seated Calf Raise" / "A2: Cable Crunch" mark a superset pair.
    const ss = exName.match(/^([A-Z])\d\s*[:.)-]\s*/);
    const slot: ProgramSlot = {
      options: [exName, ...subs.map((c) => r[c]).filter(Boolean)].map((o) => tidy(o.replace(/^[A-Z]\d\s*[:.)-]\s*/, ''))),
      superset: ss?.[1],
      sets: Math.max(1, firstInt(r[C.sets], 3)),
      warmup: C.warm >= 0 ? firstInt(r[C.warm]) : 0,
      reps: r[C.reps] || '10',
      rpe: C.rpe >= 0 ? r[C.rpe] || undefined : undefined,
      rest: C.rest >= 0 ? r[C.rest] || undefined : undefined,
      note: C.notes >= 0 ? sentence(r[C.notes]) || undefined : undefined,
    };
    day!.slots.push(slot);
  });

  const real = blocks.filter((b) => b.days.length);
  if (!real.length) throw new Error('No exercises found under the header row.');
  return { name: tidy(name) || 'Imported program', weeks: Math.max(...real.map((b) => b.to)), blocks: real };
}

// True when the day column is filled only on each day's first row.
function sparseDays(rows: string[][], hi: number, c: number) {
  const body = rows.slice(hi + 1).filter((r) => r.some(Boolean) && !r.some((x) => norm(x) === 'exercise'));
  const filled = body.filter((r) => r[c]).length;
  return filled > 0 && filled < body.length * 0.6;
}

// "BARBELL BENCH PRESS" -> "Barbell Bench Press"; leaves mixed-case names alone.
export function tidy(s: string) {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/\bDb\b/g, 'DB').replace(/\bEz\b/g, 'EZ');
}
const sentence = (s?: string) => {
  if (!s) return '';
  const t = s.trim();
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
};

// ---------- matching names to the exercise library ----------

const ALIAS: [RegExp, string][] = [
  [/\bdb\b/g, 'dumbbell'],
  [/\bbb\b/g, 'barbell'],
  [/\bkb\b/g, 'kettlebell'],
  [/\bflye?s?\b/g, 'fly'],
  [/\brdl\b/g, 'romanian deadlift'],
  [/\bdead lift\b/g, 'deadlift'],
  [/\bpulldowns?\b/g, 'pulldown'],
  [/\bpush ?ups?\b/g, 'push up'],
  [/\bpull ?ups?\b/g, 'pull up'],
  [/\bchin ?ups?\b/g, 'chin up'],
  [/\bcurls\b/g, 'curl'],
  [/\braises\b/g, 'raise'],
  [/\brows\b/g, 'row'],
];

function tokens(name: string) {
  let n = norm(name.replace(/\(.*?\)/g, ''));
  for (const [re, to] of ALIAS) n = n.replace(re, to);
  return new Set(n.split(' ').filter((w) => w && !['the', 'with', 'a', 'on'].includes(w)));
}

// Best library match by token overlap, or null when nothing is close enough.
export function matchExercise(name: string, library: Exercise[]): Exercise | null {
  const a = tokens(name);
  let best: { ex: Exercise; score: number } | null = null;
  for (const ex of library) {
    const b = tokens(ex.name);
    const inter = [...a].filter((w) => b.has(w)).length;
    if (!inter) continue;
    let score = inter / new Set([...a, ...b]).size;
    if ([...b].every((w) => a.has(w)) || [...a].every((w) => b.has(w))) score += 0.15;
    if (!best || score > best.score) best = { ex, score };
  }
  if (!best || best.score < 0.6) return null;
  // Reject a match that clearly trains something else ("tricep kickback" vs a glute kickback).
  const guess = PART_WORDS.find(([re]) => re.test(` ${norm(name)} `))?.[1];
  return guess !== undefined && guess !== best.ex.bodyPart && !(best.ex.secondary ?? []).includes(guess) ? null : best.ex;
}

const PART_WORDS: [RegExp, number][] = [
  [/calf|calves|toe press/, 9],
  [/tricep|skull|pushdown|french press|jm press/, 7],
  [/hip thrust|glute|abduct|kickback/, 5],
  [/squat|lunge|leg press|leg extension|leg curl|hamstring|ham curl|nordic|step ?up|good morning|romanian|adduct/, 8],
  [/crunch|plank|\babs?\b|sit ?up|leg raise|rollout|pallof|oblique/, 0],
  [/curl/, 2],
  [/lateral raise|rear delt|face pull|shoulder press|overhead press|military|arnold|upright|reverse fly|reverse pec|y raise/, 6],
  [/row|pulldown|pull ?up|chin ?up|\blat\b|deadlift|shrug|pullover|back extension|hyperextension/, 1],
  [/dip|close grip/, 7],
  [/bench|chest|fly|push ?up|pec|incline press|floor press/, 3],
  [/wrist|forearm|grip/, 4],
];
const EQUIP_WORDS: [RegExp, Equipment][] = [
  [/dumbbell|\bdb\b/, 'Dumbbell'],
  [/barbell|\bbb\b|ez bar|t bar|trap bar/, 'Barbell'],
  [/cable|pulldown|pushdown|face pull/, 'Cable'],
  [/machine|smith|hack|leg press|pec deck/, 'Machine'],
  [/band/, 'Band'],
  [/kettlebell/, 'Kettlebell'],
  [/push up|pull up|chin up|dip|plank|crunch|nordic|bodyweight/, 'Bodyweight'],
];

// Body part and equipment for a name the library doesn't know.
export function guessExercise(name: string): Omit<Exercise, 'id' | 'custom'> {
  const n = ` ${norm(name)} `;
  const bodyPart = PART_WORDS.find(([re]) => re.test(n))?.[1] ?? 1;
  const equipment = EQUIP_WORDS.find(([re]) => re.test(n))?.[1] ?? 'Other';
  return { name: tidy(name), bodyPart, equipment, recordType: equipment === 'Bodyweight' ? 'bodyweight' : 'weight' };
}

export const nameKey = (s: string) => norm(s);

// ---------- program -> routine days ----------

const restSeconds = (s?: string) => {
  if (!s) return 90;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return 90;
  // No unit: "2" means minutes, "90" means seconds.
  const seconds = (/s(ec)?\b/i.test(s) && !/min/i.test(s)) || (!/[a-z]/i.test(s) && +m[1] >= 10);
  return Math.round(+m[1] * (seconds ? 1 : 60));
};

export const blockFor = (p: CuratedProgram, week: number) =>
  p.blocks.find((b) => week >= b.from && week <= b.to) ?? (week > p.weeks ? p.blocks[p.blocks.length - 1] : p.blocks[0]);

export function currentWeek(r: Routine, now = Date.now()) {
  return r.guided ? Math.max(1, Math.floor((now - r.guided.start) / (7 * 864e5)) + 1) : 1;
}

// The workout days for one week: each slot uses the exercise picked for it (or the main one),
// with the slot's other options kept as alternatives. Day ids are stable across blocks.
export function daysForWeek(p: CuratedProgram, r: Routine, week: number): WorkoutDay[] {
  const block = blockFor(p, week);
  return block.days.map((d, di) => ({
    id: `${r.id}-d${di}`,
    name: d.name,
    weekday: r.days[di]?.weekday,
    items: d.slots.map((slot, si): DayItem => {
      const ids = slot.options.map((o) => p.ids[nameKey(o)]).filter(Boolean);
      const chosen = r.guided?.choices[nameKey(slot.options[0])];
      const rest = restSeconds(slot.rest);
      const reps = firstInt(slot.reps, 10);
      const sets: PlanSet[] = [
        ...Array.from({ length: slot.warmup }, () => ({ type: 'warmup' as const, weightLbs: null, reps: Math.max(5, reps), rest: 60 })),
        ...Array.from({ length: slot.sets }, () => ({ type: 'regular' as const, weightLbs: null, reps, rest })),
      ];
      const note = [slot.reps !== String(reps) && `Reps ${slot.reps}`, slot.rpe && `RPE ${slot.rpe}`, slot.note].filter(Boolean).join(' · ');
      return {
        id: `${r.id}-d${di}-s${si}`,
        exerciseId: chosen && ids.includes(chosen) ? chosen : ids[0],
        supersetId: slot.superset ? slot.superset.charCodeAt(0) - 64 : 0,
        sets,
        alternatives: ids.length > 1 ? ids : undefined,
        note: note || undefined,
      };
    }),
  }));
}
