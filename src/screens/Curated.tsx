import { useMemo, useRef, useState } from 'react';
import { useNav, useUI } from '../nav';
import { findExercise, useStore } from '../store';
import { blockFor, daysForWeek, nameKey, parseProgram } from '../lib/programImport';
import { planFacts } from '../lib/plans';
import { ExerciseThumb } from '../components/BodyMap';
import { Header, Toast, type ToastMsg } from '../components/ui';
import { ArtSquare } from './Find';
import type { CuratedProgram, Routine } from '../types';

const HUES = [200, 280, 20, 150, 330, 45];
const hueOf = (p: CuratedProgram) => HUES[p.name.length % HUES.length];

// Discover section: programs this user imported, plus the import tile.
export function CuratedSection() {
  const nav = useNav();
  const { curated, routines, activeRoutineId, customExercises, importProgram } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);

  return (
    <section className="disc-sec">
      <div className="row">
        <h2 className="disc-h grow">Curated</h2>
        <span className="muted small">Your imported programs</span>
      </div>
      <div className="sq-row">
        {curated.map((p) => {
          const running = routines.find((r) => r.guided?.programId === p.id);
          const days = daysForWeek(p, { id: p.id, days: [] } as unknown as Routine, 1);
          return (
            <ArtSquare
              key={p.id}
              hue={hueOf(p)}
              heat={planFacts(days, customExercises).heat}
              days={p.blocks[0].days.length}
              title={p.name}
              meta={`${p.weeks} weeks · ${p.blocks.length > 1 ? `${p.blocks.length} phases` : 'one phase'}`}
              current={!!running && running.id === activeRoutineId}
              onClick={() => nav.push({ kind: 'curated', id: p.id })}
            />
          );
        })}
        <button className="art-sq small create" onClick={() => file.current?.click()}>
          <span className="create-plus">⇪</span>
          <span className="art-sq-txt">
            <b>Import program</b>
            <small>CSV from a spreadsheet</small>
          </span>
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const p = importProgram(parseProgram(await f.text(), f.name), f.name);
            nav.push({ kind: 'curated', id: p.id });
          } catch (err) {
            setToast({ id: Date.now(), text: (err as Error).message || "Couldn't read that file" });
          }
        }}
      />
      <Toast msg={toast} onDone={() => setToast(null)} />
    </section>
  );
}

