import { create } from 'zustand';
import { createGame, endWeek, type GameState, type NewGameOptions } from './engine';
import type { OpenPanel } from './engine/actions';
import { migrate } from './engine/migrate';
import { repairLeadership } from './engine/systems/figures';
import type { ModFile } from './engine/mods';
import { autoBackup, haptic, safetyBackup } from './platform';

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
  | { kind: 'polls' }
  | { kind: 'tools' }
  | { kind: 'president' }
  | { kind: 'saves' }
  | { kind: OpenPanel };

export interface Toast {
  id: number;
  text: string;
  lines?: string[];
  tone: 'good' | 'bad' | 'neutral';
}

const SAVE_KEY = 'hamishkan.save.v1';

let persistWarned = false;

/** שמירה מיידית של המשחק הנוכחי. מחזיר false אם האחסון לא זמין או מלא */
function persist(g: GameState | null): boolean {
  try {
    if (g) localStorage.setItem(SAVE_KEY, JSON.stringify(g));
    return true;
  } catch {
    // אחסון מלא/חסום: המשחק ממשיך, והגיבויים (קבצים/IndexedDB) ממשיכים להישמר
    return false;
  }
}

export function loadSaved(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as GameState;
    if (g.version !== 1) return null;
    const m = migrate(g);
    repairLeadership(m);
    return m;
  } catch {
    return null;
  }
}

export function clearSaved() {
  safetyBackup(loadSaved(), 'לפני מחיקה');
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
  /** טעינת משחק משמירה/קובץ (המשחק הנוכחי מגובה קודם) */
  loadGame: (g: GameState) => void;
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
    safetyBackup(get().game ?? loadSaved(), 'לפני משחק חדש');
    const game = createGame(o);
    persist(game);
    set({ game, screen: 'game', tab: 'map', panels: [], showReport: false });
  },
  loadGame: (raw) => {
    safetyBackup(get().game ?? loadSaved(), 'לפני טעינה');
    const game = migrate(structuredClone(raw));
    repairLeadership(game);
    persist(game);
    set({ game, screen: 'game', tab: 'map', panels: [], showReport: false, eventResult: null });
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
    if (!persist(next) && !persistWarned) {
      persistWarned = true;
      get().toast('האחסון של הדפדפן מלא – המשחק ממשיך, וגיבויים נשמרים בנפרד. כדאי לייצא שמירה לקובץ.', 'bad');
    }
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
    haptic('tap');
    autoBackup(get().game);
  },
  setShowReport: (showReport) => set({ showReport }),
}));

export const useGame = () => useStore((s) => s.game!);
