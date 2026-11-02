// "מה עושים השבוע": תדריך שבועי למסך הבית – מה דחוף, ו-3 פעולות מומלצות לפי מה שהכי חסר עכשיו.
// פונקציות טהורות (לא משנות מצב) ודטרמיניסטיות – בלי אקראיות, כדי שההמלצה לא תקפוץ בין רינדורים.
import type { GameState } from '../types';
import { ACTIONS, actionBlocked, type ActionDef } from '../actions';
import { LOCATIONS, locationLock } from '../data/locations';
import { describeOps, type OpChip } from '../ops';
import { avgApproval } from '../util';
import { isCoalition } from './government';
import { inSession } from '../calendar';

/** צרכים שפעולה יכולה לענות עליהם */
export type Need = 'fame' | 'approval' | 'reputation' | 'capital' | 'money' | 'standing' | 'campaign' | 'skill' | 'consistency';

export const NEED_LABEL: Record<Need, string> = {
  fame: 'מוכרות',
  approval: 'תדמית',
  reputation: 'מוניטין',
  capital: 'הון פוליטי',
  money: 'כסף',
  standing: 'מעמד במפלגה',
  campaign: 'קמפיין',
  skill: 'מיומנויות',
  consistency: 'עקביות',
};

/** מה כל פעולה "עושה" – לצורך ההמלצה בלבד (ההשפעה האמיתית ב-run של הפעולה) */
const HELPS: Record<string, Need[]> = {
  speech: ['fame', 'skill'],
  query: ['fame', 'reputation'],
  motion: ['fame', 'consistency'],
  gallery: ['skill'],
  attend: ['reputation', 'skill'],
  accompany: ['standing', 'skill'],
  office_work: ['reputation', 'approval'],
  study: ['skill', 'reputation'],
  mingle: ['capital'],
  gossip: ['capital'],
  faction_meeting: ['standing'],
  dissent: ['consistency', 'fame'],
  protesters: ['approval', 'fame'],
  press: ['fame'],
  lobby: ['money'],
  interview: ['fame', 'approval'],
  oped: ['reputation', 'fame'],
  debate: ['fame', 'approval'],
  social: ['fame'],
  fundraise: ['money'],
  members: ['standing', 'campaign'],
  primaries_campaign: ['campaign', 'standing'],
  recruit: ['campaign'],
  home_circle: ['approval', 'campaign'],
  outreach: ['approval'],
  periphery: ['approval', 'fame'],
  ministry_tour: ['reputation'],
  rally: ['campaign', 'fame', 'standing'],
  digital: ['campaign', 'approval'],
  press_dinner: ['fame', 'reputation'],
  coalition_funds: ['approval', 'capital'],
};

export interface Recommendation {
  id: string;
  icon: string;
  label: string;
  /** למה דווקא עכשיו */
  why: string;
  ap: number;
  money?: number;
  capital?: number;
  /** השפעה צפויה (תצוגה מקדימה) */
  chips: OpChip[];
  where: string;
}

