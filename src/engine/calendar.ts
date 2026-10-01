import type { GameState } from './types';

export function dateOf(s: GameState, week = s.week): Date {
  const d = new Date(s.startDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + week * 7);
  return d;
}

const fmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtShort = new Intl.DateTimeFormat('he-IL', { month: 'short', year: '2-digit', timeZone: 'UTC' });

export function dateLabel(s: GameState, week = s.week): string {
  return fmt.format(dateOf(s, week));
}
export function shortDateLabel(s: GameState, week: number): string {
  return fmtShort.format(dateOf(s, week));
}

export type Session = 'winter' | 'summer' | 'recess';

/** מושבי הכנסת (בקירוב): חורף מאמצע אוקטובר עד סוף מרץ, קיץ ממאי עד סוף יולי. */
export function sessionOf(s: GameState, week = s.week): Session {
  const d = dateOf(s, week);
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (m >= 11 || m <= 2 || (m === 10 && day >= 15) || (m === 3 && day <= 25)) return 'winter';
  if (m >= 5 && m <= 7) return 'summer';
  return 'recess';
}

export const SESSION_NAMES: Record<Session, string> = {
  winter: 'מושב החורף',
  summer: 'מושב הקיץ',
  recess: 'פגרה',
};

export const inSession = (s: GameState, week = s.week) => sessionOf(s, week) !== 'recess';

/** שבוע שבו יש להעביר את חוק התקציב (סוף מרץ). */
export function isBudgetDeadline(s: GameState, week = s.week): boolean {
  const d = dateOf(s, week);
  const prev = dateOf(s, week - 1);
  return d.getUTCMonth() === 2 && d.getUTCDate() >= 25 && !(prev.getUTCMonth() === 2 && prev.getUTCDate() >= 25);
}
