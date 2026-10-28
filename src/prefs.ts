// העדפות של האפליקציה במכשיר הזה (לא חלק מהמשחק – לא נשמרות ב-GameState).
import { create } from 'zustand';

export interface Prefs {
  /** התראות: אתגר שבועי, תזכורת לחזור, בחירות שמתקרבות */
  notify: boolean;
  sound: boolean;
  haptics: boolean;
  /** המסך לא נכבה בהצבעה חיה ובליל הבחירות */
  keepAwake: boolean;
  /** מסך מלא – בלי שורת המצב והניווט (אנדרואיד) */
  immersive: boolean;
}

const KEY = 'hamishkan.prefs';
export const DEFAULT_PREFS: Prefs = { notify: true, sound: true, haptics: true, keepAwake: true, immersive: false };

function load(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export const usePrefs = create<Prefs & { setPref: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void }>((set, get) => ({
  ...load(),
  setPref: (k, v) => {
    set({ [k]: v } as Partial<Prefs>);
    const { setPref: _s, ...p } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* לא קריטי */
    }
  },
}));

export const pref = <K extends keyof Prefs>(k: K): Prefs[K] => usePrefs.getState()[k];
