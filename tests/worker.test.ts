// בדיקות ל-Worker של Cloudflare (worker/index.ts) מול SQLite אמיתי – אותה סכמה כמו ב-D1.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import worker, { type D1Like, type D1Stmt, type Env } from '../worker/index';
import { SCHEMA } from '../worker/schema';

function d1(): D1Like {
  const db = new DatabaseSync(':memory:');
  // בלי להריץ את ה-migrations: ה-Worker אמור ליצור את הטבלאות לבד
  const stmt = (sql: string, params: unknown[] = []): D1Stmt => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async <T,>() => ((db.prepare(sql).get(...(params as never[])) as T) ?? null),
    all: async <T,>() => ({ results: db.prepare(sql).all(...(params as never[])) as T[] }),
    run: async () => db.prepare(sql).run(...(params as never[])),
  });
  return { prepare: (sql) => stmt(sql), batch: async (stmts) => { for (const s of stmts) await s.run(); return []; } };
}

let env: Env;
const call = async (path: string, init: RequestInit & { token?: string } = {}) => {
  const res = await worker.fetch(new Request(`https://hamishkan.example${path}`, { ...init, headers: { 'Content-Type': 'application/json', Origin: 'https://localhost', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) } }), env);
  return { status: res.status, body: (await res.json()) as any, headers: res.headers };
};
const post = (path: string, data: unknown, token?: string) => call(path, { method: 'POST', body: JSON.stringify(data), token });

const score = (o: Record<string, unknown> = {}) => ({ career_id: 'c1234', player_name: 'שחקן', total: 500, peak: 60, impact: 40, country: 50, standing: 45, peak_label: 'שר/ה', ending: 'פרישה', years: 4, laws: 3, pm_week: null, scenario: 'freshman', challenge: null, edited: false, client_version: '1', ...o });

beforeEach(() => {
  env = { DB: d1() };
});

