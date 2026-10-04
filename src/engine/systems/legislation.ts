import { addStat } from '../stats';
import { inSession } from '../calendar';
import { SCOPE_FACTOR, templateById } from '../data/bills';
import { COMMITTEE_DEFS } from '../data/committees';
import { registerSpecial, type Ctx } from '../ops';
import { chance, rand } from '../rng';
import type { Bill, BillStage, GameState } from '../types';
import { SECTORS, clamp, leanAlignment, newId } from '../util';
import { onBillPassed } from './coalition';
import { onLawPassed } from './issues';
import { isCoalition } from './government';
import { addNews } from './news';
import { addWorldEffect, changeApproval } from './opinion';
import { addDebt, changeAttitude, reactToLaw } from './relationships';
import { log } from './report';
import { billImpact, billLean, runVote, sponsorParty } from './votes';

export const STAGES: BillStage[] = ['tabled', 'ministerial', 'preliminary', 'committee1', 'first', 'committee2', 'final', 'passed'];
export const STAGE_NAMES: Record<BillStage, string> = {
  draft: 'טיוטה',
  tabled: 'הונחה על שולחן הכנסת',
  ministerial: 'ועדת השרים לחקיקה',
  preliminary: 'קריאה טרומית',
  committee1: 'ועדה – הכנה לקריאה ראשונה',
  first: 'קריאה ראשונה',
  committee2: 'ועדה – הכנה לקריאה שנייה ושלישית',
  final: 'קריאה שנייה ושלישית',
  passed: 'עבר – חוק במדינת ישראל',
  failed: 'נפל',
};
export const VOTE_STAGES: BillStage[] = ['preliminary', 'first', 'final'];
export const GOV_POS_NAMES = { support: 'תמיכה', oppose: 'התנגדות', free: 'חופש הצבעה' } as const;

export const committeeName = (id: string) => COMMITTEE_DEFS.find((c) => c.id === id)?.name ?? id;

/** האם השחקן יכול להגיש הצעות חוק – כח"כ, או כעוזר בשם הח"כ שמעסיק אותו. */
export function legislativeRole(s: GameState): { canPropose: boolean; sponsor: string | null; reason?: string } {
  if (s.player.isMK || s.player.ministry) return { canPropose: true, sponsor: 'player' };
  if (s.player.employerId && s.npcs[s.player.employerId]?.isMK)
    return { canPropose: true, sponsor: s.player.employerId };
  return { canPropose: false, sponsor: null, reason: 'רק חברי כנסת (או עוזרים בשמם) יכולים להגיש הצעות חוק' };
}

export const activeBills = (s: GameState) => s.bills.filter((b) => b.stage !== 'passed' && b.stage !== 'failed');
export const isPlayerBill = (s: GameState, b: Bill) => b.sponsor === 'player' || b.sponsor === s.player.employerId;

export function createBill(s: GameState, templateId: string, scope: 1 | 2 | 3, opts: { government?: boolean } = {}): Bill | string {
  const role = legislativeRole(s);
  const gov = !!opts.government;
  if (gov && !s.player.ministry && s.coalition.pmId !== 'player') return 'רק שר/ה יכול/ה להגיש הצעת חוק ממשלתית';
  if (!role.canPropose || !role.sponsor) return role.reason ?? 'לא ניתן להגיש';
  const mine = activeBills(s).filter((b) => isPlayerBill(s, b) && !b.agreementParty && !!b.government === gov);
  if (mine.length >= 3) return 'יש כבר 3 הצעות פעילות מהסוג הזה – התמקד בהן';
  if (activeBills(s).some((b) => b.templateId === templateId && isPlayerBill(s, b))) return 'כבר הגשת הצעה בנושא הזה';
  const t = templateById(templateId);
  const b: Bill = {
    id: newId(s, 'bill'),
    templateId,
    title: t.title,
    sponsor: role.sponsor,
    scope,
    stage: 'tabled',
    stageWeek: s.week,
    waitUntil: s.week + (gov ? 3 : 7), // תזכיר חוק: 21 יום להערות הציבור; הצעה פרטית: 45 יום
    exemption: false,
    govPosition: null,
    committeeId: t.committee,
    committeeProgress: 0,
    committeeNeeded: 0,
    amendments: 0,
    pushWeek: -1,
    sessionPending: false,
    votedThisWeek: false,
    government: gov || undefined,
    history: [
      {
        week: s.week,
        text: gov ? 'תזכיר החוק פורסם להערות הציבור (21 יום).' : 'ההצעה הונחה על שולחן הכנסת. תקופת המתנה של 45 יום.',
      },
    ],
  };
  s.bills.push(b);
  log(s, `הוגשה ${gov ? 'הצעת חוק ממשלתית' : 'הצעת חוק'}: ${t.title}`, 'action');
  return b;
}

