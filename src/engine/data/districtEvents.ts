// אירועי מחוזות: עבודה מקומית, מחוז על הסף, מתמודד עצמאי, ותגובות לשינויי שיטת הבחירות.
// מופיעים רק כשיש מחוזות בשיטה (districtShare > 0) – בשיטה ארצית אין "מחוז בית".
import { registerSpecial } from '../ops';
import { addNews } from '../systems/news';
import { boostDistrict, districtShares, localLeader, playerDistrict, systemKind, usesDistricts } from '../systems/districts';
import type { GameState } from '../types';
import { districtById } from './districts';
import type { GameEvent } from './events';

const mine = (s: GameState) => !!s.player.partyId && !!s.player.isMK && usesDistricts(s);
const home = (s: GameState) => districtById(playerDistrict(s))!;
const homeCtx = (s: GameState) => ({ district: home(s).id, districtName: home(s).name });
const toElection = (s: GameState) => s.electionWeek - s.week;

/** מצב המחוז של השחקן: מי מוביל ובכמה, והאם המפלגה שלו מובילה */
function homeStatus(s: GameState) {
  const sh = districtShares(s)[playerDistrict(s)] ?? {};
  const lead = localLeader(sh);
  const myShare = sh[s.player.partyId ?? ''] ?? 0;
  const top = sh[lead.id] ?? 0;
  return { lead, myShare, gap: top - myShare, leading: lead.id === s.player.partyId };
}

