import { createContext, useContext } from 'react';
import { create } from 'zustand';
import type { FinishResult } from './store';
import type { Focus, Location } from './types';

export interface PlanFilter {
  q: string;
  goals: Focus[];
  levels: number[];
  days: number[];
  location: Location | null;
  muscles: number[];
  sort: 'recommended' | 'shortest' | 'fewest' | 'az';
}

export type Screen =
  | { kind: 'routine'; id: string }
  | { kind: 'day'; routineId: string; dayId: string }
  | { kind: 'session' }
  | { kind: 'review' }
  | { kind: 'celebrate'; result: FinishResult }
  | { kind: 'exercise'; id: string }
  | { kind: 'picker'; title: string; onPick: (ids: string[]) => void }
  | { kind: 'library'; part?: number }
  | { kind: 'plans'; category?: string; filter?: PlanFilter }
  | { kind: 'plan'; templateId?: string; routineId?: string }
  | { kind: 'bodystats' }
  | { kind: 'settings' }
  | { kind: 'history'; id: string };

export type Tab = 'discover' | 'workout' | 'progress';

export interface Nav {
  push: (s: Screen) => void;
  pop: () => void;
  replace: (s: Screen) => void;
  reset: (tab?: Tab) => void;
}

export const NavContext = createContext<Nav>({ push: () => {}, pop: () => {}, replace: () => {}, reset: () => {} });
export const useNav = () => useContext(NavContext);

// Transient view state that should survive pushing and popping screens.
interface UI {
  tab: Tab;
  workoutTab: 'find' | 'planned' | 'instant';
  planTab: 'overview' | 'details';
  dayId: string | null;
  heroCollapsed: boolean;
  set: (p: Partial<Omit<UI, 'set'>>) => void;
}
export const useUI = create<UI>((set) => ({
  tab: 'discover',
  workoutTab: 'planned',
  planTab: 'overview',
  dayId: null,
  heroCollapsed: false,
  set: (p) => set(p),
}));
