// אירועים שתלויים במה שקרה בפועל: אילו חוקים בתוקף ומי בממשלה (systems/facts.ts).
// כל מצב של הגיוס מייצר בעיות אחרות: פטור → מחאת מילואימניקים ובג"ץ; חוק גיוס → מעצרים, סנקציות וחטיבות חדשות;
// צבא מקצועי → מחסור במתגייסים. וחרדים באופוזיציה מתנהגים אחרת מחרדים בקואליציה.
import { registerSpecial, type Op } from '../ops';
import { changeSatisfaction, recomputeStability } from '../systems/coalition';
import { draftEnforced, exemptionInPlace, harediParty, isHarediParty, lawInForce, worldFacts } from '../systems/facts';
import { bumpIssue, isHot, strikeLaw } from '../systems/issues';
import { addNews } from '../systems/news';
import { addWorldEffect } from '../systems/opinion';
import type { GameState } from '../types';
import type { GameEvent } from './events';

const f = worldFacts;
const courtOn = (s: GameState) => f(s).courtActive && (!s.rules.packedCourt || s.week % 3 === 0);
const isPM = (s: GameState) => s.coalition.pmId === 'player';
const weeksSince = (s: GameState, law: string) => {
  const l = lawInForce(s, law);
  return l ? s.week - l.week : -1;
};
const harediCtx = (inGov?: boolean) => (s: GameState) => {
  const p = harediParty(s, inGov);
  return p ? { party: p.id } : null;
};
const toHarediPartners = (s: GameState, d: number) => {
  for (const id of s.coalition.parties) if (isHarediParty(s.parties[id])) changeSatisfaction(s, id, d);
  recomputeStability(s);
};
const toSecularPartners = (s: GameState, d: number) => {
  for (const id of s.coalition.parties) if ((s.parties[id]?.ideology.religion ?? 0) <= -30) changeSatisfaction(s, id, d);
  recomputeStability(s);
};

const SEC: Op = { op: 'stance', lean: { religion: -60, security: 30 }, d: 2 };
const REL: Op = { op: 'stance', lean: { religion: 75 }, d: 2 };

