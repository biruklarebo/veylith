import type { ReactNode } from 'react';
import { useNav } from '../nav';
import { BODY_PARTS } from '../types';

export function Header({ title, back = true, right }: { title: string; back?: boolean; right?: ReactNode }) {
  const nav = useNav();
  return (
    <header className="header">
      {back ? (
        <button className="icon-btn" onClick={nav.pop} aria-label="Back">
          ‹
        </button>
      ) : (
        <span className="icon-spacer" />
      )}
      <h1>{title}</h1>
      <div className="header-right">{right ?? <span className="icon-spacer" />}</div>
    </header>
  );
}

const PART_HUES = [12, 210, 280, 0, 30, 330, 190, 250, 140, 100, 160];

export function PartBadge({ part, size = 40 }: { part: number; size?: number }) {
  const name = BODY_PARTS[part] ?? '?';
  return (
    <span
      className="part-badge"
      style={{ width: size, height: size, ['--hue' as string]: PART_HUES[part] ?? 0 }}
      aria-hidden
    >
      {name
        .split(' ')
        .map((w) => w[0])
        .join('')}
    </span>
  );
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  label: string;
}) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))} aria-label={`Decrease ${label}`}>
        −
      </button>
      <input
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange(Number.isNaN(v) ? 0 : v);
        }}
        aria-label={label}
      />
      <button onClick={() => onChange(+(value + step).toFixed(2))} aria-label={`Increase ${label}`}>
        +
      </button>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}
