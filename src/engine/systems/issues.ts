// סוגיות בוערות: העולם "זוכר" מה חוקקו, מחאות נרגעות כשהבעיה נפתרת, וחוקים משנים את כללי המשחק.
import { SCOPE_FACTOR, templateById } from '../data/bills';
import { onRadicalPassed } from './transforms';
import { ISSUES } from '../data/issues';
import { rand } from '../rng';
import type { GameState, IssueId, LawRecord, Sector, WorldKey } from '../types';
import { clamp, leanAlignment } from '../util';
import { addNews } from './news';
import { addMomentum, addWorldEffect } from './opinion';
import { applyGerrymander, clearGerrymander, districtShare, systemLabel } from './districts';
import { triggerChains } from './chains';
import { applyNorwegian, termLimited } from './regime';
import { log } from './report';

/** חוק שעבר לאחרונה ונותן מענה לסוגיה (חוק שמלבה אותה – לא נחשב) */
export const recentLaw = (s: GameState, issue: IssueId, weeks = 52) =>
  s.lawsPassed.some((l) => {
    const t = templateById(l.templateId);
    return !l.struck && s.week - l.week <= weeks && t?.issue === issue && !t.inflames;
  });

export const isHot = (s: GameState, issue: IssueId, level = 60) => s.issues[issue] >= level && !recentLaw(s, issue);

function issueTarget(s: GameState, id: IssueId): number {
  const def = ISSUES.find((i) => i.id === id)!;
  const w = s.world;
  let t: number;
  if (def.world) t = clamp((70 - w[def.world]) * 1.6 + 30, 5, 100);
  else if (id === 'draft') {
    // צבא מקצועי: אין יותר שאלת גיוס (מתון – הוויכוח רק נרגע)
    const army = (s.transforms ?? []).find((x) => x.id === 'volunteer')?.scope ?? 0;
    if (army >= 2) return 0;
    t = clamp(50 + (50 - w.cohesion) * 0.6, 10, 95) * (army ? 0.5 : 1);
  } else t = clamp(55 + (50 - w.security) * 0.5, 10, 95); // פשיעה
  // חוק שנתן מענה: שנתיים של רגיעה, ואחר כך הסוגיה חוזרת – אבל חלשה יותר (עד שני חוקים)
  if (recentLaw(s, id, 104)) t = Math.min(t, 25);
  const solved = Math.min(2, s.lawsPassed.filter((l) => !l.struck && templateById(l.templateId)?.issue === id && !templateById(l.templateId)?.inflames).length);
  t -= solved * 12;
  // עייפות: הציבור לא יוצא לרחובות על אותו דבר בלי סוף
  t -= (s.issueFatigue?.[id] ?? 0) * 0.35;
  return clamp(t, 0, 100);
}

/** עוד אירוע/מחאה באותה סוגיה: הציבור מתעייף (דועך לאט, כ-1.2 לשבוע) */
export function tireIssue(s: GameState, id: IssueId, d: number) {
  s.issueFatigue ??= {};
  const before = s.issueFatigue[id] ?? 0;
  s.issueFatigue[id] = clamp(before + d, 0, 100);
  if (before < 55 && s.issueFatigue[id]! >= 55) {
    const def = ISSUES.find((i) => i.id === id);
    if (def) addNews(s, `${def.icon} ${def.name}: הציבור עייף – המחאות דועכות`, 'neutral', false, 'הסוגיה לא נפתרה, אבל היא כבר לא מוציאה אנשים לרחובות. היא תחזור – אם יקרה משהו גדול.');
  }
}

export function tickIssues(s: GameState) {
  s.issueFatigue ??= {};
  for (const k of Object.keys(s.issueFatigue) as IssueId[]) s.issueFatigue[k] = Math.max(0, (s.issueFatigue[k] ?? 0) - 1.2);
  for (const def of ISSUES) {
    const before = s.issues[def.id];
    const target = issueTarget(s, def.id);
    const next = clamp(before + (target - before) * 0.06 + (rand(s) - 0.5) * 3, 0, 100);
    s.issues[def.id] = Math.round(next * 10) / 10;
    s.issueTrend[def.id] = Math.round((next - before) * 10) / 10;
  }
}

export function bumpIssue(s: GameState, id: IssueId, d: number) {
  s.issues[id] = clamp(s.issues[id] + d, 0, 100);
}

