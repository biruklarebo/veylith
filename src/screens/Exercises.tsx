import { useMemo, useState } from 'react';
import { useNav } from '../nav';
import { useExercise, useExercises, useStore } from '../store';
import { fmtWeight, fromDisplay, logBest1RM, toDisplay, weightForReps } from '../lib/calc';
import { Empty, Header, PartBadge } from '../components/ui';
import { LineChart } from '../components/LineChart';
import { BODY_PARTS, EQUIPMENT, type Equipment, type RecordType } from '../types';

export function ExerciseLibrary({ picker, initialPart = null }: { picker?: { title: string; onPick: (ids: string[]) => void }; initialPart?: number | null }) {
  const nav = useNav();
  const exercises = useExercises();
  const addCustomExercise = useStore((s) => s.addCustomExercise);
  const [q, setQ] = useState('');
  const [part, setPart] = useState<number | null>(initialPart);
  const [equip, setEquip] = useState<Equipment | ''>('');
  const [picked, setPicked] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const list = useMemo(
    () =>
      exercises
        .filter((e) => (part === null || e.bodyPart === part) && (!equip || e.equipment === equip))
        .filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [exercises, part, equip, q],
  );

  const tap = (id: string) => {
    if (!picker) return nav.push({ kind: 'exercise', id });
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  return (
    <div className="page">
      {picker ? (
        <Header
          title={picker.title}
          right={
            <button
              className="btn small primary"
              disabled={!picked.length}
              onClick={() => {
                picker.onPick(picked);
                nav.pop();
              }}
            >
              Add{picked.length ? ` ${picked.length}` : ''}
            </button>
          }
        />
      ) : (
        <Header
          title="Exercises"
          right={
            <button className="btn small" onClick={() => setCreating(true)}>
              + Custom
            </button>
          }
        />
      )}

      <input className="search" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        <button className={`chip ${part === null ? 'on' : ''}`} onClick={() => setPart(null)}>
          All
        </button>
        {BODY_PARTS.map((b, i) => (
          <button key={b} className={`chip ${part === i ? 'on' : ''}`} onClick={() => setPart(part === i ? null : i)}>
            {b}
          </button>
        ))}
      </div>
      <select className="equip-filter" value={equip} onChange={(e) => setEquip(e.target.value as Equipment | '')} aria-label="Equipment">
        <option value="">Any equipment</option>
        {EQUIPMENT.map((e) => (
          <option key={e}>{e}</option>
        ))}
      </select>

      {creating && (
        <CustomExerciseForm
          onCancel={() => setCreating(false)}
          onSave={(e) => {
            const ex = addCustomExercise(e);
            setCreating(false);
            if (picker) setPicked((p) => [...p, ex.id]);
          }}
        />
      )}

      {list.length === 0 ? (
        <Empty title="No matching exercises">
          <button className="btn" onClick={() => setCreating(true)}>
            Create “{q || 'custom exercise'}”
          </button>
        </Empty>
      ) : (
        <ul className="list">
          {list.map((e) => (
            <li key={e.id}>
              <button className={`list-item ${picked.includes(e.id) ? 'picked' : ''}`} onClick={() => tap(e.id)}>
                <PartBadge part={e.bodyPart} size={36} />
                <div className="grow">
                  <b>{e.name}</b>
                  <p className="muted small">
                    {BODY_PARTS[e.bodyPart]} · {e.equipment}
                    {e.custom ? ' · Custom' : ''}
                  </p>
                </div>
                {picker ? <span className={`check ${picked.includes(e.id) ? 'on' : ''}`}>✓</span> : <span className="chev">›</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {picker && (
        <button className="btn block" onClick={() => setCreating(true)}>
          + Create custom exercise
        </button>
      )}
    </div>
  );
}

function CustomExerciseForm({
  onSave,
  onCancel,
}: {
  onSave: (e: { name: string; bodyPart: number; equipment: Equipment; recordType: RecordType; secondary: number[] }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [bodyPart, setBodyPart] = useState(3);
  const [equipment, setEquipment] = useState<Equipment>('Barbell');
  const [recordType, setRecordType] = useState<RecordType>('weight');
  return (
    <section className="card">
      <h3>New custom exercise</h3>
      <input className="field" placeholder="Exercise name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="grid3">
        <label>
          <span className="muted small">Muscle</span>
          <select value={bodyPart} onChange={(e) => setBodyPart(+e.target.value)}>
            {BODY_PARTS.map((b, i) => (
              <option key={b} value={i}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small">Equipment</span>
          <select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
            {EQUIPMENT.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small">Track</span>
          <select value={recordType} onChange={(e) => setRecordType(e.target.value as RecordType)}>
            <option value="weight">Weight × reps</option>
            <option value="bodyweight">Bodyweight reps</option>
            <option value="cardio">Duration</option>
          </select>
        </label>
      </div>
      <div className="row gap">
        <button className="btn grow" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn primary grow"
          disabled={!name.trim()}
          onClick={() => onSave({ name: name.trim(), bodyPart, equipment, recordType, secondary: [] })}
        >
          Save
        </button>
      </div>
    </section>
  );
}

const PCT_TABLE = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15];

export function ExerciseDetail({ id }: { id: string }) {
  const ex = useExercise(id);
  const { sessions, records, settings, setTarget1RM } = useStore();
  const rec = records[id];
  const history = sessions
    .flatMap((s) => s.logs.filter((l) => l.exerciseId === id).map((l) => ({ s, l })))
    .reverse();
  const points = history.map(({ s, l }) => ({ t: s.start, v: toDisplay(logBest1RM(l), settings) })).filter((p) => p.v > 0);
  const [calcW, setCalcW] = useState('');
  const [calcR, setCalcR] = useState('');

  if (!ex) return <Header title="Exercise not found" />;
  const oneRm = rec?.best1RM ?? 0;
  const calc1Rm = +calcW > 0 && +calcR > 0 ? (+calcR === 1 ? +calcW : +calcW * (1 + +calcR / 30)) : 0;

  return (
    <div className="page">
      <Header title={ex.name} />
      <section className="card row gap">
        <PartBadge part={ex.bodyPart} size={56} />
        <div>
          <p>
            <b>{BODY_PARTS[ex.bodyPart]}</b>
            {ex.secondary?.length ? <span className="muted"> + {ex.secondary.map((p) => BODY_PARTS[p]).join(', ')}</span> : null}
          </p>
          <p className="muted small">{ex.equipment}</p>
        </div>
      </section>

      {ex.recordType !== 'cardio' && (
        <section className="card">
          <div className="stat-row">
            <div>
              <b>{oneRm ? fmtWeight(oneRm, settings) : '—'}</b>
              <span>best est. 1RM</span>
            </div>
            <div>
              <b>{history.length}</b>
              <span>sessions</span>
            </div>
            <label>
              <input
                className="target"
                inputMode="decimal"
                placeholder="—"
                value={rec?.target1RM ? toDisplay(rec.target1RM, settings) : ''}
                onChange={(e) => setTarget1RM(id, e.target.value ? fromDisplay(+e.target.value, settings) : undefined)}
              />
              <span>target 1RM</span>
            </label>
          </div>
          {rec?.target1RM && oneRm > 0 && (
            <div className="bar goal" title="Progress to target">
              <span style={{ width: `${Math.min(100, (oneRm / rec.target1RM) * 100)}%` }} />
            </div>
          )}
          {points.length > 0 && (
            <LineChart points={points} format={(v) => `${Math.round(v)}`} label={`Estimated 1RM for ${ex.name} in ${settings.unit}`} />
          )}
        </section>
      )}

      {ex.recordType === 'weight' && (
        <section className="card">
          <h3>1RM calculator</h3>
          <div className="row gap">
            <input className="field" inputMode="decimal" placeholder={`Weight (${settings.unit})`} value={calcW} onChange={(e) => setCalcW(e.target.value)} />
            <input className="field" inputMode="numeric" placeholder="Reps" value={calcR} onChange={(e) => setCalcR(e.target.value)} />
          </div>
          {(calc1Rm > 0 || oneRm > 0) && (
            <table className="pct">
              <thead>
                <tr>
                  <th>Reps</th>
                  <th>Weight ({settings.unit})</th>
                </tr>
              </thead>
              <tbody>
                {PCT_TABLE.map((r) => (
                  <tr key={r}>
                    <td>{r}</td>
                    <td>{Math.round(weightForReps(calc1Rm || toDisplay(oneRm, settings), r))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small">Epley formula: 1RM = weight × (1 + reps ÷ 30).</p>
        </section>
      )}

      <h3 className="section-title">History</h3>
      {history.length === 0 ? (
        <Empty title="Not logged yet" />
      ) : (
        [...history].reverse().map(({ s, l }) => (
          <section key={s.id} className="card">
            <p className="muted small">{new Date(s.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
            <p>
              {l.sets
                .map((x) => (ex.recordType === 'cardio' ? `${x.reps} min` : `${toDisplay(x.weightLbs, settings)}×${x.reps}`))
                .join(', ')}
            </p>
          </section>
        ))
      )}
    </div>
  );
}
