import { useMemo, useState, type ReactNode } from 'react';
import { useNav, useUI, type PlanFilter } from '../nav';
import { findExercise, useStore } from '../store';
import { CATALOG, CATEGORIES, type PlanTemplate } from '../data/catalog';
import {
  GOAL_LABEL, LEVEL_LABEL, MESO_WEEKS, findTemplate, generateAdaptive, personalize, phaseOf, planFacts, templateDays, templateToRoutine,
  type BuildPrefs,
} from '../lib/plans';
import { ExerciseThumb, Figure } from '../components/BodyMap';
import { estDaySeconds, fmtEst, uid } from '../lib/calc';
import { MuscleShares } from './Workouts';
import { Sheet } from '../components/Sheet';
import { Empty, Header } from '../components/ui';
import { BODY_PARTS, type Focus, type Location, type Routine, type WorkoutDay } from '../types';

const EMPTY_FILTER: PlanFilter = { q: '', goals: [], levels: [], days: [], location: null, muscles: [], sort: 'recommended' };

// ---------- shared pieces ----------

const ICONS: Record<string, ReactNode> = {
  muscle: <path d="M3 21c0-4 1.5-7 4-8.5L9 9c.6-1.2 1.8-2 3.2-2H15l-.5 3H13l-1 2.5c3.5-.5 7 1.5 8 5V21zM18 1.5l3 3h-2v3.5h-2V4.5h-2z" />,
  flame: <path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 1.5-5 3-7 .5 2 1.5 3 3 3.5C12 7 11 5 12 2z" />,
  pushpull: <path d="M2 10h2V7h2v10H4v-3H2zm18 0h2v4h-2v3h-2V7h2zM7 11h10v2H7zM10 14h4l1 7h-6z" />,
  abs: <path d="M7 3h10l1 6-1 12H7L6 9zm2 4v3h2.5V7zm3.5 0v3H15V7zM9 11.5v3h2.5v-3zm3.5 0v3H15v-3zM9.5 16v3h2v-3zm3 0v3h2v-3z" />,
  body: <path d="M12 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM6 8h12v2h-4v4l2 8h-2l-2-6-2 6H8l2-8v-4H6z" />,
  home: <path d="M12 3l9 8h-3v9h-4v-6h-4v6H6v-9H3z" />,
  three: <text x="12" y="18" textAnchor="middle" fontSize="16" fontWeight="800">3</text>,
  stretch: <path d="M14 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM4 9l7-1 3 2 5-4 1.5 1.5-6 5-1 3 4 6h-2.5L11 16l-3 5H5.5l4-7 .5-3.5L4.5 11z" />,
};

function CategoryIcon({ icon, size = 34 }: { icon: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="cat-svg" aria-hidden>
      {ICONS[icon]}
    </svg>
  );
}

// Stand-in for plan photos: a coloured gradient with the plan's muscle map.
export function PlanArt({ hue, heat, className, children }: { hue: number; heat: number[]; className?: string; children?: ReactNode }) {
  return (
    <div className={`plan-art ${className ?? ''}`} style={{ ['--h' as string]: hue }}>
      <Figure view="front" heat={heat} className="pa-front" fit="meet" />
      <Figure view="back" heat={heat} className="pa-back" fit="meet" />
      {children}
    </div>
  );
}

const factsCache = new Map<string, ReturnType<typeof planFacts>>();
function templateFacts(t: PlanTemplate) {
  let f = factsCache.get(t.id);
  if (!f) {
    f = planFacts(templateDays(t));
    factsCache.set(t.id, f);
  }
  return f;
}

function applyFilter(f: PlanFilter, list: PlanTemplate[]) {
  const q = f.q.trim().toLowerCase();
  const out = list.filter((t) => {
    if (q && !`${t.name} ${t.description}`.toLowerCase().includes(q)) return false;
    if (f.goals.length && !f.goals.includes(t.goal)) return false;
    if (f.levels.length && !f.levels.includes(t.level)) return false;
    if (f.days.length && !f.days.includes(Math.min(6, t.days.length))) return false;
    if (f.location && t.location !== f.location) return false;
    if (f.muscles.length && !f.muscles.some((m) => templateFacts(t).heat[m] >= 0.5)) return false;
    return true;
  });
  const by: Record<PlanFilter['sort'], (a: PlanTemplate, b: PlanTemplate) => number> = {
    recommended: (a, b) => Number(!!b.trending) - Number(!!a.trending),
    shortest: (a, b) => templateFacts(a).avgMinutes - templateFacts(b).avgMinutes,
    fewest: (a, b) => a.days.length - b.days.length,
    az: (a, b) => a.name.localeCompare(b.name),
  };
  return out.sort(by[f.sort]);
}

