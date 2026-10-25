import { useMemo, useState } from 'react';
import { useNav } from '../nav';
import { findExercise, useStore } from '../store';
import { dayKey, fmtDuration, fmtWeight, sessionSetCount, sessionVolume, toDisplay, weekStreak } from '../lib/calc';
import { LineChart } from '../components/LineChart';
import { BodyMap } from '../components/BodyMap';
import { daysSince, fatigue, hoursToReady, volume } from '../lib/recovery';
import { Empty } from '../components/ui';
import { BODY_PARTS } from '../types';

export function Progress() {
  const nav = useNav();
  const { sessions, records, bodyStats, customExercises, settings } = useStore();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    sessions.forEach((s) => m.set(dayKey(s.start), (m.get(dayKey(s.start)) ?? 0) + 1));
    return m;
  }, [sessions]);

  const firstDow = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthCount = sessions.filter((s) => {
    const d = new Date(s.start);
    return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
  }).length;

  const weightPoints = bodyStats
    .filter((b) => b.values.weight)
    .map((b) => ({ t: new Date(b.date).getTime(), v: toDisplay(b.values.weight!, settings) }));

  const topRecords = Object.entries(records)
    .filter(([, r]) => r.best1RM > 0)
    .sort((a, b) => b[1].bestAt - a[1].bestAt)
    .slice(0, 8);

  const totalVolume = sessions.reduce((n, s) => n + sessionVolume(s), 0);

  return (
    <div className="page">
      <header className="home-head">
        <h1 className="title">Progress</h1>
        <button className="icon-btn" onClick={() => nav.push({ kind: 'settings' })} aria-label="Settings">
          ⚙
        </button>
      </header>

      <section className="card">
        <div className="stat-row">
          <div>
            <b>{sessions.length}</b>
            <span>workouts</span>
          </div>
          <div>
            <b>{weekStreak(sessions)}</b>
            <span>week streak</span>
          </div>
          <div>
            <b>{fmtWeight(totalVolume, settings)}</b>
            <span>lifted</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="row gap">
          <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">
            ‹
          </button>
          <h3 className="grow center">
            {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            <span className="muted small"> · {monthCount} {monthCount === 1 ? 'workout' : 'workouts'}</span>
          </h3>
          <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">
            ›
          </button>
        </div>
        <div className="cal">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i} className="cal-h">
              {d}
            </span>
          ))}
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const k = dayKey(new Date(month.getFullYear(), month.getMonth(), d));
            const n = byDay.get(k) ?? 0;
            return (
              <span key={i} className={`cal-d ${n ? 'on' : ''} ${k === dayKey(Date.now()) ? 'today' : ''}`} title={n ? `${n} workout(s)` : undefined}>
                {d}
              </span>
            );
          })}
        </div>
      </section>

      <MusclesCard />

      <section className="card">
        <div className="row">
          <h3 className="grow">Body weight</h3>
          <button className="btn small" onClick={() => nav.push({ kind: 'bodystats' })}>
            Body stats ›
          </button>
        </div>
        {weightPoints.length ? (
          <LineChart points={weightPoints} format={(v) => `${v.toFixed(0)}`} label={`Body weight in ${settings.unit} over time`} />
        ) : (
          <p className="muted small">Log your weight in Body stats to see a trend.</p>
        )}
      </section>

      <section className="card">
        <h3>Personal records</h3>
        {topRecords.length === 0 ? (
          <p className="muted small">Estimated 1RMs appear after you log weighted sets.</p>
        ) : (
          <ul className="list flat">
            {topRecords.map(([id, r]) => (
              <li key={id}>
                <button className="list-item" onClick={() => nav.push({ kind: 'exercise', id })}>
                  <span className="grow">{findExercise(id, customExercises)?.name ?? id}</span>
                  <b>{fmtWeight(r.best1RM, settings)}</b>
                  <span className="chev">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h3 className="section-title">History</h3>
      {sessions.length === 0 ? (
        <Empty title="Nothing logged yet" />
      ) : (
        <ul className="list">
          {sessions.map((s) => (
            <li key={s.id}>
              <button className="list-item" onClick={() => nav.push({ kind: 'history', id: s.id })}>
                <div className="grow">
                  <b>{s.name}</b>
                  <p className="muted small">
                    {new Date(s.start).toLocaleDateString()} · {fmtDuration((s.end ?? s.start) - s.start)} · {sessionSetCount(s)} sets
                  </p>
                </div>
                <span className="chev">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type MuscleMode = 'recovery' | 'volume' | 'untrained';
const WINDOWS = [
  { days: 7, label: 'Week' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
];

// Body map in three modes: what is still recovering, where the volume went, what has gone untrained.
function MusclesCard() {
  const { sessions, customExercises } = useStore();
  const [mode, setMode] = useState<MuscleMode>('recovery');
  const [days, setDays] = useState(7);
  const find = (id: string) => findExercise(id, customExercises);
  const data = useMemo(() => {
    const f = fatigue(sessions, find);
    const v = volume(sessions, find, days);
    const since = daysSince(sessions, find);
    return { f, v, since };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, customExercises, days]);

  const parts = BODY_PARTS.slice(0, 10).map((name, p) => ({ name, p }));
  const maxV = Math.max(1, ...data.v);
  const heat =
    mode === 'recovery'
      ? data.f
      : mode === 'volume'
        ? data.v.map((n) => n / maxV)
        : data.since.map((d) => (d === null ? 1 : Math.min(1, Math.max(0, (d - 4) / 10))));

  const rows =
    mode === 'recovery'
      ? [...parts].sort((a, b) => data.f[b.p] - data.f[a.p])
      : mode === 'volume'
        ? [...parts].sort((a, b) => data.v[b.p] - data.v[a.p])
        : [...parts].sort((a, b) => (data.since[b.p] ?? 1e9) - (data.since[a.p] ?? 1e9));

  return (
    <section className="card muscles-card">
      <div className="seg-ctl" role="tablist" aria-label="Muscle view">
        {(
          [
            ['recovery', 'Recovery'],
            ['volume', 'Volume'],
            ['untrained', 'Untrained'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={mode === id} className={mode === id ? 'on' : ''} onClick={() => setMode(id)}>
            {label}
          </button>
        ))}
      </div>
      <p className="muted small">
        {mode === 'recovery' && 'Brighter = more fatigue still on the muscle, from hard sets fading over time.'}
        {mode === 'volume' && 'Hard sets per muscle (secondary muscles count 0.4).'}
        {mode === 'untrained' && 'Brighter = longer since you trained it directly.'}
      </p>
      {mode === 'volume' && (
        <div className="seg-ctl small">
          {WINDOWS.map((w) => (
            <button key={w.days} className={days === w.days ? 'on' : ''} onClick={() => setDays(w.days)}>
              {w.label}
            </button>
          ))}
        </div>
      )}
      <BodyMap heat={heat} className={`muscle-map m-${mode}`} />
      <div className="bars">
        {rows.slice(0, mode === 'untrained' ? 10 : 6).map(({ name, p }) => {
          const pct = mode === 'recovery' ? 1 - data.f[p] : mode === 'volume' ? data.v[p] / maxV : heat[p];
          const label =
            mode === 'recovery'
              ? hoursToReady(data.f[p], p)
                ? `ready in ~${hoursToReady(data.f[p], p)}h`
                : 'Ready'
              : mode === 'volume'
                ? `${Math.round(data.v[p] * 10) / 10} sets`
                : data.since[p] === null
                  ? 'never'
                  : data.since[p] === 0
                    ? 'today'
                    : `${data.since[p]}d ago`;
          return (
            <div key={p} className="bar-row">
              <span>{name}</span>
              <div className={`bar ${mode === 'recovery' ? 'recovery' : ''}`}>
                <span style={{ width: `${Math.max(2, pct * 100)}%` }} />
              </div>
              <span className="muted small">{label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
