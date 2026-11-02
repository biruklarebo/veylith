import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useNav } from '../nav';
import { parseNum } from '../lib/calc';
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

// Number box that keeps what is being typed ("12.", or empty) and only tidies it on blur.
export function NumField({
  value,
  onChange,
  label,
  decimal,
  className,
  placeholder,
  onFocus,
  onClick,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  decimal?: boolean;
  className?: string;
  placeholder?: string;
  onFocus?: () => void;
  onClick?: (e: MouseEvent<HTMLInputElement>) => void;
}) {
  const shown = value === null || !Number.isFinite(value) ? '' : String(value);
  const [text, setText] = useState<string | null>(null);
  // A stepper can change the value while this field is focused: show the new number. The
  // tolerance allows for the rounding of displayed weights, which must not rewrite the typing.
  useEffect(() => setText((t) => (t !== null && Math.abs(parseNum(t) - (value ?? 0)) >= 0.06 ? shown : t)), [value, shown]);
  return (
    <input
      className={className}
      inputMode={decimal ? 'decimal' : 'numeric'}
      aria-label={label}
      placeholder={placeholder}
      value={text ?? shown}
      onClick={onClick}
      onFocus={(e) => {
        onFocus?.();
        setText(shown);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseNum(e.target.value);
        onChange(Number.isNaN(v) ? null : decimal ? v : Math.round(v));
      }}
      onBlur={() => setText(null)}
    />
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

export interface ToastMsg {
  id: number;
  text: string;
  action?: string;
  onAction?: () => void;
}

// Bottom toast with an optional action (Undo). Disappears after a few seconds.
export function Toast({ msg, onDone }: { msg: ToastMsg | null; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => done.current(), 4000);
    return () => clearTimeout(t);
  }, [msg]);
  if (!msg) return null;
  return (
    <div className="toast" role="status" key={msg.id}>
      <span className="grow">{msg.text}</span>
      {msg.action && (
        <button
          onClick={() => {
            msg.onAction?.();
            onDone();
          }}
        >
          {msg.action}
        </button>
      )}
    </div>
  );
}