// ---------- Discover home ----------

const CAT_HUE: Record<string, number> = { 'muscle-gain': 22, 'fat-loss': 2, 'push-pull': 215, abs: 160, 'full-body': 265, 'at-home': 130, '3-day-split': 195, stretch: 300 };

export function FindHome() {
  const nav = useNav();
  const { routines, activeRoutineId } = useStore();
  const [filterOpen, setFilterOpen] = useState(false);
  const [q, setQ] = useState('');
  const featured = CATALOG.filter((t) => t.trending);
  const results = q.trim() ? applyFilter({ ...EMPTY_FILTER, q }, CATALOG) : null;

  return (
    <div className="disc">
      <div className="disc-search">
        <span aria-hidden>⌕</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search programs" aria-label="Search programs" />
        {q && (
          <button className="clear" onClick={() => setQ('')} aria-label="Clear search">
            ✕
          </button>
        )}
        <button className="disc-filter" onClick={() => setFilterOpen(true)} aria-label="Filter programs">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path d="M3 6h18M6 12h12M10 18h4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {results ? (
        <section className="disc-sec">
          <h2 className="disc-h">
            {results.length} {results.length === 1 ? 'program' : 'programs'}
          </h2>
          {results.length ? <ProgramRows list={results} /> : <p className="muted">Nothing matches “{q}”.</p>}
        </section>
      ) : (
        <>
          <CycleCard />

          <section className="disc-sec">
            <h2 className="disc-h">Browse by goal</h2>
            <div className="goal-grid">
              {CATEGORIES.map((c, i) => (
                <button
                  key={c.id}
                  className="goal-tile"
                  style={{ ['--h' as string]: CAT_HUE[c.id] ?? 220, animationDelay: `${i * 25}ms` }}
                  onClick={() => nav.push({ kind: 'plans', category: c.id })}
                >
                  <span className="goal-ico">
                    <CategoryIcon icon={c.icon} size={22} />
                  </span>
                  <span className="grow">
                    <b>{c.name}</b>
                    <small>{CATALOG.filter((t) => t.categories.includes(c.id)).length} programs</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {featured[0] && (
            <section className="disc-sec">
              <h2 className="disc-h">Featured</h2>
              <FeatureCard t={featured[0]} />
            </section>
          )}

          <section className="disc-sec">
            <div className="row">
              <h2 className="disc-h grow">Popular programs</h2>
              <button className="link small" onClick={() => nav.push({ kind: 'plans' })}>
                See all
              </button>
            </div>
            <ProgramRows list={featured.slice(1)} />
          </section>

          <section className="disc-sec">
            <h2 className="disc-h">Your programs</h2>
            <ul className="prog-rows">
              {routines.map((r) => (
                <li key={r.id}>
                  <button className="prog-row" onClick={() => nav.push({ kind: 'plan', routineId: r.id })}>
                    <DaysBadge days={r.days.length} hue={(r.templateId && findTemplate(r.templateId)?.hue) || 222} />
                    <span className="grow">
                      <b>{r.name}</b>
                      <small className="muted block">
                        {LEVEL_LABEL[r.difficulty]} · {GOAL_LABEL[r.focus]}
                        {r.author ? ` · ${r.author}` : ''}
                      </small>
                    </span>
                    {r.id === activeRoutineId && <span className="pill">Current</span>}
                    <span className="chev">›</span>
                  </button>
                </li>
              ))}
              <li>
                <CreatePlanRow />
              </li>
            </ul>
          </section>
        </>
      )}

      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} />
    </div>
  );
}

function DaysBadge({ days, hue }: { days: number; hue: number }) {
  return (
    <span className="days-badge" style={{ ['--h' as string]: hue }} aria-label={`${days} days per week`}>
      <b>{days}</b>
      <small>days</small>
    </span>
  );
}