export function scheduleEvent(s: GameState, eventId: string, inWeeks: number, ctx: Record<string, string> = {}) {
  s.scheduled.push({ week: s.week + Math.max(1, inWeeks), eventId, ctx });
}

/** אירועים מתוזמנים שהגיע זמנם נכנסים לתור */
export function releaseScheduled(s: GameState) {
  const due = s.scheduled.filter((x) => x.week <= s.week + 1);
  s.scheduled = s.scheduled.filter((x) => x.week > s.week + 1);
  for (const d of due) s.eventQueue.push({ eventId: d.eventId, ctx: d.ctx });
}

/** הרוב שנדרש לחוק יסוד (אם שוריינו חוקי היסוד – 80) */
export function requiredMajority(s: GameState, templateId: string): number | null {
  const t = templateById(templateId);
  if (!t.basic) return null;
  return s.rules.entrench ? 80 : t.basic.majority;
}

/** כל מה שקורה בעולם כשחוק עובר – של השחקן או של ח"כ אחר */
export function onLawPassed(s: GameState, rec: Omit<LawRecord, 'week'>) {
  const t = templateById(rec.templateId);
  s.lawsPassed.push({ ...rec, week: s.week });
  const impact = SCOPE_FACTOR[rec.scope];
  // חוק שנותן מענה מרגיע את הסוגיה; חוק שנוי במחלוקת מלבה אותה
  if (t.issue) bumpIssue(s, t.issue, t.inflames ? 12 + 8 * rec.scope : -(25 + 10 * rec.scope));
  for (const [id, d] of Object.entries(t.stirs ?? {})) bumpIssue(s, id as IssueId, d! * impact);
  coalitionReaction(s, t.id, rec.scope);
  // מפלגות שהחוק "שלהן" מתחזקות, המתנגדות נחלשות מעט
  if (Object.keys(t.lean).length) {
    for (const p of Object.values(s.parties)) {
      if (p.seats <= 0) continue;
      const a = leanAlignment(p.ideology, t.lean);
      p.base = Math.max(0.3, p.base + a * 0.25 * impact);
    }
  }
  for (const [eventId, delay] of t.aftermath ?? []) scheduleEvent(s, eventId, delay, { law: t.id, title: t.title });
  if (t.petitionRisk) scheduleEvent(s, 'petition', 5, { law: t.id, title: t.title });
  if (t.rule) applyRule(s, t.rule, rec.scope);
  if (t.radical) onRadicalPassed(s, t.id, rec.scope, rec.sponsor);
  else if (!t.hidden) triggerChains(s, 'law', t.id);
}

/** השפעות החוק על העולם: הבסיס, ו"הצד השני" לפי היקף ותזמון. factor כולל את ההיקף */
export function applyLawEffects(s: GameState, templateId: string, scope: 1 | 2 | 3, factor: number, source: string, delay?: number) {
  const t = templateById(templateId);
  for (const [k, v] of Object.entries(t.world)) addWorldEffect(s, k as WorldKey, v! * factor, t.weeks, source, delay ?? t.delay);
  for (const e of lawEffects(templateId, scope)) addWorldEffect(s, e.key, e.d * factor, e.weeks, source, delay ?? e.delay ?? 0);
}

export const lawEffects = (templateId: string, scope: 1 | 2 | 3) => (templateById(templateId).effects ?? []).filter((e) => (e.from ?? 1) <= scope);

/** תדמית במגזרים לפי היקף (בסיס + תוספות של היקף רחב) – לפני הכפלה בהיקף */
export function lawSectors(templateId: string, scope: 1 | 2 | 3): Partial<Record<Sector, number>> {
  const t = templateById(templateId);
  const out: Partial<Record<Sector, number>> = { ...t.sectors };
  for (const x of t.scopeSectors ?? []) if (x.from <= scope) for (const [k, v] of Object.entries(x.sectors)) out[k as Sector] = (out[k as Sector] ?? 0) + v!;
  return out;
}

/** איך השותפות בקואליציה יגיבו לחוק: מה שמתאים לבוחרים שלהן משמח, מה שנוגד אותם – מרגיז */
export function coalitionMood(s: GameState, templateId: string, scope: 1 | 2 | 3): { id: string; d: number }[] {
  const t = templateById(templateId);
  if (t.radical || t.hidden) return [];
  const pmParty = s.coalition.pmId === 'player' ? s.player.partyId : s.npcs[s.coalition.pmId]?.partyId;
  const out: { id: string; d: number }[] = [];
  for (const pid of s.coalition.parties) {
    const p = s.parties[pid];
    if (!p || s.coalition.satisfaction[pid] === undefined) continue;
    const a = Object.keys(t.lean).length ? leanAlignment(p.ideology, t.lean) : 0;
    let d = Math.abs(a) >= 0.3 ? a * 4 * SCOPE_FACTOR[scope] : 0;
    if (t.partners && pid !== pmParty) d += t.partners * SCOPE_FACTOR[scope];
    if (Math.abs(d) >= 1) out.push({ id: pid, d: Math.round(d * 10) / 10 });
  }
  return out;
}

