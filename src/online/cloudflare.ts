// מימוש השרת מול ה-Worker שלנו ב-Cloudflare (worker/index.ts). אימות בטוקן (Bearer) שנשמר במכשיר.
import type { BoardKind, BoardRow, CloudSave, CloudSaveMeta, OnlineBackend, OnlineUser, Profile, ScoreRow } from './types';

const TOKEN_KEY = 'hamishkan.token';

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

export class CloudflareBackend implements OnlineBackend {
  readonly kind = 'cloudflare' as const;
  private listeners = new Set<(u: OnlineUser | null) => void>();
  private user: OnlineUser | null = null;
  private profile: Profile | null = null;

  /** base: כתובת האתר ב-Cloudflare ('' = אותו מקור, כשהאתר עצמו מוגש מה-Worker) */
  constructor(private base: string) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = ls.get(TOKEN_KEY);
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      if (res.status === 401 && token) this.setSession(null, null);
      throw new Error(data?.error ?? `שגיאת שרת (${res.status})`);
    }
    return data;
  }

  private setSession(token: string | null, user: OnlineUser | null) {
    ls.set(TOKEN_KEY, token);
    this.user = user;
    if (!user) this.profile = null;
    this.listeners.forEach((cb) => cb(user));
  }

  /** האם השרת זמין (למשל: האתר פתוח מ-npm run dev בלי Worker – אז לא) */
  async health(): Promise<boolean> {
    try {
      const r = await this.call<{ service?: string }>('/api/health');
      return r.service === 'hamishkan';
    } catch {
      return false;
    }
  }

  async currentUser() {
    if (!ls.get(TOKEN_KEY)) return null;
    if (this.user) return this.user;
    const r = await this.call<{ user: OnlineUser; profile: Profile | null }>('/api/me');
    this.user = r.user;
    this.profile = r.profile;
    return r.user;
  }
  onAuthChange(cb: (u: OnlineUser | null) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  async signUp(email: string, password: string) {
    const r = await this.call<{ token: string; user: OnlineUser }>('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) });
    this.setSession(r.token, r.user);
    return 'signed-in' as const;
  }
  async signIn(email: string, password: string) {
    const r = await this.call<{ token: string; user: OnlineUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    this.setSession(r.token, r.user);
  }
  async signInGuest() {
    const r = await this.call<{ token: string; user: OnlineUser }>('/api/auth/guest', { method: 'POST' });
    this.setSession(r.token, r.user);
  }
  async upgrade(email: string, password: string) {
    const r = await this.call<{ user: OnlineUser }>('/api/auth/upgrade', { method: 'POST', body: JSON.stringify({ email, password }) });
    this.user = r.user;
    this.listeners.forEach((cb) => cb(r.user));
  }
  async signOut() {
    await this.call('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    this.setSession(null, null);
  }
  async deleteAccount() {
    await this.call('/api/me', { method: 'DELETE' });
    this.setSession(null, null);
  }
  async getProfile() {
    if (this.profile) return this.profile;
    const r = await this.call<{ profile: Profile | null }>('/api/me');
    this.profile = r.profile;
    return r.profile;
  }
  async setDisplayName(name: string) {
    this.profile = await this.call<Profile>('/api/profile', { method: 'PUT', body: JSON.stringify({ display_name: name }) });
  }
  listSaves() {
    return this.call<CloudSaveMeta[]>('/api/saves');
  }
  async putSave(save: CloudSave) {
    await this.call(`/api/saves/${encodeURIComponent(save.slot)}`, { method: 'PUT', body: JSON.stringify({ ...save, client_version: import.meta.env.VITE_APP_VERSION ?? '' }) });
  }
  getSave(slot: string) {
    return this.call<CloudSave | null>(`/api/saves/${encodeURIComponent(slot)}`);
  }
  async deleteSave(slot: string) {
    await this.call(`/api/saves/${encodeURIComponent(slot)}`, { method: 'DELETE' });
  }
  async submitScore(row: ScoreRow) {
    await this.call('/api/scores', { method: 'POST', body: JSON.stringify(row) });
  }
  board(kind: BoardKind, opts: { challenge?: string; limit?: number }) {
    const q = new URLSearchParams({ kind, ...(opts.challenge ? { challenge: opts.challenge } : {}), ...(opts.limit ? { limit: String(opts.limit) } : {}) });
    return this.call<BoardRow[]>(`/api/board?${q}`);
  }
}
