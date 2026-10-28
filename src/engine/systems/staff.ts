// הצוות: עוזר/ת, דובר/ת, יועץ/ת אסטרטגי/ת, סוקר/ת, מנהל/ת קמפיין ויועץ/ת משפטי/ת.
// לכל אחד/ת: השפעה שבועית, יכולת פעילה (עולה זמן, עם קירור), והמלצה לפי המצב.
import { addStat } from '../stats';
import { makeName } from '../data/names';
import { makeAvatar } from '../avatarGen';
import { chance, makeLocalRng } from '../rng';
import type { GameState, Sector, Staff, StaffRole } from '../types';
import { SECTORS, SECTOR_NAMES, clamp, newId } from '../util';
import { addNews } from './news';
import { addMomentum, changeApproval, pollSeats } from './opinion';
import { latestSurvey } from './surveys';
import { sectorWeights } from './society';
import { ISSUES } from '../data/issues';

export const STAFF_ROLES: Record<StaffRole, { m: string; f: string; icon: string; desc: string }> = {
  aide: { m: 'עוזר פרלמנטרי', f: 'עוזרת פרלמנטרית', icon: '🗂️', desc: '+1 זמן בשבוע. ברמה 4+ עוד +1.' },
  spokesperson: { m: 'דובר', f: 'דוברת', icon: '🎙️', desc: 'מוכרות עולה כל שבוע, פעולות תקשורת חזקות יותר. יכולת: ספין לכותרת רעה.' },
  advisor: { m: 'יועץ אסטרטגי', f: 'יועצת אסטרטגית', icon: '♟️', desc: 'הון פוליטי כל שבוע, משא ומתן טוב יותר. יכולת: הערכת מצב.' },
  pollster: { m: 'סוקר אישי', f: 'סוקרת אישית', icon: '📊', desc: 'יכולת: סקר פנימי – המנדטים האמיתיים, והמגזר שהכי כדאי לעבוד עליו.' },
  campaign: { m: 'מנהל קמפיין', f: 'מנהלת קמפיין', icon: '📣', desc: 'לקראת בחירות ופריימריז: מומנטום ותמיכה כל שבוע. יכולת: קמפיין בזק.' },
  legal: { m: 'יועץ משפטי', f: 'יועצת משפטית', icon: '⚖️', desc: 'מחזק/ת חקיקה, ומאט/ה חקירות. יכולת: חוות דעת.' },
};

const ROLES = Object.keys(STAFF_ROLES) as StaffRole[];

/** כמה תקנים: לח"כ 4, לשר/ה, יו"ר מפלגה וראש ממשלה 5, מחוץ לכנסת 2 */
export function maxStaff(s: GameState): number {
  const p = s.player;
  const senior = !!p.ministry || s.coalition.pmId === 'player' || (p.partyId && s.parties[p.partyId]?.leaderId === 'player');
  return senior ? 5 : p.isMK ? 4 : 2;
}
/** עלות שבועית (אלפי ₪). לח"כ – תקציב הכנסת משלם על העוזרים. */
export const staffCost = (s: GameState, st: Staff) => (s.player.isMK ? 0 : 2 * st.level);

/** מועמדים לגיוס – דטרמיניסטי לפי שבוע, כדי שלא יתחלפו בכל רענון. */
export function staffCandidates(s: GameState): Staff[] {
  const rnd = makeLocalRng(s.seed + s.week * 977);
  const used = new Set<string>(s.player.staff.map((x) => x.name));
  return ROLES.flatMap((role) =>
    [0, 1].map((k) => {
      const gender = rnd() < 0.5 ? 'm' : 'f';
      const level = 1 + Math.floor(rnd() * 3) + (k === 1 && s.player.reputation > 55 ? 1 : 0);
      return {
        id: `cand-${role}-${k}`,
        name: makeName(rnd, rnd() < 0.85 ? 'jewish' : 'arab', gender, used),
        gender,
        role,
        level,
        loyalty: 40 + Math.floor(rnd() * 40),
        avatar: { ...makeAvatar(rnd, gender, 'jewish'), age: 24 + Math.floor(rnd() * 15) },
        hiredWeek: s.week,
      } satisfies Staff;
    }),
  );
}