// Program page: phases, days and every slot's exercise options. Picks are remembered.
export function CuratedDetail({ id }: { id: string }) {
  const nav = useNav();
  const ui = useUI();
  const { curated, routines, customExercises, startGuided, setGuidedChoice, deleteProgram, setActiveRoutine } = useStore();
  const p = curated.find((x) => x.id === id);
  const running = routines.find((r) => r.guided?.programId === id);
  const [blockIdx, setBlockIdx] = useState(0);
  const [picks, setPicks] = useState<Record<string, string>>(running?.guided?.choices ?? {});
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [name, setName] = useState(p?.name ?? '');
  const [confirmDel, setConfirmDel] = useState(false);

  const facts = useMemo(() => (p ? planFacts(daysForWeek(p, { id: p.id, days: [] } as unknown as Routine, 1), customExercises) : null), [p, customExercises]);
  if (!p || !facts) return <Header title="Program not found" />;
  const block = p.blocks[Math.min(blockIdx, p.blocks.length - 1)];
  const exName = (exId?: string) => (exId ? findExercise(exId, customExercises)?.name : undefined);

  const pick = (slotKey: string, exId: string) => {
    setPicks((x) => ({ ...x, [slotKey]: exId }));
    if (running) setGuidedChoice(running.id, slotKey, exId);
  };
  const goProgram = () => {
    ui.set({ tab: 'workout', workoutTab: 'planned', planTab: 'overview', dayId: null });
    nav.reset('workout');
  };

  return (
    <div className="plan-detail pd2">
      <header className="pd2-top">
        <button className="icon-btn" onClick={nav.pop} aria-label="Back">
          ‹
        </button>
      </header>
      <section className="pd2-head" style={{ ['--h' as string]: hueOf(p) }}>
        <div className="grow">
          <span className="eyebrow">Curated · imported</span>
          <input
            className="pd2-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== p.name && useStore.setState((s) => ({ curated: s.curated.map((x) => (x.id === p.id ? { ...x, name: name.trim() } : x)) }))}
            aria-label="Program name"
          />
          <p>
            {p.weeks} weeks · {p.blocks[0].days.length} days a week. Follows the week you're on, and each slot keeps its substitutes so you can pick what fits your gym.
          </p>
        </div>
      </section>

      <div className="pd2-stats">
        <div>
          <b>{p.blocks[0].days.length}</b>
          <span>days / week</span>
        </div>
        <div>
          <b>{p.weeks}</b>
          <span>weeks</span>
        </div>
        <div>
          <b>{p.blocks.length}</b>
          <span>{p.blocks.length === 1 ? 'phase' : 'phases'}</span>
        </div>
        <div>
          <b>{facts.equipment.length}</b>
          <span>equipment</span>
        </div>
      </div>

      {p.blocks.length > 1 && (
        <div className="chips">
          {p.blocks.map((b, i) => (
            <button key={b.label} className={`chip ${i === blockIdx ? 'on' : ''}`} onClick={() => setBlockIdx(i)}>
              {b.label}
            </button>
          ))}
        </div>
      )}

      <div className="pd2-days">
        {block.days.map((d, di) => (
          <section key={di} className="pd2-day open">
            <div className="pd2-day-head">
              <span className="day-num">{di + 1}</span>
              <span className="grow">
                <b>{d.name}</b>
                <small className="muted block">{d.slots.length} exercises</small>
              </span>
            </div>
            <ul className="slot-list">
              {d.slots.map((slot, si) => {
                const key = nameKey(slot.options[0]);
                const ids = slot.options.map((o) => p.ids[nameKey(o)]);
                const chosen = picks[key] && ids.includes(picks[key]) ? picks[key] : ids[0];
                const noteKey = `${di}-${si}`;
                return (
                  <li key={si} className="slot">
                    <div className="row gap">
                      <ExerciseThumb ex={findExercise(chosen, customExercises)} size={40} />
                      <span className="grow">
                        {slot.superset && <span className="ss-tag">Superset {slot.superset}</span>}
                        <b className="block">{exName(chosen) ?? slot.options[0]}</b>
                        <small className="muted">
                          {slot.warmup ? `${slot.warmup} warm-up + ` : ''}
                          {slot.sets} × {slot.reps}
                          {slot.rpe ? ` · RPE ${slot.rpe}` : ''}
                          {slot.rest ? ` · rest ${slot.rest}` : ''}
                        </small>
                      </span>
                      {slot.note && (
                        <button className="icon-btn small-ico" onClick={() => setOpenNote(openNote === noteKey ? null : noteKey)} aria-label="Coaching note">
                          ⓘ
                        </button>
                      )}
                    </div>
                    {ids.length > 1 && (
                      <div className="slot-opts" role="radiogroup" aria-label="Exercise options">
                        {ids.map((exId, oi) => (
                          <button key={exId + oi} role="radio" aria-checked={exId === chosen} className={`chip ${exId === chosen ? 'on' : ''}`} onClick={() => pick(key, exId)}>
                            {exName(exId) ?? slot.options[oi]}
                          </button>
                        ))}
                      </div>
                    )}
                    {openNote === noteKey && <p className="slot-note">{slot.note}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="pd-foot">
        {running ? (
          <button
            className="btn primary big block"
            onClick={() => {
              setActiveRoutine(running.id);
              goProgram();
            }}
          >
            Open in Program
          </button>
        ) : (
          <button
            className="btn primary big block"
            onClick={() => {
              if (startGuided(p.id, picks)) goProgram();
            }}
          >
            Start this program
          </button>
        )}
        <button
          className="btn build big block"
          onClick={() => {
            if (!confirmDel) return setConfirmDel(true);
            deleteProgram(p.id);
            nav.pop();
          }}
        >
          {confirmDel ? 'Tap again to remove it' : 'Remove from Curated'}
        </button>
      </div>
    </div>
  );
}

// Program tab banner line for an imported program: week, phase and a stepper to fix the week.
export function GuidedWeek({ r }: { r: Routine }) {
  const { curated, setGuidedWeek } = useStore();
  const p = r.guided && curated.find((x) => x.id === r.guided!.programId);
  if (!p || !r.guided) return null;
  const week = Math.max(1, Math.floor((Date.now() - r.guided.start) / (7 * 864e5)) + 1);
  const done = week > p.weeks;
  return (
    <div className="guided-week">
      <button className="icon-btn glass" onClick={() => setGuidedWeek(r.id, Math.min(week, p.weeks) - 1)} disabled={week <= 1} aria-label="Previous week">
        ‹
      </button>
      <span>
        {done ? `Finished · ${p.weeks} weeks` : `Week ${week} of ${p.weeks}`} · {blockFor(p, week).label}
      </span>
      <button className="icon-btn glass" onClick={() => setGuidedWeek(r.id, week + 1)} disabled={week >= p.weeks} aria-label="Next week">
        ›
      </button>
    </div>
  );
}
