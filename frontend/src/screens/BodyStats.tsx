import { useState } from 'react';
import { useStore } from '../store';
import { dayKey, fromDisplay, parseNum, toDisplay, uid } from '../lib/calc';
import { Header } from '../components/ui';
import { LineChart } from '../components/LineChart';
import { BODY_FIELDS, type BodyField } from '../types';

const LABELS: Record<BodyField, string> = {
  weight: 'Weight', fat: 'Body fat %', chest: 'Chest', arms: 'Arms', waist: 'Waist', hips: 'Hips',
  thighs: 'Thighs', calves: 'Calves', shoulders: 'Shoulders', neck: 'Neck', forearms: 'Forearms',
};

// Measurements are stored as entered (inches/cm per the user's choice); only weight is unit-converted.
export function BodyStats() {
  const { bodyStats, saveBodyStat, deleteBodyStat, settings } = useStore();
  const [date, setDate] = useState(dayKey(Date.now()));
  const existing = bodyStats.find((b) => b.date === date);
  const [draft, setDraft] = useState<Partial<Record<BodyField, string>>>({});
  const [field, setField] = useState<BodyField>('weight');

  const valueOf = (f: BodyField) => {
    if (draft[f] !== undefined) return draft[f];
    const v = existing?.values[f];
    if (v == null) return '';
    return String(f === 'weight' ? toDisplay(v, settings) : v);
  };

  const save = () => {
    const values: Partial<Record<BodyField, number>> = { ...existing?.values };
    for (const f of BODY_FIELDS) {
      const raw = draft[f];
      if (raw === undefined) continue;
      const v = parseNum(raw);
      if (raw.trim() === '') delete values[f];
      else if (!Number.isNaN(v)) values[f] = f === 'weight' ? fromDisplay(v, settings) : v;
    }
    if (Object.keys(values).length) saveBodyStat({ id: existing?.id ?? uid(), date, values });
    else if (existing) deleteBodyStat(existing.id);
    setDraft({});
  };

  const points = bodyStats
    .filter((b) => b.values[field] != null)
    .map((b) => ({ t: new Date(`${b.date}T12:00`).getTime(), v: field === 'weight' ? toDisplay(b.values.weight!, settings) : b.values[field]! }));

  return (
    <div className="page">
      <Header title="Body stats" />
      <section className="card">
        <label className="row gap">
          <span className="grow">Date</span>
          <input type="date" value={date} max={dayKey(Date.now())} onChange={(e) => { setDate(e.target.value); setDraft({}); }} />
        </label>
        <div className="grid2">
          {BODY_FIELDS.map((f) => (
            <label key={f}>
              <span className="muted small">
                {LABELS[f]} {f === 'weight' ? `(${settings.unit})` : ''}
              </span>
              <input inputMode="decimal" value={valueOf(f)} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} />
            </label>
          ))}
        </div>
        <button className="btn primary block" onClick={save} disabled={!Object.keys(draft).length}>
          Save
        </button>
      </section>

      <section className="card">
        <select value={field} onChange={(e) => setField(e.target.value as BodyField)} aria-label="Chart measurement">
          {BODY_FIELDS.map((f) => (
            <option key={f} value={f}>
              {LABELS[f]}
            </option>
          ))}
        </select>
        {points.length ? (
          <LineChart points={points} format={(v) => v.toFixed(field === 'fat' ? 1 : 0)} label={`${LABELS[field]} over time`} />
        ) : (
          <p className="muted small">No entries for {LABELS[field].toLowerCase()} yet.</p>
        )}
      </section>

      <ul className="list">
        {[...bodyStats].reverse().map((b) => (
          <li key={b.id} className="list-item">
            <div className="grow">
              <b>{b.date}</b>
              <p className="muted small">
                {Object.entries(b.values)
                  .map(([k, v]) => `${LABELS[k as BodyField]} ${k === 'weight' ? toDisplay(v!, settings) : v}`)
                  .join(' · ')}
              </p>
            </div>
            <button className="icon-btn danger" onClick={() => deleteBodyStat(b.id)} aria-label="Delete entry">
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
