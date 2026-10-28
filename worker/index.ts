// השרת של המשכן ב-Cloudflare: Worker אחד שמגיש את האתר (dist/) ואת ה-API (/api/*),
// ומסד נתונים D1. בלי שירותים חיצוניים.
// הרצה מקומית: npm run cf:dev · העלאה: npm run cf:deploy (ראו docs/CLOUDFLARE.md)
import { SCHEMA } from './schema';

/** הממשק המינימלי של D1 שאנחנו צריכים (כך גם אפשר לבדוק עם SQLite רגיל) */
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface D1Like {
  prepare(sql: string): D1Stmt;
  batch(stmts: D1Stmt[]): Promise<unknown>;
}

export interface Env {
  DB: D1Like;
  ASSETS?: { fetch(req: Request): Promise<Response> };
  /** מקורות נוספים שמותר להם לפנות ל-API (מופרד בפסיקים), מלבד האפליקציה עצמה */
  ALLOWED_ORIGINS?: string;
}

const SESSION_DAYS = 180;
const MAX_SAVES = 12;
const MAX_SAVE_CHARS = 4_000_000;
const MAX_SHARE_CHARS = 600_000;

/** הטבלאות נוצרות לבד בבקשה הראשונה לכל מסד נתונים (פעם אחת לכל מופע של ה-Worker) */
const ready = new WeakMap<D1Like, Promise<unknown>>();
function ensureSchema(db: D1Like) {
  let p = ready.get(db);
  if (!p) {
    const stmts = SCHEMA.split(';').map((x) => x.trim()).filter(Boolean);
    p = db.batch(stmts.map((x) => db.prepare(x)));
    p.catch(() => ready.delete(db));
    ready.set(db, p);
  }
  return p;
}

// ---------------- עזרים ----------------

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

/** סיסמה: PBKDF2-SHA256 עם salt אקראי (100 אלף סבבים – המקסימום ש-Workers מאפשר) */
async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100_000 }, key, 256);
  return hex(bits);
}

function sameHash(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = ['https://localhost', 'http://localhost', 'capacitor://localhost', ...(env.ALLOWED_ORIGINS ?? '').split(',').map((x) => x.trim()).filter(Boolean)];
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : {};
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'גוף הבקשה אינו JSON');
  }
}

const str = (v: unknown, max: number, field: string, min = 0): string => {
  if (typeof v !== 'string' || v.length < min || v.length > max) throw new HttpError(400, `שדה לא תקין: ${field}`);
  return v;
};
const int = (v: unknown, lo: number, hi: number, field: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new HttpError(400, `שדה לא תקין: ${field}`);
  return Math.round(v);
};

// ---------------- משתמשים וסשנים ----------------

interface UserRow {
  id: string;
  email: string | null;
  anonymous: number;
}

async function newSession(env: Env, userId: string) {
  const token = randomHex(32);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), userId, Date.now() + SESSION_DAYS * 864e5).run();
  return token;
}

async function currentUser(req: Request, env: Env): Promise<UserRow> {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get('Authorization') ?? '');
  if (!m) throw new HttpError(401, 'לא מחובר/ת');
  const row = await env.DB.prepare('SELECT u.id, u.email, u.anonymous, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').bind(await sha256(m[1])).first<UserRow & { expires_at: number }>();
  if (!row || row.expires_at < Date.now()) throw new HttpError(401, 'החיבור פג – התחבר/י מחדש');
  return row;
}

const userJson = (u: UserRow) => ({ id: u.id, email: u.email, anonymous: !!u.anonymous });

const validEmail = (e: unknown) => typeof e === 'string' && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function signup(req: Request, env: Env) {
  const b = await body<{ email?: string; password?: string }>(req);
  if (!validEmail(b.email)) throw new HttpError(400, 'אימייל לא תקין');
  const password = str(b.password, 200, 'password', 6);
  const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(b.email).first();
  if (exists) throw new HttpError(409, 'User already registered');
  const id = crypto.randomUUID();
  const salt = randomHex(16);
  await env.DB.prepare('INSERT INTO users (id, email, pass_hash, salt, anonymous, created_at) VALUES (?, ?, ?, ?, 0, ?)').bind(id, b.email, await hashPassword(password, salt), salt, Date.now()).run();
  return json({ token: await newSession(env, id), user: { id, email: b.email, anonymous: false } });
}