export interface Alert {
  id: string;
  icon: string;
  text: string;
  tone: 'bad' | 'warn' | 'good' | 'neutral';
  /** לאן ללחוץ */
  go?: { tab?: 'map' | 'dashboard' | 'people' | 'laws'; panel?: string };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function campaignSeason(s: GameState) {
  const toElection = s.electionWeek - s.week;
  const toPrimaries = s.primariesWeek - s.week;
  return (toElection > 0 && toElection <= 26) || (toPrimaries > 0 && toPrimaries <= 12 && s.player.wantsList);
}

/** כמה חסר כל דבר עכשיו (0 = בסדר, 1 = דחוף) */
export function needs(s: GameState): Record<Need, number> {
  const p = s.player;
  const toElection = s.electionWeek - s.week;
  const toPrimaries = s.primariesWeek - s.week;
  const outsider = !p.isMK;
  return {
    fame: clamp01((65 - p.fame) / 55) * (outsider ? 1.2 : 1),
    approval: clamp01((56 - avgApproval(s)) / 18) * (toElection <= 26 ? 1.3 : 1),
    reputation: clamp01((55 - p.reputation) / 45) * 0.8,
    capital: clamp01((30 - p.capital) / 30) * (p.isMK ? 0.9 : 0.4),
    money: clamp01((45 - p.money) / 45) * 1.1,
    standing: clamp01((60 - p.partyStanding) / 50) * (p.partyId ? (p.wantsList && toPrimaries > 0 ? 1.4 : 0.8) : 0),
    campaign: campaignSeason(s) ? 0.9 : 0,
    skill: 0.25,
    consistency: clamp01((50 - p.consistency) / 40) * 0.6,
  };
}

const why = (n: Need, s: GameState): string => {
  const p = s.player;
  switch (n) {
    case 'fame':
      return p.fame < 30 ? `רק ${Math.round(p.fame)} מוכרות – עוד לא מכירים אותך` : `מוכרות ${Math.round(p.fame)} – אפשר לעלות עוד`;
    case 'approval':
      return `התדמית שלך ${Math.round(avgApproval(s))} – צריך לחזק אותה`;
    case 'reputation':
      return `מוניטין ${Math.round(p.reputation)} – עמיתים עוד לא סומכים עליך`;
    case 'capital':
      return `רק ${Math.round(p.capital)} הון פוליטי – אין במה לסחור`;
    case 'money':
      return `נשארו ₪${Math.round(p.money)}K – הקופה מתרוקנת`;
    case 'standing':
      return p.wantsList ? `מעמד במפלגה ${Math.round(p.partyStanding)} – קובע את המקום ברשימה` : `מעמד במפלגה ${Math.round(p.partyStanding)}`;
    case 'campaign':
      return s.electionWeek - s.week <= 26 ? `${s.electionWeek - s.week} שבועות לבחירות` : `${s.primariesWeek - s.week} שבועות לסגירת הרשימות`;
    case 'skill':
      return 'משקיע/ה בעצמך לטווח ארוך';
    case 'consistency':
      return `עקביות ${Math.round(p.consistency)} – הציבור לא בטוח במה את/ה מאמין/ה`;
  }
};

/** הציון של פעולה לפי הצרכים, פחות מחיר */
function score(s: GameState, a: ActionDef, need: Record<Need, number>): { v: number; top: Need } | null {
  const helps = HELPS[a.id];
  if (!helps) return null;
  let v = 0;
  let top: Need = helps[0];
  helps.forEach((h, i) => {
    const w = need[h] * (i === 0 ? 1 : 0.6);
    v += w;
    if (need[h] > need[top]) top = h;
  });
  // יעילות: ציון לכל נקודת זמן, עם עונש קל על כסף והון
  v = v / Math.sqrt(Math.max(1, a.ap));
  if (a.money) v -= (a.money / Math.max(20, s.player.money)) * 0.5;
  if (a.capital) v -= a.capital / Math.max(10, s.player.capital) * 0.4;
  // לא לחזור על אותה פעולה שוב ושוב
  const done = s.counters[`act_${a.id}`] ?? 0;
  v -= Math.min(0.15, done * 0.01);
  return { v, top };
}

/** 3 פעולות מומלצות לשבוע הזה (שאפשר לבצע עכשיו) */
export function recommend(s: GameState, n = 3): Recommendation[] {
  if (s.presidency && s.president?.id === 'player') return [];
  const need = needs(s);
  const scored = ACTIONS.flatMap((a) => {
    if (locationLock(s, a.loc)) return [];
    if (actionBlocked(s, a)) return [];
    const r = score(s, a, need);
    return r && r.v > 0.05 ? [{ a, ...r }] : [];
  }).sort((x, y) => y.v - x.v || x.a.id.localeCompare(y.a.id));
  // גיוון: לא שתי פעולות שעונות על אותו צורך עיקרי, אם אפשר
  const out: typeof scored = [];
  for (const x of scored) if (out.length < n && !out.some((o) => o.top === x.top)) out.push(x);
  for (const x of scored) if (out.length < n && !out.includes(x)) out.push(x);
  return out.map(({ a, top }) => ({
    id: a.id,
    icon: a.icon,
    label: a.label,
    why: why(top, s),
    ap: a.ap,
    money: a.money,
    capital: a.capital,
    chips: a.preview ? describeOps(s, a.preview(s)) : HELPS[a.id].slice(0, 2).map((h) => ({ label: `${NEED_LABEL[h]} ▲`, tone: 'good' as const })),
    where: LOCATIONS[a.loc].name,
  }));
}

/** מה דחוף השבוע */
export function alerts(s: GameState): Alert[] {
  const p = s.player;
  const out: Alert[] = [];
  const toElection = s.electionWeek - s.week;
  const toPrimaries = s.primariesWeek - s.week;
  const pres = !!s.presidency && s.president?.id === 'player';
  if (s.scandal) out.push({ id: 'scandal', icon: '🚨', text: `פרשת ${s.scandal.source}: חום התיק ${Math.round(s.scandal.heat)}`, tone: 'bad', go: { tab: 'dashboard' } });
  if (s.negotiation) out.push({ id: 'negotiation', icon: '🤝', text: 'משא ומתן קואליציוני מחכה לך', tone: 'warn', go: { panel: 'negotiation' } });
  if (!pres && !p.partyId && !p.isMK) out.push({ id: 'party', icon: '🔀', text: 'עוד אין לך מפלגה – הצטרפ/י או הקם/י אחת', tone: 'warn', go: { panel: 'party' } });
  if (!pres && p.partyId && !p.isMK && !p.wantsList && toPrimaries > 0 && toPrimaries <= 8)
    out.push({ id: 'list', icon: '🗳️', text: `הרשימות נסגרות בעוד ${toPrimaries} שבועות – עוד לא הגשת מועמדות`, tone: 'warn', go: { tab: 'map' } });
  if (toElection > 0 && toElection <= 6) out.push({ id: 'election', icon: '🗳️', text: `בחירות בעוד ${toElection} שבועות`, tone: 'warn' });
  const mine = s.bills.filter((b) => (b.sponsor === 'player' || b.sponsor === p.employerId) && ['preliminary', 'first', 'final'].includes(b.stage));
  if (mine.length && inSession(s)) out.push({ id: 'bills', icon: '📜', text: `${mine.length === 1 ? `"${mine[0].title}" מחכה` : `${mine.length} הצעות מחכות`} להצבעה`, tone: 'good', go: { tab: 'laws' } });
  if (p.partyId && isCoalition(s, p.partyId) && s.coalition.stability < 35) out.push({ id: 'stability', icon: '⚠️', text: `הקואליציה מתנדנדת (יציבות ${Math.round(s.coalition.stability)})`, tone: 'bad', go: { tab: 'dashboard' } });
  const bad = s.news.find((n) => n.aboutPlayer && n.tone === 'bad' && s.week - n.week <= 1);
  if (bad) out.push({ id: 'news', icon: '📰', text: bad.headline, tone: 'bad', go: { tab: 'dashboard' } });
  const owe = p.debts.filter((d) => d.dir === 'player_owes').length;
  if (owe >= 2) out.push({ id: 'debts', icon: '🧾', text: `את/ה חייב/ת טובות ל-${owe} אנשים – הם יבואו לגבות`, tone: 'neutral', go: { tab: 'dashboard' } });
  if (p.money < 10) out.push({ id: 'money', icon: '💸', text: 'הקופה כמעט ריקה', tone: 'bad' });
  return out.slice(0, 4);
}

/** התדריך השבועי למסך הבית */
export function weekBrief(s: GameState) {
  return { alerts: alerts(s), recs: recommend(s) };
}

/** היעד הבא בקריירה – משפט אחד */
export function nextGoal(s: GameState): string {
  const p = s.player;
  const toElection = s.electionWeek - s.week;
  const toPrimaries = s.primariesWeek - s.week;
  if (s.presidency && s.president?.id === 'player') return 'לאחד את העם ולהשאיר את המדינה במצב טוב: פעולות שבועיות ויוזמות בלשונית "נשיאות".';
  if (!p.partyId && !p.isMK) return 'הצטרף/י למפלגה או הקם/י אחת – במטה המפלגה.';
  if (!p.isMK && !p.wantsList && toPrimaries > 0) return `הגש/י מועמדות לרשימה במטה המפלגה (הרשימות נסגרות בעוד ${toPrimaries} שבועות).`;
  if (!p.isMK && p.wantsList && toPrimaries > 0) return 'בנה/י תמיכה לקראת הרכבת הרשימה: כנסי מתפקדים, קמפיין, ותמיכת ח"כים בכירים.';
  if (!p.isMK) return `הבחירות בעוד ${toElection} שבועות. כל נקודת תדמית חשובה.`;
  if (s.negotiation) return 'משא ומתן קואליציוני בעיצומו – פתח/י אותו מהמפה.';
  if (s.coalition.pmId === 'player') return 'לשמור על הקואליציה, להעביר את סעיפי ההסכם ואת התקציב – ולשרוד עד הבחירות.';
  if (p.ministry) return 'להשיק תכניות דגל, להעלות את ביצועי המשרד – ולבנות בסיס לראשות המפלגה.';
  if (!s.bills.some((b) => b.sponsor === 'player')) return 'הגש/י הצעת חוק ראשונה – באגף הלשכות.';
  if (!p.achievements.includes('first_law')) return 'העבר/י חוק בשלוש קריאות. גייס/י תומכים לפני כל הצבעה.';
  if (p.partyId && s.parties[p.partyId].leaderId === 'player') return 'כיו"ר מפלגה: להגדיל את המפלגה בסקרים – הגדולה בגוש מקבלת את המנדט להרכיב ממשלה.';
  return 'בנה/י כוח: ראשות ועדה, תיק בממשלה, ובסוף – התמודדות על ראשות המפלגה (במטה).';
}
