import { useEffect, useMemo, useRef, useState } from 'react';
import { useNav } from '../nav';
import { findExercise, useStore } from '../store';
import { dayKey, fmtDuration, fmtWeight, sessionSetCount, sessionVolume, weekStreak } from '../lib/calc';
import { BodyWeightCard } from '../components/BodyWeightCard';
import { Thumb } from './Photos';
import { BodyMap } from '../components/BodyMap';
import { daysSince, fatigue, hoursToReady, volume } from '../lib/recovery';
import { Empty } from '../components/ui';
import { BODY_PARTS, type Session } from '../types';

export function Progress() {
  const nav = useNav();
  const { sessions, records, customExercises, settings } = useStore();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const monthCount = sessions.filter((s) => s.start >= monthStart).length;
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

      <div className="stat-tiles">
        <div className="tile">
          <span>Workouts</span>
          <b>{sessions.length}</b>
        </div>
        <div className="tile">
          <span>This month</span>
          <b>{monthCount}</b>
        </div>
        <div className="tile">
          <span>Week streak</span>
          <b>{weekStreak(sessions)}</b>
        </div>
        <div className="tile">
          <span>Lifted</span>
          <b>{fmtWeight(totalVolume, settings)}</b>
        </div>
      </div>

      <Heatmap sessions={sessions} />

      <MusclesCard />

      <BodyWeightCard />

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

      <PhotosCard />

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

// Last 12 months, one cell per day, shaded by sets logged that day.
function Heatmap({ sessions }: { sessions: Session[] }) {
  const nav = useNav();
  const scroller = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<string | null>(null);
  const byDay = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of sessions) m.set(dayKey(s.start), [...(m.get(dayKey(s.start)) ?? []), s]);
    return m;
  }, [sessions]);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);

  const WEEKS = 53;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (WEEKS - 1) * 7);
  const todayKey = dayKey(Date.now());
  const level = (list?: Session[]) => {
    const sets = (list ?? []).reduce((n, s) => n + sessionSetCount(s), 0);
    return !list ? 0 : sets < 10 ? 1 : sets < 20 ? 2 : sets < 30 ? 3 : 4;
  };
  const weeks = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      return date;
    }),
  );
  const picked = pick ? byDay.get(pick) : undefined;
  const activeDays = [...byDay.keys()].filter((k) => k >= dayKey(start)).length;

  return (
    <section className="card heat-card">
      <div className="row">
        <h3 className="grow">Activity</h3>
        <span className="muted small">{activeDays} {activeDays === 1 ? 'day' : 'days'} in the last year</span>
      </div>
      <div className="heat-scroll" ref={scroller}>
        <div className="heat-months">
          {weeks.map((w, i) => (
            <span key={i}>{w[0].getDate() <= 7 ? w[0].toLocaleDateString(undefined, { month: 'short' }) : ''}</span>
          ))}
        </div>
        <div className="heat-grid" role="grid" aria-label="Workouts per day, last 12 months">
          {weeks.map((w, i) => (
            <div key={i} className="heat-col">
              {w.map((date) => {
                const k = dayKey(date);
                if (k > todayKey) return <span key={k} className="heat-cell future" />;
                return (
                  <button
                    key={k}
                    className={`heat-cell l${level(byDay.get(k))} ${k === todayKey ? 'today' : ''} ${pick === k ? 'picked' : ''}`}
                    onClick={() => (pick === k && picked ? nav.push({ kind: 'history', id: picked[0].id }) : setPick(k))}
                    aria-label={`${date.toLocaleDateString()}: ${byDay.get(k)?.length ?? 0} workouts`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="heat-foot">
        <span className="muted small grow">
          {pick
            ? `${new Date(pick + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${
                picked ? `${picked.map((s) => s.name).join(', ')} · ${picked.reduce((n, s) => n + sessionSetCount(s), 0)} sets (tap again to open)` : 'Rest'
              }`
            : 'Tap a day for details'}
        </span>
        <span className="heat-legend" aria-hidden>
          Less <i className="heat-cell l0" /> <i className="heat-cell l1" /> <i className="heat-cell l2" /> <i className="heat-cell l3" /> <i className="heat-cell l4" /> More
        </span>
      </div>
    </section>
  );
}

function PhotosCard() {
  const nav = useNav();
  const photos = useStore((s) => s.photos);
  const recent = photos.slice(-4).reverse();
  return (
    <section className="card">
      <div className="row">
        <h3 className="grow">Progress photos</h3>
        <button className="btn small" onClick={() => nav.push({ kind: 'photos' })}>
          {photos.length ? `All ${photos.length} ›` : 'Add ›'}
        </button>
      </div>
      {recent.length ? (
        <>
          <div className="ph-grid four">
            {recent.map((p) => (
              <Thumb key={p.id} photo={p} onClick={() => nav.push({ kind: 'photos' })} />
            ))}
          </div>
          {photos.length >= 2 && (
            <button className="btn soft block" onClick={() => nav.push({ kind: 'compare', a: photos[0].id, b: photos[photos.length - 1].id })}>
              ⇆ Before / after
            </button>
          )}
        </>
      ) : (
        <p className="muted small">Add photos to see your change side by side with a slider.</p>
      )}
    </section>
  );
}
