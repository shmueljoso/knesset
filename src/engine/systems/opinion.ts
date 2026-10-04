import { rand } from '../rng';
import { salienceMultiplier } from './issues';
import { reactToStance } from './relationships';
import { playerSeatContribution } from './influence';
import type { GameState, Ideology, Sector, WorldKey } from '../types';
import { SECTORS, SECTOR_IDEOLOGY, SECTOR_WEIGHTS, clamp, leanAlignment } from '../util';

export const WORLD_NAMES: Record<WorldKey, string> = {
  economy: 'כלכלה',
  affordability: 'יוקר המחיה',
  housing: 'דיור',
  security: 'ביטחון',
  trust: 'אמון במוסדות',
  cohesion: 'לכידות חברתית',
};

export function changeApproval(s: GameState, sector: Sector | 'all', delta: number) {
  const secs = sector === 'all' ? SECTORS : [sector];
  for (const sec of secs) s.player.approval[sec] = clamp(s.player.approval[sec] + delta, 0, 100);
}

/**
 * השחקן נוקט עמדה פומבית. כל מגזר מגיב לפי ההתאמה בין עמדתו לעמדה שהובעה,
 * ועוצמת התגובה גדלה עם המוכרות. עמדה שסותרת את האידיאולוגיה של השחקן פוגעת בעקביות.
 */
export function takeStance(s: GameState, lean: Partial<Ideology>, magnitude: number): Record<Sector, number> {
  // עמדה בסוגיה בוערת מזיזה יותר
  const axis = (Object.keys(lean) as (keyof Ideology)[]).sort((a, b) => Math.abs(lean[b] ?? 0) - Math.abs(lean[a] ?? 0))[0] ?? null;
  magnitude *= salienceMultiplier(s, axis);
  reactToStance(s, lean, magnitude);
  const fameFactor = 0.4 + s.player.fame / 100;
  const out = {} as Record<Sector, number>;
  for (const sec of SECTORS) {
    const align = leanAlignment(SECTOR_IDEOLOGY[sec], lean);
    const d = magnitude * align * fameFactor;
    out[sec] = d;
    changeApproval(s, sec, d);
  }
  const selfAlign = leanAlignment(s.player.ideology, lean);
  if (selfAlign < 0) s.player.consistency = clamp(s.player.consistency + selfAlign * 6, 0, 100);
  else s.player.consistency = clamp(s.player.consistency + 0.5, 0, 100);
  return out;
}

export function addWorldEffect(s: GameState, key: WorldKey, total: number, weeks: number, source: string, delay = 0) {
  const w = Math.max(1, weeks);
  s.effects.push({ key, perWeek: total / w, weeksLeft: w, startWeek: s.week + delay, source });
}

export function tickWorld(s: GameState) {
  for (const e of s.effects) {
    if (s.week < e.startWeek || e.weeksLeft <= 0) continue;
    s.world[e.key] = clamp(s.world[e.key] + e.perWeek, 0, 100);
    e.weeksLeft -= 1;
  }
  s.effects = s.effects.filter((e) => e.weeksLeft > 0);
  // רעש ונטייה איטית לממוצע
  for (const k of Object.keys(s.world) as WorldKey[]) {
    const drift = (50 - s.world[k]) * 0.004 + (rand(s) - 0.5) * 0.6;
    s.world[k] = clamp(s.world[k] + drift, 0, 100);
  }
}

/** שביעות רצון מהממשלה: -1..1 */
export function govSatisfaction(s: GameState): number {
  const w = s.world;
  const avg = (w.economy + w.affordability + w.housing + w.security * 1.4 + w.trust + w.cohesion) / 6.4;
  return clamp((avg - 45) / 30, -1, 1);
}

/** כוח המשיכה האלקטורלי של השחקן עצמו (באחוזים), משמש למפלגה שהקים. */
export function playerElectoralAppeal(s: GameState): number {
  const p = s.player;
  let appeal = 0;
  for (const sec of SECTORS) {
    const fit = Math.max(0, (p.approval[sec] - 45) / 55);
    appeal += SECTOR_WEIGHTS[sec] * fit;
  }
  const fame = p.fame / 100;
  const party = p.partyId ? s.parties[p.partyId] : null;
  const listStrength = party
    ? party.list.filter((id) => id !== 'player').reduce((a, id) => a + (s.npcs[id]?.influence ?? 0), 0) / 1000
    : 0;
  return appeal * fame * 22 + listStrength * 2 + (p.consistency - 50) / 50;
}

/** עדכון סקרים שבועי: חזרה לבסיס, השפעת מצב המדינה, השחקן, ורעש. */
export function updatePolls(s: GameState) {
  const gov = govSatisfaction(s);
  const parties = Object.values(s.parties);
  for (const p of parties) {
    let target = p.base;
    const inCoal = s.coalition.parties.includes(p.id);
    target *= 1 + (inCoal ? gov * 0.18 : -gov * 0.1);
    if (p.playerFounded) target = playerElectoralAppeal(s) + (p.absorbed ?? 0);
    else if (p.id === s.player.partyId) target += playerSeatContribution(s)?.pct ?? 0;
    // מומנטום: הייפ או קריסה זמניים, שדועכים אם לא מתחזקים
    const m = p.momentum ?? 0;
    target = Math.max(0.2, target + m);
    if (m) p.momentum = Math.abs(m) < 0.05 ? 0 : m * 0.95;
    p.poll = Math.max(0, p.poll + (target - p.poll) * 0.12 + (rand(s) - 0.5) * 0.35);
  }
  // נרמול ל-100%. הבסיס עצמו מתעדכן רק בבחירות, כדי למנוע סחף מצטבר.
  normalizePolls(s);
}

export function normalizePolls(s: GameState) {
  const parties = Object.values(s.parties);
  const total = parties.reduce((a, p) => a + p.poll, 0) || 1;
  for (const p of parties) p.poll = (p.poll / total) * 100;
}


export function pollSeats(poll: number, threshold = 3.25): number {
  return poll < threshold ? 0 : Math.round((poll / 100) * 120);
}


/** מכפיל לפי רמת הדרמה שנבחרה */
export function dramaScale(s: GameState): number {
  const d = s.settings?.drama ?? 'normal';
  return d === 'calm' ? 0.7 : d === 'wild' ? 1.4 : 1;
}

/** תנופה בסקרים למפלגה (באחוזים), מוכפלת ברמת הדרמה. */
export function addMomentum(s: GameState, partyId: string, d: number) {
  const p = s.parties[partyId];
  if (!p) return;
  const dd = d * dramaScale(s);
  p.momentum = Math.max(-25, Math.min(25, (p.momentum ?? 0) + dd));
  // הסקר הבא כבר מראה חלק מהקפיצה
  p.poll = Math.max(0.1, p.poll + dd * 0.4);
}
