// שרשראות: מה שקורה אחרי חוק, טלטלה או פסילה – והמשך שתלוי בהחלטות שלך.
import { CHAINS, CHAIN_EVENTS } from '../data/chains';
import { registerSpecial } from '../ops';
import { chance } from '../rng';
import type { GameState } from '../types';
import { clamp } from '../util';
import { partyQuits } from './coalition';
import { bumpIssue, reenactLaw, scheduleEvent, strikeLaw } from './issues';
import { addNews } from './news';
import { addMomentum } from './opinion';

export { CHAIN_EVENTS };

const pending = (s: GameState, eventId: string) => s.scheduled.some((x) => x.eventId === eventId) || s.eventQueue.some((x) => x.eventId === eventId);

/** בודק אילו שרשראות מופעלות ממה שקרה (kind: law/shock/struck, id: מזהה החוק או הטלטלה) */
export function triggerChains(s: GameState, kind: 'law' | 'shock' | 'struck', id: string) {
  for (const r of CHAINS) {
    if (r.kind !== kind || !r.match(id, s)) continue;
    if (s.week - Number(s.flags[`chain_${r.id}`] ?? -99) < 26 || pending(s, r.event)) continue;
    if (r.when && !r.when(s, id)) continue;
    if (!chance(s, r.p)) continue;
    s.flags[`chain_${r.id}`] = s.week;
    scheduleEvent(s, r.event, r.delay, r.ctx ? r.ctx(s, id) : {});
  }
}

const later = (s: GameState, eventId: string, weeks: number, ctx: Record<string, string> = {}) => {
  if (!pending(s, eventId)) scheduleEvent(s, eventId, weeks, ctx);
};

registerSpecial('ch_freeze_law', (s, ctx) => {
  if (ctx.law) strikeLaw(s, ctx.law, true);
  if (ctx.party && s.coalition.satisfaction[ctx.party] !== undefined) s.coalition.satisfaction[ctx.party] = clamp(s.coalition.satisfaction[ctx.party] + 15, 0, 100);
  addNews(s, `"${ctx.title ?? 'החוק'}" הוקפא. ${ctx.partyName ? `${ctx.partyName} חוזרת לעבוד עם הממשלה` : 'הממשלה נסוגה'}`, 'neutral', false, undefined, 'ערוץ המשכן');
  return 'החוק הוקפא והמתח יורד – אבל מי שרצה אותו יזכור.';
});

registerSpecial('ch_hold_law', (s, ctx) => {
  const id = ctx.party;
  if (id && s.parties[id] && chance(s, 0.55)) {
    partyQuits(s, id, `"${ctx.title}" – עברנו את הקו`);
    return `${s.parties[id].name} פרשה מהקואליציה!`;
  }
  if (id && s.coalition.satisfaction[id] !== undefined) s.coalition.satisfaction[id] = clamp(s.coalition.satisfaction[id] - 12, 0, 100);
  return 'הם איימו – אבל נשארו. בינתיים.';
});

registerSpecial('ch_compromise_law', (s, ctx) => {
  if (ctx.party && s.coalition.satisfaction[ctx.party] !== undefined) s.coalition.satisfaction[ctx.party] = clamp(s.coalition.satisfaction[ctx.party] + 6, 0, 100);
  return 'הפשרה הרגיעה את הרוחות. החוק נשאר, עם תיקונים.';
});

registerSpecial('ch_jc_hold', (s, ctx) => {
  bumpIssue(s, 'judiciary', 10);
  if (s.issues.judiciary >= 50) later(s, 'ch_jc_pilots', 5, ctx);
  return s.issues.judiciary >= 50 ? 'המחאה מתעצמת – וכבר מדברים על מכתב של טייסים.' : 'המחאה נחלשת מעצמה.';
});
registerSpecial('ch_jc_talk', (s) => {
  bumpIssue(s, 'judiciary', -10);
  return 'השיחות מרגיעות את הרחוב, בינתיים.';
});
registerSpecial('ch_jc_strike_next', (s, ctx) => {
  bumpIssue(s, 'judiciary', 8);
  later(s, 'ch_jc_strike', 5, ctx);
});
registerSpecial('ch_judiciary_heat', (s, ctx) => {
  bumpIssue(s, 'judiciary', 12);
  if (chance(s, 0.6)) later(s, 'ch_jc_pilots', 6, ctx);
});
registerSpecial('ch_override_law', (s, ctx) => {
  reenactLaw(s, ctx.law);
  addNews(s, `הכנסת חוקקה מחדש את "${ctx.title}" בפסקת ההתגברות`, 'neutral', false, undefined, 'ערוץ המשכן');
  bumpIssue(s, 'judiciary', 10);
  return 'החוק חוקק מחדש. המחאה מתחדשת.';
});
registerSpecial('ch_housing_deal', (s, ctx) => {
  later(s, 'ch_housing_boom', 28, ctx);
  return 'ההסכם נחתם. התוצאות יתבררו רק בעוד חצי שנה.';
});
registerSpecial('ch_reservists_protest', (s) => {
  later(s, 'ch_reservists_protest', 4);
});
registerSpecial('ch_unions', (s) => later(s, 'ch_unions_strike', 4));
registerSpecial('ch_inflation', (s) => later(s, 'ch_inflation_bite', 20));
registerSpecial('ch_tents_boost', (s) => {
  for (const p of Object.values(s.parties)) if (p.seats > 0 && p.ideology.econ < -30) addMomentum(s, p.id, 1.4);
});
