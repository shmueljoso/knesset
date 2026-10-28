// הממשק בין המשחק לשרת. יש שני מימושים: Cloudflare (ה-Worker שלנו, worker/index.ts) ו-Mock (מקומי, לבדיקות ולהדגמה).

export interface OnlineUser {
  id: string;
  email: string | null;
  anonymous: boolean;
}

export interface Profile {
  id: string;
  display_name: string;
}

export interface CloudSaveMeta {
  slot: string;
  name: string;
  player: string;
  week: number;
  game_date: string;
  career_id: string;
  bytes: number;
  gz: boolean;
  updated_at: string;
}

export interface CloudSave extends CloudSaveMeta {
  data: string; // base64
}

export interface ScoreRow {
  career_id: string;
  player_name: string;
  total: number;
  peak: number;
  impact: number;
  country: number;
  standing: number;
  peak_label: string;
  ending: string;
  years: number;
  laws: number;
  pm_week: number | null;
  scenario: string;
  challenge: string | null;
  edited: boolean;
  client_version: string;
}

export interface BoardRow extends ScoreRow {
  user_id: string;
  display_name: string;
  created_at: string;
}

export type BoardKind = 'all' | 'challenge' | 'fastest' | 'mine';

export interface OnlineBackend {
  readonly kind: 'cloudflare' | 'mock';
  currentUser(): Promise<OnlineUser | null>;
  onAuthChange(cb: (u: OnlineUser | null) => void): () => void;
  signUp(email: string, password: string): Promise<'signed-in' | 'confirm-email'>;
  signIn(email: string, password: string): Promise<void>;
  signInGuest(): Promise<void>;
  signOut(): Promise<void>;
  /** אורח/ת → חשבון קבוע (אימייל וסיסמה), בלי לאבד שמירות ושיאים */
  upgrade(email: string, password: string): Promise<void>;
  deleteAccount(): Promise<void>;
  getProfile(): Promise<Profile | null>;
  setDisplayName(name: string): Promise<void>;
  listSaves(): Promise<CloudSaveMeta[]>;
  putSave(save: CloudSave): Promise<void>;
  getSave(slot: string): Promise<CloudSave | null>;
  deleteSave(slot: string): Promise<void>;
  submitScore(row: ScoreRow): Promise<void>;
  board(kind: BoardKind, opts: { challenge?: string; limit?: number }): Promise<BoardRow[]>;
}

/** הודעת שגיאה ידידותית בעברית */
export function friendlyError(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e);
  if (/Invalid login credentials/i.test(m)) return 'אימייל או סיסמה שגויים';
  if (/already registered|already exists/i.test(m)) return 'כבר יש חשבון עם האימייל הזה – נסה/י להתחבר';
  if (/Password should be|weak/i.test(m)) return 'הסיסמה קצרה מדי (לפחות 6 תווים)';
  if (/profiles_name_unique|duplicate key/i.test(m)) return 'השם הזה כבר תפוס';
  if (/too many cloud saves/i.test(m)) return 'הגעת למקסימום 12 שמירות בענן – מחק/י אחת';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'אין חיבור לאינטרנט';
  return m.length > 120 ? m.slice(0, 120) + '…' : m;
}
