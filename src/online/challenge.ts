// "אתגר השבוע": כולם מקבלים את אותו עולם (אותו seed ואותו תרחיש), כי המנוע דטרמיניסטי.
// עובד גם בלי אינטרנט – המזהה מחושב מהתאריך. רק הפרסום בטבלה דורש חיבור.
import type { ScenarioId } from '../engine/types';

export interface Challenge {
  id: string; // למשל 2026-W44
  week: number;
  seed: number;
  scenario: ScenarioId;
  title: string;
}

/** שבוע ISO‏ 8601 (שבוע מתחיל ביום שני) */
export function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7) };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2 ** 31;
}

export function weeklyChallenge(now = new Date()): Challenge {
  const { year, week } = isoWeek(now);
  const id = `${year}-W${String(week).padStart(2, '0')}`;
  const scenario: ScenarioId = week % 2 ? 'grassroots' : 'freshman';
  return { id, week, seed: hash(`hamishkan:${id}`), scenario, title: `אתגר שבוע ${week} · ${scenario === 'freshman' ? 'ח"כ טרי' : 'מהשטח'}` };
}