function setStage(s: GameState, b: Bill, stage: BillStage, text: string) {
  b.stage = stage;
  b.stageWeek = s.week;
  b.history.push({ week: s.week, text });
  if (stage === 'committee1') {
    b.committeeProgress = 0;
    b.committeeNeeded = 2 + (b.scope === 3 ? 1 : 0);
  }
  if (stage === 'committee2') {
    b.committeeProgress = 0;
    b.committeeNeeded = 2 + b.scope;
  }
}

export function ministerialDecision(s: GameState, b: Bill): 'support' | 'oppose' | 'free' {
  const lean = billLean(b);
  const coal = s.coalition.parties;
  const totalSeats = coal.reduce((a, p) => a + s.parties[p].seats, 0) || 1;
  const coalAlign = coal.reduce((a, p) => a + leanAlignment(s.parties[p].ideology, lean) * s.parties[p].seats, 0) / totalSeats;
  const justice = s.npcs[s.ministers.justice];
  const sp = sponsorParty(s, b);
  let score = coalAlign * 0.9;
  score += justice && b.sponsor === 'player' ? justice.attitude / 250 : 0;
  score += sp && isCoalition(s, sp) ? 0.2 : -0.4;
  if (b.government) score += 0.3;
  if (b.agreementParty) score += 1;
  // וטו של שותפה בהסכם הקואליציוני
  if (s.coalition.agreement.some((a) => a.status === 'pending' && a.demand.kind === 'veto' && a.demand.ref === b.templateId)) score -= 1;
  score -= templateById(b.templateId).cost * SCOPE_FACTOR[b.scope] * 0.04;
  if (s.flags[`minlobby_${b.id}`]) score += 0.25;
  // הצעה מרחיקת לכת: הממשלה תומכת רק אם מפלגת ראש הממשלה בעד בלב שלם
  if (templateById(b.templateId).radical) {
    const pmParty = s.coalition.pmId === 'player' ? s.player.partyId : s.npcs[s.coalition.pmId]?.partyId;
    const pmAlign = pmParty && s.parties[pmParty] ? leanAlignment(s.parties[pmParty].ideology, lean) : 0;
    return pmAlign > 0.75 && coalAlign > 0.55 ? 'support' : pmAlign < 0.45 ? 'oppose' : 'free';
  }
  if (score > 0.35) return 'support';
  if (score < 0.05) return 'oppose';
  return 'free';
}

export function committeeChair(s: GameState, b: Bill) {
  const c = s.committees.find((x) => x.id === b.committeeId);
  return c ? s.npcs[c.chairId] : undefined;
}

export function scheduleChance(s: GameState, b: Bill): number {
  const chair = committeeChair(s, b);
  const sp = sponsorParty(s, b);
  let p = 0.25;
  if (s.committees.find((c) => c.id === b.committeeId)?.chairId === 'player') p += 0.5;
  if (chair) {
    p += (b.sponsor === 'player' ? chair.attitude : 10) / 200;
    p += leanAlignment(chair.ideology, billLean(b)) * 0.15;
  }
  p += sp && isCoalition(s, sp) ? 0.15 : -0.05;
  if (b.govPosition === 'support') p += 0.1;
  if (b.pushWeek === s.week) p += 0.25;
  if (!inSession(s)) p *= 0.5;
  return clamp(p, 0.05, 0.95);
}

