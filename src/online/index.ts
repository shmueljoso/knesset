// מצב החיבור לשרת (חשבון, סנכרון, טבלת שיאים). המשחק עובד מלא גם בלי – זו שכבה נוספת.
// כל פעולה שנכשלת בגלל חוסר אינטרנט נכנסת לתור, ונשלחת כשהחיבור חוזר.
import { create } from 'zustand';
import type { GameState } from '../engine';
import { careerId, careerScore } from '../engine/systems/score';
import { ENDINGS } from '../engine/systems/legacy';
import { decode, encode, fromBase64, looksLikeSave, toBase64 } from '../saves';
import { MockBackend } from './mock';
import { SupabaseBackend } from './supabase';
import { friendlyError, type BoardKind, type BoardRow, type CloudSaveMeta, type OnlineBackend, type OnlineUser, type Profile, type ScoreRow } from './types';

export * from './types';
export { weeklyChallenge, type Challenge } from './challenge';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const PENDING_SCORES = 'hamishkan.pendingScores';
const PENDING_SAVE = 'hamishkan.cloudPending';
const LOCAL_RECORDS = 'hamishkan.myRecords';

const safeLS = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* מלא – לא קריטי */
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export const serverConfigured = () => !!(URL_ && KEY_) || safeLS.get('hamishkan.onlineMock') === '1';

function pickBackend(): OnlineBackend | null {
  if (typeof localStorage !== 'undefined' && safeLS.get('hamishkan.onlineMock') === '1') return new MockBackend();
  if (URL_ && KEY_) return new SupabaseBackend(URL_, KEY_);
  return null;
}

export type OnlineStatus = 'unconfigured' | 'loading' | 'signedOut' | 'signedIn';

interface OnlineStore {
  backend: OnlineBackend | null;
  status: OnlineStatus;
  user: OnlineUser | null;
  profile: Profile | null;
  online: boolean;
  lastSync: number | null;
  syncError: string | null;
  pending: number;
  init: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const useOnline = create<OnlineStore>((set, get) => ({
  backend: null,
  status: 'loading',
  user: null,
  profile: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastSync: Number(safeLS.get('hamishkan.lastSync')) || null,
  syncError: null,
  pending: pendingCount(),
  init: async () => {
    const backend = pickBackend();
    if (!backend) {
      set({ backend: null, status: 'unconfigured' });
      return;
    }
    set({ backend });
    backend.onAuthChange((user) => {
      set({ user, status: user ? 'signedIn' : 'signedOut', profile: user ? get().profile : null });
      if (user) void get().refreshProfile().then(flushPending);
    });
    try {
      const user = await backend.currentUser();
      set({ user, status: user ? 'signedIn' : 'signedOut' });
      if (user) {
        await get().refreshProfile();
        void flushPending();
      }
    } catch {
      set({ status: 'signedOut' });
    }
  },
  refreshProfile: async () => {
    const b = get().backend;
    if (!b || !get().user) return;
    try {
      set({ profile: await b.getProfile() });
    } catch {
      /* אופליין – נשאר מה שהיה */
    }
  },
}));

let started = false;
/** הפעלה פעם אחת באתחול האפליקציה */
export function startOnline() {
  if (started) return;
  started = true;
  void useOnline.getState().init();
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      useOnline.setState({ online: true });
      void flushPending();
    });
    window.addEventListener('offline', () => useOnline.setState({ online: false }));
  }
}

function backend(): OnlineBackend {
  const b = useOnline.getState().backend;
  if (!b) throw new Error('השרת לא מוגדר');
  return b;
}

const signedIn = () => useOnline.getState().status === 'signedIn';

// ---------------- חשבון ----------------

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

export const account = {
  signUp: (email: string, password: string) => wrap(() => backend().signUp(email.trim(), password)),
  signIn: (email: string, password: string) => wrap(() => backend().signIn(email.trim(), password)),
  guest: () => wrap(() => backend().signInGuest()),
  signOut: () => wrap(() => backend().signOut()),
  reset: (email: string) => wrap(() => backend().resetPassword(email.trim())),
  setName: (name: string) =>
    wrap(async () => {
      await backend().setDisplayName(name);
      await useOnline.getState().refreshProfile();
    }),
  deleteAccount: () => wrap(() => backend().deleteAccount()),
};

// ---------------- שמירות בענן ----------------

export const CURRENT_SLOT = 'current';

export async function uploadGame(g: GameState, slot = CURRENT_SLOT, name?: string): Promise<void> {
  const { data, gz } = await encode(JSON.stringify(g));
  await wrap(() =>
    backend().putSave({
      slot,
      name: (name?.trim() || `${g.player.name} · שבוע ${g.week + 1}`).slice(0, 60),
      player: g.player.name.slice(0, 40),
      week: g.week,
      game_date: '',
      career_id: careerId(g),
      bytes: data.byteLength,
      gz,
      updated_at: new Date().toISOString(),
      data: toBase64(data),
    }),
  );
  const now = Date.now();
  safeLS.set('hamishkan.lastSync', String(now));
  if (slot === CURRENT_SLOT) safeLS.del(PENDING_SAVE);
  useOnline.setState({ lastSync: now, syncError: null, pending: pendingCount() });
}

