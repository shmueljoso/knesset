// סוגיות בוערות: העולם "זוכר" מה חוקקו, מחאות נרגעות כשהבעיה נפתרת, וחוקים משנים את כללי המשחק.
import { SCOPE_FACTOR, templateById } from '../data/bills';
import { onRadicalPassed } from './transforms';
import { ISSUES } from '../data/issues';
import { rand } from '../rng';
import type { GameState, IssueId, LawRecord, Sector, WorldKey } from '../types';
import { clamp, leanAlignment } from '../util';
import { addNews } from './news';
import { addWorldEffect } from './opinion';
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
  if (recentLaw(s, id)) t = Math.min(t, 25);
  return t;
}

export function tickIssues(s: GameState) {
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

function applyRule(s: GameState, rule: NonNullable<ReturnType<typeof templateById>['rule']>, scope: 1 | 2 | 3) {
  switch (rule) {
    case 'threshold':
      s.flags.thresholdBefore ??= s.rules.threshold;
      s.rules.threshold = [3.5, 4, 5][scope - 1];
      addNews(s, `אחוז החסימה הועלה ל-${s.rules.threshold}%. המפלגות הקטנות בבהלה – ומתחילות לדבר על איחודים`, 'neutral');
      break;
    case 'thresholdDown':
      s.flags.thresholdBefore ??= s.rules.threshold;
      s.rules.threshold = [2.75, 2, 1.5][scope - 1];
      addNews(s, `אחוז החסימה הורד ל-${s.rules.threshold}%. מפלגות קטנות חדשות כבר מתכוננות לבחירות`, 'neutral');
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
  }
  log(s, `כללי המשחק השתנו: ${templateById(ruleTemplate(rule)).title}`, 'system');
}

const ruleTemplate = (rule: string) => ({ threshold: 'threshold', thresholdDown: 'threshold_down', norwegian: 'norwegian', termLimit: 'termlimit', override: 'override', entrench: 'basic_entrench', equality: 'basic_dignity', immunity: 'immunity' })[rule] ?? rule;

/** בג"ץ פסל חוק שמשנה את כללי המשחק – הכלל חוזר לקדמותו */
function revertRule(s: GameState, rule: NonNullable<ReturnType<typeof templateById>['rule']>) {
  switch (rule) {
    case 'threshold':
    case 'thresholdDown':
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
export function strikeLaw(s: GameState, templateId: string) {
  const rec = [...s.lawsPassed].reverse().find((l) => l.templateId === templateId && !l.struck);
  if (!rec) return;
  rec.struck = true;
  const t = templateById(templateId);
  s.effects = s.effects.filter((e) => e.source !== rec.title && e.source !== t.title);
  if (t.rule) revertRule(s, t.rule);
  addWorldEffect(s, 'trust', 1, 2, 'בג"ץ');
  addWorldEffect(s, 'cohesion', -1.5, 2, 'בג"ץ');
  if (t.issue) bumpIssue(s, t.issue, 15);
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
