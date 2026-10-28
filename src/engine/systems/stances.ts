// העמדות של השחקן זזות במהלך המשחק: הודעה פומבית על שינוי עמדה (מחיר: עקביות, מוניטין, תגובות),
// וסחף הדרגתי – מי שמצהיר/ה שוב ושוב בכיוון מסוים, מתחיל/ה להאמין בזה.
import { addStat } from '../stats';
import type { Axis, GameState, Ideology } from '../types';
import { AXIS_NAMES, clamp, leanAlignment } from '../util';
import { changeAttitude } from './relationships';
import { addNews } from './news';
import { takeStance } from './opinion';

/** כמה אפשר לזוז בהודעה אחת, וכמה זמן עד ששוב אפשר לשנות באותו ציר */
export const STEP_SIZES = [10, 25, 45] as const;
export const STANCE_COOLDOWN = 8;

export function stanceBlocked(s: GameState, axis: Axis): string | null {
  if (s.player.ap < 1) return 'אין מספיק זמן השבוע';
  const last = Number(s.flags[`stance_${axis}`] ?? -99);
  if (s.week - last < STANCE_COOLDOWN) return `שינית עמדה בנושא הזה לפני ${s.week - last} שבועות – עוד ${STANCE_COOLDOWN - (s.week - last)} שבועות`;
  return null;
}

/** מה יקרה (לתצוגה): כמה עקביות ומוניטין יעלה, ומה תגובת המפלגה */
export function stancePreview(s: GameState, axis: Axis, delta: number) {
  const size = Math.abs(delta);
  const p = s.player;
  const party = p.partyId ? s.parties[p.partyId] : null;
  const before = party ? Math.abs(p.ideology[axis] - party.ideology[axis]) : 0;
  const after = party ? Math.abs(clamp(p.ideology[axis] + delta, -100, 100) - party.ideology[axis]) : 0;
  // תפנית (מעבר מצד לצד) מכה חזק יותר מהתמתנות
  const flip = Math.sign(p.ideology[axis]) !== 0 && Math.sign(p.ideology[axis] + delta) !== Math.sign(p.ideology[axis]) && Math.abs(p.ideology[axis] + delta) > 10;
  return {
    consistency: -Math.round(size * 0.35 + (flip ? 10 : 0)),
    reputation: size >= 40 || flip ? -3 : size >= 20 ? -1 : 0,
    party: party ? (after < before ? 'המפלגה תשמח – את/ה מתקרב/ת לקו שלה' : after > before + 5 ? 'המפלגה תכעס – את/ה מתרחק/ת מהקו שלה' : 'במפלגה לא ממש ישימו לב') : '',
    flip,
  };
}

/** הודעה פומבית: "שיניתי את דעתי" */
export function changeStance(s: GameState, axis: Axis, delta: number, why = ''): { ok: boolean; text: string; lines?: string[] } {
  const blocked = stanceBlocked(s, axis);
  if (blocked) return { ok: false, text: blocked };
  const p = s.player;
  const pv = stancePreview(s, axis, delta);
  const party = p.partyId ? s.parties[p.partyId] : null;
  const old = p.ideology[axis];
  p.ap -= 1;
  s.flags[`stance_${axis}`] = s.week;
  // הציבור מגיב לכיוון החדש (מי שמסכים – אוהב, מי שלא – פחות)
  const lean: Partial<Ideology> = { [axis]: delta > 0 ? 70 : -70 };
  const c0 = p.consistency;
  takeStance(s, lean, Math.min(2.5, Math.abs(delta) / 15));
  p.consistency = c0;
  // העמדה החדשה בדיוק כפי שהוכרזה (בלי הסחף של takeStance), ומחיר העקביות לפי התצוגה המקדימה
  p.ideology[axis] = clamp(old + delta, -100, 100);
  p.consistency = clamp(p.consistency + pv.consistency, 0, 100);
  if (pv.reputation) addStat(s, 'reputation', pv.reputation);
  addStat(s, 'fame', Math.min(4, Math.abs(delta) / 10));
  // המפלגה וח"כים
  if (party) {
    const closer = Math.abs(p.ideology[axis] - party.ideology[axis]) < Math.abs(old - party.ideology[axis]);
    p.partyStanding = clamp(p.partyStanding + (closer ? 2 : -Math.min(8, Math.abs(delta) / 5)), 0, 100);
  }
  for (const n of Object.values(s.npcs)) {
    if (!n.isMK || !n.notable) continue;
    const d = leanAlignment(n.ideology, lean);
    if (Math.abs(d) > 0.4) changeAttitude(s, n.id, Math.round(d * Math.min(6, Math.abs(delta) / 6)), { spread: false });
  }
  const [name, low, high] = AXIS_NAMES[axis];
  const toward = delta > 0 ? high : low;
  const headline = pv.flip ? `תפנית: ${p.name} משנה כיוון ב${name} – עכשיו בעד ${toward}` : Math.abs(delta) >= 25 ? `${p.name} מודיע/ה: "השתכנעתי" – מתקרב/ת ל${toward}` : `${p.name} מרכך/ת עמדה ב${name}`;
  addNews(s, headline, 'neutral', true, why ? `"${why}"` : pv.flip ? 'יריבים כבר מפיצים את הציטוטים הישנים.' : undefined);
  return {
    ok: true,
    text: headline,
    lines: [`${name}: ${Math.round(old)} ← ${Math.round(p.ideology[axis])}`, `עקביות ${pv.consistency}`, ...(pv.reputation ? [`מוניטין ${pv.reputation}`] : []), ...(pv.party ? [pv.party] : [])],
  };
}

/**
 * סחף: כל הצהרה פומבית מזיזה מעט את העמדה שלך לכיוונה (עד 1.5 נקודות לציר בפעם).
 * נקרא מתוך takeStance.
 */
export function driftTowards(s: GameState, lean: Partial<Ideology>, magnitude: number) {
  const p = s.player;
  for (const [ax, v] of Object.entries(lean) as [Axis, number][]) {
    if (!v) continue;
    const d = clamp((v - p.ideology[ax]) * 0.012 * Math.abs(magnitude), -1.5, 1.5);
    p.ideology[ax] = clamp(p.ideology[ax] + d, -100, 100);
  }
}
