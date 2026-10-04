import { addStat } from '../stats';
import { inSession } from '../calendar';
import { SCOPE_FACTOR, templateById } from '../data/bills';
import { COMMITTEE_DEFS } from '../data/committees';
import { registerSpecial, type Ctx } from '../ops';
import { chance, rand, shuffle } from '../rng';
import type { Bill, BillStage, GameState, Ideology, LiveVote, SeatVote, VoteResult } from '../types';
import { SECTORS, clamp, leanAlignment, newId } from '../util';
import { onBillPassed, onBudgetPassed } from './coalition';
import { callEarlyElections } from './elections';
import { resetMinistryBudget } from './ministry';
import { onLawPassed, requiredMajority } from './issues';
import { isCoalition } from './government';
import { addNews } from './news';
import { addWorldEffect, changeApproval, takeStance } from './opinion';
import { addDebt, changeAttitude, reactToLaw } from './relationships';
import { log } from './report';
import { LINE_NAMES, billImpact, billLean, forecast, runVote, sponsorParty } from './votes';

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
  if (s.coalition.pmId === 'player' && b.sponsor === 'player') return 'support';
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
        else {
          setStage(s, b, 'failed', 'ועדת השרים לא אישרה את הצעת החוק הממשלתית.');
          b.cabinetRejected = true;
        }
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

/** הצבעה מיידית (לבדיקות ולתאימות): פותחת וסוגרת הצבעה חיה */
export function bringToVote(s: GameState, b: Bill) {
  startVote(s, b, 'own');
  return finishVote(s)!.result;
}

/** פתיחת הצבעה במליאה: התוצאה מוגרלת מיד, וה-UI חושף אותה מושב אחרי מושב. */
export function startVote(s: GameState, b: Bill, kind: LiveVote['kind'] = 'own', playerVote?: SeatVote): LiveVote {
  if (kind === 'own') s.player.ap -= 1;
  b.votedThisWeek = true;
  const vote = playerVote ?? (kind === 'own' && s.seating.includes('player') ? 'for' : undefined);
  const f = forecast(s, b);
  const result = runVote(s, b, vote);
  const lv: LiveVote = {
    billId: b.id,
    kind,
    result,
    order: shuffle(s, Array.from({ length: s.seating.length }, (_, i) => i)),
    playerVote: s.seating.includes('player') ? result.seats[s.seating.indexOf('player')] : null,
    lines: f.lines,
    majority: b.stage === 'final' ? requiredMajority(s, b.templateId) : null,
    rescued: false,
    flipped: [],
  };
  s.liveVote = lv;
  return lv;
}

/** סגירת ההצבעה והחלת התוצאה */
export function finishVote(s: GameState): { text: string; result: VoteResult } | null {
  const lv = s.liveVote;
  if (!lv) return null;
  s.liveVote = null;
  const b = s.bills.find((x) => x.id === lv.billId);
  if (!b) return null;
  const res = lv.result;
  b.lastVote = res;
  if (lv.kind === 'own') return { text: applyOwnVote(s, b, res), result: res };
  let text = lv.kind === 'budget' ? applyBudgetVote(s, res) : applyOtherVote(s, b, res);
  text += playerVoteConsequences(s, b, lv);
  s.bills = s.bills.filter((x) => x !== b);
  return { text, result: res };
}

function applyOwnVote(s: GameState, b: Bill, res: VoteResult): string {
  const stage = b.stage;
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
    return `ההצעה נפלה (${tally}).`;
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
  return stage === 'final' ? `זה חוק! (${tally})` : `עברה! (${tally})`;
}

function applyOtherVote(s: GameState, b: Bill, res: VoteResult): string {
  const t = templateById(b.templateId);
  const tally = `${res.for} בעד, ${res.against} נגד`;
  if (!res.passed) {
    addNews(s, `"${b.title}" נפלה במליאה: ${tally}`, 'neutral');
    return `ההצעה נפלה (${tally}).`;
  }
  b.stage = 'passed';
  onLawPassed(s, { templateId: t.id, title: b.title, scope: b.scope, sponsor: b.sponsor, coSponsor: s.flags[`cosp_${b.sponsor}`] === t.id || undefined });
  for (const [k, v] of Object.entries(t.world)) addWorldEffect(s, k as keyof typeof s.world, v! * billImpact(b) * 0.8, t.weeks, b.title, t.delay);
  const sp = s.npcs[b.sponsor];
  addNews(s, `הכנסת אישרה את "${b.title}"${sp ? ` של ${sp.name}` : ''} (${tally})`, 'neutral', false, undefined, undefined, sp?.id);
  return `החוק עבר (${tally}).`;
}