export function hireStaff(s: GameState, cand: Staff): string {
  if (s.player.staff.length >= maxStaff(s)) return 'אין תקן פנוי בלשכה';
  if (s.player.staff.some((x) => x.role === cand.role)) return 'כבר יש לך מישהו בתפקיד הזה';
  const req = cand.level * 8;
  if (s.player.reputation < req) return `ברמה ${cand.level} הוא/היא מצפה למוניטין של ${req} לפחות`;
  s.player.staff.push({ ...cand, id: newId(s, 'st'), hiredWeek: s.week });
  recomputeAp(s);
  return `${cand.name} הצטרף/ה ללשכה.`;
}

export function fireStaff(s: GameState, id: string): string {
  const st = s.player.staff.find((x) => x.id === id);
  if (!st) return '';
  s.player.staff = s.player.staff.filter((x) => x.id !== id);
  recomputeAp(s);
  if (st.loyalty < 40) s.flags.disgruntledStaff = st.name;
  return `${st.name} סיים/ה את עבודתו/ה.`;
}

export function recomputeAp(s: GameState) {
  const aide = s.player.staff.find((x) => x.role === 'aide');
  const base = s.player.isMK ? 6 : 5;
  s.player.apMax = base + (aide ? 1 + (aide.level >= 4 ? 1 : 0) : 0);
}

const campaignSeason = (s: GameState) => {
  const toElection = s.electionWeek - s.week;
  const toPrimaries = s.primariesWeek - s.week;
  return (toElection > 0 && toElection <= 26) || (toPrimaries > 0 && toPrimaries <= 12);
};

export function tickStaff(s: GameState) {
  const p = s.player;
  for (const st of p.staff) {
    if (st.role === 'spokesperson') addStat(s, 'fame', 0.15 * st.level);
    if (st.role === 'advisor') p.capital += 0.25 * st.level;
    if (st.role === 'legal') p.skills.law = clamp(p.skills.law + 0.05 * st.level, 0, 100);
    if (st.role === 'legal' && s.scandal && chance(s, 0.04 * st.level)) s.scandal.nextWeek += 1; // החקירה מתעכבת
    if (st.role === 'campaign' && campaignSeason(s)) {
      if (p.partyId && s.parties[p.partyId]?.leaderId === 'player') addMomentum(s, p.partyId, 0.08 * st.level);
      if (p.wantsList) p.primariesScore += 0.4 * st.level;
    }
    p.money -= staffCost(s, st);
    const target = 40 + p.reputation * 0.4;
    st.loyalty = clamp(st.loyalty + (target - st.loyalty) * 0.05, 0, 100);
    if ((s.week - st.hiredWeek) % 26 === 25 && st.level < 5) st.level += 1;
    // איש צוות ממורמר עלול להדליף
    if (st.loyalty < 30 && chance(s, 0.03)) {
      addStat(s, 'reputation', -3);
      addNews(s, `מקורב ל${p.name} מדליף: "בלשכה יש אווירה קשה"`, 'bad', true, `לפי ההערכות, ההדלפה הגיעה מ${STAFF_ROLES[st.role][st.gender]}.`);
    }
  }
}

export const staffBonus = (s: GameState, role: StaffRole) => s.player.staff.find((x) => x.role === role)?.level ?? 0;

// ---------------- יכולות פעילות ----------------

export interface StaffAbility {
  role: StaffRole;
  label: string;
  desc: string;
  ap: number;
  cd: number;
}

