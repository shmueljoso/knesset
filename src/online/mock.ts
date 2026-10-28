// שרת מדומה ב-localStorage: אותו ממשק כמו השרת ב-Cloudflare, בלי אינטרנט.
// משמש לבדיקות אוטומטיות, ואפשר להפעיל אותו ידנית כדי לנסות את הפיצ'רים בלי להקים שרת:
// localStorage.setItem('hamishkan.onlineMock', '1')
import type { BoardKind, BoardRow, CloudSave, CloudSaveMeta, OnlineBackend, OnlineUser, Profile, ScoreRow } from './types';

interface Db {
  users: { id: string; email: string | null; password: string; anonymous: boolean; name?: string }[];
  saves: Record<string, CloudSave[]>;
  scores: (BoardRow & { user_id: string })[];
  session: string | null;
}

const KEY = 'hamishkan.mockServer';

function load(storage: Storage): Db {
  try {
    return JSON.parse(storage.getItem(KEY) ?? '') as Db;
  } catch {
    return { users: [], saves: {}, scores: [], session: null };
  }
}

let n = 0;
const newId = () => `u${Date.now().toString(36)}${(n++).toString(36)}`;

export class MockBackend implements OnlineBackend {
  readonly kind = 'mock' as const;
  private listeners = new Set<(u: OnlineUser | null) => void>();
  constructor(private storage: Storage = localStorage) {}

  private db() {
    return load(this.storage);
  }
  private save(db: Db) {
    this.storage.setItem(KEY, JSON.stringify(db));
  }
  private me(db: Db) {
    const u = db.users.find((x) => x.id === db.session);
    if (!u) throw new Error('לא מחובר/ת');
    return u;
  }
  private emit() {
    void this.currentUser().then((u) => this.listeners.forEach((cb) => cb(u)));
  }

  async currentUser() {
    const db = this.db();
    const u = db.users.find((x) => x.id === db.session);
    return u ? { id: u.id, email: u.email, anonymous: u.anonymous } : null;
  }
  onAuthChange(cb: (u: OnlineUser | null) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  async signUp(email: string, password: string) {
    const db = this.db();
    if (password.length < 6) throw new Error('Password should be at least 6 characters');
    if (db.users.some((u) => u.email === email)) throw new Error('User already registered');
    const id = newId();
    db.users.push({ id, email, password, anonymous: false });
    db.session = id;
    this.save(db);
    this.emit();
    return 'signed-in' as const;
  }
  async signIn(email: string, password: string) {
    const db = this.db();
    const u = db.users.find((x) => x.email === email && x.password === password);
    if (!u) throw new Error('Invalid login credentials');
    db.session = u.id;
    this.save(db);
    this.emit();
  }
  async signInGuest() {
    const db = this.db();
    const id = newId();
    db.users.push({ id, email: null, password: '', anonymous: true });
    db.session = id;
    this.save(db);
    this.emit();
  }
  async signOut() {
    const db = this.db();
    db.session = null;
    this.save(db);
    this.emit();
  }
  async upgrade(email: string, password: string) {
    const db = this.db();
    const me = this.me(db);
    if (db.users.some((u) => u.email === email && u.id !== me.id)) throw new Error('User already registered');
    Object.assign(me, { email, password, anonymous: false });
    this.save(db);
    this.emit();
  }
  async deleteAccount() {
    const db = this.db();
    const me = this.me(db);
    db.users = db.users.filter((u) => u.id !== me.id);
    delete db.saves[me.id];
    db.scores = db.scores.filter((x) => x.user_id !== me.id);
    db.session = null;
    this.save(db);
    this.emit();
  }
  async getProfile(): Promise<Profile | null> {
    const me = this.me(this.db());
    return me.name ? { id: me.id, display_name: me.name } : null;
  }
  async setDisplayName(name: string) {
    const db = this.db();
    const me = this.me(db);
    const t = name.trim();
    if (t.length < 2 || t.length > 24) throw new Error('השם צריך להיות 2–24 תווים');
    if (db.users.some((u) => u.id !== me.id && u.name?.toLowerCase() === t.toLowerCase())) throw new Error('duplicate key profiles_name_unique');
    me.name = t;
    for (const s of db.scores) if (s.user_id === me.id) s.display_name = t;
    this.save(db);
  }
  async listSaves(): Promise<CloudSaveMeta[]> {
    const db = this.db();
    const me = this.me(db);
    return (db.saves[me.id] ?? []).map(({ data: _d, ...m }) => m).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  async putSave(save: CloudSave) {
    const db = this.db();
    const me = this.me(db);
    const list = (db.saves[me.id] ??= []).filter((x) => x.slot !== save.slot);
    if (list.length >= 12) throw new Error('too many cloud saves (max 12)');
    db.saves[me.id] = [...list, { ...save, updated_at: new Date().toISOString() }];
    this.save(db);
  }
  async getSave(slot: string) {
    const db = this.db();
    return (db.saves[this.me(db).id] ?? []).find((x) => x.slot === slot) ?? null;
  }
  async deleteSave(slot: string) {
    const db = this.db();
    const me = this.me(db);
    db.saves[me.id] = (db.saves[me.id] ?? []).filter((x) => x.slot !== slot);
    this.save(db);
  }
  async submitScore(row: ScoreRow) {
    const db = this.db();
    const me = this.me(db);
    db.scores = db.scores.filter((x) => !(x.user_id === me.id && x.career_id === row.career_id));
    db.scores.push({ ...row, user_id: me.id, display_name: me.name ?? 'אנונימי', created_at: new Date().toISOString() });
    this.save(db);
  }
  async board(kind: BoardKind, opts: { challenge?: string; limit?: number }) {
    const db = this.db();
    let rows = db.scores;
    if (kind === 'all') rows = rows.filter((r) => !r.edited).sort((a, b) => b.total - a.total);
    else if (kind === 'challenge') rows = rows.filter((r) => !r.edited && r.challenge === opts.challenge).sort((a, b) => b.total - a.total);
    else if (kind === 'fastest') rows = rows.filter((r) => !r.edited && r.pm_week !== null).sort((a, b) => (a.pm_week ?? 0) - (b.pm_week ?? 0));
    else rows = rows.filter((r) => r.user_id === db.session).sort((a, b) => b.total - a.total);
    return rows.slice(0, opts.limit ?? 50);
  }
}