function applyBudgetVote(s: GameState, res: VoteResult): string {
  const tally = `${res.for} בעד, ${res.against} נגד`;
  if (res.passed) {
    addNews(s, `הכנסת אישרה את תקציב המדינה (${tally})`, 'neutral', false, undefined, 'ערוץ המשכן');
    onBudgetPassed(s);
    resetMinistryBudget(s);
    if (s.player.isMK && isCoalition(s, s.player.partyId)) s.player.capital += 2;
    return `התקציב עבר (${tally}). הממשלה שורדת.`;
  }
  callEarlyElections(s, `חוק התקציב נפל במליאה (${tally})`);
  return `התקציב נפל (${tally})! הכנסת מתפזרת – בחירות.`;
}

function negate(lean: Partial<Ideology>): Partial<Ideology> {
  return Object.fromEntries(Object.entries(lean).map(([k, v]) => [k, -(v ?? 0)]));
}

/** מה קרה לשחקן בגלל איך שהצביע: קו הסיעה, קול מכריע, הדמות שהגישה */
function playerVoteConsequences(s: GameState, b: Bill, lv: LiveVote): string {
  const v = lv.playerVote;
  if (!v) return '';
  const res = lv.result;
  const notes: string[] = [];
  const line = s.player.partyId ? lv.lines[s.player.partyId] ?? 'free' : 'free';
  const lean = billLean(b);
  if ((v === 'for' || v === 'against') && Object.keys(lean).length) takeStance(s, v === 'for' ? lean : negate(lean), 1);
  if (line !== 'free' && (v === 'for' || v === 'against')) {
    if (v !== line) {
      addStat(s, 'partyStanding', -5);
      const leader = s.player.partyId ? s.parties[s.player.partyId].leaderId : '';
      if (s.npcs[leader]) changeAttitude(s, leader, -8);
      if (lv.kind === 'budget' && isCoalition(s, s.player.partyId) && s.npcs[s.coalition.pmId]) changeAttitude(s, s.coalition.pmId, -15);
      notes.push('הצבעת נגד קו הסיעה: מעמד במפלגה −5.');
    } else addStat(s, 'partyStanding', 1);
  } else if (v === 'absent' && line !== 'free') {
    addStat(s, 'partyStanding', -2);
    notes.push('נעדרת מהצבעה שהסיעה ספרה עליה.');
  }
  const decisive = lv.majority
    ? res.passed && v === 'for' && res.for === lv.majority
    : (res.passed && v === 'for' && res.for - res.against === 1) || (!res.passed && v === 'against' && res.for - res.against >= -1);
  if (decisive) {
    addStat(s, 'fame', 3);
    addNews(s, `הקול של ${s.player.name} הכריע את ההצבעה על "${b.title}"`, 'neutral', true, undefined, 'ערוץ המשכן');
    notes.push('הקול שלך הכריע! מוכרות +3.');
  }
  const sp = s.npcs[b.sponsor];
  if (sp && v === 'for') changeAttitude(s, sp.id, 6);
  if (sp && v === 'against') changeAttitude(s, sp.id, -8);
  return notes.length ? ' ' + notes.join(' ') : '';
}

// ---- "להביא נעדרים מהמזנון": הצלת הצבעה צמודה ----
export const RESCUE_COST = 2;

export function rescueInfo(s: GameState): { need: number; candidates: string[]; desired: 'pass' | 'fail' } | null {
  const lv = s.liveVote;
  if (!lv || lv.rescued) return null;
  const b = s.bills.find((x) => x.id === lv.billId);
  if (!b) return null;
  const res = lv.result;
  const desired = lv.kind === 'own' ? 'pass' : lv.playerVote === 'for' ? 'pass' : lv.playerVote === 'against' ? 'fail' : null;
  if (!desired || (desired === 'pass') === res.passed) return null;
  let need: number;
  if (desired === 'pass') need = lv.majority ? lv.majority - res.for : res.against - res.for + 1;
  else {
    if (lv.majority) return null;
    need = res.for - res.against;
  }
  if (need < 1 || need > 3) return null;
  const f = forecast(s, b);
  const candidates = res.seats
    .map((v, i) => ({ v, i, sp: f.seats[i] }))
    .filter((x) => x.v === 'absent' && x.sp && (desired === 'pass' ? x.sp.pFor > x.sp.pAgainst : x.sp.pAgainst > x.sp.pFor))
    .map((x) => s.seating[x.i]);
  return candidates.length ? { need, candidates, desired } : null;
}