async function login(req: Request, env: Env) {
  const b = await body<{ email?: string; password?: string }>(req);
  const row = await env.DB.prepare('SELECT id, email, anonymous, pass_hash, salt FROM users WHERE email = ?').bind(b.email ?? '').first<UserRow & { pass_hash: string; salt: string }>();
  // אותה שגיאה לאימייל שלא קיים ולסיסמה שגויה
  if (!row || !row.pass_hash || !sameHash(await hashPassword(String(b.password ?? ''), row.salt), row.pass_hash)) throw new HttpError(401, 'Invalid login credentials');
  return json({ token: await newSession(env, row.id), user: userJson(row) });
}

async function guest(env: Env) {
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO users (id, email, pass_hash, salt, anonymous, created_at) VALUES (?, NULL, NULL, NULL, 1, ?)').bind(id, Date.now()).run();
  return json({ token: await newSession(env, id), user: { id, email: null, anonymous: true } });
}

/** אורח/ת שרוצה לשמור את החשבון: מוסיפים אימייל וסיסמה, והכול נשאר */
async function upgrade(req: Request, env: Env, u: UserRow) {
  const b = await body<{ email?: string; password?: string }>(req);
  if (!validEmail(b.email)) throw new HttpError(400, 'אימייל לא תקין');
  const password = str(b.password, 200, 'password', 6);
  if (await env.DB.prepare('SELECT id FROM users WHERE email = ? AND id <> ?').bind(b.email, u.id).first()) throw new HttpError(409, 'User already registered');
  const salt = randomHex(16);
  await env.DB.prepare('UPDATE users SET email = ?, pass_hash = ?, salt = ?, anonymous = 0 WHERE id = ?').bind(b.email, await hashPassword(password, salt), salt, u.id).run();
  return json({ user: { id: u.id, email: b.email, anonymous: false } });
}

async function deleteAccount(env: Env, u: UserRow) {
  await env.DB.batch(['sessions', 'profiles', 'cloud_saves', 'scores'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(u.id)).concat([env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u.id)]));
  return json({ ok: true });
}

// ---------------- פרופיל, שמירות, שיאים ----------------

async function setName(req: Request, env: Env, u: UserRow) {
  const b = await body<{ display_name?: string }>(req);
  const name = str(typeof b.display_name === 'string' ? b.display_name.trim() : b.display_name, 24, 'display_name', 2);
  const taken = await env.DB.prepare('SELECT user_id FROM profiles WHERE display_name = ? AND user_id <> ?').bind(name, u.id).first();
  if (taken) throw new HttpError(409, 'duplicate key profiles_name_unique');
  await env.DB.prepare('INSERT INTO profiles (user_id, display_name) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name').bind(u.id, name).run();
  return json({ id: u.id, display_name: name });
}

const SAVE_COLS = 'slot, name, player, week, career_id, bytes, gz, updated_at';

async function putSave(req: Request, env: Env, u: UserRow, slot: string) {
  str(slot, 40, 'slot', 1);
  const b = await body<Record<string, unknown>>(req);
  const data = str(b.data, MAX_SAVE_CHARS, 'data', 1);
  const existing = await env.DB.prepare('SELECT COUNT(*) AS n FROM cloud_saves WHERE user_id = ? AND slot <> ?').bind(u.id, slot).first<{ n: number }>();
  if ((existing?.n ?? 0) >= MAX_SAVES) throw new HttpError(409, 'too many cloud saves (max 12)');
  await env.DB.prepare(
    `INSERT INTO cloud_saves (user_id, slot, name, player, week, career_id, data, gz, bytes, client_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, slot) DO UPDATE SET name = excluded.name, player = excluded.player, week = excluded.week, career_id = excluded.career_id, data = excluded.data, gz = excluded.gz, bytes = excluded.bytes, client_version = excluded.client_version, updated_at = excluded.updated_at`,
  )
    .bind(u.id, slot, str(b.name, 60, 'name'), str(b.player, 40, 'player'), int(b.week, 0, 1e6, 'week'), str(b.career_id ?? '', 60, 'career_id'), data, b.gz === false ? 0 : 1, int(b.bytes ?? 0, 0, 1e8, 'bytes'), str(b.client_version ?? '', 20, 'client_version'), new Date().toISOString())
    .run();
  return json({ ok: true });
}