export const ABILITIES: Partial<Record<StaffRole, StaffAbility>> = {
  spokesperson: { role: 'spokesperson', label: 'ספין', desc: 'מנטרל/ת כותרת רעה מהשבועיים האחרונים: תדמית ומוכרות', ap: 1, cd: 3 },
  advisor: { role: 'advisor', label: 'הערכת מצב', desc: 'שלוש המלצות מדויקות + הון פוליטי', ap: 1, cd: 4 },
  pollster: { role: 'pollster', label: 'סקר פנימי', desc: 'המנדטים האמיתיים שלך, והמגזר שכדאי לעבוד עליו', ap: 1, cd: 4 },
  campaign: { role: 'campaign', label: 'קמפיין בזק', desc: 'שלטי חוצות, סרטון ויראלי ומתנדבים (12 אלף ₪)', ap: 1, cd: 6 },
  legal: { role: 'legal', label: 'חוות דעת', desc: 'בדיקה משפטית: מקטינה את הנזק מחקירה, או מחזקת את ההצעה שלך', ap: 1, cd: 6 },
};

export function abilityBlocked(s: GameState, role: StaffRole): string | null {
  const a = ABILITIES[role];
  const st = s.player.staff.find((x) => x.role === role);
  if (!a || !st) return 'אין מי שיעשה את זה';
  if (s.player.ap < a.ap) return 'אין מספיק זמן השבוע';
  const last = Number(s.flags[`ability_${role}`] ?? -99);
  if (s.week - last < a.cd) return `בקירור עוד ${a.cd - (s.week - last)} שבועות`;
  if (role === 'campaign' && s.player.money < 12) return 'נדרשים 12 אלף ₪';
  return null;
}

/** המגזר שבו הכי משתלם לעבוד: גדול באוכלוסייה, ותדמית נמוכה בו */
function bestSector(s: GameState): Sector {
  const w = sectorWeights(s);
  return [...SECTORS].sort((a, b) => w[b] * (100 - s.player.approval[b]) - w[a] * (100 - s.player.approval[a]))[0];
}

export function staffAbility(s: GameState, role: StaffRole): { ok: boolean; text: string; lines?: string[] } {
  const blocked = abilityBlocked(s, role);
  if (blocked) return { ok: false, text: blocked };
  const st = s.player.staff.find((x) => x.role === role)!;
  const a = ABILITIES[role]!;
  s.player.ap -= a.ap;
  s.flags[`ability_${role}`] = s.week;
  const lv = st.level;
  const p = s.player;
  const who = st.name;
  if (role === 'spokesperson') {
    const bad = s.news.find((n) => n.aboutPlayer && n.tone === 'bad' && s.week - n.week <= 2);
    if (!bad) {
      addStat(s, 'fame', 0.5 * lv);
      return { ok: true, text: `${who}: "אין מה לכבות – אז הצגנו את העבודה שלך." מוכרות עלתה מעט.` };
    }
    changeApproval(s, 'all', 0.8 * lv);
    addStat(s, 'fame', 0.5);
    addNews(s, `לשכת ${p.name}: "הדברים הוצאו מהקשרם"`, 'neutral', true);
    return { ok: true, text: `${who} עבד/ה על הספין: "${bad.headline}" כבר לא נשמע כל כך רע.`, lines: [`תדמית +${(0.8 * lv).toFixed(1)}`] };
  }
  if (role === 'advisor') {
    p.capital += 1 + lv;
    return { ok: true, text: `${who} – הערכת מצב:`, lines: staffAdvice(s).filter((x) => x.role !== 'advisor').slice(0, 3).map((x) => x.text).concat([`הון פוליטי +${1 + lv}`]) };
  }
  if (role === 'pollster') {
    const party = p.partyId ? s.parties[p.partyId] : null;
    const sec = bestSector(s);
    const sv = latestSurvey(s);
    const lines = [
      party ? `${party.name}: ${pollSeats(party.poll, s.rules.threshold)} מנדטים בפועל (בסקר הפומבי: ${sv?.seats[party.id] ?? '?'})` : 'אין לך מפלגה – אבל הציבור מכיר אותך.',
      `המגזר שהכי כדאי לעבוד עליו: ${SECTOR_NAMES[sec]} (תדמית ${Math.round(p.approval[sec])})`,
      `הנושא שהכי בוער לציבור: ${ISSUES.find((i) => i.id === [...Object.entries(s.issues)].sort((x, y) => y[1] - x[1])[0][0])?.name ?? '?'}`,
    ];
    changeApproval(s, sec, 0.3 * lv);
    return { ok: true, text: `${who} – סקר פנימי:`, lines };
  }
  if (role === 'campaign') {
    p.money -= 12;
    addStat(s, 'fame', 1 + lv * 0.5);
    if (p.partyId) addMomentum(s, p.partyId, 0.4 + lv * 0.3);
    if (p.wantsList) p.primariesScore += lv * 2;
    return { ok: true, text: `${who} הוציא/ה קמפיין בזק לשטח. השלטים כבר על האיילון.`, lines: [`מוכרות +${(1 + lv * 0.5).toFixed(1)}`] };
  }
  if (role === 'legal') {
    if (s.scandal) {
      s.scandal.heat = clamp(s.scandal.heat - 6 * lv, 0, 100);
      s.scandal.nextWeek += lv;
      return { ok: true, text: `${who} הגיש/ה חוות דעת לפרקליטות. החקירה מאטה והלחץ התקשורתי יורד.` };
    }
    p.skills.law = clamp(p.skills.law + lv, 0, 100);
    return { ok: true, text: `${who} עבר/ה על ההצעות שלך סעיף-סעיף. מיומנות משפט וחקיקה +${lv}.` };
  }
  return { ok: false, text: 'לא זמין' };
}

