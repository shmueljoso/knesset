// שמירות וגיבויים: שמירות ידניות עם שם, גיבוי אוטומטי בכל שבוע (8 אחרונים + אחד לכל שנה במשחק),
// גיבוי ביטחון לפני פעולות הרסניות, וייצוא/ייבוא לקובץ.
// באנדרואיד הקבצים נשמרים בתיקיית האפליקציה (Filesystem), בדפדפן – ב-IndexedDB.
// המשחק הנוכחי עצמו ממשיך להישמר ב-localStorage אחרי כל פעולה (store.ts) – כאן רק העותקים.
import type { GameState } from './engine';
import { dateLabel } from './engine/calendar';

export type SaveKind = 'manual' | 'auto' | 'year' | 'safety';

export interface SaveMeta {
  id: string;
  kind: SaveKind;
  name: string;
  player: string;
  week: number;
  date: string;
  savedAt: number;
  bytes: number;
  gz: boolean;
}

/** כמה מכל סוג נשמרים לפני שהישנים נמחקים */
export const KEEP: Record<SaveKind, number> = { manual: 30, auto: 8, year: 12, safety: 4 };

export const KIND_LABEL: Record<SaveKind, string> = { manual: 'שמירה ידנית', auto: 'גיבוי אוטומטי', year: 'גיבוי שנתי', safety: 'גיבוי ביטחון' };

export interface SaveBackend {
  list(): Promise<SaveMeta[]>;
  put(meta: SaveMeta, data: Uint8Array): Promise<void>;
  get(id: string): Promise<Uint8Array | null>;
  remove(id: string): Promise<void>;
}

// ---------------- דחיסה ----------------

const canGzip = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export async function encode(json: string): Promise<{ data: Uint8Array; gz: boolean }> {
  const raw = new TextEncoder().encode(json);
  if (!canGzip()) return { data: raw, gz: false };
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
  return { data: new Uint8Array(await new Response(stream).arrayBuffer()), gz: true };
}

export async function decode(data: Uint8Array, gz: boolean): Promise<string> {
  if (!gz) return new TextDecoder().decode(data);
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// ---------------- מדיניות שמירה ----------------

/** אילו שמירות למחוק כדי שלא יצטברו: הישנות ביותר מכל סוג, מעבר ל-KEEP */
export function pruneIds(list: SaveMeta[]): string[] {
  const out: string[] = [];
  for (const kind of Object.keys(KEEP) as SaveKind[]) {
    const of = list.filter((m) => m.kind === kind).sort((a, b) => b.savedAt - a.savedAt);
    out.push(...of.slice(KEEP[kind]).map((m) => m.id));
  }
  return out;
}

/** בדיקה שקובץ הוא שמירה של המשחק */
export function looksLikeSave(x: unknown): x is GameState {
  const g = x as GameState;
  return !!g && typeof g === 'object' && g.version === 1 && !!g.player && typeof g.week === 'number' && !!g.parties && Array.isArray(g.seating);
}

let seq = 0;
export function metaFor(g: GameState, kind: SaveKind, name?: string): SaveMeta {
  const now = Date.now();
  return {
    id: `${kind}-${now.toString(36)}-${(seq++).toString(36)}`,
    kind,
    name: name?.trim() || `${g.player.name} · ${dateLabel(g)}`,
    player: g.player.name,
    week: g.week,
    date: dateLabel(g),
    savedAt: now,
    bytes: 0,
    gz: false,
  };
}

// ---------------- המנהל ----------------

export class SaveManager {
  constructor(private backend: SaveBackend) {}

  async list(): Promise<SaveMeta[]> {
    try {
      return (await this.backend.list()).sort((a, b) => b.savedAt - a.savedAt);
    } catch {
      return [];
    }
  }

  async save(g: GameState, kind: SaveKind, name?: string): Promise<SaveMeta> {
    const meta = metaFor(g, kind, name);
    const { data, gz } = await encode(JSON.stringify(g));
    meta.bytes = data.byteLength;
    meta.gz = gz;
    await this.backend.put(meta, data);
    const drop = pruneIds(await this.backend.list());
    for (const id of drop) await this.backend.remove(id);
    return meta;
  }

  async load(id: string): Promise<GameState | null> {
    const all = await this.backend.list();
    const meta = all.find((m) => m.id === id);
    const data = await this.backend.get(id);
    if (!meta || !data) return null;
    const g = JSON.parse(await decode(data, meta.gz));
    return looksLikeSave(g) ? g : null;
  }

  async remove(id: string) {
    await this.backend.remove(id);
  }

  async rename(id: string, name: string) {
    const all = await this.backend.list();
    const meta = all.find((m) => m.id === id);
    const data = await this.backend.get(id);
    if (!meta || !data) return;
    // שמירה שקיבלה שם הופכת לידנית – כך היא לא נמחקת בסבב הגיבויים
    await this.backend.put({ ...meta, name: name.trim() || meta.name, kind: 'manual' }, data);
  }

  /** הגיבוי האחרון (לשחזור אם השמירה הראשית אבדה) */
  async latest(): Promise<SaveMeta | null> {
    return (await this.list())[0] ?? null;
  }
}

// ---------------- מימושים ----------------

/** בזיכרון – לבדיקות */
export class MemoryBackend implements SaveBackend {
  private metas = new Map<string, SaveMeta>();
  private blobs = new Map<string, Uint8Array>();
  async list() {
    return [...this.metas.values()];
  }
  async put(meta: SaveMeta, data: Uint8Array) {
    this.metas.set(meta.id, meta);
    this.blobs.set(meta.id, data);
  }
  async get(id: string) {
    return this.blobs.get(id) ?? null;
  }
  async remove(id: string) {
    this.metas.delete(id);
    this.blobs.delete(id);
  }
}

/** IndexedDB – בדפדפן */
export class IdbBackend implements SaveBackend {
  private db: Promise<IDBDatabase> | null = null;
  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open('hamishkan-saves', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('meta', { keyPath: 'id' });
        req.result.createObjectStore('data');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }
  private async tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      const r = fn(t);
      t.oncomplete = () => resolve(r ? r.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  async list() {
    return ((await this.tx(['meta'], 'readonly', (t) => t.objectStore('meta').getAll())) ?? []) as SaveMeta[];
  }
  async put(meta: SaveMeta, data: Uint8Array) {
    await this.tx(['meta', 'data'], 'readwrite', (t) => {
      t.objectStore('meta').put(meta);
      t.objectStore('data').put(data, meta.id);
    });
  }
  async get(id: string) {
    const v = await this.tx(['data'], 'readonly', (t) => t.objectStore('data').get(id));
    return (v as Uint8Array | undefined) ?? null;
  }
  async remove(id: string) {
    await this.tx(['meta', 'data'], 'readwrite', (t) => {
      t.objectStore('meta').delete(id);
      t.objectStore('data').delete(id);
    });
  }
}

export function toBase64(data: Uint8Array): string {
  let s = '';
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
