// ניקוד מנורמל לטבלת השיאים: 0–1000, כך שקריירות באורכים, תרחישים והגדרות שונים יהיו ברות השוואה.
// ארבעה רכיבים (כל אחד 0–100), משוקללים, כפול מכפיל קושי:
//   פסגה (35%)    – התפקיד הגבוה ביותר שהושג, ואיכות הכהונה בו
//   השפעה (25%)   – חוקים ומהפכות, ביחס לזמן שעבר (מי ששיחק 12 שנה צריך יותר חוקים ממי ששיחק 3)
//   מדינה (20%)   – כמה מצב המדינה השתפר מאז שהתחלת
//   ציבור (20%)   – מוכרות, מוניטין ותדמית בסוף הדרך
// משחק שנערך בכלים המתקדמים (דילוג/עריכה) מסומן, ולא נכנס לטבלה הראשית.
import { templateById } from '../data/bills';
import type { GameState } from '../types';
import { avgApproval, clamp } from '../util';

export interface ScoreBreakdown {
  total: number;
  peak: number;
  impact: number;
  country: number;
  standing: number;
  mult: number;
  /** תווית התפקיד הגבוה ביותר */
  peakLabel: string;
  years: number;
  laws: number;
  /** שבוע (מתחילת המשחק) שבו הגעת לראשות הממשלה, אם הגעת */
  pmWeek: number | null;
  edited: boolean;
  notes: string[];
}

const PEAKS: [string, number, string][] = [
  ['president', 92, 'נשיא/ת המדינה'],
  ['pm', 85, 'ראש/ת ממשלה'],
  ['leader', 68, 'יו"ר מפלגה'],
  ['minister', 60, 'שר/ה'],
  ['chair', 48, 'יו"ר ועדה'],
  ['elected', 38, 'חבר/ת כנסת'],
];

function peakOf(s: GameState): { v: number; label: string } {
  const a = s.player.achievements;
  for (const [id, v, label] of PEAKS) {
    if (!a.includes(id) && !(id === 'elected' && (s.player.isMK || s.career.mkTerms > 0))) continue;
    let bonus = 0;
    // איכות הפסגה: קדנציה מלאה כראש ממשלה, נשיאות מאחדת
    if (id === 'pm') bonus = Math.min(10, s.career.pmWeeks / 21);
    if (id === 'president' && s.presidency?.weeks) bonus = clamp((s.presidency.unitySum / s.presidency.weeks - 45) / 3, 0, 8);
    if (id === 'elected') bonus = Math.min(8, s.career.mkTerms * 3);
    return { v: Math.min(100, v + bonus), label };
  }
  const r = s.player.rank;
  if (r === 'candidate') return { v: 22, label: 'מועמד/ת לכנסת' };
  if (r === 'aide') return { v: 15, label: 'עוזר/ת פרלמנטרי/ת' };
  if (r === 'activist') return { v: 10, label: 'פעיל/ה' };
  return { v: 4, label: 'אזרח/ית' };
}

export function careerScore(s: GameState): ScoreBreakdown {
  const p = s.player;
  const years = Math.max(0.25, s.week / 52);
  const notes: string[] = [];

  const peak = peakOf(s);

  // השפעה: חוק = 1, חוק יסוד = 1.5, שותפות = 0.3, מהפכה = 3. הציפייה גדלה עם הזמן
  const laws = s.lawsPassed.filter((l) => l.sponsor === 'player' && !l.struck);
  const weight =
    laws.reduce((a, l) => a + (templateById(l.templateId)?.basic ? 1.5 : 1), 0) +
    s.lawsPassed.filter((l) => l.coSponsor && !l.struck).length * 0.3 +
    (s.transforms ?? []).filter((t) => t.sponsor === 'player').length * 3 +
    (s.presidency?.initiatives.filter((i) => i.done).length ?? 0) * 0.8;
  const expected = Math.max(2.5, 1.2 * years);
  const impact = 100 * (1 - Math.exp(-weight / expected));

  // המדינה: ‎-15..+15 נקודות ממוצעות ← 0..100
  const worldNow = Object.values(s.world).reduce((a, b) => a + b, 0) / 6;
  const delta = worldNow - s.career.startWorld;
  const country = clamp(50 + (delta / 15) * 50, 0, 100);

  const standing = clamp((p.fame + p.reputation + avgApproval(s)) / 3, 0, 100);

  // מכפיל קושי: לטפס מהשטח קשה יותר; דרמה גבוהה ושינוי חברתי חזק – יותר אי-ודאות
  let mult = 1;
  if (s.scenario === 'grassroots') mult += 0.08;
  if (s.settings?.drama === 'wild') mult += 0.05;
  else if (s.settings?.drama === 'calm') mult -= 0.05;
  if (s.settings?.dynamics === 'strong') mult += 0.03;
  // קריירה קצרה מאוד לא יכולה להוביל את הטבלה
  if (years < 1) {
    mult *= 0.6 + 0.4 * years;
    notes.push('פחות משנה במשחק');
  }
  if (s.gameOver === 'convicted') {
    mult *= 0.5;
    notes.push('הרשעה');
  }
  if (s.gameOver === 'president_removed') {
    mult *= 0.7;
    notes.push('הדחה מהנשיאות');
  }
  const edited = !!s.flags.usedTools;
  if (edited) notes.push('נעשה שימוש בכלים מתקדמים');

  const raw = 0.35 * peak.v + 0.25 * impact + 0.2 * country + 0.2 * standing;
  const total = Math.round(clamp(raw * mult, 0, 100) * 10);
  return {
    total,
    peak: Math.round(peak.v),
    impact: Math.round(impact),
    country: Math.round(country),
    standing: Math.round(standing),
    mult: Math.round(mult * 100) / 100,
    peakLabel: peak.label,
    years: Math.round(years * 10) / 10,
    laws: laws.length,
    pmWeek: s.career.firstPmWeek ?? null,
    edited,
    notes,
  };
}

/** מזהה יציב לקריירה (אותו משחק = אותה שורה בטבלה, גם אם מפרסמים כמה פעמים) */
export function careerId(s: GameState): string {
  const src = `${s.seed}|${s.startDate}|${s.scenario}|${s.player.name}|${s.player.background}`;
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `c${(h >>> 0).toString(36)}${s.seed.toString(36)}`;
}