function ProgramRows({ list }: { list: PlanTemplate[] }) {
  const nav = useNav();
  return (
    <ul className="prog-rows">
      {list.map((t, i) => {
        const f = templateFacts(t);
        return (
          <li key={t.id} style={{ animationDelay: `${i * 30}ms` }}>
            <button className="prog-row" onClick={() => nav.push({ kind: 'plan', templateId: t.id })}>
              <DaysBadge days={t.days.length} hue={t.hue} />
              <span className="grow">
                <b>{t.name}</b>
                <small className="muted block">
                  {LEVEL_LABEL[t.level]} · {GOAL_LABEL[t.goal]} · ~{f.avgMinutes} min
                </small>
              </span>
              <span className="chev">›</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FeatureCard({ t }: { t: PlanTemplate }) {
  const nav = useNav();
  const f = templateFacts(t);
  return (
    <button className="feature" style={{ ['--h' as string]: t.hue }} onClick={() => nav.push({ kind: 'plan', templateId: t.id })}>
      <span className="feature-txt">
        <span className="eyebrow">{t.location === 'home' ? 'At home' : 'Gym'} · {t.days.length} days/week</span>
        <b>{t.name}</b>
        <small>{t.description}</small>
        <span className="feature-meta">
          <span>{LEVEL_LABEL[t.level]}</span>
          <span>{GOAL_LABEL[t.goal]}</span>
          <span>~{f.avgMinutes} min</span>
        </span>
      </span>
      <Figure view="front" heat={f.heat} fit="meet" className="feature-fig" />
    </button>
  );
}

function CreatePlanRow() {
  const nav = useNav();
  const { adoptPlan } = useStore();
  return (
    <button
      className="prog-row create"
      onClick={() => {
        const r: Routine = {
          id: uid(),
          name: 'New Program',
          description: '',
          difficulty: 1,
          focus: 'general',
          daysPerWeek: 3,
          days: [{ id: uid(), name: 'Day 1', items: [] }],
          author: 'You',
        };
        adoptPlan(r);
        nav.push({ kind: 'routine', id: r.id });
      }}
    >
      <span className="days-badge add">＋</span>
      <span className="grow">
        <b>New program</b>
        <small className="muted block">Start from scratch</small>
      </span>
    </button>
  );
}

// ---------- adaptive cycle card ----------

const PHASE_OF_WEEK = ['build', 'build', 'build', 'peak', 'deload'] as const;

function CycleCard() {
  const ui = useUI();
  const { routines, activeRoutineId, setActiveRoutine } = useStore();
  const [open, setOpen] = useState(false);
  const plan = routines.find((r) => r.adaptive && r.id === activeRoutineId) ?? routines.find((r) => r.adaptive);
  const ph = plan ? phaseOf(plan) : null;
  return (
    <section className="cycle">
      <div className="row gap">
        <span className="cycle-ico" aria-hidden>
          ✦
        </span>
        <div className="grow">
          <b>Adaptive program</b>
          <small className="block">{ph ? `Week ${ph.week} of ${ph.weeks} · ${ph.phase}` : `Built from your goal, adjusts itself every week`}</small>
        </div>
        <button
          className="btn primary cycle-btn"
          onClick={() => {
            if (!plan) return setOpen(true);
            setActiveRoutine(plan.id);
            ui.set({ workoutTab: 'planned', planTab: 'overview', dayId: null });
          }}
        >
          {plan ? 'Open' : 'Build'}
        </button>
      </div>
      <div className="cycle-weeks" aria-label={`${MESO_WEEKS}-week cycle`}>
        {PHASE_OF_WEEK.map((p, i) => (
          <span key={i} className={`cw ${p} ${ph && ph.week === i + 1 ? 'now' : ''} ${ph && ph.week > i + 1 ? 'past' : ''}`}>
            <i />
            <small>{p === 'build' ? `Build ${i + 1}` : p === 'peak' ? 'Peak' : 'Deload'}</small>
          </span>
        ))}
      </div>
      <AdaptiveSheet open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { v: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
  label?: string;
}) {
  return (
    <div className="weekday-pick" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          className={`chip ${value.includes(o.v) ? 'on' : ''}`}
          aria-pressed={value.includes(o.v)}
          onClick={() => onChange(value.includes(o.v) ? value.filter((x) => x !== o.v) : [...value, o.v])}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function OneOf<T extends string | number>({ options, value, onChange, label }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="weekday-pick" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={value === o.v} className={`chip ${value === o.v ? 'on' : ''}`} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const GOALS: { v: Focus; label: string }[] = (['bulking', 'cutting', 'strength', 'maintaining', 'general'] as Focus[]).map((v) => ({ v, label: GOAL_LABEL[v] }));
const LEVELS = [1, 2, 3].map((v) => ({ v: v as 1 | 2 | 3, label: LEVEL_LABEL[v] }));
const LOCATIONS: { v: Location; label: string }[] = [
  { v: 'gym', label: 'Gym' },
  { v: 'home', label: 'Home' },
];
const DAY_OPTS = [2, 3, 4, 5, 6].map((v) => ({ v, label: v === 6 ? '6+' : String(v) }));

function AdaptiveSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ui = useUI();
  const { adoptPlan } = useStore();
  const [goal, setGoal] = useState<Focus>('bulking');
  const [days, setDays] = useState(4);
  const [location, setLocation] = useState<Location>('gym');
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  return (
    <Sheet open={open} onClose={onClose} title="Your Adaptive Plan" sub={`${MESO_WEEKS}-week cycle: build → intensify → deload`}>
      <h4 className="sheet-label">Goal</h4>
      <OneOf options={GOALS} value={goal} onChange={setGoal} label="Goal" />
      <h4 className="sheet-label">Days per week</h4>
      <OneOf options={DAY_OPTS} value={days} onChange={setDays} label="Days per week" />
      <h4 className="sheet-label">Where do you train?</h4>
      <OneOf options={LOCATIONS} value={location} onChange={setLocation} label="Location" />
      <h4 className="sheet-label">Experience</h4>
      <OneOf options={LEVELS} value={level} onChange={setLevel} label="Experience" />
      <button
        className="btn primary block big"
        onClick={() => {
          adoptPlan(generateAdaptive({ goal, days, location, level }));
          onClose();
          ui.set({ workoutTab: 'planned', planTab: 'overview', dayId: null });
        }}
      >
        Build my plan
      </button>
    </Sheet>
  );
}

// ---------- filter ----------

function FilterSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: PlanFilter }) {
  const nav = useNav();
  const [f, setF] = useState<PlanFilter>(initial ?? EMPTY_FILTER);
  const set = (p: Partial<PlanFilter>) => setF((x) => ({ ...x, ...p }));
  const count = applyFilter(f, CATALOG).length;
  return (
    <Sheet open={open} onClose={onClose} title="Filter plans">
      <input className="search" placeholder="Search plans" value={f.q} onChange={(e) => set({ q: e.target.value })} aria-label="Search plans" />
      <h4 className="sheet-label">Goal</h4>
      <ChipGroup options={GOALS} value={f.goals} onChange={(goals) => set({ goals })} label="Goal" />
      <h4 className="sheet-label">Level</h4>
      <ChipGroup options={LEVELS.map((l) => ({ v: l.v as number, label: l.label }))} value={f.levels} onChange={(levels) => set({ levels })} label="Level" />
      <h4 className="sheet-label">Days per week</h4>
      <ChipGroup options={[1, ...DAY_OPTS.map((d) => d.v)].map((v) => ({ v, label: v === 6 ? '6+' : String(v) }))} value={f.days} onChange={(days) => set({ days })} label="Days per week" />
      <h4 className="sheet-label">Location</h4>
      <OneOf
        options={[{ v: '' as const, label: 'Any' }, ...LOCATIONS] as { v: Location | ''; label: string }[]}
        value={f.location ?? ''}
        onChange={(v) => set({ location: v || null })}
        label="Location"
      />
      <h4 className="sheet-label">Muscles</h4>
      <ChipGroup options={BODY_PARTS.slice(0, 10).map((b, i) => ({ v: i, label: b }))} value={f.muscles} onChange={(muscles) => set({ muscles })} label="Muscles" />
      <h4 className="sheet-label">Sort by</h4>
      <OneOf
        options={[
          { v: 'recommended' as const, label: 'Recommended' },
          { v: 'shortest' as const, label: 'Shortest sessions' },
          { v: 'fewest' as const, label: 'Fewest days' },
          { v: 'az' as const, label: 'A–Z' },
        ]}
        value={f.sort}
        onChange={(sort) => set({ sort })}
        label="Sort by"
      />
      <div className="row gap">
        <button className="btn big" onClick={() => setF(EMPTY_FILTER)}>
          Reset
        </button>
        <button
          className="btn primary big grow"
          disabled={!count}
          onClick={() => {
            onClose();
            nav.push({ kind: 'plans', filter: f });
          }}
        >
          Show {count} {count === 1 ? 'plan' : 'plans'}
        </button>
      </div>
    </Sheet>
  );
}

// ---------- category / results list ----------

export function PlanList({ category, filter }: { category?: string; filter?: PlanFilter }) {
  const nav = useNav();
  const [filterOpen, setFilterOpen] = useState(false);
  const cat = CATEGORIES.find((c) => c.id === category);
  const list = useMemo(() => {
    const base = cat ? CATALOG.filter((t) => t.categories.includes(cat.id)) : CATALOG;
    return applyFilter(filter ?? EMPTY_FILTER, base);
  }, [cat, filter]);

  return (
    <div className="plan-list">
      <header className="pl-head">
        <button className="icon-btn" onClick={nav.pop} aria-label="Back">
          ‹
        </button>
        <div className="pl-title">
          <h1>{cat?.name ?? (filter ? 'Filter results' : 'All programs')}</h1>
          <p className="muted">{list.length} {list.length === 1 ? 'program' : 'programs'}</p>
        </div>
        {cat ? (
          <span className="pl-icon">
            <CategoryIcon icon={cat.icon} size={110} />
          </span>
        ) : (
          <button className="filter-btn" onClick={() => setFilterOpen(true)}>
            ⚙ FILTER
          </button>
        )}
      </header>
      {list.length === 0 ? (
        <Empty title="No plans match">
          <p className="muted small">Try removing a filter.</p>
        </Empty>
      ) : (
        <ProgramRows list={list} />
      )}
      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} initial={filter} />
    </div>
  );
}

// ---------- plan detail ----------

export function PlanDetail({ templateId, routineId }: { templateId?: string; routineId?: string }) {
  const nav = useNav();
  const ui = useUI();
  const { routines, activeRoutineId, customExercises, setActiveRoutine, adoptPlan, activeSession } = useStore();
  const routine = routineId ? routines.find((r) => r.id === routineId) : undefined;
  const tpl = templateId ? findTemplate(templateId) : routine?.templateId ? findTemplate(routine.templateId) : undefined;
  const days: WorkoutDay[] = useMemo(() => routine?.days ?? (tpl ? templateDays(tpl) : []), [routine, tpl]);
  const [openDays, setOpenDays] = useState<Set<number>>(new Set([0]));
  const [build, setBuild] = useState(false);
  const [shared, setShared] = useState('');

  if (!routine && !tpl) return <Header title="Plan not found" />;
  const name = routine?.name ?? tpl!.name;
  const description = routine?.description || tpl?.description || '';
  const goal = routine?.focus ?? tpl!.goal;
  const level = routine?.difficulty ?? tpl!.level;
  const facts = planFacts(days, customExercises);
  const author = routine?.author ?? 'Veylith Team';
  const isCurrent = routine ? routine.id === activeRoutineId : routines.some((r) => r.templateId === tpl!.id && r.id === activeRoutineId && !r.author?.startsWith('Built'));
  const allOpen = openDays.size === days.length;

  const goPlanned = () => {
    ui.set({ tab: 'workout', workoutTab: 'planned', planTab: 'overview', dayId: null });
    nav.reset('workout');
  };
  const select = () => {
    if (routine) setActiveRoutine(routine.id);
    else {
      const existing = routines.find((r) => r.templateId === tpl!.id && r.author === 'Veylith Team');
      if (existing) setActiveRoutine(existing.id);
      else adoptPlan(templateToRoutine(tpl!));
    }
    goPlanned();
  };
  const share = async () => {
    const text = [name, `${LEVEL_LABEL[level]} • ${GOAL_LABEL[goal]} • ${days.length} days`, '', ...days.map((d, i) => `${d.name} - Day ${i + 1}: ${d.items.map((it) => findExercise(it.exerciseId, customExercises)?.name).join(', ')}`)].join('\n');
    try {
      if (navigator.share) await navigator.share({ title: name, text });
      else {
        await navigator.clipboard.writeText(text);
        setShared('Plan copied to clipboard');
      }
    } catch {
      /* dismissed */
    }
  };

  return (
    <div className="plan-detail pd2">
      <header className="pd2-top">
        <button className="icon-btn" onClick={nav.pop} aria-label="Back">
          ‹
        </button>
        <span className="grow" />
        <button className="icon-btn" onClick={share} aria-label="Share program">
          ⇪
        </button>
      </header>

      <section className="pd2-head" style={{ ['--h' as string]: tpl?.hue ?? 222 }}>
        <div className="grow">
          <span className="eyebrow">by {author}</span>
          <h1>{name}</h1>
          {description && <p>{description}</p>}
        </div>
        <Figure view="front" heat={facts.heat} fit="meet" className="pd2-fig" />
      </section>
      {shared && <p className="muted small center">{shared}</p>}

      <div className="pd2-stats">
        <div>
          <b>{days.length}</b>
          <span>days / week</span>
        </div>
        <div>
          <b>~{facts.avgMinutes}</b>
          <span>min / session</span>
        </div>
        <div>
          <b>{LEVEL_LABEL[level]}</b>
          <span>level</span>
        </div>
        <div>
          <b>{GOAL_LABEL[goal]}</b>
          <span>goal</span>
        </div>
      </div>

      <section className="card">
        <h3>Muscle focus</h3>
        <MuscleShares heat={facts.heat} />
        <div className="equip-chips">
          {(facts.equipment.length ? facts.equipment : ['No equipment']).map((e) => (
            <span key={e} className="chip">
              {e}
            </span>
          ))}
        </div>
      </section>

      <div className="row">
        <h3 className="grow">Schedule</h3>
        <button className="link small" onClick={() => setOpenDays(allOpen ? new Set([0]) : new Set(days.map((_, i) => i)))}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <div className="pd2-days">
        {days.map((d, i) => {
          const isOpen = openDays.has(i);
          return (
            <section key={d.id} className={`pd2-day ${isOpen ? 'open' : ''}`}>
              <button
                className="pd2-day-head"
                aria-expanded={isOpen}
                onClick={() =>
                  setOpenDays((s) => {
                    const n = new Set(s);
                    if (n.has(i)) n.delete(i);
                    else n.add(i);
                    return n;
                  })
                }
              >
                <span className="day-num">{i + 1}</span>
                <span className="grow">
                  <b>{d.name}</b>
                  <small className="muted block">
                    {d.items.length} exercises · ~{fmtEst(estDaySeconds(d))}
                  </small>
                </span>
                <span className={`chev-d ${isOpen ? 'up' : ''}`}>⌄</span>
              </button>
              {isOpen && (
                <ul className="pd2-ex">
                  {d.items.map((it) => {
                    const ex = findExercise(it.exerciseId, customExercises);
                    const reps = it.sets.map((x) => x.reps);
                    return (
                      <li key={it.id}>
                        <button onClick={() => nav.push({ kind: 'exercise', id: it.exerciseId })}>
                          <ExerciseThumb ex={ex} size={44} />
                          <span className="grow">{ex?.name ?? 'Exercise'}</span>
                          <span className="muted small">
                            {it.sets.length} × {reps.every((r) => r === reps[0]) ? reps[0] : reps.join(',')}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="pd-foot">
        <button className="btn primary big block" disabled={isCurrent} onClick={select}>
          {isCurrent ? '✓ Your current program' : 'Use this program'}
        </button>
        {tpl && !routine ? (
          <button className="btn build big block" onClick={() => setBuild(true)}>
            ✦ Build for me
          </button>
        ) : (
          routine && (
            <button className="btn build big block" onClick={() => nav.push({ kind: 'routine', id: routine.id })}>
              Edit program
            </button>
          )
        )}
        {activeSession && <p className="muted small center">Your workout in progress isn't affected.</p>}
      </div>

      {tpl && (
        <BuildSheet
          open={build}
          onClose={() => setBuild(false)}
          tpl={tpl}
          onBuild={(p) => {
            adoptPlan(personalize(tpl, p));
            setBuild(false);
            goPlanned();
          }}
        />
      )}
    </div>
  );
}

function BuildSheet({ open, onClose, tpl, onBuild }: { open: boolean; onClose: () => void; tpl: PlanTemplate; onBuild: (p: BuildPrefs) => void }) {
  const [days, setDays] = useState(tpl.days.length);
  const [location, setLocation] = useState<Location>(tpl.location);
  const [level, setLevel] = useState<1 | 2 | 3>(tpl.level);
  return (
    <Sheet open={open} onClose={onClose} title="Build for me" sub={`We'll fit ${tpl.name} to you`}>
      <h4 className="sheet-label">Days per week</h4>
      <OneOf options={[1, 2, 3, 4, 5, 6].map((v) => ({ v, label: String(v) }))} value={days} onChange={setDays} label="Days per week" />
      <h4 className="sheet-label">Where do you train?</h4>
      <OneOf options={LOCATIONS} value={location} onChange={setLocation} label="Location" />
      <p className="muted small">At home, gym-only exercises are swapped for one that works the same muscle.</p>
      <h4 className="sheet-label">Experience</h4>
      <OneOf options={LEVELS} value={level} onChange={setLevel} label="Experience" />
      <p className="muted small">Beginners get one set fewer per exercise; advanced lifters one more.</p>
      <button className="btn primary block big" onClick={() => onBuild({ days, location, level })}>
        Build my plan
      </button>
    </Sheet>
  );
}