export function requestExemption(s: GameState, b: Bill): boolean {
  const p = clamp(0.25 + s.player.reputation / 200 + (isCoalition(s, s.player.partyId) ? 0.15 : 0), 0.1, 0.85);
  const ok = rand(s) < p;
  b.exemption = true;
  if (ok) {
    b.waitUntil = s.week;
    b.history.push({ week: s.week, text: 'ועדת הכנסת אישרה פטור מחובת ההנחה.' });
  } else b.history.push({ week: s.week, text: 'ועדת הכנסת דחתה את בקשת הפטור.' });
  return ok;
}

/** התקדמות שבועית של הצעות החוק. */
export function tickLegislation(s: GameState) {
  for (const b of activeBills(s)) {
    b.votedThisWeek = false;
    if (b.stage === 'tabled' && s.week >= b.waitUntil) {
      setStage(s, b, 'ministerial', 'ההצעה עלתה לדיון בוועדת השרים לחקיקה.');
    } else if (b.stage === 'ministerial' && s.week > b.stageWeek) {
      b.govPosition = ministerialDecision(s, b);
      const pos = GOV_POS_NAMES[b.govPosition];
      if (b.government) {
        // הצעת חוק ממשלתית מדלגת על הקריאה הטרומית – אבל רק אם ועדת השרים מאשרת
        if (b.govPosition === 'support') setStage(s, b, 'first', 'ועדת השרים אישרה את הצעת החוק הממשלתית. היא מונחת לקריאה ראשונה.');
        else setStage(s, b, 'failed', 'ועדת השרים לא אישרה את הצעת החוק הממשלתית.');
        if (isPlayerBill(s, b)) addNews(s, `ועדת השרים ${b.govPosition === 'support' ? 'אישרה' : 'דחתה'} את "${b.title}"`, b.govPosition === 'support' ? 'good' : 'bad', true);
        continue;
      }
      setStage(s, b, 'preliminary', `ועדת השרים החליטה: ${pos}. ההצעה מוכנה לקריאה טרומית.`);
      if (isPlayerBill(s, b)) {
        addNews(s, `ועדת השרים לחקיקה: ${pos} ב"${b.title}"`, b.govPosition === 'support' ? 'good' : b.govPosition === 'oppose' ? 'bad' : 'neutral', true);
      }
    } else if ((b.stage === 'committee1' || b.stage === 'committee2') && !b.sessionPending) {
      if (chance(s, scheduleChance(s, b))) {
        if (isPlayerBill(s, b)) {
          b.sessionPending = true;
          s.eventQueue.push({ eventId: 'committee_session', ctx: { bill: b.id } });
        } else advanceCommittee(s, b, 1);
      }
    }
  }
}

export function advanceCommittee(s: GameState, b: Bill, steps: number) {
  b.committeeProgress += steps;
  b.sessionPending = false;
  b.history.push({ week: s.week, text: `דיון ב${committeeName(b.committeeId)} (${Math.min(b.committeeProgress, b.committeeNeeded)}/${b.committeeNeeded}).` });
  if (b.committeeProgress >= b.committeeNeeded) {
    if (b.stage === 'committee1') setStage(s, b, 'first', 'הוועדה אישרה את ההצעה לקריאה ראשונה.');
    else if (b.stage === 'committee2') setStage(s, b, 'final', 'הוועדה אישרה את הנוסח לקריאה שנייה ושלישית.');
  }
}

export function canBringToVote(s: GameState, b: Bill): string | null {
  if (!(['preliminary', 'first', 'final'] as BillStage[]).includes(b.stage)) return 'ההצעה לא בשלב הצבעה';
  if (!inSession(s)) return 'הכנסת בפגרה – אין הצבעות במליאה';
  if (b.votedThisWeek) return 'כבר הייתה הצבעה השבוע';
  if (s.player.ap < 1) return 'אין מספיק זמן השבוע';
  return null;
}