const saveOut = (r: Record<string, unknown>) => ({ ...r, gz: !!r.gz });

const SCORE_FIELDS = ['career_id', 'player_name', 'total', 'peak', 'impact', 'country', 'standing', 'peak_label', 'ending', 'years', 'laws', 'pm_week', 'scenario', 'challenge', 'edited', 'client_version'] as const;

async function submitScore(req: Request, env: Env, u: UserRow) {
  const b = await body<Record<string, unknown>>(req);
  const v = [
    str(b.career_id, 60, 'career_id', 4),
    str(b.player_name, 40, 'player_name', 1),
    int(b.total, 0, 1000, 'total'),
    int(b.peak, 0, 100, 'peak'),
    int(b.impact, 0, 100, 'impact'),
    int(b.country, 0, 100, 'country'),
    int(b.standing, 0, 100, 'standing'),
    str(b.peak_label ?? '', 40, 'peak_label'),
    str(b.ending ?? '', 40, 'ending'),
    typeof b.years === 'number' && b.years >= 0 && b.years < 500 ? b.years : 0,
    int(b.laws ?? 0, 0, 1000, 'laws'),
    b.pm_week === null || b.pm_week === undefined ? null : int(b.pm_week, 0, 1e6, 'pm_week'),
    str(b.scenario ?? '', 40, 'scenario'),
    b.challenge === null || b.challenge === undefined ? null : str(b.challenge, 40, 'challenge'),
    b.edited ? 1 : 0,
    str(b.client_version ?? '', 20, 'client_version'),
  ];
  await env.DB.prepare(
    `INSERT INTO scores (user_id, ${SCORE_FIELDS.join(', ')}, created_at) VALUES (?, ${SCORE_FIELDS.map(() => '?').join(', ')}, ?)
     ON CONFLICT(user_id, career_id) DO UPDATE SET ${SCORE_FIELDS.filter((f) => f !== 'career_id').map((f) => `${f} = excluded.${f}`).join(', ')}, created_at = excluded.created_at`,
  )
    .bind(u.id, ...v, new Date().toISOString())
    .run();
  return json({ ok: true });
}

async function board(req: Request, env: Env) {
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind') ?? 'all';
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const base = `SELECT s.*, COALESCE(p.display_name, 'אנונימי') AS display_name FROM scores s LEFT JOIN profiles p ON p.user_id = s.user_id`;
  let stmt: D1Stmt;
  if (kind === 'challenge') stmt = env.DB.prepare(`${base} WHERE s.edited = 0 AND s.challenge = ? ORDER BY s.total DESC LIMIT ?`).bind(url.searchParams.get('challenge') ?? '', limit);
  else if (kind === 'fastest') stmt = env.DB.prepare(`${base} WHERE s.edited = 0 AND s.pm_week IS NOT NULL ORDER BY s.pm_week ASC LIMIT ?`).bind(limit);
  else if (kind === 'mine') stmt = env.DB.prepare(`${base} WHERE s.user_id = ? ORDER BY s.total DESC LIMIT ?`).bind((await currentUser(req, env)).id, limit);
  else stmt = env.DB.prepare(`${base} WHERE s.edited = 0 ORDER BY s.total DESC LIMIT ?`).bind(limit);
  const { results } = await stmt.all<Record<string, unknown>>();
  return json(results.map((r) => ({ ...r, edited: !!r.edited })));
}

