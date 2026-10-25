import { useRef, useState } from 'react';

export interface Point {
  t: number;
  v: number;
}

// Single-series line chart: 2px line, 8px markers, crosshair + tooltip on hover/touch.
export function LineChart({
  points,
  format,
  height = 180,
  label,
}: {
  points: Point[];
  format: (v: number) => string;
  height?: number;
  label: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;

  const W = 340;
  const H = height;
  const pad = { l: 44, r: 12, t: 12, b: 24 };
  const ts = points.map((p) => p.t);
  const vs = points.map((p) => p.v);
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  let vMin = Math.min(...vs);
  let vMax = Math.max(...vs);
  const span = vMax - vMin || Math.max(1, vMax * 0.1);
  vMin -= span * 0.15;
  vMax += span * 0.15;
  const x = (t: number) => (tMax === tMin ? (pad.l + W - pad.r) / 2 : pad.l + ((t - tMin) / (tMax - tMin)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - vMin) / (vMax - vMin)) * (H - pad.t - pad.b);
  const ticks = [0, 0.5, 1].map((f) => vMin + (vMax - vMin) * f);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const onMove = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.t) - px) < Math.abs(x(points[best].t) - px)) best = i;
    });
    setHover(best);
  };

  const h = hover !== null ? points[hover] : null;
  return (
    <figure className="chart">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        onMouseMove={(e) => onMove(e.clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchStart={(e) => onMove(e.touches[0].clientX)}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="chart-axis">
              {format(v)}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 6} className="chart-axis">
          {fmtDate(tMin)}
        </text>
        {tMax !== tMin && (
          <text x={W - pad.r} y={H - 6} textAnchor="end" className="chart-axis">
            {fmtDate(tMax)}
          </text>
        )}
        <path d={path} className="chart-line" />
        {points.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.v)} r={4} className="chart-dot" />
        ))}
        {h && (
          <g>
            <line x1={x(h.t)} x2={x(h.t)} y1={pad.t} y2={H - pad.b} className="chart-cross" />
            <circle cx={x(h.t)} cy={y(h.v)} r={6} className="chart-dot chart-dot-active" />
          </g>
        )}
      </svg>
      {h && (
        <div className="chart-tip" style={{ left: `${(x(h.t) / W) * 100}%` }}>
          <strong>{format(h.v)}</strong>
          <span>{fmtDate(h.t)}</span>
        </div>
      )}
    </figure>
  );
}
