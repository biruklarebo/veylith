import { useNav, useUI } from '../nav';
import { useStore } from '../store';
import { dayKey, estDaySeconds, fmtDuration, fmtEst, fmtWeight, sessionSetCount, sessionVolume } from '../lib/calc';
import { plannedOn } from '../lib/plans';
import { Sheet } from './Sheet';

// One calendar day: what was logged and, from today on, what is planned, with the active
// program's other days ready to add. Opened from the Home calendar and the Progress activity grid.
export function DaySheet({ date, onClose }: { date: Date | null; onClose: () => void }) {
  const nav = useNav();
  const { sessions, routines, activeRoutineId, schedule, settings, scheduleDay, unscheduleDay } = useStore();
  if (!date) return null;

  const key = dayKey(date);
  const logged = sessions.filter((s) => dayKey(s.start) === key);
  const upcoming = key >= dayKey(Date.now());
  const routine = routines.find((r) => r.id === activeRoutineId);
  const planned = plannedOn(date, routine, schedule, sessions);
  const addable = upcoming ? (routine?.days ?? []).filter((d) => !planned.some((p) => p.day.id === d.id)) : [];
  const weekdayName = date.toLocaleDateString(undefined, { weekday: 'long' });

  const openDay = (dayId: string) => {
    onClose();
    useUI.getState().set({ workoutTab: 'planned', planTab: 'details', dayId });
    nav.reset('workout');
  };

  return (
    <Sheet open onClose={onClose} title={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}>
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
          {planned.map(({ day: d, scheduled }) => (
            <li key={d.id} className="planned-row">
              <button className="list-item" onClick={() => openDay(d.id)}>
                <div className="grow">
                  <b>{d.name}</b>
                  <p className="muted small">
                    {scheduled ? 'Planned' : `Every ${weekdayName}`} · {d.items.length} exercises · ~{fmtEst(estDaySeconds(d))}
                  </p>
                </div>
                <span className="chev">›</span>
              </button>
              {scheduled && (
                <button className="icon-btn" onClick={() => unscheduleDay(key, routine!.id, d.id)} aria-label={`Remove ${d.name} from this day`}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{!upcoming ? 'No workout logged.' : routine?.days.length ? 'Nothing planned yet.' : 'Pick a program to plan workouts here.'}</p>
      )}
      {addable.length > 0 && (
        <>
          <span className="sheet-label">Plan a workout</span>
          <ul className="prog-rows">
            {addable.map((d) => (
              <li key={d.id}>
                <button className="prog-row" onClick={() => scheduleDay(key, routine!.id, d.id)}>
                  <span className="grow">
                    <b>{d.name}</b>
                    <small className="muted block">
                      {d.items.length} exercises · ~{fmtEst(estDaySeconds(d))}
                    </small>
                  </span>
                  <span className="chev">+</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
