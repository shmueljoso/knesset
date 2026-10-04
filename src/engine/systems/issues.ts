// סוגיות בוערות: העולם "זוכר" מה חוקקו, מחאות נרגעות כשהבעיה נפתרת, וחוקים משנים את כללי המשחק.
import { SCOPE_FACTOR, templateById } from '../data/bills';
import { onRadicalPassed } from './transforms';
import { ISSUES } from '../data/issues';
import { rand } from '../rng';
import type { GameState, IssueId, LawRecord } from '../types';
import { clamp, leanAlignment } from '../util';
import { addNews } from './news';
import { addWorldEffect } from './opinion';
import { log } from './report';

export const recentLaw = (s: GameState, issue: IssueId, weeks = 52) =>
  s.lawsPassed.some((l) => !l.struck && s.week - l.week <= weeks && templateById(l.templateId)?.issue === issue);

export const isHot = (s: GameState, issue: IssueId, level = 60) => s.issues[issue] >= level && !recentLaw(s, issue);

function issueTarget(s: GameState, id: IssueId): number {
  const def = ISSUES.find((i) => i.id === id)!;
  const w = s.world;
  let t: number;
  if (def.world) t = clamp((70 - w[def.world]) * 1.6 + 30, 5, 100);
  else if (id === 'draft') t = clamp(50 + (50 - w.cohesion) * 0.6, 10, 95);
  else t = clamp(55 + (50 - w.security) * 0.5, 10, 95); // פשיעה
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
  if (t.issue) bumpIssue(s, t.issue, -(25 + 10 * rec.scope));
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

function applyRule(s: GameState, rule: NonNullable<ReturnType<typeof templateById>['rule']>, scope: 1 | 2 | 3) {
  switch (rule) {
    case 'threshold':
      s.rules.threshold = [3.5, 4, 5][scope - 1];
      addNews(s, `אחוז החסימה הועלה ל-${s.rules.threshold}%. המפלגות הקטנות בבהלה`, 'neutral');
      break;
    case 'norwegian':
      s.rules.norwegian = true;
      for (const p of s.coalition.parties) s.coalition.satisfaction[p] = clamp((s.coalition.satisfaction[p] ?? 60) + 8, 0, 100);
      break;
    case 'termLimit':
      s.rules.termLimit = true;
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

const ruleTemplate = (rule: string) => ({ threshold: 'threshold', norwegian: 'norwegian', termLimit: 'termlimit', override: 'override', entrench: 'basic_entrench', equality: 'basic_dignity' })[rule] ?? rule;

/** הסיכוי שבג"ץ יפסול חוק */
export function strikeChance(s: GameState, templateId: string): number {
  const t = templateById(templateId);
  if (s.rules.noReview) return 0;
  let p = t.petitionRisk ?? 0;
  if (s.rules.equality) p *= 1.3;
  if (s.rules.entrench) p *= 1.2;
  return clamp(p, 0, 0.9);
}

/** פסילת חוק: ההשפעות שנותרו מתבטלות */
export function strikeLaw(s: GameState, templateId: string) {
  const rec = [...s.lawsPassed].reverse().find((l) => l.templateId === templateId && !l.struck);
  if (!rec) return;
  rec.struck = true;
  const t = templateById(templateId);
  s.effects = s.effects.filter((e) => e.source !== rec.title && e.source !== t.title);
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
  for (const [k, v] of Object.entries(t.world)) addWorldEffect(s, k as keyof typeof s.world, v! * 0.7, t.weeks, t.title, 1);
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
