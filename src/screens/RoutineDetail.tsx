import { useNav } from '../nav';
import { useStore } from '../store';
import { uid } from '../lib/calc';
import { Header } from '../components/ui';
import type { Focus, Routine } from '../types';

export function RoutineDetail({ id }: { id: string }) {
  const nav = useNav();
  const { routines, activeRoutineId, saveRoutine, deleteRoutine, setActiveRoutine, startSession, activeSession } =
    useStore();
  const r = routines.find((x) => x.id === id);
  if (!r) return <Header title="Routine not found" />;

  const patch = (p: Partial<Routine>) => saveRoutine({ ...r, ...p });
  const addDay = () => {
    const day = { id: uid(), name: `Day ${r.days.length + 1}`, items: [] };
    patch({ days: [...r.days, day] });
    nav.push({ kind: 'day', routineId: r.id, dayId: day.id });
  };

  return (
    <div className="page">
      <Header
        title="Routine"
        right={
          <button
            className="icon-btn danger"
            aria-label="Delete routine"
            onClick={() => {
              if (confirm(`Delete "${r.name}"?`)) {
                deleteRoutine(r.id);
                nav.pop();
              }
            }}
          >
            🗑
          </button>
        }
      />
      <section className="card">
        <input className="title-input" value={r.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Routine name" />
        <textarea
          className="field"
          placeholder="Description"
          value={r.description}
          onChange={(e) => patch({ description: e.target.value })}
          rows={2}
        />
        <div className="grid3">
          <label>
            <span className="muted small">Level</span>
            <select value={r.difficulty} onChange={(e) => patch({ difficulty: +e.target.value as 1 | 2 | 3 })}>
              <option value={1}>Beginner</option>
              <option value={2}>Intermediate</option>
              <option value={3}>Advanced</option>
            </select>
          </label>
          <label>
            <span className="muted small">Focus</span>
            <select value={r.focus} onChange={(e) => patch({ focus: e.target.value as Focus })}>
              <option value="general">General</option>
              <option value="bulking">Bulking</option>
              <option value="cutting">Cutting</option>
              <option value="strength">Strength</option>
              <option value="maintaining">Maintaining</option>
            </select>
          </label>
          <label>
            <span className="muted small">Days/week</span>
            <select value={r.daysPerWeek} onChange={(e) => patch({ daysPerWeek: +e.target.value })}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          className={`btn block ${r.id === activeRoutineId ? '' : 'primary'}`}
          onClick={() => setActiveRoutine(r.id === activeRoutineId ? null : r.id)}
        >
          {r.id === activeRoutineId ? '✓ Active routine' : 'Set as active routine'}
        </button>
      </section>

      <h3 className="section-title">Workout days</h3>
      <ul className="list">
        {r.days.map((d) => (
          <li key={d.id} className="list-item tall">
            <button className="grow text-left" onClick={() => nav.push({ kind: 'day', routineId: r.id, dayId: d.id })}>
              <b>{d.name}</b>
              <p className="muted small">
                {d.items.length} exercises · {d.items.reduce((n, i) => n + i.sets.length, 0)} sets
              </p>
            </button>
            <button
              className="btn small primary"
              disabled={!d.items.length}
              onClick={() => {
                if (activeSession && !confirm('Discard the workout in progress and start this one?')) return;
                startSession(r.id, d.id);
                nav.push({ kind: 'session' });
              }}
            >
              Start
            </button>
          </li>
        ))}
      </ul>
      <button className="btn block" onClick={addDay}>
        + Add day
      </button>
    </div>
  );
}