// ---------------- קישורי שיתוף ----------------

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

/** שיתוף כנסת מהעורך: שומרים את הקובץ ומחזירים קוד קצר. לא צריך חשבון (אבל אם יש – נרשם) */
async function share(req: Request, env: Env) {
  const b = await body<Record<string, unknown>>(req);
  const kind = str(b.kind, 20, 'kind', 1);
  if (kind !== 'mod') throw new HttpError(400, 'bad kind');
  const data = str(b.data, MAX_SHARE_CHARS, 'data', 2);
  try {
    JSON.parse(data);
  } catch {
    throw new HttpError(400, 'bad data');
  }
  const user = await currentUser(req, env).catch(() => null);
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const code = [...bytes].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
  await env.DB.prepare('INSERT INTO shares (code, kind, title, data, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(code, kind, str(b.title ?? '', 80, 'title'), data, user?.id ?? null, Date.now())
    .run();
  return json({ code });
}

// ---------------- ניתוב ----------------

async function api(req: Request, env: Env, path: string): Promise<Response> {
  const m = req.method;
  if (path === '/api/health') return json({ ok: true, service: 'hamishkan' });
  if (path === '/api/auth/signup' && m === 'POST') return signup(req, env);
  if (path === '/api/auth/login' && m === 'POST') return login(req, env);
  if (path === '/api/auth/guest' && m === 'POST') return guest(env);
  if (path === '/api/board' && m === 'GET') return board(req, env);
  const shared = /^\/api\/share\/([A-Za-z0-9]{4,16})$/.exec(path);
  if (shared && m === 'GET') {
    const r = await env.DB.prepare('SELECT code, kind, title, data, created_at FROM shares WHERE code = ?').bind(shared[1]).first();
    if (!r) throw new HttpError(404, 'not found');
    return json(r);
  }
  if (path === '/api/share' && m === 'POST') return share(req, env);

  const u = await currentUser(req, env);
  if (path === '/api/auth/logout' && m === 'POST') {
    const token = (req.headers.get('Authorization') ?? '').slice(7);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true });
  }
  if (path === '/api/auth/upgrade' && m === 'POST') return upgrade(req, env, u);
  if (path === '/api/me' && m === 'GET') {
    const p = await env.DB.prepare('SELECT display_name FROM profiles WHERE user_id = ?').bind(u.id).first<{ display_name: string }>();
    return json({ user: userJson(u), profile: p ? { id: u.id, display_name: p.display_name } : null });
  }
  if (path === '/api/me' && m === 'DELETE') return deleteAccount(env, u);
  if (path === '/api/profile' && m === 'PUT') return setName(req, env, u);
  if (path === '/api/saves' && m === 'GET') {
    const { results } = await env.DB.prepare(`SELECT ${SAVE_COLS} FROM cloud_saves WHERE user_id = ? ORDER BY updated_at DESC`).bind(u.id).all<Record<string, unknown>>();
    return json(results.map(saveOut));
  }
  const save = /^\/api\/saves\/([^/]+)$/.exec(path);
  if (save) {
    const slot = decodeURIComponent(save[1]);
    if (m === 'PUT') return putSave(req, env, u, slot);
    if (m === 'GET') {
      const r = await env.DB.prepare(`SELECT ${SAVE_COLS}, data FROM cloud_saves WHERE user_id = ? AND slot = ?`).bind(u.id, slot).first<Record<string, unknown>>();
      return r ? json(saveOut(r)) : json(null);
    }
    if (m === 'DELETE') {
      await env.DB.prepare('DELETE FROM cloud_saves WHERE user_id = ? AND slot = ?').bind(u.id, slot).run();
      return json({ ok: true });
    }
  }
  if (path === '/api/scores' && m === 'POST') return submitScore(req, env, u);
  throw new HttpError(404, 'not found');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (!path.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let res: Response;
    try {
      await ensureSchema(env.DB);
      res = await api(req, env, path);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      res = json({ error: e instanceof Error ? e.message : 'error' }, status);
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
};