export function bringToVote(s: GameState, b: Bill) {
  const stage = b.stage;
  const res = runVote(s, b);
  b.lastVote = res;
  b.votedThisWeek = true;
  s.player.ap -= 1;
  const tally = `${res.for} בעד, ${res.against} נגד`;
  // התחייבויות מתממשות או נשברות
  s.seating.forEach((id, i) => {
    const n = s.npcs[id];
    if (!n || !n.pledges.includes(b.id)) return;
    if (res.seats[i] !== 'for') {
      n.trust = clamp(n.trust - 15, 0, 100);
      log(s, `${n.name} הפר את התחייבותו להצביע בעד.`, 'vote');
    }
    n.pledges = n.pledges.filter((x) => x !== b.id);
  });
  if (!res.passed) {
    setStage(s, b, 'failed', `ההצעה נפלה ב${STAGE_NAMES[stage]} (${tally}).`);
    s.player.reputation = clamp(s.player.reputation - 3, 0, 100);
    addNews(s, `"${b.title}" נפלה ב${STAGE_NAMES[stage]}: ${tally}`, 'bad', true);
    log(s, `ההצעה "${b.title}" נפלה (${tally})`, 'vote');
    return res;
  }
  addStat(s, 'reputation', 2);
  addStat(s, 'fame', 1.5);
  if (stage === 'preliminary') setStage(s, b, 'committee1', `עברה בקריאה טרומית (${tally}). הועברה ל${committeeName(b.committeeId)}.`);
  else if (stage === 'first') setStage(s, b, 'committee2', `עברה בקריאה ראשונה (${tally}). חזרה לוועדה להכנה לקריאה שנייה ושלישית.`);
  else if (stage === 'final') {
    setStage(s, b, 'passed', `אושרה בקריאה שנייה ושלישית (${tally})! החוק ייכנס לתוקף.`);
    onPassed(s, b);
    onBillPassed(s, b);
  }
  if (stage !== 'final') addNews(s, `"${b.title}" עברה ב${STAGE_NAMES[stage]} (${tally})`, 'good', true);
  log(s, `"${b.title}" עברה ב${STAGE_NAMES[stage]} (${tally})`, 'vote');
  return res;
}

function onPassed(s: GameState, b: Bill) {
  const t = templateById(b.templateId);
  const impact = billImpact(b);
  onLawPassed(s, { templateId: t.id, title: b.title, scope: b.scope, sponsor: b.sponsor });
  if (b.sponsor === 'player' || b.sponsor === s.player.employerId) reactToLaw(s, t.id, billLean(b), b.title);
  for (const [k, v] of Object.entries(t.world)) addWorldEffect(s, k as keyof typeof s.world, v! * impact, t.weeks, b.title, t.delay);
  const own = b.sponsor === 'player' ? 1 : 0.35;
  const fameF = 0.5 + s.player.fame / 100;
  for (const sec of SECTORS) changeApproval(s, sec, (t.sectors[sec] ?? 0) * impact * fameF * own);
  addStat(s, 'reputation', 6 * own + 2);
  s.player.capital += 5 * own + 1;
  addStat(s, 'fame', 6 * own);
  const sp = sponsorParty(s, b);
  if (sp) s.parties[sp].poll += 0.4 * impact;
  if (b.sponsor === 'player') {
    if (!s.player.achievements.includes('first_law')) s.player.achievements.push('first_law');
  } else if (s.player.employerId) changeAttitude(s, s.player.employerId, 15);
  addNews(s, `הכנסת אישרה סופית: ${b.title}`, 'good', true, `החוק עבר בקריאה שנייה ושלישית. השפעתו תורגש בהדרגה בשבועות הקרובים.`);
}

// ---- מיני-משחק: דיון בוועדה (נקרא מאירוע committee_session) ----
function billFromCtx(s: GameState, ctx: Ctx) {
  return s.bills.find((b) => b.id === ctx.bill);
}

