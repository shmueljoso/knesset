// "אקלים פוליטי": מתי מהפכה הופכת מהזויה לאפשרית –
// ממשלה תמימת דעים, כנסת רחבה במיוחד, או "חלון הזדמנויות" אחרי זעזוע.
import { templateById } from '../data/bills';
import { TRANSFORM_INFO } from '../data/transforms';
import type { GameState, TransformId } from '../types';
import { clamp, leanAlignment } from '../util';
import { addNews } from './news';

export interface Climate {
  bonus: number; // 0..1 – כמה המהפכה "באוויר"
  coalAlign: number;
  coalSeats: number;
  window: boolean;
  reasons: string[];
}

const NONE: Climate = { bonus: 0, coalAlign: 0, coalSeats: 0, window: false, reasons: [] };

export const windowOpen = (s: GameState, id: TransformId) => (s.windows?.[id] ?? -1) > s.week;

/** פתיחת חלון הזדמנויות: הציבור והכנסת פתוחים פתאום לרעיון שהיה הזוי */
export function openWindow(s: GameState, id: TransformId, weeks: number, why: string) {
  if ((s.transforms ?? []).some((t) => t.id === id)) return;
  s.windows ??= {};
  const until = s.week + weeks;
  if ((s.windows[id] ?? -1) >= until) return;
  s.windows[id] = until;
  addNews(s, `🪟 ${why}: לראשונה, רוב בציבור מוכן לשקול ${TRANSFORM_INFO[id].name}`, 'neutral', false, 'פרשנים: "חלון כזה נפתח פעם בדור – ונסגר מהר."', 'ערוץ המשכן');
}

export function radicalClimate(s: GameState, templateId: string): Climate {
  const t = templateById(templateId);
  if (!t?.radical) return NONE;
  const coal = s.coalition.parties.filter((p) => s.parties[p]);
  const coalSeats = coal.reduce((a, p) => a + s.parties[p].seats, 0);
  const coalAlign = coalSeats ? coal.reduce((a, p) => a + leanAlignment(s.parties[p].ideology, t.lean) * s.parties[p].seats, 0) / coalSeats : 0;
  const window = windowOpen(s, t.radical);
  const reasons: string[] = [];
  let b = 0;
  if (coalAlign > 0.45) {
    b += (coalAlign - 0.45) * 1.6;
    reasons.push(`הקואליציה תומכת ברעיון (התאמה ${Math.round(coalAlign * 100)}%)`);
  }
  if (coalSeats >= 80) {
    b += 0.3;
    reasons.push(`קואליציה רחבה במיוחד (${coalSeats})`);
  } else if (coalSeats >= 72) {
    b += 0.15;
    reasons.push(`קואליציה רחבה (${coalSeats})`);
  }
  if (window) {
    b += 0.55;
    reasons.push(`🪟 חלון הזדמנויות פתוח עד שבוע ${(s.windows?.[t.radical] ?? 0) + 1}`);
  }
  return { bonus: clamp(b, 0, 1), coalAlign, coalSeats, window, reasons };
}