export const FACT_EVENTS: GameEvent[] = [
  // ---------- פטור (בהסדר או בחוק) ----------
  {
    id: 'court_exemption_law', icon: '⚖️', weight: 2, cooldown: 60, issue: 'draft',
    title: 'בג"ץ פסל את חוק מעמד לומדי התורה',
    body: 'בהרכב מורחב קבע בית המשפט שהפטור הגורף פוגע בשוויון באופן לא מידתי. החוק בטל, והמדינה צריכה להתחיל לגייס. {gov}',
    when: (s) => courtOn(s) && f(s).draft === 'exemptionLaw' && weeksSince(s, 'yeshiva') >= 20,
    ctx: (s) => ({ gov: f(s).haredimInGov ? 'המפלגות החרדיות בקואליציה דורשות לחוקק אותו מחדש – מיד.' : 'החרדים באופוזיציה קוראים לצאת לרחובות.' }),
    choices: [
      { label: 'לכבד את הפסיקה', ops: [{ op: 'special', id: 'fx_strike_yeshiva', label: 'החוק בטל' }, SEC] },
      {
        label: 'לחוקק מחדש בפסקת התגברות', hint: 'רק אם יש התגברות',
        requires: (s) => (f(s).canOverride ? null : 'אין פסקת התגברות – אי אפשר לעקוף את הפסיקה'),
        ops: [{ op: 'special', id: 'fx_reenact_yeshiva', label: 'משבר עם בית המשפט' }, REL, { op: 'world', key: 'trust', d: -3, weeks: 8 }],
      },
      { label: 'לשתוק', ops: [{ op: 'special', id: 'fx_strike_yeshiva', label: 'החוק בטל' }] },
    ],
  },
  {
    id: 'court_draft_order', icon: '⚖️', weight: 1.5, cooldown: 80, issue: 'draft',
    title: 'בג"ץ: אין בסיס לפטור – חייבים לגייס',
    body: 'בית המשפט קבע שאין לפטור של בני הישיבות שום בסיס בחוק, והורה לממשלה להתחיל לאכוף. בלי המפלגות החרדיות בקואליציה, אין מי שיפיל את הממשלה על זה – אבל הרחוב החרדי כבר רותח.',
    when: (s) => courtOn(s) && f(s).draft === 'statusQuo' && !f(s).haredimInGov,
    choices: [
      { label: '"פסק הדין יאכף – שוויון בנטל"', ops: [{ op: 'special', id: 'court_draft_ruling', label: 'הסוגיה בוערת' }, SEC, { op: 'momentum', party: '@ctx', d: 1 }] },
      { label: 'לקרוא לחוק מוסכם במקום כפייה', ops: [{ op: 'reputation', d: 2 }, { op: 'consistency', d: -1 }] },
      { label: 'לתקוף את בית המשפט', ops: [REL, { op: 'stance', lean: { judiciary: 70 }, d: 1.5 }] },
    ],
    ctx: harediCtx(false),
  },
  {
    id: 'reservists_exemption', icon: '🎖️', weight: 2.5, cooldown: 40, issue: 'draft',
    title: 'המילואימניקים מול הכנסת',
    body: '"שלושה סבבים בשנה – ואחרים פטורים": אלפי משרתי מילואים מפגינים נגד {what}. ארגוני המשפחות מצטרפים.',
    when: (s) => exemptionInPlace(f(s)) && (isHot(s, 'draft', 40) || weeksSince(s, 'yeshiva') >= 0 && weeksSince(s, 'yeshiva') < 30),
    ctx: (s) => ({ what: f(s).draft === 'exemptionLaw' ? 'חוק מעמד לומדי התורה' : 'הפטור בפועל לבני הישיבות' }),
    choices: [
      { label: 'לנאום מול המילואימניקים', ops: [SEC, { op: 'fame', d: 2 }, { op: 'approval', sector: 'secular', d: 1.5 }] },
      { label: 'להגן על לומדי התורה', ops: [REL, { op: 'approval', sector: 'haredi', d: 2 }, { op: 'approval', sector: 'secular', d: -1.5 }] },
      { label: 'להציע הטבות למשרתים במקום עימות', ops: [{ op: 'reputation', d: 1.5 }, { op: 'approval', sector: 'all', d: 0.5 }] },
    ],
  },
  {
    id: 'exemption_backlash', queued: true, icon: '🪧', title: 'אחרי חוק הפטור: הרחוב החילוני בוער',
    body: 'מיד אחרי ש"{title}" עבר, עשרות אלפים חוסמים את איילון. מילואימניקים מודיעים שלא יתייצבו, וחברות הייטק משחררות עובדים להפגנה.',
    choices: [
      { label: '"החוק יישאר – לימוד תורה הוא שליחות"', ops: [REL, { op: 'world', key: 'cohesion', d: -2, weeks: 4 }] },
      { label: 'להבטיח תיקון שיכלול יעדי שירות', ops: [{ op: 'consistency', d: -2 }, { op: 'world', key: 'cohesion', d: 1, weeks: 4 }, { op: 'special', id: 'fx_haredi_partners_down', label: 'השותפות החרדיות חושדות' }] },
      { label: 'לשתוק', ops: [] },
    ],
  },
  // ---------- חוק גיוס בתוקף ----------
  {
    id: 'draft_arrests', icon: '🚓', weight: 2.5, cooldown: 30, issue: 'draft',
    title: 'מעצרי עריקים בבני ברק',
    body: 'לפי חוק השוויון בנטל, המשטרה הצבאית עצרה בני ישיבות שלא התייצבו. אלפים חוסמים את כביש 4, ורבנים קוראים "לא להתייצב בשום מקרה".',
    when: (s) => draftEnforced(f(s)) && weeksSince(s, 'draft') >= 8,
    ctx: harediCtx(),
    choices: [
      { label: '"החוק חל על כולם"', ops: [SEC, { op: 'approval', sector: 'haredi', d: -2 }, { op: 'world', key: 'cohesion', d: -1, weeks: 4 }] },
      { label: 'לקרוא לעצור את המעצרים ולהידבר', ops: [{ op: 'reputation', d: 1 }, { op: 'world', key: 'cohesion', d: 1, weeks: 4 }, { op: 'approval', sector: 'secular', d: -1 }] },
      { label: 'לבקר בישיבה ולהרגיע', hint: 'מוכרות, סיכון', ops: [{ op: 'fame', d: 2 }, { op: 'approval', sector: 'haredi', d: 2 }] },
    ],
  },
  {
    id: 'draft_sanctions', icon: '💸', weight: 2, cooldown: 52, issue: 'draft',
    title: 'הסנקציות נכנסות לתוקף',
    body: 'יעדי הגיוס לא הושגו, ולפי החוק האוצר מקצץ בתקציבי הישיבות ובהנחות במעונות. {gov}',
    when: (s) => draftEnforced(f(s)) && weeksSince(s, 'draft') >= 26,
    ctx: (s) => ({ gov: f(s).haredimInGov ? 'השותפות החרדיות מציבות אולטימטום.' : 'ההנהגה החרדית מכריזה על "גזירת שמד" ומארגנת עצרת תפילה המונית.' }),
    choices: [
      { label: 'לעמוד מאחורי הסנקציות', ops: [SEC, { op: 'world', key: 'economy', d: 1, weeks: 12 }, { op: 'special', id: 'fx_haredi_partners_down', label: 'השותפות החרדיות זועמות' }] },
      { label: 'לדחות את הסנקציות בשנה', ops: [REL, { op: 'consistency', d: -2 }, { op: 'approval', sector: 'secular', d: -1.5 }] },
    ],
  },
  {
    id: 'draft_success', icon: '🪖', weight: 1.5, cooldown: 70,
    title: 'שיא בגיוס החרדי',
    body: 'צה"ל מדווח: יותר מאלף חרדים התגייסו השנה, ונפתחת חטיבה חרדית שנייה. המפקדים מבקשים מסלולי לימוד ותנאי כשרות מהודרת.',
    when: (s) => draftEnforced(f(s)) && weeksSince(s, 'draft') >= 40,
    choices: [
      { label: 'לטקס ההשבעה – ולקחת קרדיט', ops: [{ op: 'fame', d: 2 }, { op: 'approval', sector: 'secular', d: 1 }, { op: 'approval', sector: 'traditional', d: 1 }] },
      { label: 'לקדם תקציב למסלולים החרדיים', ops: [{ op: 'reputation', d: 2 }, { op: 'approval', sector: 'haredi', d: 1.5 }, { op: 'world', key: 'cohesion', d: 1, weeks: 8 }] },
    ],
  },
  {
    id: 'full_draft_riots', icon: '🔥', weight: 2, cooldown: 40, issue: 'draft',
    title: 'גיוס חובה מלא: מלחמת תרבות',
    body: 'אלפי צווים נשלחו בבת אחת. בשכונות החרדיות שורפים צווים ברחוב, והצבא מודה שאין לו מקום לקלוט את כולם.',
    when: (s) => f(s).draft === 'fullDraft',
    choices: [
      { label: '"אין חזרה – כולם מתגייסים"', ops: [SEC, { op: 'world', key: 'cohesion', d: -3, weeks: 6 }] },
      { label: 'לקדם מתווה הדרגתי', ops: [{ op: 'reputation', d: 2 }, { op: 'consistency', d: -1 }, { op: 'world', key: 'cohesion', d: 2, weeks: 6 }] },
    ],
  },
  // ---------- צבא מקצועי ----------
  {
    id: 'volunteer_shortfall', icon: '🎖️', weight: 2, cooldown: 50,
    title: 'הצבא המקצועי לא מצליח לגייס',
    body: 'אגף כוח האדם: יחידות השדה מאוישות ב-70% בלבד. המשכורות לא מתחרות בהייטק, והרמטכ"ל מבקש תוספת של מיליארדים.',
    when: (s) => f(s).draft === 'volunteer',
    choices: [
      { label: 'להעלות את שכר הלוחמים', ops: [{ op: 'world', key: 'security', d: 2, weeks: 12 }, { op: 'world', key: 'economy', d: -2, weeks: 12 }] },
      { label: '"ההחלטה הייתה טעות" – לקרוא להחזיר גיוס', ops: [{ op: 'stance', lean: { security: 50 }, d: 2 }, { op: 'consistency', d: -1 }] },
    ],
  },
  // ---------- חרדים מחוץ לממשלה ----------
  {
    id: 'haredi_opposition', icon: '📜', weight: 1.5, cooldown: 40,
    title: '{party} באופוזיציה: "נפיל את הממשלה הזו"',
    body: 'מחוץ לקואליציה, {party} פותחת במאבק: חרם על הצבעות, הפגנות מול משרד האוצר ופגישות חשאיות עם מפלגות האופוזיציה.',
    when: (s) => !f(s).haredimInGov && !!harediParty(s, false) && s.player.isMK,
    ctx: harediCtx(false),
    choices: [
      { label: 'להיפגש איתם בשקט', ops: [{ op: 'approval', sector: 'haredi', d: 1.5 }, { op: 'skill', skill: 'negotiation', d: 1 }] },
      { label: '"סוף לסחטנות"', ops: [{ op: 'stance', lean: { religion: -50 }, d: 1.5 }, { op: 'fame', d: 1.5 }] },
    ],
  },
  {
    id: 'haredi_offer', icon: '🤝', weight: 2, cooldown: 30,
    title: '{party} מוכנה להצטרף לממשלה',
    body: 'שליח של מועצת גדולי התורה מגיע ללשכה: {party} תצטרף לקואליציה ותייצב אותה – בתנאי שהממשלה תקדם את חוק מעמד לומדי התורה.',
    when: (s) => isPM(s) && !f(s).haredimInGov && !!harediParty(s, false) && f(s).draft !== 'exemptionLaw' && s.coalition.stability < 60,
    ctx: harediCtx(false),
    choices: [
      { label: 'לסגור את העסקה', hint: 'יציבות, מחיר אצל החילונים', ops: [{ op: 'special', id: 'fx_haredi_join', label: 'מצטרפת לקואליציה' }, REL, { op: 'approval', sector: 'secular', d: -2 }] },
      { label: 'לסרב בנימוס', ops: [{ op: 'reputation', d: 1 }] },
    ],
  },
];