registerSpecial('cs_data', (s, ctx) => {
  const b = billFromCtx(s, ctx);
  if (!b) return;
  const p = 0.35 + s.player.skills.law / 130;
  s.player.skills.law = clamp(s.player.skills.law + 1, 0, 100);
  if (rand(s) < p) {
    advanceCommittee(s, b, 1);
    return 'הנתונים שכנעו. הדיון התקדם.';
  }
  b.sessionPending = false;
  b.history.push({ week: s.week, text: 'הדיון בוועדה הסתיים ללא התקדמות.' });
  return 'נציגי המשרדים הקשו. הדיון נדחה.';
});
registerSpecial('cs_compromise', (s, ctx) => {
  const b = billFromCtx(s, ctx);
  if (!b) return;
  b.amendments += 1;
  advanceCommittee(s, b, 1);
  s.player.consistency = clamp(s.player.consistency - 1.5, 0, 100);
  return 'קיבלת הסתייגויות: יותר תמיכה, פחות השפעה.';
});
registerSpecial('cs_public', (s, ctx) => {
  const b = billFromCtx(s, ctx);
  if (!b) return;
  const chair = committeeChair(s, b);
  addStat(s, 'fame', 2);
  if (chair) changeAttitude(s, chair.id, -6);
  if (rand(s) < 0.35 + s.player.skills.media / 150) {
    advanceCommittee(s, b, 1);
    return 'הלחץ הציבורי עבד. הדיון התקדם.';
  }
  b.sessionPending = false;
  return 'יו"ר הוועדה נעלב ונעל את הדיון.';
});
registerSpecial('cs_fast', (s, ctx) => {
  const b = billFromCtx(s, ctx);
  if (!b) return;
  const chair = committeeChair(s, b);
  if (chair) addDebt(s, chair.id, 'player_owes', `זירוז "${b.title}" בוועדה`);
  advanceCommittee(s, b, 2);
  return 'היו"ר קבע דיון מרתוני – אבל עכשיו אתה חייב לו.';
});

// ---- שכנוע ח"כים לקראת הצבעה ----
export type LobbyMethod = 'persuade' | 'trade' | 'capital';

export function lobbyMK(s: GameState, b: Bill, npcId: string, method: LobbyMethod): { ok: boolean; text: string } {
  const n = s.npcs[npcId];
  if (!n) return { ok: false, text: '?' };
  if (n.pledges.includes(b.id)) return { ok: false, text: `${n.name} כבר התחייב` };
  const align = leanAlignment(n.ideology, billLean(b));
  n.lastContact = s.week;
  if (method === 'persuade') {
    if (s.player.ap < 1) return { ok: false, text: 'אין זמן' };
    s.player.ap -= 1;
    const p = clamp(0.2 + n.attitude / 160 + align * 0.35 + s.player.skills.negotiation / 250, 0.03, 0.9);
    s.player.skills.negotiation = clamp(s.player.skills.negotiation + 0.5, 0, 100);
    if (rand(s) < p) {
      n.pledges.push(b.id);
      changeAttitude(s, n.id, 2);
      return { ok: true, text: `${n.name} השתכנע/ה והתחייב/ה לתמוך.` };
    }
    return { ok: false, text: `${n.name} לא השתכנע/ה.` };
  }
  if (method === 'trade') {
    if (n.traits.includes('principled') && align < -0.2) return { ok: false, text: `${n.name} עקרוני/ת: "אני לא סוחר בעמדות".` };
    n.pledges.push(b.id);
    addDebt(s, n.id, 'player_owes', `החלפת קולות על "${b.title}"`);
    return { ok: true, text: `סגרתם: ${n.name} יתמוך – ואתה חייב לו קול בהמשך.` };
  }
  // capital
  if (s.player.capital < 3) return { ok: false, text: 'אין מספיק הון פוליטי' };
  if (n.attitude < -25) return { ok: false, text: `${n.name} עוין/ת מדי כדי לקבל טובות ממך.` };
  s.player.capital -= 3;
  n.pledges.push(b.id);
  return { ok: true, text: `הפעלת קשרים. ${n.name} יתמוך/תתמוך.` };
}

export function pushChair(s: GameState, b: Bill): string {
  const chair = committeeChair(s, b);
  b.pushWeek = s.week;
  if (chair) {
    chair.lastContact = s.week;
    if (chair.attitude < 0) return `${chair.name} לא מתלהב, אבל שמע את הבקשה.`;
    return `${chair.name} הבטיח לבדוק את סדר היום של הוועדה.`;
  }
  return 'הבקשה נרשמה.';
}

export function lobbyMinisterial(s: GameState, b: Bill): string {
  s.flags[`minlobby_${b.id}`] = true;
  const j = s.npcs[s.ministers.justice];
  if (j) changeAttitude(s, j.id, 2);
  return j ? `נפגשת עם ${j.name}, יו"ר ועדת השרים. העמדה תישקל מחדש.` : 'פנית לוועדת השרים.';
}
