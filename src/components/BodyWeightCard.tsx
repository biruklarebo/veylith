import { useEffect, useState } from 'react';
import { useNav } from '../nav';
import { useStore } from '../store';
import { dayKey, fromDisplay, toDisplay, uid } from '../lib/calc';
import { LineChart } from './LineChart';
import { Sheet } from './Sheet';

// Least-squares slope over the last `days` days of weigh-ins, in display units per week.
function weeklyTrend(points: { t: number; v: number }[], days = 42) {
  const since = Date.now() - days * 864e5;
  const pts = points.filter((p) => p.t >= since);
  if (pts.length < 3 || pts.at(-1)!.t - pts[0].t < 7 * 864e5) return null;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.t, 0) / n;
  const my = pts.reduce((a, p) => a + p.v, 0) / n;
  const num = pts.reduce((a, p) => a + (p.t - mx) * (p.v - my), 0);
  const den = pts.reduce((a, p) => a + (p.t - mx) ** 2, 0);
  const perWeek = (num / den) * 7 * 864e5;
  return { perWeek, pct: (perWeek / my) * 100 };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// Latest weight, change, goal, chart and trend, with quick logging. Used on Home and Progress.
export function BodyWeightCard() {
  const nav = useNav();
  const { bodyStats, settings, saveBodyStat, updateSettings } = useStore();
  const [logOpen, setLogOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const points = bodyStats.filter((b) => b.values.weight).map((b) => ({ t: new Date(`${b.date}T12:00`).getTime(), v: toDisplay(b.values.weight!, settings), date: b.date }));
  const last = points.at(-1);
  const prev = points.at(-2);
  const goal = settings.goalWeightLbs ? toDisplay(settings.goalWeightLbs, settings) : undefined;
  const trend = weeklyTrend(points);
  const u = settings.unit;

  return (
    <section className="card bw-card">
      <div className="row gap">
        <h3 className="grow muted-h">Body weight</h3>
        <button className="bw-goal" onClick={() => setGoalOpen(true)} aria-label={goal ? `Goal ${goal} ${u}, change` : 'Set a goal'}>
          ◎ {goal ?? 'Goal'}
        </button>
        <button className="link small bw-log" onClick={() => setLogOpen(true)}>
          ＋ Log
        </button>
      </div>

      {last ? (
        <>
          <div className="bw-head">
            <b className="bw-now">
              {last.v} <small>{u}</small>
            </b>
            {prev && last.v !== prev.v && (
              <span className={`bw-delta ${last.v < prev.v ? 'down' : 'up'}`}>
                {last.v < prev.v ? '↓' : '↑'} {round1(Math.abs(last.v - prev.v))}
              </span>
            )}
            <span className="grow" />
            <span className="muted small">{new Date(last.t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          </div>
          {goal !== undefined && (
            <p className="bw-goal-line">
              ◎ Goal {goal} {u}
              {round1(last.v - goal) === 0 ? ' · reached' : ` · ${round1(Math.abs(last.v - goal))} ${u} to ${last.v > goal ? 'lose' : 'gain'}`}
            </p>
          )}
          {points.length > 1 && <LineChart points={points} area goal={goal} format={(v) => `${round1(v)}`} label={`Body weight in ${u} over time`} />}
          {trend && (
            <p className="bw-trend">
              <span aria-hidden>↗</span> Trend {trend.perWeek > 0 ? '+' : '−'}
              {round1(Math.abs(trend.perWeek))} {u} a week ({trend.perWeek > 0 ? '+' : '−'}
              {Math.abs(Math.round(trend.pct * 100) / 100)}%)
            </p>
          )}
          <button className="link small bw-all" onClick={() => nav.push({ kind: 'bodystats' })}>
            All weigh-ins ›
          </button>
        </>
      ) : (
        <p className="muted small">Log your weight to see your trend and progress toward a goal.</p>
      )}

      <NumberSheet
        open={logOpen}
        title="Log weight"
        unit={u}
        initial={last?.v}
        onClose={() => setLogOpen(false)}
        onSave={(v) => {
          if (v === undefined) return;
          const date = dayKey(Date.now());
          const existing = bodyStats.find((b) => b.date === date);
          saveBodyStat({ id: existing?.id ?? uid(), date, values: { ...existing?.values, weight: fromDisplay(v, settings) } });
          setLogOpen(false);
        }}
      />
      <NumberSheet
        open={goalOpen}
        title="Body-weight goal"
        unit={u}
        initial={goal}
        removable={goal !== undefined}
        onClose={() => setGoalOpen(false)}
        onSave={(v) => {
          updateSettings({ goalWeightLbs: v ? fromDisplay(v, settings) : undefined });
          setGoalOpen(false);
        }}
      />
    </section>
  );
}

function NumberSheet({ open, title, unit, initial, removable, onClose, onSave }: { open: boolean; title: string; unit: string; initial?: number; removable?: boolean; onClose: () => void; onSave: (v: number | undefined) => void }) {
  const [text, setText] = useState('');
  useEffect(() => setText(initial !== undefined ? String(initial) : ''), [open, initial]);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="row gap center-row">
        <input className="field big-input" inputMode="decimal" autoFocus placeholder="0" value={text} onChange={(e) => setText(e.target.value)} aria-label={`${title} in ${unit}`} />
        <span className="muted">{unit}</span>
      </div>
      <div className="row gap">
        {removable && (
          <button className="btn grow" onClick={() => onSave(undefined)}>
            Remove
          </button>
        )}
        <button className="btn primary grow big" disabled={!(parseFloat(text) > 0)} onClick={() => onSave(parseFloat(text))}>
          Save
        </button>
      </div>
    </Sheet>
  );
}
