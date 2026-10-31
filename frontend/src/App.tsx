import { useEffect, useMemo, useState } from 'react';
import { NavContext, useUI, type Nav, type Screen, type Tab } from './nav';
import { findExercise, useStore } from './store';
import { fmtHMS } from './lib/calc';
import { beep, flashScreen, useWakeLock } from './lib/alarm';
import { Discover } from './screens/Discover';
import { Workouts } from './screens/Workouts';
import { RoutineDetail } from './screens/RoutineDetail';
import { DayEditor } from './screens/DayEditor';
import { SessionScreen } from './screens/Session';
import { Celebrate, HistoryDetail, Review } from './screens/Summary';
import { Progress } from './screens/Progress';
import { BodyStats } from './screens/BodyStats';
import { ExerciseDetail, ExerciseLibrary } from './screens/Exercises';
import { SettingsScreen } from './screens/Settings';
import { PlanDetail, PlanList } from './screens/Find';
import { CompareScreen, PhotosScreen } from './screens/Photos';
import { CuratedDetail } from './screens/Curated';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'discover', label: 'Home', icon: '⌂' },
  { id: 'workout', label: 'Workout', icon: '☑' },
  { id: 'progress', label: 'Progress', icon: '▦' },
];

// Screens that take over the whole viewport (no tab bar, no workout bar).
const FULL = new Set<Screen['kind']>(['session', 'review', 'celebrate', 'picker', 'plan', 'compare', 'curated']);

function renderScreen(s: Screen) {
  switch (s.kind) {
    case 'routine':
      return <RoutineDetail id={s.id} />;
    case 'day':
      return <DayEditor routineId={s.routineId} dayId={s.dayId} />;
    case 'session':
      return <SessionScreen />;
    case 'review':
      return <Review />;
    case 'celebrate':
      return <Celebrate result={s.result} />;
    case 'exercise':
      return <ExerciseDetail id={s.id} />;
    case 'picker':
      return <ExerciseLibrary picker={s} />;
    case 'library':
      return <ExerciseLibrary initialPart={s.part ?? null} />;
    case 'bodystats':
      return <BodyStats />;
    case 'settings':
      return <SettingsScreen />;
    case 'history':
      return <HistoryDetail id={s.id} />;
    case 'plans':
      return <PlanList category={s.category} filter={s.filter} />;
    case 'plan':
      return <PlanDetail templateId={s.templateId} routineId={s.routineId} />;
    case 'photos':
      return <PhotosScreen />;
    case 'compare':
      return <CompareScreen a={s.a} b={s.b} />;
    case 'curated':
      return <CuratedDetail id={s.id} />;
  }
}

export default function App() {
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated());
  const { tab, set: setUI } = useUI();
  const [stack, setStack] = useState<Screen[]>([]);
  const activeSession = useStore((s) => s.activeSession);
  const customExercises = useStore((s) => s.customExercises);
  const [, tick] = useState(0);

  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    if (useStore.persist.hasHydrated()) setHydrated(true);
    return () => {
      unsub();
    };
  }, []);
  useEffect(() => {
    if (!activeSession) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [activeSession]);
  // Imported programs move to the next phase as the weeks go by.
  useEffect(() => {
    if (hydrated) useStore.getState().refreshGuided();
  }, [hydrated, tab]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [stack.length, tab]);

  useWakeLock(!!activeSession && !activeSession.end);

  // Rest timer alarm fires wherever the user is in the app.
  const rest = activeSession?.rest;
  useEffect(() => {
    if (!rest || rest.pausedLeft !== undefined) return;
    const t = setTimeout(() => {
      beep();
      if (useStore.getState().settings.flash !== false) flashScreen();
      useStore.getState().updateActive((x) => ({ ...x, rest: null }));
    }, Math.max(0, rest.endsAt - Date.now()));
    return () => clearTimeout(t);
  }, [rest]);

  const nav: Nav = useMemo(
    () => ({
      push: (s) => setStack((st) => [...st, s]),
      pop: () => setStack((st) => st.slice(0, -1)),
      replace: (s) => setStack((st) => [...st.slice(0, -1), s]),
      reset: (t) => {
        setStack([]);
        if (t) useUI.getState().set({ tab: t });
      },
    }),
    [],
  );

  if (!hydrated) return <div className="splash">Veylith</div>;

  const top = stack.at(-1);
  const full = top && FULL.has(top.kind);
  const cur = activeSession?.logs[activeSession.current ?? 0];
  const curName = cur ? findExercise(cur.exerciseId, customExercises)?.name : undefined;

  return (
    <NavContext.Provider value={nav}>
      <main className={`app ${top ? 'stacked' : ''} ${full ? 'full' : ''} ${activeSession && !full ? 'with-bar' : ''}`}>
        {top ? (
          <div key={stack.length} className="view-in">
            {renderScreen(top)}
          </div>
        ) : (
          <div key={tab} className="view-in">
            {tab === 'discover' && <Discover />}
            {tab === 'workout' && <Workouts />}
            {tab === 'progress' && <Progress />}
          </div>
        )}
      </main>

      {activeSession && !full && (
        <div className={`active-bar ${top ? 'low' : ''}`}>
          <button className="grow text-left" onClick={() => nav.push({ kind: activeSession.end ? 'review' : 'session' })}>
            <span className="ab-time">{activeSession.rest ? `Rest ${fmtHMS(activeSession.rest.pausedLeft !== undefined ? activeSession.rest.pausedLeft * 1000 : activeSession.rest.endsAt - Date.now()).slice(3)}` : fmtHMS(Date.now() - activeSession.start)}</span>
            <b className="ab-name">{activeSession.end ? 'Ready to save' : curName ?? activeSession.name}</b>
          </button>
          <button
            className="btn primary pill-btn"
            onClick={() => {
              useStore.getState().endSession();
              nav.push({ kind: 'review' });
            }}
          >
            End Workout
          </button>
        </div>
      )}

      {!top && (
        <nav className="tabbar">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setUI({ tab: t.id })}>
              <span className="tab-icon">
                {t.icon}
                {t.id === 'workout' && activeSession && !activeSession.end && <i className="live-dot" aria-label="Workout running" />}
              </span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
    </NavContext.Provider>
  );
}
