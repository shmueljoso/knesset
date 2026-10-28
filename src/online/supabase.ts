// מימוש השרת ב-Supabase (Postgres + אימות). הסכמה וההרשאות: supabase/schema.sql
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { BoardKind, BoardRow, CloudSave, CloudSaveMeta, OnlineBackend, OnlineUser, Profile, ScoreRow } from './types';

const toUser = (u: User | null | undefined): OnlineUser | null => (u ? { id: u.id, email: u.email ?? null, anonymous: !!u.is_anonymous } : null);

const SAVE_COLS = 'slot,name,player,week,game_date,career_id,bytes,gz,updated_at';

export class SupabaseBackend implements OnlineBackend {
  readonly kind = 'supabase' as const;
  private sb: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'hamishkan.auth' },
    });
  }

  private async uid(): Promise<string> {
    const u = await this.currentUser();
    if (!u) throw new Error('לא מחובר/ת');
    return u.id;
  }

  async currentUser() {
    const { data } = await this.sb.auth.getSession();
    return toUser(data.session?.user);
  }

  onAuthChange(cb: (u: OnlineUser | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((_e, session) => cb(toUser(session?.user)));
    return () => data.subscription.unsubscribe();
  }

  async signUp(email: string, password: string) {
    const { data, error } = await this.sb.auth.signUp({ email, password });
    if (error) throw error;
    return data.session ? 'signed-in' : 'confirm-email';
  }

  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async signInGuest() {
    const { error } = await this.sb.auth.signInAnonymously();
    if (error) throw error;
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  async resetPassword(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email);
    if (error) throw error;
  }

  async deleteAccount() {
    const { error } = await this.sb.rpc('delete_my_account');
    if (error) throw error;
    await this.sb.auth.signOut();
  }

  async getProfile(): Promise<Profile | null> {
    const id = await this.uid();
    const { data, error } = await this.sb.from('profiles').select('id,display_name').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async setDisplayName(name: string) {
    const id = await this.uid();
    const { error } = await this.sb.from('profiles').upsert({ id, display_name: name.trim() });
    if (error) throw error;
  }

  async listSaves(): Promise<CloudSaveMeta[]> {
    const { data, error } = await this.sb.from('cloud_saves').select(SAVE_COLS).order('updated_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async putSave(save: CloudSave) {
    const user_id = await this.uid();
    const { error } = await this.sb.from('cloud_saves').upsert({ ...save, user_id, client_version: import.meta.env.VITE_APP_VERSION ?? '' }, { onConflict: 'user_id,slot' });
    if (error) throw error;
  }

  async getSave(slot: string): Promise<CloudSave | null> {
    const { data, error } = await this.sb.from('cloud_saves').select(`${SAVE_COLS},data`).eq('slot', slot).maybeSingle();
    if (error) throw error;
    return data;
  }

  async deleteSave(slot: string) {
    const { error } = await this.sb.from('cloud_saves').delete().eq('slot', slot);
    if (error) throw error;
  }

  async submitScore(row: ScoreRow) {
    const user_id = await this.uid();
    const { error } = await this.sb.from('scores').upsert({ ...row, user_id }, { onConflict: 'user_id,career_id' });
    if (error) throw error;
  }

  async board(kind: BoardKind, opts: { challenge?: string; limit?: number }): Promise<BoardRow[]> {
    let q = this.sb.from('leaderboard').select('*').limit(opts.limit ?? 50);
    if (kind === 'all') q = q.eq('edited', false).order('total', { ascending: false });
    else if (kind === 'challenge') q = q.eq('challenge', opts.challenge ?? '').eq('edited', false).order('total', { ascending: false });
    else if (kind === 'fastest') q = q.not('pm_week', 'is', null).eq('edited', false).order('pm_week', { ascending: true });
    else q = q.eq('user_id', await this.uid()).order('total', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as BoardRow[];
  }
}
