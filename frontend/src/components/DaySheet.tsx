import { useNav, useUI } from '../nav';
import { useStore } from '../store';
import { dayKey, estDaySeconds, fmtDuration, fmtEst, fmtWeight, sessionSetCount, sessionVolume } from '../lib/calc';
import { Sheet } from './Sheet';

// One calendar day: what was logged and, from today on, what the program has pinned to it.
// Opened from the Home week strip and the Progress activity grid.
export function DaySheet({ date, onClose }: { date: Date | null; onClose: () => void }) {
  const nav = useNav();
  const { sessions, routines, activeRoutineId, settings } = useStore();
  if (!date) return null;

  const key = dayKey(date);
  const logged = sessions.filter((s) => dayKey(s.start) === key);
  const upcoming = key >= dayKey(Date.now());
  const weekday = (date.getDay() + 6) % 7;
  const routine = routines.find((r) => r.id === activeRoutineId);
  const planned = upcoming ? (routine?.days ?? []).filter((d) => d.weekday === weekday && !logged.some((s) => s.dayId === d.id)) : [];

  const openDay = (dayId: string) => {
    onClose();
    useUI.getState().set({ workoutTab: 'planned', planTab: 'details', dayId });
    nav.reset('workout');
  };

  return (
    <Sheet open onClose={onClose} title={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
      {logged.length > 0 || planned.length > 0 ? (
        <ul className="list flat">
          {logged.map((s) => (
            <li key={s.id}>
              <button
                className="list-item"
                onClick={() => {
                  onClose();
                  nav.push({ kind: 'history', id: s.id });
                }}
              >
                <div className="grow">
                  <b>{s.name}</b>
                  <p className="muted small">
                    {fmtDuration((s.end ?? s.start) - s.start)} · {sessionSetCount(s)} sets · {fmtWeight(sessionVolume(s), settings)}
                  </p>
                </div>
                <span className="chev">›</span>
              </button>
            </li>
          ))}
          {planned.map((d) => (
            <li key={d.id}>
              <button className="list-item" onClick={() => openDay(d.id)}>
                <div className="grow">
                  <b>{d.name}</b>
                  <p className="muted small">
                    Planned · {d.items.length} exercises · ~{fmtEst(estDaySeconds(d))}
                  </p>
                </div>
                <span className="chev">›</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{upcoming ? 'Nothing scheduled. Assign a weekday to a program day to see it here.' : 'No workout logged.'}</p>
      )}
    </Sheet>
  );
}
