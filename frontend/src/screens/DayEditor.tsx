import { useNav } from '../nav';
import { findExercise, useStore } from '../store';
import { fromDisplay, toDisplay, uid } from '../lib/calc';
import { Empty, Header, NumField, PartBadge } from '../components/ui';
import type { DayItem, PlanSet, SetType, WorkoutDay } from '../types';

export const SET_TYPES: { id: SetType; short: string; label: string }[] = [
  { id: 'regular', short: '', label: 'Regular' },
  { id: 'warmup', short: 'W', label: 'Warm-up' },
  { id: 'drop', short: 'D', label: 'Drop set' },
  { id: 'failure', short: 'F', label: 'To failure' },
];

export function DayEditor({ routineId, dayId }: { routineId: string; dayId: string }) {
  const nav = useNav();
  const { routines, updateDay, saveRoutine, customExercises, settings } = useStore();
  const routine = routines.find((r) => r.id === routineId);
  const day = routine?.days.find((d) => d.id === dayId);
  if (!routine || !day) return <Header title="Day not found" />;

  const save = (d: WorkoutDay) => updateDay(routineId, d);
  const setItems = (items: DayItem[]) => save({ ...day, items });
  const patchItem = (id: string, fn: (i: DayItem) => DayItem) => setItems(day.items.map((i) => (i.id === id ? fn(i) : i)));
  const patchSet = (itemId: string, idx: number, p: Partial<PlanSet>) =>
    patchItem(itemId, (i) => ({ ...i, sets: i.sets.map((s, j) => (j === idx ? { ...s, ...p } : s)) }));

  const move = (idx: number, dir: -1 | 1) => {
    const items = [...day.items];
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    [items[idx], items[j]] = [items[j], items[idx]];
    setItems(items);
  };

  // Superset with the next exercise: share (or create) a group id.
  const toggleSuperset = (idx: number) => {
    const a = day.items[idx];
    const b = day.items[idx + 1];
    if (!b) return;
    if (a.supersetId && a.supersetId === b.supersetId) {
      setItems(day.items.map((it, k) => (k === idx + 1 ? { ...it, supersetId: 0 } : it)));
      return;
    }
    const gid = a.supersetId || Math.max(0, ...day.items.map((i) => i.supersetId)) + 1;
    setItems(day.items.map((it, k) => (k === idx || k === idx + 1 ? { ...it, supersetId: gid } : it)));
  };

  const addExercises = () =>
    nav.push({
      kind: 'picker',
      title: 'Add exercises',
      onPick: (ids) => {
        const fresh = useStore.getState().routines.find((r) => r.id === routineId)?.days.find((d) => d.id === dayId);
        if (!fresh) return;
        const rest = useStore.getState().settings.defaultRest;
        updateDay(routineId, {
          ...fresh,
          items: [
            ...fresh.items,
            ...ids.map((exerciseId) => ({
              id: uid(),
              exerciseId,
              supersetId: 0,
              sets: Array.from({ length: 3 }, () => ({ type: 'regular' as const, weightLbs: null, reps: 10, rest })),
            })),
          ],
        });
      },
    });

  return (
    <div className="page">
      <Header
        title={routine.name}
        right={
          <button
            className="icon-btn danger"
            aria-label="Delete day"
            onClick={() => {
              if (confirm(`Delete ${day.name}?`)) {
                saveRoutine({ ...routine, days: routine.days.filter((d) => d.id !== day.id) });
                nav.pop();
              }
            }}
          >
            🗑
          </button>
        }
      />
      <input className="title-input" value={day.name} onChange={(e) => save({ ...day, name: e.target.value })} aria-label="Day name" />

      {day.items.length === 0 && (
        <Empty title="No exercises yet">
          <p className="muted small">Add exercises to build this workout day.</p>
        </Empty>
      )}

      {day.items.map((it, idx) => {
        const ex = findExercise(it.exerciseId, customExercises);
        const linkedNext = it.supersetId > 0 && day.items[idx + 1]?.supersetId === it.supersetId;
        const linkedPrev = it.supersetId > 0 && day.items[idx - 1]?.supersetId === it.supersetId;
        return (
          <section key={it.id} className={`card item ${linkedNext ? 'ss-top' : ''} ${linkedPrev ? 'ss-bottom' : ''}`}>
            <div className="row gap">
              <PartBadge part={ex?.bodyPart ?? 0} size={36} />
              <div className="grow">
                <b>{ex?.name ?? 'Unknown exercise'}</b>
                {it.supersetId > 0 && (linkedNext || linkedPrev) && <span className="pill ss">Superset</span>}
              </div>
              <button className="icon-btn" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Move up">
                ↑
              </button>
              <button className="icon-btn" onClick={() => move(idx, 1)} disabled={idx === day.items.length - 1} aria-label="Move down">
                ↓
              </button>
              <button className="icon-btn danger" onClick={() => setItems(day.items.filter((x) => x.id !== it.id))} aria-label="Remove">
                ✕
              </button>
            </div>
            <table className="sets">
              <thead>
                <tr>
                  <th>Set</th>
                  <th>{settings.unit}</th>
                  <th>Reps</th>
                  <th>Rest s</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {it.sets.map((s, j) => (
                  <tr key={j}>
                    <td>
                      <select
                        className={`set-type t-${s.type}`}
                        value={s.type}
                        onChange={(e) => patchSet(it.id, j, { type: e.target.value as SetType })}
                        aria-label="Set type"
                      >
                        {SET_TYPES.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.short || j + 1} {t.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <NumField
                        decimal
                        label={`Set ${j + 1} weight`}
                        placeholder="auto"
                        value={s.weightLbs === null ? null : toDisplay(s.weightLbs, settings)}
                        onChange={(v) => patchSet(it.id, j, { weightLbs: v === null ? null : fromDisplay(v, settings) })}
                      />
                    </td>
                    <td>
                      <input inputMode="numeric" value={s.reps} onChange={(e) => patchSet(it.id, j, { reps: +e.target.value || 0 })} />
                    </td>
                    <td>
                      <input inputMode="numeric" value={s.rest} onChange={(e) => patchSet(it.id, j, { rest: +e.target.value || 0 })} />
                    </td>
                    <td>
                      <button
                        className="icon-btn small"
                        aria-label="Remove set"
                        disabled={it.sets.length === 1}
                        onClick={() => patchItem(it.id, (i) => ({ ...i, sets: i.sets.filter((_, k) => k !== j) }))}
                      >
                        −
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row gap">
              <button
                className="btn small"
                onClick={() =>
                  patchItem(it.id, (i) => ({
                    ...i,
                    sets: [...i.sets, { ...(i.sets.at(-1) ?? { type: 'regular', weightLbs: null, reps: 10, rest: settings.defaultRest }) }],
                  }))
                }
              >
                + Set
              </button>
              {idx < day.items.length - 1 && (
                <button className="btn small" onClick={() => toggleSuperset(idx)}>
                  {linkedNext ? 'Unlink superset' : 'Superset with next'}
                </button>
              )}
            </div>
          </section>
        );
      })}
      <button className="btn primary block" onClick={addExercises}>
        + Add exercises
      </button>
    </div>
  );
}