function coalitionReaction(s: GameState, templateId: string, scope: 1 | 2 | 3) {
  const t = templateById(templateId);
  for (const { id, d } of coalitionMood(s, templateId, scope)) {
    s.coalition.satisfaction[id] = clamp(s.coalition.satisfaction[id] + d, 0, 100);
    if (d <= -4) addNews(s, `${s.parties[id].name} זועמת על "${t.title}": "זה לא מה שהבטחתם לנו"`, 'bad');
  }
}

export function applyRule(s: GameState, rule: NonNullable<ReturnType<typeof templateById>['rule']>, scope: 1 | 2 | 3) {
  switch (rule) {
    case 'threshold':
      s.flags.thresholdBefore ??= s.rules.threshold;
      s.rules.threshold = [3.5, 4, 5][scope - 1];
      delete s.flags.thrWave;
      addNews(s, `אחוז החסימה הועלה ל-${s.rules.threshold}%. המפלגות הקטנות בבהלה – ומתחילות לדבר על איחודים`, 'neutral');
      break;
    case 'thresholdDown':
      s.flags.thresholdBefore ??= s.rules.threshold;
      s.rules.threshold = [2.75, 2, 1.5][scope - 1];
      s.flags.thrWave = scope + 1; // גל מפלגות קטנות חדשות בחודשים הקרובים
      addNews(s, `אחוז החסימה הורד ל-${s.rules.threshold}%. מפלגות קטנות חדשות כבר מתכוננות לבחירות, ובוחרים יפחדו פחות מ"קול אבוד"`, 'neutral');
      break;
    case 'immunity':
      s.rules.immunity = scope;
      addNews(s, `${['"החוק הצרפתי"', 'חוק החסינות לשרים', 'חוק החסינות האוטומטית'][scope - 1]} עבר: ${['ראש ממשלה מכהן', 'ראש הממשלה והשרים', 'כל חברי הכנסת'][scope - 1]} לא ייחקרו בזמן הכהונה`, 'neutral', false, 'במחאה: "חוק עוקף משפט".');
      break;
    case 'norwegian':
      s.rules.norwegian = true;
      s.rules.norwegianLimit = [1, 5, 99][scope - 1];
      for (const p of s.coalition.parties) s.coalition.satisfaction[p] = clamp((s.coalition.satisfaction[p] ?? 60) + 8, 0, 100);
      applyNorwegian(s);
      addNews(s, 'החוק הנורבגי בתוקף: שרים מתפטרים מהכנסת והבאים ברשימות נכנסים', 'neutral');
      break;
    case 'termLimit':
      s.rules.termLimit = true;
      s.rules.termLimitScope = scope;
      if (termLimited(s, s.coalition.pmId)) addNews(s, 'הגבלת הכהונה: ראש הממשלה המכהן/ת לא יוכל/תוכל לרוץ שוב', 'neutral', s.coalition.pmId === 'player');
      break;
    case 'override':
      s.rules.override = true;
      break;
    case 'entrench':
      s.rules.entrench = true;
      break;
    case 'equality':
      s.rules.equality = true;
      break;
    case 'districts': {
      s.flags.shareBefore ??= districtShare(s);
      s.rules.districts = false;
      s.rules.districtShare = [0.3, 0.5, 1][scope - 1];
      // המפלגות הגדולות והמרוכזות מתחזקות, הקטנות והפזורות נחלשות – ככל שהשיטה מחוזית יותר
      for (const p of Object.values(s.parties)) addMomentum(s, p.id, p.seats >= 20 ? scope * 0.9 : p.seats > 0 && p.seats <= 8 ? -scope * 0.7 : 0);
      addNews(s, `שיטת הבחירות השתנתה: ${systemLabel(s)}`, 'neutral', false, 'מעכשיו גם המחוז שלך קובע.', 'ערוץ המשכן');
      if (s.week > 0) scheduleEvent(s, 'dist_system_changed', 3, { title: systemLabel(s) });
      break;
    }
    case 'proportional':
      s.flags.shareBeforeProp = districtShare(s);
      s.rules.districts = false;
      s.rules.districtShare = 0;
      clearGerrymander(s);
      addNews(s, 'חזרה לשיטה הארצית היחסית: המחוזות בוטלו', 'neutral', false, 'מפלגות קטנות נושמות לרווחה.', 'ערוץ המשכן');
      break;
    case 'electoral':
      s.rules.electoral = true;
      if (!s.rules.presidential && !s.rules.directPM) {
        s.rules.directPM = true;
        s.flags.electoralForcedDirect = true;
      }
      addNews(s, 'ראש הממשלה ייבחר באלקטורים: מי שמנצח במחוז לוקח את כולו', 'neutral', false, 'אפשר לנצח גם בלי רוב בקולות הארציים.', 'ערוץ המשכן');
      break;
    case 'gerrymander':
      applyGerrymander(s, scope);
      s.flags.gerryWeek = s.week;
      addNews(s, 'הכנסת אישרה שרטוט מחדש של גבולות המחוזות', 'bad', false, 'האופוזיציה: "גרימנדר – מדביקים את המחוזות לטובת הקואליציה".', 'ערוץ המשכן');
      if (s.week > 0) scheduleEvent(s, 'dist_gerry_outcry', 2, { title: templateById('redistrict').title });
      break;
    case 'compulsory':
      s.rules.compulsory = true;
      addNews(s, 'חובת הצבעה: מי שלא יצביע – ייקנס', 'neutral', false, 'מפלגות שמגייסות מגזרים שנעדרים מהקלפי – בהתעוררות.', 'ערוץ המשכן');
      break;
    case 'age16':
      s.rules.age16 = true;
      for (const p of Object.values(s.parties)) addMomentum(s, p.id, leanAlignment(p.ideology, { econ: -30, religion: -40, security: -25 }) * 1.1);
      addNews(s, 'גיל ההצבעה ירד ל-16: מאות אלפי בני נוער נכנסים לקלפי', 'neutral', false, undefined, 'ערוץ המשכן');
      break;
    case 'termLength': {
      const before = s.rules.termWeeks ?? 208;
      s.flags.termBefore = before;
      s.rules.termWeeks = [156, 260, 312][scope - 1];
      const next = s.electionWeek + (s.rules.termWeeks - before);
      if (next > s.week + 20) {
        s.electionWeek = next;
        s.primariesWeek = next - 12;
      }
      addNews(s, `הכנסת תכהן ${Math.round(s.rules.termWeeks / 52)} שנים: הבחירות הבאות בעוד ${s.electionWeek - s.week} שבועות`, 'neutral', false, undefined, 'ערוץ המשכן');
      break;
    }
    case 'allPrimaries': {
      s.rules.allPrimaries = true;
      s.flags.primBefore = Object.values(s.parties).filter((p) => !p.primaries).map((p) => p.id).join(',');
      for (const p of Object.values(s.parties)) p.primaries = true;
      addNews(s, 'חוק המפלגות: כל הרשימות ייבחרו בפריימריז', 'neutral', false, 'יו"רים מתלוננים שאיבדו שליטה ברשימה.', 'ערוץ המשכן');
      break;
    }
  }
  log(s, `כללי המשחק השתנו: ${templateById(ruleTemplate(rule)).title}`, 'system');
}

