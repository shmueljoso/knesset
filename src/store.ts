import { create } from 'zustand';
import { createGame, endWeek, type GameState, type NewGameOptions } from './engine';
import type { OpenPanel } from './engine/actions';
import { migrate } from './engine/migrate';
import type { ModFile } from './engine/mods';

export type Tab = 'map' | 'dashboard' | 'people' | 'laws' | 'news';
export type Panel =
  | { kind: 'location'; id: string }
  | { kind: 'npc'; id: string }
  | { kind: 'bill'; id: string }
  | { kind: 'vote'; id: string }
  | { kind: 'settings' }
  | { kind: 'help' }
  | { kind: 'guide' }
  | { kind: 'negotiation' }
  | { kind: OpenPanel };

export interface Toast {
  id: number;
  text: string;
  lines?: string[];
  tone: 'good' | 'bad' | 'neutral';
}

const SAVE_KEY = 'hamishkan.save.v1';

function persist(g: GameState | null) {
  try {
    if (g) localStorage.setItem(SAVE_KEY, JSON.stringify(g));
  } catch {
    /* אחסון לא זמין – המשחק ממשיך בלי שמירה */
  }
}

export function loadSaved(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as GameState;
    return g.version === 1 ? migrate(g) : null;
  } catch {
    return null;
  }
}

export function clearSaved() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

interface Store {
  screen: 'title' | 'create' | 'game' | 'editor';
  pendingMod: ModFile | null;
  setPendingMod: (m: ModFile | null) => void;
  /** תוצאת האירוע האחרון – נשארת על המסך גם כשהתור התרוקן */
  eventResult: { lines: string[]; success: boolean; title: string } | null;
  setEventResult: (r: { lines: string[]; success: boolean; title: string } | null) => void;
  game: GameState | null;
  tab: Tab;
  panels: Panel[];
  toasts: Toast[];
  showReport: boolean;
  setScreen: (s: Store['screen']) => void;
  setTab: (t: Tab) => void;
  open: (p: Panel) => void;
  close: () => void;
  closeAll: () => void;
  newGame: (o: NewGameOptions) => void;
  continueGame: () => boolean;
  /** מריץ פונקציה על עותק של המצב, שומר ומחזיר את התוצאה */
  act: <T>(fn: (s: GameState) => T) => T;
  toast: (text: string, tone?: Toast['tone'], lines?: string[]) => void;
  dismissToast: (id: number) => void;
  nextWeek: () => void;
  setShowReport: (v: boolean) => void;
}

let toastId = 0;

export const useStore = create<Store>((set, get) => ({
  screen: 'title',
  pendingMod: null,
  setPendingMod: (pendingMod) => set({ pendingMod }),
  eventResult: null,
  setEventResult: (eventResult) => set({ eventResult }),
  game: null,
  tab: 'map',
  panels: [],
  toasts: [],
  showReport: false,
  setScreen: (screen) => set({ screen }),
  setTab: (tab) => set({ tab, panels: [] }),
  open: (p) => set((st) => ({ panels: [...st.panels, p] })),
  close: () => set((st) => ({ panels: st.panels.slice(0, -1) })),
  closeAll: () => set({ panels: [] }),
  newGame: (o) => {
    const game = createGame(o);
    persist(game);
    set({ game, screen: 'game', tab: 'map', panels: [], showReport: false });
  },
  continueGame: () => {
    const game = loadSaved();
    if (!game) return false;
    set({ game, screen: 'game', tab: 'map', panels: [] });
    return true;
  },
  act: (fn) => {
    const g = get().game;
    if (!g) throw new Error('no game');
    const next = structuredClone(g);
    const res = fn(next);
    persist(next);
    set({ game: next });
    return res;
  },
  toast: (text, tone = 'neutral', lines) => {
    const id = ++toastId;
    set((st) => ({ toasts: [...st.toasts.slice(-2), { id, text, tone, lines }] }));
    setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
  nextWeek: () => {
    get().act((s) => endWeek(s));
    set({ showReport: true, panels: [] });
  },
  setShowReport: (showReport) => set({ showReport }),
}));

export const useGame = () => useStore((s) => s.game!);
