// שכבת הפלטפורמה: מה שונה בין דפדפן לאפליקציית אנדרואיד (Capacitor).
// כל קריאה ל-API נייטיב עוברת מכאן, כדי שהמשחק עצמו לא יצטרך לדעת איפה הוא רץ.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import type { GameState } from './engine';
import { pref } from './prefs';
import { IdbBackend, MemoryBackend, SaveManager, fromBase64, toBase64, type SaveBackend, type SaveMeta } from './saves';

export const isNative = () => Capacitor.isNativePlatform();
export const platformName = () => Capacitor.getPlatform(); // 'android' | 'ios' | 'web'

// ---------------- פלאגין נייטיב משלנו (android/app/src/main/java/.../HamishkanNativePlugin.java) ----------------

export interface DeviceInfo {
  appVersion: string;
  build: string;
  os: string;
  model: string;
  freeMb: number;
}

/** מה שמוצג בווידג'ט במסך הבית */
export interface WidgetData {
  title: string;
  line1: string;
  line2: string;
  line3: string;
}

interface HamishkanNativePlugin {
  getInfo(): Promise<DeviceInfo>;
  setKeepAwake(o: { on: boolean }): Promise<void>;
  setImmersive(o: { on: boolean }): Promise<void>;
  updateWidget(o: WidgetData): Promise<void>;
}

let wakeLock: { release(): Promise<void> } | null = null;

const HamishkanNative = registerPlugin<HamishkanNativePlugin>('HamishkanNative', {
  // בדפדפן אין קוד ג'אווה – מחזירים את מה שאפשר לדעת מכאן
  web: {
    async getInfo(): Promise<DeviceInfo> {
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      return {
        appVersion: import.meta.env.VITE_APP_VERSION ?? 'web',
        build: 'web',
        os: navigator.userAgent.includes('Android') ? 'Android (דפדפן)' : 'דפדפן',
        model: '',
        freeMb: est?.quota && est.usage !== undefined ? Math.round((est.quota - est.usage) / 1048576) : 0,
      };
    },
    // בדפדפן: Screen Wake Lock, אם יש
    async setKeepAwake({ on }: { on: boolean }) {
      const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
      if (on && wl && !wakeLock) wakeLock = await wl.request('screen').catch(() => null);
      if (!on && wakeLock) {
        await wakeLock.release().catch(() => undefined);
        wakeLock = null;
      }
    },
    async setImmersive() {},
    async updateWidget() {},
  },
});

export async function deviceInfo(): Promise<DeviceInfo | null> {
  try {
    return await HamishkanNative.getInfo();
  } catch {
    return null;
  }
}

/** המסך לא נכבה (הצבעה חיה, ליל בחירות) */
export function keepAwake(on: boolean) {
  if (on && !pref('keepAwake')) return;
  void HamishkanNative.setKeepAwake({ on }).catch(() => undefined);
}

/** מסך מלא באנדרואיד: מסתיר את שורת המצב ואת סרגל הניווט (מחווה מהקצה מחזירה אותם לרגע) */
export function applyImmersive(on = pref('immersive')) {
  if (!isNative()) return;
  void HamishkanNative.setImmersive({ on }).catch(() => undefined);
}

let lastWidget = '';
/** עדכון הווידג'ט במסך הבית (רק כשמשהו השתנה) */
export function updateWidget(d: WidgetData) {
  if (!isNative()) return;
  const key = JSON.stringify(d);
  if (key === lastWidget) return;
  lastWidget = key;
  void HamishkanNative.updateWidget(d).catch(() => undefined);
}

// ---------------- אחסון שמירות בקבצים (אנדרואיד) ----------------