registerSpecial('fx_strike_yeshiva', (s) => {
  strikeLaw(s, 'yeshiva');
  bumpIssue(s, 'draft', 20);
  toHarediPartners(s, -14);
  addNews(s, 'בג"ץ פסל את חוק מעמד לומדי התורה', 'neutral', false, 'הפטור בטל; המדינה צריכה לגבש מתווה גיוס.', 'ערוץ המשכן');
  return 'חוק הפטור בוטל';
});
registerSpecial('fx_reenact_yeshiva', (s) => {
  addWorldEffect(s, 'trust', -3, 8, 'עקיפת בג"ץ');
  toHarediPartners(s, 8);
  toSecularPartners(s, -8);
  addNews(s, 'הכנסת חוקקה מחדש את חוק הפטור בפסקת התגברות', 'bad', false, 'האופוזיציה: "ירייה ברגל של שלטון החוק".', 'ערוץ המשכן');
  return 'הפטור נשאר – בעקיפת בית המשפט';
});
registerSpecial('fx_haredi_partners_down', (s) => toHarediPartners(s, -8));
registerSpecial('fx_haredi_join', (s, ctx) => {
  const p = s.parties[ctx.party];
  if (!p || s.coalition.parties.includes(p.id)) return;
  s.coalition.parties.push(p.id);
  s.coalition.satisfaction[p.id] = 70;
  s.flags.promisedExemption = s.week;
  toSecularPartners(s, -10);
  addNews(s, `${p.name} מצטרפת לקואליציה; בהסכם: חוק מעמד לומדי התורה`, 'neutral', true, undefined, 'ערוץ המשכן');
  return `${p.name} בקואליציה`;
});