const ruleTemplate = (rule: string) => ({ threshold: 'threshold', thresholdDown: 'threshold_down', norwegian: 'norwegian', termLimit: 'termlimit', override: 'override', entrench: 'basic_entrench', equality: 'basic_dignity', immunity: 'immunity', districts: 'elect_districts', proportional: 'elect_proportional', electoral: 'elect_college', gerrymander: 'redistrict', compulsory: 'compulsory_vote', age16: 'vote_age_16', termLength: 'term_length', allPrimaries: 'all_primaries' })[rule] ?? rule;

/** בג"ץ פסל חוק שמשנה את כללי המשחק – הכלל חוזר לקדמותו */
function revertRule(s: GameState, rule: NonNullable<ReturnType<typeof templateById>['rule']>) {
  switch (rule) {
    case 'threshold':
    case 'thresholdDown':
      delete s.flags.thrWave;
      s.rules.threshold = Number(s.flags.thresholdBefore ?? 3.25);
      delete s.flags.thresholdBefore;
      break;
    case 'norwegian':
      s.rules.norwegian = false;
      break;
    case 'termLimit':
      s.rules.termLimit = false;
      break;
    case 'override':
      s.rules.override = false;
      break;
    case 'entrench':
      s.rules.entrench = false;
      break;
    case 'equality':
      s.rules.equality = false;
      break;
    case 'immunity':
      s.rules.immunity = 0;
      break;
    case 'districts':
      s.rules.districtShare = Number(s.flags.shareBefore ?? 0);
      delete s.flags.shareBefore;
      break;
    case 'proportional':
      s.rules.districtShare = Number(s.flags.shareBeforeProp ?? 0);
      break;
    case 'electoral':
      s.rules.electoral = false;
      if (s.flags.electoralForcedDirect) {
        s.rules.directPM = false;
        delete s.flags.electoralForcedDirect;
      }
      break;
    case 'gerrymander':
      clearGerrymander(s);
      break;
    case 'compulsory':
      s.rules.compulsory = false;
      break;
    case 'age16':
      s.rules.age16 = false;
      break;
    case 'termLength':
      s.rules.termWeeks = Number(s.flags.termBefore ?? 208);
      break;
    case 'allPrimaries': {
      s.rules.allPrimaries = false;
      const was = new Set(String(s.flags.primBefore ?? '').split(',').filter(Boolean));
      for (const p of Object.values(s.parties)) if (was.has(p.id)) p.primaries = false;
      break;
    }
  }
}