export async function downloadGame(slot: string): Promise<GameState> {
  const s = await wrap(() => backend().getSave(slot));
  if (!s) throw new Error('השמירה לא נמצאה בענן');
  const g = JSON.parse(await decode(fromBase64(s.data), s.gz));
  if (!looksLikeSave(g)) throw new Error('השמירה בענן פגומה');
  return g;
}

export const listCloud = (): Promise<CloudSaveMeta[]> => wrap(() => backend().listSaves());
export const deleteCloud = (slot: string) => wrap(() => backend().deleteSave(slot));

let lastAuto = 0;
/** גיבוי אוטומטי לענן (לכל היותר פעם ב-5 דקות). בלי חיבור – מסומן לשליחה כשיחזור */
export function cloudAutoSync(g: GameState | null, opts: { force?: boolean } = {}) {
  if (!g || !signedIn()) return;
  const now = Date.now();
  if (!opts.force && now - lastAuto < 5 * 60_000) return;
  lastAuto = now;
  uploadGame(g).catch((e) => {
    safeLS.set(PENDING_SAVE, '1');
    useOnline.setState({ syncError: friendlyError(e), pending: pendingCount() });
  });
}

// ---------------- טבלת שיאים ----------------

export function scoreRow(g: GameState): ScoreRow {
  const b = careerScore(g);
  return {
    career_id: careerId(g),
    player_name: g.player.name.slice(0, 40),
    total: b.total,
    peak: b.peak,
    impact: b.impact,
    country: b.country,
    standing: b.standing,
    peak_label: b.peakLabel.slice(0, 40),
    ending: g.gameOver ? (ENDINGS[g.gameOver]?.title ?? g.gameOver).slice(0, 40) : 'קריירה פעילה',
    years: b.years,
    laws: b.laws,
    pm_week: b.pmWeek,
    scenario: g.scenario,
    challenge: typeof g.flags.challenge === 'string' ? g.flags.challenge : null,
    edited: b.edited,
    client_version: import.meta.env.VITE_APP_VERSION ?? '',
  };
}

/** השיאים שלי – נשמרים במכשיר גם בלי חשבון */
export function localRecords(): (ScoreRow & { at: number })[] {
  try {
    return JSON.parse(safeLS.get(LOCAL_RECORDS) ?? '[]');
  } catch {
    return [];
  }
}

export function recordLocal(g: GameState) {
  const row = scoreRow(g);
  const list = localRecords().filter((r) => r.career_id !== row.career_id);
  list.push({ ...row, at: Date.now() });
  list.sort((a, b) => b.total - a.total);
  safeLS.set(LOCAL_RECORDS, JSON.stringify(list.slice(0, 30)));
}

function pendingScores(): ScoreRow[] {
  try {
    return JSON.parse(safeLS.get(PENDING_SCORES) ?? '[]');
  } catch {
    return [];
  }
}

function pendingCount() {
  return pendingScores().length + (safeLS.get(PENDING_SAVE) ? 1 : 0);
}

/** פרסום בטבלה. בלי חיבור – נשמר בתור ויישלח אוטומטית */
export async function publishScore(g: GameState): Promise<'sent' | 'queued'> {
  recordLocal(g);
  const row = scoreRow(g);
  try {
    if (!signedIn()) throw new Error('offline');
    await wrap(() => backend().submitScore(row));
    return 'sent';
  } catch (e) {
    const msg = friendlyError(e);
    if (signedIn() && !/אינטרנט|offline/.test(msg)) throw new Error(msg);
    const q = pendingScores().filter((r) => r.career_id !== row.career_id);
    safeLS.set(PENDING_SCORES, JSON.stringify([...q, row]));
    useOnline.setState({ pending: pendingCount() });
    return 'queued';
  }
}

let flushing = false;
/** שליחת כל מה שחיכה לחיבור */
export async function flushPending() {
  if (flushing || !signedIn()) return;
  flushing = true;
  try {
    const q = pendingScores();
    const left: ScoreRow[] = [];
    for (const row of q) {
      try {
        await backend().submitScore(row);
      } catch {
        left.push(row);
      }
    }
    if (left.length) safeLS.set(PENDING_SCORES, JSON.stringify(left));
    else safeLS.del(PENDING_SCORES);
    if (safeLS.get(PENDING_SAVE)) {
      const raw = safeLS.get('hamishkan.save.v1');
      if (raw) await uploadGame(JSON.parse(raw)).catch(() => undefined);
    }
  } finally {
    flushing = false;
    useOnline.setState({ pending: pendingCount() });
  }
}

export const fetchBoard = (kind: BoardKind, opts: { challenge?: string; limit?: number } = {}): Promise<BoardRow[]> => wrap(() => backend().board(kind, opts));