export const DISTRICT_EVENTS: GameEvent[] = [
  {
    id: 'dist_system_changed', queued: true, icon: '🗺️', title: 'שיטת בחירות חדשה: {title}',
    body: 'הבחירות הבאות כבר לא יהיו כמו שהכרנו. עכשיו גם המחוז שלך קובע: מי שמנצח מקומית – נבחר, גם בלי מקום ברשימה. מפלגות קטנות ופזורות בסכנה, ומועמדים עם שורשים מקומיים מתחזקים.',
    choices: [
      { label: 'להשקיע במחוז הבית', hint: 'סיור, חוגי בית וקשרים מקומיים', ops: [{ op: 'special', id: 'dist_focus_home', label: 'המחוז שלך מתחזק' }, { op: 'fame', d: 1 }] },
      { label: 'להמשיך בקמפיין הארצי', ops: [{ op: 'fame', d: 1.5 }] },
      { label: 'לקרוא להחזיר את השיטה הקודמת', ops: [{ op: 'stance', lean: { judiciary: -50 }, d: 1.5 }, { op: 'reputation', d: 1 }] },
    ],
  },
  {
    id: 'dist_gerry_outcry', queued: true, icon: '✂️', title: 'מחאה על שרטוט המחוזות',
    body: '"{title}" עבר, והמפות החדשות חושפות הכול: מחוזות אופוזיציה "ארוזים" למעטים, והשאר מפוזרים. ארגוני חברה אזרחית עותרים, ובכיכרות נשמעים קריאות "בחירות הוגנות".',
    choices: [
      { label: 'להצטרף למחאה', ops: [{ op: 'stance', lean: { judiciary: -60 }, d: 2 }, { op: 'fame', d: 2 }] },
      { label: '"הגבולות מקצועיים וחוקיים"', ops: [{ op: 'stance', lean: { judiciary: 60 }, d: 1.5 }, { op: 'reputation', d: -1 }] },
      { label: 'לא להתערב', ops: [] },
    ],
  },
  {
    id: 'dist_electoral_upset', queued: true, icon: '🇺🇸', title: '{winner} ניצח/ה באלקטורים – {loser} בקולות',
    body: '{loser} קיבל/ה יותר קולות ברחבי הארץ, אבל {winner} ניצח/ה בחמישה מחוזות מרכזיים ולכן הוא/היא ראש/ת הממשלה. בטלוויזיה מתווכחים אם זו "שיטה מטורפת" או "שיטה שמכריחה לבנות קואליציית מחוזות".',
    choices: [
      { label: 'לקרוא לבטל את האלקטורים', ops: [{ op: 'stance', lean: { judiciary: -40 }, d: 1.5 }, { op: 'fame', d: 1.5 }] },
      { label: '"הכללים ידועים מראש"', ops: [{ op: 'stance', lean: { judiciary: 40 }, d: 1.5 }, { op: 'reputation', d: 0.5 }] },
      { label: 'לחכות', ops: [] },
    ],
  },
  {
    id: 'dist_local_demand', icon: '🏗️', weight: 2, cooldown: 40,
    title: 'ראש מועצה ב{districtName} מבקש טובה',
    body: 'ראש מועצה במחוז שלך פנה אליך: דרוש אישור לגשר, בית חולים או כביש עוקף. "בלי זה לא אוכל לתמוך בך בקלפי". הוא יודע שאת/ה צריך/ה אותו.',
    when: (s) => mine(s),
    ctx: homeCtx,
    choices: [
      { label: 'להבטיח ולקדם', hint: 'הון פוליטי, מחזק מקומית', ops: [{ op: 'capital', d: -4 }, { op: 'special', id: 'dist_boost_big', label: 'המחוז מתחזק' }] },
      { label: 'להפנות לצוות', hint: 'פחות מחויב, פחות אפקטיבי', ops: [{ op: 'money', d: -20 }, { op: 'special', id: 'dist_boost_small', label: 'המחוז מתחזק מעט' }] },
      { label: 'לסרב: "זו לא עדיפות"', ops: [{ op: 'special', id: 'dist_hurt', label: 'המחוז מתרחק' }, { op: 'reputation', d: 1 }] },
    ],
  },
  {
    id: 'dist_marginal', icon: '🎯', weight: 2.5, cooldown: 30,
    title: '{districtName}: מחוז על הסף',
    body: 'סקר מקומי: המחוז שלך צמוד – {gap} נקודות בלבד מפרידות בין המובילה לבין המפלגה שלך. כל חוג בית יכול להכריע, והיריבים כבר שולחים פעילים.',
    when: (s) => mine(s) && toElection(s) <= 60 && homeStatus(s).gap < 5 && homeStatus(s).myShare > 8,
    ctx: (s) => ({ ...homeCtx(s), gap: String(Math.round(homeStatus(s).gap * 10) / 10) }),
    choices: [
      { label: 'קמפיין ממומן במחוז', hint: '₪25K', ops: [{ op: 'money', d: -25 }, { op: 'special', id: 'dist_boost_big', label: 'המחוז מתחזק' }] },
      { label: 'לבקש מהיו"ר להגיע', ops: [{ op: 'att', who: '@leader', d: -3 }, { op: 'special', id: 'dist_boost_small', label: 'ביקור היו"ר' }] },
      { label: 'לסמוך על העבודה הרגילה', ops: [] },
    ],
  },
  {
    id: 'dist_independent', icon: '🧑‍🌾', weight: 1.2, cooldown: 60,
    title: 'מועמד עצמאי פופולרי ב{districtName}',
    body: 'רופא מקומי אהוד מכריז שיתמודד כעצמאי במחוז שלך. הסקרים המקומיים נותנים לו נתח לא קטן, והוא לוקח קולות משני הצדדים – אבל בעיקר ממך.',
    when: (s) => mine(s) && toElection(s) <= 80 && systemKind(s) !== 'pr',
    ctx: homeCtx,
    choices: [
      { label: 'להזמין אותו לשיחה ולהציע שיתוף פעולה', ops: [{ op: 'reputation', d: 1.5 }, { op: 'special', id: 'dist_boost_small', label: 'שיתוף פעולה' }] },
      { label: 'לתקוף אותו כ"מפצל קולות"', ops: [{ op: 'fame', d: 1 }, { op: 'special', id: 'dist_hurt', label: 'התדמית נפגעת' }] },
      { label: 'להתעלם', ops: [{ op: 'special', id: 'dist_hurt_small', label: 'הוא מתחזק' }] },
    ],
  },
  {
    id: 'dist_wasted_vote', icon: '🗑️', weight: 1.2, cooldown: 50,
    title: '"קול אבוד": מצביעי הקטנות עוברים',
    body: 'בשיטה המחוזית מצביעים רבים מבינים שמפלגה קטנה לא תנצח באף מחוז, ועוברים לגדולות. ראשי המפלגות הקטנות אומרים: "זו שיטה שמוחקת קולות".',
    when: (s) => !!s.player.partyId && systemKind(s) !== 'pr' && Object.values(s.parties).some((p) => p.id !== s.player.partyId && p.poll > 1 && p.poll < 5),
    choices: [
      { label: 'לקרוא להצבעה אסטרטגית', hint: 'המפלגה שלך מתחזקת', ops: [{ op: 'momentum', party: '@player', d: 0.8 }, { op: 'fame', d: 1 }] },
      { label: 'לדרוש שיטה יחסית', ops: [{ op: 'stance', lean: { judiciary: -30 }, d: 1.5 }, { op: 'reputation', d: 1 }] },
      { label: 'להתעלם', ops: [] },
    ],
  },
];

registerSpecial('dist_focus_home', (s) => boostDistrict(s, playerDistrict(s), s.player.partyId, 5));
registerSpecial('dist_boost_big', (s, ctx) => boostDistrict(s, ctx.district || playerDistrict(s), s.player.partyId, 5));
registerSpecial('dist_boost_small', (s, ctx) => boostDistrict(s, ctx.district || playerDistrict(s), s.player.partyId, 2));
registerSpecial('dist_hurt', (s, ctx) => {
  boostDistrict(s, ctx.district || playerDistrict(s), s.player.partyId, -3);
  addNews(s, `${s.player.name} מאבד/ת תמיכה ב${districtById(ctx.district || playerDistrict(s))?.name ?? 'מחוז הבית'}`, 'bad', true);
});
registerSpecial('dist_hurt_small', (s, ctx) => boostDistrict(s, ctx.district || playerDistrict(s), s.player.partyId, -1.5));