export function rescueVote(s: GameState): string {
  const info = rescueInfo(s);
  const lv = s.liveVote;
  if (!info || !lv) return 'אין את מי להביא.';
  lv.rescued = true;
  const want = info.desired === 'pass' ? 'for' : 'against';
  let got = 0;
  let tried = 0;
  for (const id of info.candidates) {
    if (got >= info.need || s.player.capital < RESCUE_COST) break;
    s.player.capital -= RESCUE_COST;
    tried++;
    const n = s.npcs[id];
    const p = clamp(0.55 + s.player.skills.negotiation / 300 + (n?.attitude ?? 0) / 300, 0.2, 0.9);
    if (rand(s) < p) {
      const i = s.seating.indexOf(id);
      lv.result.seats[i] = want;
      lv.flipped.push(i);
      got++;
    }
  }
  const r = lv.result;
  r.for = r.seats.filter((x) => x === 'for').length;
  r.against = r.seats.filter((x) => x === 'against').length;
  r.absent = r.seats.filter((x) => x === 'absent').length;
  r.passed = lv.majority ? r.for >= lv.majority : r.for > r.against;
  if (!tried) return 'אין מספיק הון פוליטי כדי להזעיק אף אחד.';
  return got >= info.need ? `הבאת ${got} ח"כים מהמזנון ברגע האחרון – התוצאה התהפכה!` : `הצלחת להביא ${got} מתוך ${info.need} שהיו צריכים. לא הספיק.`;
}

// ---- לחץ על ועדת השרים: אולטימטום וערר ----
export type PressureRole = 'leader' | 'minister' | 'mk';

export function pressureRole(s: GameState): PressureRole | null {
  const p = s.player;
  if (!p.isMK || !p.partyId || !isCoalition(s, p.partyId) || s.coalition.pmId === 'player') return null;
  if (s.parties[p.partyId].leaderId === 'player') return 'leader';
  return p.ministry ? 'minister' : 'mk';
}

const cabinetAgainst = (b: Bill) => b.govPosition === 'oppose' || !!b.cabinetRejected;
const pressureStage = (b: Bill) => b.stage === 'preliminary' || (b.stage === 'failed' && !!b.cabinetRejected && !b.lastVote);

export function ultimatumBlocked(s: GameState, b: Bill): string | null {
  if (b.sponsor !== 'player') return 'רק להצעות שלך';
  if (!cabinetAgainst(b) || !pressureStage(b)) return 'ועדת השרים לא חוסמת את ההצעה';
  if (!pressureRole(s)) return 'רק מתוך הקואליציה (ולא כראש הממשלה)';
  if (s.flags[`ult_${b.id}`]) return 'כבר הצבת אולטימטום על ההצעה הזו';
  if (s.player.capital < 3) return 'נדרש הון פוליטי 3';
  return null;
}

function coalitionAlign(s: GameState, b: Bill): number {
  const lean = billLean(b);
  const coal = s.coalition.parties.filter((p) => s.parties[p]);
  const seats = coal.reduce((a, p) => a + s.parties[p].seats, 0) || 1;
  return coal.reduce((a, p) => a + leanAlignment(s.parties[p].ideology, lean) * s.parties[p].seats, 0) / seats;
}

export function ultimatumChance(s: GameState, b: Bill): number {
  const role = pressureRole(s);
  if (!role) return 0;
  const party = s.parties[s.player.partyId!];
  const coal = s.coalition.parties.reduce((a, p) => a + (s.parties[p]?.seats ?? 0), 0);
  const pivotal = coal - (role === 'leader' ? party.seats : 1) < 61;
  const pm = s.npcs[s.coalition.pmId];
  const pmParty = pm?.partyId ? s.parties[pm.partyId] : null;
  const align = pmParty ? leanAlignment(pmParty.ideology, billLean(b)) : 0;
  const p = { leader: 0.3, minister: 0.18, mk: 0.07 }[role] + (pivotal ? (role === 'leader' ? 0.35 : 0.15) : 0) + (pm?.attitude ?? 0) / 250 + align * 0.25 + Math.min(s.player.capital, 30) / 100 - (b.scope === 3 ? 0.1 : 0) - (templateById(b.templateId).radical ? 0.4 : 0);
  return clamp(p, 0.03, 0.9);
}

function cabinetFlips(s: GameState, b: Bill, how: string) {
  b.govPosition = 'support';
  if (b.cabinetRejected) {
    b.cabinetRejected = false;
    setStage(s, b, 'first', `${how} – ועדת השרים חזרה בה ואישרה את ההצעה. היא מונחת לקריאה ראשונה.`);
  } else b.history.push({ week: s.week, text: `${how} – הממשלה תתמוך בהצעה.` });
}

