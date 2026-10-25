import type { Exercise } from '../types';

// Stylised anatomy figure. Each muscle shape is drawn for the left half and mirrored,
// and carries a body-part index (see BODY_PARTS) so a heat array can light it up.
type Shape = { part: number; d: string };

const FRONT: Shape[] = [
  { part: 6, d: 'M36 36Q26 35 23 44Q22 50 24 55Q29 47 36 44Z' },
  { part: 3, d: 'M49 38Q40 37 37 40Q34 47 35 54Q42 58 49 55Z' },
  { part: 2, d: 'M24 57Q21 64 22 72Q25 76 28 72Q30 64 30 56Q27 55 24 57Z' },
  { part: 4, d: 'M21 76Q17 86 16 98L20 99Q25 88 27 77Q24 79 21 76Z' },
  { part: 0, d: 'M42 59h7v8h-7zM42 68h7v8h-7zM42 77h7v8h-7zM43 86h6v7h-6z' },
  { part: 0, d: 'M36 58Q35 72 38 88L40 88L40 59Z' },
  { part: 8, d: 'M37 100Q32 118 34 140Q38 148 43 146Q47 130 48 108Q45 100 37 100Z' },
  { part: 9, d: 'M35 152Q32 166 35 186L40 188Q44 170 43 152Q39 149 35 152Z' },
];

const BACK: Shape[] = [
  { part: 1, d: 'M49 29Q42 32 37 37Q44 40 49 48Z' },
  { part: 6, d: 'M36 36Q26 35 23 44Q22 50 24 55Q29 47 36 44Z' },
  { part: 1, d: 'M37 43Q34 56 38 72Q44 81 49 84L49 51Q44 45 37 43Z' },
  { part: 7, d: 'M24 57Q21 64 22 72Q25 76 28 72Q30 64 30 56Q27 55 24 57Z' },
  { part: 4, d: 'M21 76Q17 86 16 98L20 99Q25 88 27 77Q24 79 21 76Z' },
  { part: 5, d: 'M49 92Q40 90 37 96Q35 106 40 112Q46 114 49 110Z' },
  { part: 8, d: 'M37 115Q34 130 36 145Q40 149 44 146Q47 132 48 117Q43 116 37 115Z' },
  { part: 9, d: 'M35 151Q31 162 34 176Q38 180 42 175Q45 162 43 151Q39 148 35 151Z' },
];

// Non-muscle silhouette pieces (head, neck, hips, hands, feet, shins).
const BASE = [
  'M45 25h10v8h-10z',
  'M36 88Q50 86 64 88L62 100L50 112L38 100Z',
  'M17 99Q14 103 16 107Q20 108 21 102Z',
  'M34 188L41 189L43 199L31 199Z',
  'M36 176Q36 182 37 188L41 188Q42 182 42 176Z',
  'M36 33Q30 34 34 36L50 36L50 30Z',
];

const LEGS = new Set([5, 8, 9]);
const BACK_PARTS = new Set([1, 5, 7]);

export type Crop = 'full' | 'upper' | 'lower';
const VIEWBOX: Record<Crop, string> = { full: '0 0 100 204', upper: '14 18 72 80', lower: '24 90 52 112' };

function Half({ shapes, heat }: { shapes: Shape[]; heat: number[] }) {
  return (
    <>
      {BASE.map((d, i) => (
        <path key={`b${i}`} d={d} className="bm-base" />
      ))}
      {shapes.map((s, i) => {
        const h = heat[s.part] ?? 0;
        return (
          <path
            key={i}
            d={s.d}
            className={h > 0 ? 'bm-on' : 'bm-off'}
            style={h > 0 ? { fillOpacity: 0.35 + 0.65 * h } : undefined}
          />
        );
      })}
    </>
  );
}

export function Figure({ view, heat, crop = 'full', fit = 'slice', className }: { view: 'front' | 'back'; heat: number[]; crop?: Crop; fit?: 'slice' | 'meet'; className?: string }) {
  const shapes = view === 'front' ? FRONT : BACK;
  return (
    <svg viewBox={VIEWBOX[crop]} preserveAspectRatio={fit === 'meet' ? 'xMidYMid meet' : 'xMidYMid slice'} className={`bm ${className ?? ''}`} aria-hidden>
      <ellipse cx="50" cy="14" rx="8.5" ry="10.5" className="bm-base" />
      <g>
        <Half shapes={shapes} heat={heat} />
      </g>
      <g transform="translate(100 0) scale(-1 1)">
        <Half shapes={shapes} heat={heat} />
      </g>
    </svg>
  );
}

export function BodyMap({ heat, className }: { heat: number[]; className?: string }) {
  return (
    <div className={`bodymap ${className ?? ''}`}>
      <Figure view="front" heat={heat} />
      <Figure view="back" heat={heat} />
    </div>
  );
}

// Pick the side and crop that best shows where the heat is.
export function framing(heat: number[]): { view: 'front' | 'back'; crop: Crop } {
  const sum = (f: (i: number) => boolean) => heat.reduce((n, h, i) => (f(i) ? n + h : n), 0);
  const legs = sum((i) => LEGS.has(i));
  const upper = sum((i) => !LEGS.has(i) && i !== 10);
  const back = sum((i) => BACK_PARTS.has(i));
  const front = sum((i) => !BACK_PARTS.has(i) && i !== 10);
  const crop: Crop = legs > upper * 2 ? 'lower' : upper > legs * 2 ? 'upper' : 'full';
  return { view: back > front ? 'back' : 'front', crop };
}

export function MuscleThumb({ heat, className }: { heat: number[]; className?: string }) {
  const f = framing(heat);
  return (
    <span className={`muscle-thumb ${className ?? ''}`}>
      <Figure view={f.view} crop={f.crop} heat={heat} />
    </span>
  );
}

export function exerciseHeat(ex?: Exercise): number[] {
  const heat = Array(11).fill(0);
  if (!ex) return heat;
  heat[ex.bodyPart] = 1;
  for (const p of ex.secondary ?? []) heat[p] = Math.max(heat[p], 0.35);
  return heat;
}

export function ExerciseThumb({ ex, size = 56 }: { ex?: Exercise; size?: number }) {
  const heat = exerciseHeat(ex);
  const part = ex?.bodyPart ?? 0;
  return (
    <span className="ex-thumb" style={{ width: size, height: size }}>
      <Figure view={BACK_PARTS.has(part) ? 'back' : 'front'} crop={LEGS.has(part) ? 'lower' : 'upper'} heat={heat} />
    </span>
  );
}