// ---------------- המלצות ----------------

/** מה הצוות ממליץ השבוע (לפי המצב) – מוצג בלוח */
export function staffAdvice(s: GameState): { role: StaffRole; name: string; text: string }[] {
  const p = s.player;
  const out: { role: StaffRole; name: string; text: string }[] = [];
  const say = (role: StaffRole, text: string) => {
    const st = p.staff.find((x) => x.role === role);
    if (st) out.push({ role, name: st.name, text });
  };
  const badNews = s.news.find((n) => n.aboutPlayer && n.tone === 'bad' && s.week - n.week <= 2);
  say('spokesperson', badNews ? `הכותרת "${badNews.headline.slice(0, 50)}" פוגעת בנו. ספין או ראיון – עכשיו.` : p.fame < 30 ? 'לא מכירים אותך מספיק. ראיון באולפן או נאום במליאה השבוע.' : 'התקשורת שקטה. זה הזמן להוביל סדר יום משלך.');
  if (s.coalition.stability < 45) say('advisor', `הקואליציה ביציבות ${Math.round(s.coalition.stability)}. כל מי שמחזיק/ה את הקולות הקובעים יכול/ה לגבות מחיר.`);
  else if (p.capital > 30) say('advisor', `יש לך ${Math.round(p.capital)} הון פוליטי. אל תשב/י עליו – תעביר/י חוק או תבנה/י ברית.`);
  else say('advisor', 'צריך לבנות הון: לעזור לח"כים אחרים, ולגבות את החוב כשצריך.');
  say('pollster', `התדמית שלך נמוכה ב${SECTOR_NAMES[bestSector(s)]} – שם יש הכי הרבה מה להרוויח.`);
  if (campaignSeason(s)) say('campaign', `${s.electionWeek - s.week} שבועות לבחירות. כל שבוע בלי קמפיין – מנדט שהולך למישהו אחר.`);
  else say('campaign', 'עוד מוקדם לבחירות. בונים בסיס: חוגי בית, מתפקדים ומתנדבים.');
  if (s.scandal) say('legal', 'לא מדברים עם חוקרים בלי עורך דין. ולא מדברים עם התקשורת בכלל.');
  else if (s.bills.some((b) => b.sponsor === 'player' && b.stage !== 'passed' && b.stage !== 'failed')) say('legal', 'ההצעה שלך צריכה ניסוח הדוק לפני הוועדה – אחרת היועמ"ש יפיל אותה.');
  return out;
}
