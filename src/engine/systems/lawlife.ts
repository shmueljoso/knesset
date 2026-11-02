// חיים של חוק אחרי שעבר: דוחות יישום, דרישות לביטול, וביטול בכנסת – בידי השחקן או בידי ממשלה אחרת.
// חוק שבוטל מחזיר את המצב לקדמותו (facts.ts רואה אותו כלא בתוקף), והאירועים והכותרות מתחלפים בהתאם.
import { templateById } from '../data/bills';
import { chance } from '../rng';
import type { GameState, Ideology, LawRecord, Party } from '../types';
import { AXES, clamp, leanAlignment } from '../util';
import { changeSatisfaction, recomputeStability } from './coalition';
import { repealLaw, scheduleEvent } from './issues';
import { addNews } from './news';
import { log } from './report';

export const REPEAL_COST = { pm: 15, partner: 25 } as const;

/** חוקים בתוקף (הרשומה האחרונה של כל תבנית), בלי חוקים מוסתרים ומהפכות */
export function lawsInForce(s: GameState): LawRecord[] {
  const seen = new Set<string>();
  const out: LawRecord[] = [];
  for (const l of [...s.lawsPassed].reverse()) {
    if (seen.has(l.templateId)) continue;
    seen.add(l.templateId);
    const t = templateById(l.templateId);
    if (!l.struck && t && !t.hidden && !t.radical) out.push(l);
  }
  return out;
}

const coalitionParties = (s: GameState) => s.coalition.parties.map((id) => s.parties[id]).filter((p): p is Party => !!p && p.seats > 0);

/** העמדה הממוצעת של הקואליציה (משוקללת במושבים) */
export function coalitionIdeology(s: GameState): Ideology {
  const coal = coalitionParties(s);
  const seats = coal.reduce((a, p) => a + p.seats, 0) || 1;
  return Object.fromEntries(AXES.map((a) => [a, coal.reduce((x, p) => x + p.ideology[a] * p.seats, 0) / seats])) as Ideology;
}

/** כמה הממשלה הנוכחית "לא אוהבת" חוק (-1 = מתנגדת בתוקף, 1 = תומכת) */
export const govFit = (s: GameState, templateId: string) => leanAlignment(coalitionIdeology(s), templateById(templateId).lean);

/** השותפה שהכי מתנגדת לחוק */
export function fiercestOpponent(s: GameState, templateId: string): Party | null {
  const t = templateById(templateId);
  return coalitionParties(s)
    .map((p) => ({ p, a: leanAlignment(p.ideology, t.lean) }))
    .filter((x) => x.a < -0.2)
    .sort((a, b) => a.a - b.a)[0]?.p ?? null;
}

/** הדוח על חוק: עבד או לא – לפי המדדים שהוא אמור לשפר */
export function lawVerdict(s: GameState, templateId: string): { good: boolean; text: string } {
  const t = templateById(templateId);
  const keys = Object.entries(t.world).filter(([, v]) => (v ?? 0) > 0).map(([k]) => k as keyof GameState['world']);
  if (!keys.length) return { good: true, text: 'החוק מיושם כמתוכנן, אבל ההשפעה שלו עדיין שנויה במחלוקת.' };
  const avg = keys.reduce((a, k) => a + s.world[k], 0) / keys.length;
  return avg >= 50
    ? { good: true, text: 'המבקר קובע שהחוק השיג את רוב יעדיו. המספרים השתפרו.' }
    : { good: false, text: 'המבקר קובע שהחוק לא השיג את יעדיו: היישום חלקי והתקציבים לא הועברו.' };
}

export function repealBlocked(s: GameState, templateId: string): string | null {
  const rec = lawsInForce(s).find((l) => l.templateId === templateId);
  if (!rec) return 'החוק לא בתוקף';
  const my = s.player.partyId ? s.parties[s.player.partyId] : null;
  const pm = s.coalition.pmId === 'player';
  const partner = !!my && my.leaderId === 'player' && s.coalition.parties.includes(my.id);
  if (!pm && !partner) return 'רק ראש הממשלה או יו"ר מפלגה בקואליציה';
  if (s.player.ap < 1) return 'אין מספיק זמן השבוע';
  const cost = pm ? REPEAL_COST.pm : REPEAL_COST.partner;
  if (s.player.capital < cost) return `צריך ${cost} הון פוליטי`;
  if (s.week - Number(s.flags[`repealTry_${templateId}`] ?? -99) < 12) return 'ניסית לאחרונה';
  return null;
}

/** ביטול חוק ביוזמת השחקן: ראש הממשלה מעביר בטוח (משמעת קואליציונית), שותפה צריכה שכנוע */
export function repealByPlayer(s: GameState, templateId: string): { ok: boolean; text: string } {
  const b = repealBlocked(s, templateId);
  if (b) return { ok: false, text: b };
  const t = templateById(templateId);
  const pm = s.coalition.pmId === 'player';
  s.player.ap -= 1;
  s.player.capital -= pm ? REPEAL_COST.pm : REPEAL_COST.partner;
  s.flags[`repealTry_${templateId}`] = s.week;
  if (!pm && !chance(s, clamp(0.35 - govFit(s, templateId) * 0.4, 0.05, 0.8))) {
    return { ok: false, text: `ראש הממשלה לא מוכן/ה להביא את ביטול "${t.title}" להצבעה.` };
  }
  repealAndReact(s, templateId, s.player.name);
  return { ok: true, text: `"${t.title}" בוטל. ${t.issue ? 'הסוגיה תחזור לכותרות.' : ''}` };
}

/** ביטול + תגובות: השותפות לפי העמדה שלהן, כותרת ואירוע תגובה */
export function repealAndReact(s: GameState, templateId: string, who: string) {
  const t = templateById(templateId);
  if (!repealLaw(s, templateId)) return;
  for (const p of coalitionParties(s)) changeSatisfaction(s, p.id, -leanAlignment(p.ideology, t.lean) * 10);
  recomputeStability(s);
  addNews(s, `הכנסת ביטלה את "${t.title}"`, 'neutral', who === s.player.name, `היוזמה: ${who}.`, 'ערוץ המשכן');
  log(s, `"${t.title}" בוטל בכנסת.`, 'system');
  scheduleEvent(s, 'law_repealed', 1, { law: t.id, title: t.title, who });
}

/** ממשלה (לא בראשות השחקן) מבטלת מדי פעם חוק שהיא מתנגדת לו בתוקף */
export function tickLaws(s: GameState) {
  if (s.coalition.pmId === 'player' || s.negotiation || s.week % 4 !== 0 || s.week < 26) return;
  const target = lawsInForce(s)
    .filter((l) => s.week - l.week >= 30)
    .map((l) => ({ l, fit: govFit(s, l.templateId) }))
    .filter((x) => x.fit < -0.45)
    .sort((a, b) => a.fit - b.fit)[0];
  if (target && chance(s, 0.08)) repealAndReact(s, target.l.templateId, s.npcs[s.coalition.pmId]?.name ?? 'הממשלה');
}