export function issueUltimatum(s: GameState, b: Bill): { ok: boolean; text: string } {
  const blocked = ultimatumBlocked(s, b);
  if (blocked) return { ok: false, text: blocked };
  const role = pressureRole(s)!;
  const p = ultimatumChance(s, b);
  s.player.capital -= 3;
  s.flags[`ult_${b.id}`] = true;
  const pm = s.npcs[s.coalition.pmId];
  if (pm) changeAttitude(s, pm.id, -10);
  const threat = role === 'leader' ? 'המפלגה שלי פורשת מהקואליציה' : role === 'minister' ? 'אני מתפטר/ת מהממשלה' : 'אני מפסיק/ה להצביע עם הקואליציה';
  if (rand(s) < p) {
    cabinetFlips(s, b, 'אחרי אולטימטום');
    addStat(s, 'fame', 2);
    addNews(s, `${s.player.name} הציב/ה אולטימטום – והממשלה נכנעה: "${b.title}" תקבל תמיכה`, 'good', true, `"${threat} אם החוק לא עובר."`);
    return { ok: true, text: `"${threat}" – וזה עבד! הממשלה תתמוך בהצעה.` };
  }
  s.eventQueue.push({ eventId: 'ultimatum_refused', ctx: { bill: b.id, npc: pm?.id ?? '', threat } });
  addNews(s, `ראש הממשלה ל${s.player.name}: "הדלת פתוחה"`, 'bad', true);
  return { ok: false, text: 'ראש הממשלה לא נבהל. עכשיו צריך להחליט: לממש את האיום או לסגת.' };
}

export function appealBlocked(s: GameState, b: Bill): string | null {
  if (b.sponsor !== 'player') return 'רק להצעות שלך';
  if (!cabinetAgainst(b) || !pressureStage(b)) return 'ועדת השרים לא חוסמת את ההצעה';
  if (!s.player.ministry) return 'רק שר/ה יכול/ה לערער למליאת הממשלה';
  if (s.flags[`appeal_${b.id}`]) return 'כבר ערערת';
  if (s.player.ap < 1) return 'אין זמן';
  return null;
}

export function appealChance(s: GameState, b: Bill): number {
  const pm = s.npcs[s.coalition.pmId];
  return clamp(0.15 + coalitionAlign(s, b) * 0.4 + (pm?.attitude ?? 0) / 250 + s.player.skills.negotiation / 300, 0.05, 0.8);
}

export function appealToGovernment(s: GameState, b: Bill): { ok: boolean; text: string } {
  const blocked = appealBlocked(s, b);
  if (blocked) return { ok: false, text: blocked };
  s.player.ap -= 1;
  s.flags[`appeal_${b.id}`] = true;
  if (rand(s) < appealChance(s, b)) {
    cabinetFlips(s, b, 'הערר התקבל במליאת הממשלה');
    return { ok: true, text: 'מליאת הממשלה קיבלה את הערר!' };
  }
  b.history.push({ week: s.week, text: 'מליאת הממשלה דחתה את הערר.' });
  return { ok: false, text: 'מליאת הממשלה דחתה את הערר.' };
}

/** הצעה של אחרים (או חוק התקציב) עולה להצבעה בקריאה שלישית – והשחקן מצביע */
export function queueOtherVote(s: GameState, sponsor: string, templateId: string, scope: 1 | 2 | 3): Bill {
  const t = templateById(templateId);
  const b: Bill = {
    id: newId(s, 'bill'),
    templateId,
    title: t.title,
    sponsor,
    scope,
    stage: 'final',
    stageWeek: s.week,
    waitUntil: s.week,
    exemption: false,
    govPosition: null,
    committeeId: t.committee,
    committeeProgress: 0,
    committeeNeeded: 0,
    amendments: 0,
    pushWeek: -1,
    sessionPending: false,
    votedThisWeek: false,
    external: true,
    government: templateId === 'budget_law' || !!s.npcs[sponsor]?.ministry || undefined,
    history: [],
  };
  b.govPosition = templateId === 'budget_law' ? 'support' : ministerialDecision(s, b);
  s.bills.push(b);
  const f = forecast(s, b);
  const line = s.player.partyId ? f.lines[s.player.partyId] ?? 'free' : 'free';
  const budget = templateId === 'budget_law';
  s.eventQueue.push({
    eventId: budget ? 'budget_vote' : 'plenum_vote',
    ctx: { bill: b.id, kind: budget ? 'budget' : 'other', line: LINE_NAMES[line], forecast: `${Math.round(f.eFor)} בעד מול ${Math.round(f.eAgainst)} נגד`, npc: s.npcs[sponsor] ? sponsor : '' },
  });
  return b;
}

for (const v of ['for', 'against', 'abstain', 'absent'] as const) {
  registerSpecial(`cast_${v}`, (s, ctx) => {
    const b = s.bills.find((x) => x.id === ctx.bill);
    if (!b) return;
    startVote(s, b, (ctx.kind as LiveVote['kind']) ?? 'other', s.seating.includes('player') ? v : undefined);
  });
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
