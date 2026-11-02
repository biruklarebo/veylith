import { useState, type CSSProperties, type PointerEvent } from 'react';

// Pointer-driven reorder for a vertical list. Rows need `data-drag-row`; the handle gets
// `onPointerDown={start(i)}`. Rows are assumed to be roughly equal height.
export function useDragReorder(count: number, onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<{ i: number; dy: number; h: number } | null>(null);
  const target = (d: { i: number; dy: number; h: number }) => Math.max(0, Math.min(count - 1, d.i + Math.round(d.dy / d.h)));

  const start = (i: number) => (e: PointerEvent<HTMLElement>) => {
    const row = e.currentTarget.closest('[data-drag-row]') as HTMLElement | null;
    if (!row) return;
    e.preventDefault();
    const gap = parseFloat(getComputedStyle(row.parentElement!).rowGap) || 0;
    const h = row.offsetHeight + gap;
    const y0 = e.clientY;
    setDrag({ i, dy: 0, h });
    const move = (ev: globalThis.PointerEvent) => setDrag((d) => d && { ...d, dy: ev.clientY - y0 });
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', end);
      setDrag(null);
    };
    const up = (ev: globalThis.PointerEvent) => {
      const to = target({ i, dy: ev.clientY - y0, h });
      end();
      if (to !== i) onMove(i, to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', end);
  };

  const style = (j: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (j === drag.i) return { transform: `translateY(${drag.dy}px)`, zIndex: 3, position: 'relative', boxShadow: '0 8px 24px rgb(0 0 0 / 0.35)' };
    const to = target(drag);
    if (drag.i < j && j <= to) return { transform: `translateY(${-drag.h}px)`, transition: 'transform .15s' };
    if (to <= j && j < drag.i) return { transform: `translateY(${drag.h}px)`, transition: 'transform .15s' };
    return { transition: 'transform .15s' };
  };

  return { start, style, dragging: drag !== null };
}