/** הסיכוי שבג"ץ יפסול חוק */
export function strikeChance(s: GameState, templateId: string): number {
  const t = templateById(templateId);
  if (s.rules.noReview) return 0;
  let p = t.petitionRisk ?? 0;
  if (s.rules.equality) p *= 1.3;
  if (s.rules.entrench) p *= 1.2;
  if (s.rules.packedCourt) p *= 0.4;
  return clamp(p, 0, 0.9);
}

/** פסילת חוק: ההשפעות שנותרו מתבטלות */
export function strikeLaw(s: GameState, templateId: string, quiet = false) {
  const rec = [...s.lawsPassed].reverse().find((l) => l.templateId === templateId && !l.struck);
  if (!rec) return;
  rec.struck = true;
  const t = templateById(templateId);
  s.effects = s.effects.filter((e) => e.source !== rec.title && e.source !== t.title);
  if (t.rule) revertRule(s, t.rule);
  addWorldEffect(s, 'trust', 1, 2, 'בג"ץ');
  addWorldEffect(s, 'cohesion', -1.5, 2, 'בג"ץ');
  if (t.issue) bumpIssue(s, t.issue, 15);
  if (!quiet) triggerChains(s, 'struck', templateId);
}

/** ביטול חוק בכנסת: ההשפעות שנותרו מתבטלות, הכלל חוזר לקדמותו, והסוגיה מתחממת שוב */
export function repealLaw(s: GameState, templateId: string): boolean {
  const rec = [...s.lawsPassed].reverse().find((l) => l.templateId === templateId && !l.struck);
  if (!rec) return false;
  rec.struck = true;
  rec.repealed = true;
  const t = templateById(templateId);
  s.effects = s.effects.filter((e) => e.source !== rec.title && e.source !== t.title);
  if (t.rule) revertRule(s, t.rule);
  if (t.issue) bumpIssue(s, t.issue, 10);
  return true;
}

/** חקיקה מחדש בפסקת ההתגברות */
export function reenactLaw(s: GameState, templateId: string) {
  const rec = [...s.lawsPassed].reverse().find((l) => l.templateId === templateId && l.struck);
  if (!rec) return;
  rec.struck = false;
  const t = templateById(templateId);
  applyLawEffects(s, templateId, rec.scope, 0.7, t.title, 1);
  if (t.rule) applyRule(s, t.rule, rec.scope);
  addWorldEffect(s, 'trust', -4, 4, 'פסקת ההתגברות');
  addWorldEffect(s, 'cohesion', -3, 4, 'פסקת ההתגברות');
}

/** מכפיל להשפעת עמדה פומבית: עמדה בסוגיה בוערת מזיזה יותר */
export function salienceMultiplier(s: GameState, axis: string | null): number {
  if (!axis || !s.issues) return 1;
  const rel = ISSUES.filter((i) => i.axis === axis).map((i) => s.issues[i.id]);
  const max = rel.length ? Math.max(...rel) : 50;
  return 0.7 + (max / 100) * 0.8;
}