describe('Cloudflare worker API', () => {
  it('health, and CORS for the Android app', async () => {
    const r = await call('/api/health');
    expect(r.body.service).toBe('hamishkan');
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost');
  });

  it('sign up, log in, wrong password, duplicate email', async () => {
    const a = await post('/api/auth/signup', { email: 'a@x.com', password: 'secret1' });
    expect(a.status).toBe(200);
    expect(a.body.token).toMatch(/^[0-9a-f]{64}$/);
    expect((await post('/api/auth/signup', { email: 'A@x.com', password: 'secret2' })).status).toBe(409);
    expect((await post('/api/auth/login', { email: 'a@x.com', password: 'nope' })).status).toBe(401);
    const b = await post('/api/auth/login', { email: 'a@x.com', password: 'secret1' });
    expect(b.status).toBe(200);
    const me = await call('/api/me', { token: b.body.token });
    expect(me.body.user.email).toBe('a@x.com');
    expect((await call('/api/me', { token: 'f'.repeat(64) })).status).toBe(401);
  });

  it('guest → upgrade keeps the same account; names are unique', async () => {
    const g = await post('/api/auth/guest', {});
    const t = g.body.token;
    expect((await call('/api/profile', { method: 'PUT', body: JSON.stringify({ display_name: 'אלפא' }), token: t })).status).toBe(200);
    const other = (await post('/api/auth/guest', {})).body.token;
    expect((await call('/api/profile', { method: 'PUT', body: JSON.stringify({ display_name: 'אלפא' }), token: other })).status).toBe(409);
    expect((await post('/api/auth/upgrade', { email: 'g@x.com', password: 'secret9' }, t)).body.user.anonymous).toBe(false);
    const login = await post('/api/auth/login', { email: 'g@x.com', password: 'secret9' });
    expect(login.body.user.id).toBe(g.body.user.id);
  });

  it('cloud saves: own only, upsert, 12 max', async () => {
    const a = (await post('/api/auth/guest', {})).body.token;
    const b = (await post('/api/auth/guest', {})).body.token;
    const put = (slot: string, token: string, week = 3) => call(`/api/saves/${slot}`, { method: 'PUT', body: JSON.stringify({ name: 'x', player: 'p', week, career_id: 'c1', data: 'AAAA', gz: true, bytes: 3 }), token });
    expect((await put('current', a)).status).toBe(200);
    expect((await put('current', a, 9)).status).toBe(200);
    expect((await call('/api/saves/current', { token: a })).body.week).toBe(9);
    expect((await call('/api/saves', { token: b })).body).toEqual([]);
    expect((await call('/api/saves/current', { token: b })).body).toBeNull();
    for (let i = 0; i < 11; i++) await put(`s${i}`, a);
    expect((await put('too-many', a)).status).toBe(409);
    expect((await call('/api/saves', { token: a })).body).toHaveLength(12);
    await call('/api/saves/s0', { method: 'DELETE', token: a });
    expect((await call('/api/saves', { token: a })).body).toHaveLength(11);
  });

  it('scores: validation, upsert per career, boards, delete account removes everything', async () => {
    const a = (await post('/api/auth/signup', { email: 'p@x.com', password: 'secret1' })).body.token;
    await call('/api/profile', { method: 'PUT', body: JSON.stringify({ display_name: 'פי' }), token: a });
    expect((await post('/api/scores', score({ total: 5000 }), a)).status).toBe(400);
    expect((await post('/api/scores', score(), a)).status).toBe(200);
    expect((await post('/api/scores', score({ total: 700 }), a)).status).toBe(200);
    await post('/api/scores', score({ career_id: 'c9999', total: 900, edited: true }), a);
    await post('/api/scores', score({ career_id: 'c7777', total: 300, challenge: '2026-W44', pm_week: 40 }), a);
    const all = (await call('/api/board?kind=all')).body;
    expect(all.map((r: any) => r.total)).toEqual([700, 300]);
    expect(all[0].display_name).toBe('פי');
    expect((await call('/api/board?kind=challenge&challenge=2026-W44')).body).toHaveLength(1);
    expect((await call('/api/board?kind=fastest')).body[0].pm_week).toBe(40);
    expect((await call('/api/board?kind=mine', { token: a })).body).toHaveLength(3);
    expect((await post('/api/scores', score(), undefined)).status).toBe(401);
    await call('/api/me', { method: 'DELETE', token: a });
    expect((await call('/api/board?kind=all')).body).toEqual([]);
    expect((await call('/api/me', { token: a })).status).toBe(401);
  });

  it('the built-in schema matches the migration files', () => {
    const norm = (x: string) => x.split('\n').filter((l) => !l.trim().startsWith('--')).join(' ').replace(/\s+/g, ' ').trim();
    const files = ['0001_init.sql', '0002_shares.sql'].map((f) => readFileSync(new URL(`../worker/migrations/${f}`, import.meta.url), 'utf8'));
    expect(norm(SCHEMA)).toBe(norm(files.join('\n')));
  });

  it('share links: store a mod and read it back by code', async () => {
    const mod = JSON.stringify({ name: 'כנסת של חבר', parties: [] });
    const r = await post('/api/share', { kind: 'mod', title: 'כנסת של חבר', data: mod });
    expect(r.body.code).toMatch(/^[a-z0-9]{8}$/);
    const back = await call(`/api/share/${r.body.code}`);
    expect(back.body.data).toBe(mod);
    expect(back.body.title).toBe('כנסת של חבר');
    expect((await call('/api/share/zzzzzzzz')).status).toBe(404);
    expect((await post('/api/share', { kind: 'mod', data: 'not json' })).status).toBe(400);
    expect((await post('/api/share', { kind: 'save', data: '{}' })).status).toBe(400);
  });

  it('non-API paths go to the static site', async () => {
    env.ASSETS = { fetch: async () => new Response('<html>site</html>') };
    const res = await worker.fetch(new Request('https://hamishkan.example/'), env);
    expect(await res.text()).toContain('site');
  });
});
