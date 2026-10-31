import { illustrationFor } from '../data/illustrations';

// Two-pose line drawing that eases between start and end positions (CC BY-SA 4.0, Everkinetic).
// Returns null when the exercise has no drawing, so callers can fall back to the body map.
export function ExerciseArt({ exerciseId, className }: { exerciseId: string; className?: string }) {
  const frames = illustrationFor(exerciseId);
  if (!frames) return null;
  const src = (p: string) => `${import.meta.env.BASE_URL}${p}`;
  return (
    <div className={`ex-art ${className ?? ''}`} aria-hidden>
      {/* Line art used as a mask so it takes the theme's colour. */}
      <span className="a" style={{ ['--src' as string]: `url("${src(frames[0])}")` }} />
      <span className="b" style={{ ['--src' as string]: `url("${src(frames[1])}")` }} />
    </div>
  );
}

export const hasArt = (exerciseId: string) => !!illustrationFor(exerciseId);