/** קבצים בתיקיית האפליקציה: saves/index.json + saves/<id>.sav (דחוס) */
class FileBackend implements SaveBackend {
  private queue: Promise<unknown> = Promise.resolve();
  /** פעולות על האינדקס רצות אחת אחרי השנייה, כדי שלא ידרסו זו את זו */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private async readIndex(): Promise<SaveMeta[]> {
    try {
      const r = await Filesystem.readFile({ path: 'saves/index.json', directory: Directory.Data, encoding: Encoding.UTF8 });
      return JSON.parse(String(r.data)) as SaveMeta[];
    } catch {
      return [];
    }
  }
  private writeIndex(list: SaveMeta[]) {
    return Filesystem.writeFile({ path: 'saves/index.json', directory: Directory.Data, encoding: Encoding.UTF8, data: JSON.stringify(list), recursive: true });
  }
  list() {
    return this.serial(() => this.readIndex());
  }
  put(meta: SaveMeta, data: Uint8Array) {
    return this.serial(async () => {
      await Filesystem.writeFile({ path: `saves/${meta.id}.sav`, directory: Directory.Data, data: toBase64(data), recursive: true });
      const list = (await this.readIndex()).filter((m) => m.id !== meta.id);
      await this.writeIndex([...list, meta]);
    });
  }
  get(id: string) {
    return this.serial(async () => {
      try {
        const r = await Filesystem.readFile({ path: `saves/${id}.sav`, directory: Directory.Data });
        return fromBase64(String(r.data));
      } catch {
        return null;
      }
    });
  }
  remove(id: string) {
    return this.serial(async () => {
      await Filesystem.deleteFile({ path: `saves/${id}.sav`, directory: Directory.Data }).catch(() => undefined);
      await this.writeIndex((await this.readIndex()).filter((m) => m.id !== id));
    });
  }
}

function pickBackend(): SaveBackend {
  if (isNative()) return new FileBackend();
  if (typeof indexedDB !== 'undefined') return new IdbBackend();
  return new MemoryBackend();
}

export const saves = new SaveManager(pickBackend());

let lastAuto = 0;

/** גיבוי אוטומטי: בכל סוף שבוע (ובכל פעם שהאפליקציה יוצאת לרקע, לכל היותר פעם בכמה דקות) */
export function autoBackup(g: GameState | null, opts: { minGapMs?: number } = {}) {
  if (!g) return;
  const now = Date.now();
  if (opts.minGapMs && now - lastAuto < opts.minGapMs) return;
  lastAuto = now;
  const kind = g.week > 0 && g.week % 52 === 0 ? 'year' : 'auto';
  void saves.save(g, kind).catch(() => undefined);
}

/** גיבוי ביטחון לפני פעולה שמוחקת או מחליפה את המשחק הנוכחי */
export function safetyBackup(g: GameState | null, why: string) {
  if (!g) return;
  void saves.save(g, 'safety', `${g.player.name} · ${why}`).catch(() => undefined);
}

// ---------------- ייצוא וייבוא קבצים ----------------

export const exportName = (g: GameState) => `hamishkan-${g.player.name.replace(/\s+/g, '_')}-week${g.week + 1}.json`;

/** ייצוא: באנדרואיד – חלון השיתוף (Drive, וואטסאפ, שמירה בקבצים); בדפדפן – הורדה */
export async function exportGame(g: GameState): Promise<string> {
  const json = JSON.stringify(g);
  const name = exportName(g);
  if (isNative()) {
    const res = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'שמירה של המשכן', text: `${g.player.name} – שבוע ${g.week + 1}`, files: [res.uri], dialogTitle: 'לאן לשמור את הגיבוי?' });
    return 'נפתח חלון השיתוף – בחר/י Drive, קבצים או וואטסאפ.';
  }
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  return 'הקובץ הורד.';
}

/** קריאת קובץ שהמשתמש/ת בחר/ה (עובד גם באנדרואיד: Capacitor פותח את בוחר הקבצים) */
export function pickFile(accept = '.json,application/json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? await f.text() : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

// ---------------- רטט ----------------

export function haptic(kind: 'tap' | 'heavy' | 'good' | 'bad' = 'tap') {
  if (!isNative() || !pref('haptics')) return;
  if (kind === 'heavy') void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => undefined);
  else if (kind === 'tap') void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  else void Haptics.notification({ type: kind === 'good' ? NotificationType.Success : NotificationType.Error }).catch(() => undefined);
}
