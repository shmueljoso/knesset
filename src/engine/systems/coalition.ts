// קואליציה: שביעות רצון של שותפות, משא ומתן להקמת ממשלה, פרישה, ממשלת מיעוט ואי-אמון.
import { BILL_TEMPLATES, templateById } from '../data/bills';
import { COMMITTEE_DEFS } from '../data/committees';
import { chance, rand } from '../rng';
import type { AgreementItem, Bill, Demand, GameState, PartnerTalk, Sector } from '../types';
import { SECTORS, SECTOR_IDEOLOGY, SECTOR_NAMES, clamp, ideologyDistance, leanAlignment, newId } from '../util';
import { callEarlyElections, completeCoalition } from './elections';
import { MINISTRIES, MINISTRY_PREFS, coalitionSeats, formGovernment, ministryTitle, proposeCoalition } from './government';
import { addNews } from './news';
import { addWorldEffect, changeApproval, govSatisfaction } from './opinion';
import { changeAttitude } from './relationships';
import { log } from './report';

export const SENIOR = ['defense', 'finance', 'justice', 'foreign'];
const CHAIR_PREFS: Record<string, string> = {
  yahadut: 'finance',
  shomrim: 'labor',
  emuna: 'constitution',
  oz: 'security',
  tikva: 'constitution',
  merkaz: 'finance',
  mamlachti: 'security',
  brit: 'labor',
  smol: 'interior',
  shivyon: 'interior',
  tzedek: 'interior',
};

export function demandLabel(d: Demand): string {
  switch (d.kind) {
    case 'ministry':
      return `תיק ${ministryTitle(d.ref, 'm').replace(/^שר |^השר /, '')}`;
    case 'chair':
      return `ראשות ${COMMITTEE_DEFS.find((c) => c.id === d.ref)?.name ?? d.ref}`;
    case 'budget':
      return `${d.amount} מיליארד ₪ ל${SECTOR_NAMES[d.sector]}`;
    case 'bill':
      return `חקיקת "${templateById(d.ref).title}"`;
    case 'veto':
      return `וטו על "${templateById(d.ref).title}"`;
  }
}

export const DEMAND_ICON: Record<Demand['kind'], string> = { ministry: '🏛️', chair: '🪑', budget: '💰', bill: '📜', veto: '⛔' };

function mainSector(s: GameState, partyId: string): Sector {
  const p = s.parties[partyId];
  const entries = Object.entries(p.sectors) as [Sector, number][];
  if (entries.length) return entries.sort((a, b) => b[1] - a[1])[0][0];
  return [...SECTORS].sort((a, b) => ideologyDistance(SECTOR_IDEOLOGY[a], p.ideology) - ideologyDistance(SECTOR_IDEOLOGY[b], p.ideology))[0];
}

/** הדרישות של מפלגה במשא ומתן קואליציוני. */
export function generateDemands(s: GameState, partyId: string): { demands: Demand[]; weights: number[] } {
  const p = s.parties[partyId];
  const demands: Demand[] = [];
  const weights: number[] = [];
  const nMin = clamp(Math.round(p.seats / 5), 1, 4);
  const fallback = p.ideology.security > 55 ? ['defense', 'interior', 'housing'] : p.ideology.econ > 30 ? ['finance', 'economy', 'transport'] : ['education', 'welfare', 'health', 'transport'];
  const prefs = [...new Set([...(MINISTRY_PREFS[partyId] ?? []), ...fallback, ...MINISTRIES.map((m) => m.id)])];
  prefs.slice(0, nMin).forEach((m, i) => {
    demands.push({ kind: 'ministry', ref: m });
    weights.push((i === 0 ? 20 : 12) + (SENIOR.includes(m) ? 6 : 0));
  });
  if (p.seats >= 5) {
    demands.push({ kind: 'chair', ref: CHAIR_PREFS[partyId] ?? 'economy' });
    weights.push(9);
  }
  demands.push({ kind: 'budget', amount: Math.max(0.5, Math.round(p.seats * 0.12 * 10) / 10), sector: mainSector(s, partyId) });
  weights.push(10);
  const scored = BILL_TEMPLATES.map((t) => ({ t, a: leanAlignment(p.ideology, t.lean) })).sort((a, b) => b.a - a.a);
  const wish = scored.find((x) => !x.t.radical);
  if (wish && wish.a > 0.5) {
    demands.push({ kind: 'bill', ref: wish.t.id });
    weights.push(12);
  }
  const worst = scored[scored.length - 1];
  if (worst.a < -0.6) {
    demands.push({ kind: 'veto', ref: worst.t.id });
    weights.push(10);
  }
  return { demands, weights };
}

// ---------------- משא ומתן ----------------

function makeTalk(s: GameState, partyId: string, formateur: string): PartnerTalk {
  const { demands, weights } = generateDemands(s, partyId);
  const p = s.parties[partyId];
  const fit = 1 - ideologyDistance(p.ideology, s.parties[formateur].ideology) * 2.2;
  const leader = s.npcs[p.leaderId];
  const att = leader ? leader.attitude / 100 : 0;
  return {
    partyId,
    demands,
    weights,
    granted: demands.map(() => false),
    base: Math.round(30 + fit * 30 + att * 15),
    signed: false,
    walkedOut: false,
    attempts: 0,
  };
}

export function startFormateur(s: GameState) {
  const own = s.player.partyId!;
  const talks = Object.values(s.parties)
    .filter((p) => p.seats > 0 && p.id !== own)
    .map((p) => makeTalk(s, p.id, own));
  s.negotiation = { mode: 'formateur', formateurParty: own, startWeek: s.week, deadline: s.week + 4, extended: false, talks, budgetPool: 5, log: [] };
  addNews(s, `הנשיא הטיל על ${s.player.name} את הרכבת הממשלה`, 'good', true);
  log(s, 'קיבלת את המנדט להרכבת הממשלה: 28 יום (אפשר להאריך ב-14).', 'career');
}

export function startPartner(s: GameState, formateur: string) {
  const own = s.player.partyId!;
  const talk = makeTalk(s, own, formateur);
  talk.granted = talk.demands.map((_, i) => i === 0);
  s.negotiation = { mode: 'partner', formateurParty: formateur, startWeek: s.week, deadline: s.week + 2, extended: false, talks: [talk], budgetPool: 5, log: [] };
  log(s, `${s.parties[formateur].name} מזמינה אותך למשא ומתן קואליציוני.`, 'career');
}

export function willingness(s: GameState, t: PartnerTalk): number {
  const n = s.negotiation!;
  const total = t.weights.reduce((a, b) => a + b, 0) || 1;
  const got = t.weights.reduce((a, w, i) => a + (t.granted[i] ? w : 0), 0);
  let w = t.base + (got / total) * 50;
  const signedParties = n.talks.filter((x) => x.signed).map((x) => x.partyId);
  const p = s.parties[t.partyId];
  if (signedParties.some((sp) => p.incompatible?.includes(sp) || s.parties[sp].incompatible?.includes(t.partyId))) w -= 60;
  return clamp(Math.round(w), 0, 100);
}

/** האם פריט כבר הובטח למפלגה אחרת / סותר וטו של מפלגה אחרת / חורג מהקופה */
export function demandConflict(s: GameState, t: PartnerTalk, i: number): string | null {
  const n = s.negotiation!;
  const d = t.demands[i];
  for (const o of n.talks) {
    if (o === t) continue;
    for (let j = 0; j < o.demands.length; j++) {
      if (!o.granted[j]) continue;
      const od = o.demands[j];
      const who = s.parties[o.partyId].short;
      if ((d.kind === 'ministry' || d.kind === 'chair') && od.kind === d.kind && od.ref === d.ref) return `כבר הובטח ל${who}`;
      if (d.kind === 'bill' && od.kind === 'veto' && od.ref === d.ref) return `${who} קיבלה וטו על זה`;
      if (d.kind === 'veto' && od.kind === 'bill' && od.ref === d.ref) return `הובטח ל${who} לחוקק את זה`;
    }
  }
  if (d.kind === 'budget' && !t.granted[i]) {
    const used = budgetUsed(s);
    if (used + d.amount > n.budgetPool + 0.01) return `נשארו רק ${(n.budgetPool - used).toFixed(1)} מיליארד בקופה הקואליציונית`;
  }
  return null;
}

export function budgetUsed(s: GameState): number {
  const n = s.negotiation!;
  return n.talks.reduce((a, o) => a + o.demands.reduce((b, od, j) => b + (o.granted[j] && od.kind === 'budget' ? od.amount : 0), 0), 0);
}

export function toggleGrant(s: GameState, partyId: string, i: number): string | null {
  const t = s.negotiation?.talks.find((x) => x.partyId === partyId);
  if (!t || t.signed || t.walkedOut) return 'לא ניתן';
  if (!t.granted[i]) {
    const c = s.negotiation!.mode === 'formateur' ? demandConflict(s, t, i) : null;
    if (c) return c;
  }
  t.granted[i] = !t.granted[i];
  return null;
}

/** פורמטור (השחקן) מציע הסכם לשותפה */
export function offerDeal(s: GameState, partyId: string): { ok: boolean; text: string } {
  const n = s.negotiation!;
  const t = n.talks.find((x) => x.partyId === partyId)!;
  if (s.player.ap < 1) return { ok: false, text: 'אין זמן השבוע' };
  s.player.ap -= 1;
  const w = willingness(s, t);
  const p = s.parties[partyId];
  if (w >= 70 || (w >= 60 && rand(s) < (w - 55) / 20)) {
    t.signed = true;
    n.log.push(`${p.name} חתמה על הסכם קואליציוני.`);
    addNews(s, `${p.name} חתמה על הסכם קואליציוני עם ${s.player.name}`, 'good', true);
    return { ok: true, text: `${p.name} חתמה! (${p.seats} מנדטים)` };
  }
  t.attempts += 1;
  t.base -= 3;
  if (w < 35 && t.attempts >= 2) {
    t.walkedOut = true;
    n.log.push(`${p.name} עזבה את המגעים.`);
    return { ok: false, text: `${p.name} טרקה את הדלת: "ההצעה מעליבה". היא מחוץ למשחק.` };
  }
  return { ok: false, text: `${p.name} דחתה את ההצעה (נכונות ${w}/70). צריך לתת יותר.` };
}

export const formationSeats = (s: GameState) => {
  const n = s.negotiation!;
  return s.parties[n.formateurParty].seats + n.talks.filter((t) => t.signed).reduce((a, t) => a + s.parties[t.partyId].seats, 0);
};

function grantedOf(t: PartnerTalk) {
  return t.demands.filter((_, i) => t.granted[i]);
}

function buildAgreement(s: GameState, talks: PartnerTalk[]) {
  const ministries: Record<string, string> = {};
  const chairs: Record<string, string> = {};
  const agreement: AgreementItem[] = [];
  const satisfaction: Record<string, number> = {};
  for (const t of talks) {
    const total = t.weights.reduce((a, b) => a + b, 0) || 1;
    const got = t.weights.reduce((a, w, i) => a + (t.granted[i] ? w : 0), 0);
    satisfaction[t.partyId] = Math.round(55 + (got / total) * 35);
    for (const d of grantedOf(t)) {
      if (d.kind === 'ministry') ministries[d.ref] = t.partyId;
      if (d.kind === 'chair') chairs[d.ref] = t.partyId;
      agreement.push({
        id: newId(s, 'ag'),
        partyId: t.partyId,
        demand: d,
        status: d.kind === 'ministry' || d.kind === 'chair' ? 'done' : 'pending',
        dueWeek: d.kind === 'bill' ? s.week + 104 : d.kind === 'budget' ? s.week + 60 : s.electionWeek,
      });
    }
  }
  return { ministries, chairs, agreement, satisfaction };
}

/** השבעת הממשלה שהשחקן הרכיב */
export function swearIn(s: GameState): { ok: boolean; text: string } {
  const n = s.negotiation!;
  const seats = formationSeats(s);
  if (seats < 61) return { ok: false, text: `יש לך ${seats} מנדטים. צריך 61.` };
  const signed = n.talks.filter((t) => t.signed);
  const coalition = [n.formateurParty, ...signed.map((t) => t.partyId)];
  const { ministries, chairs, agreement, satisfaction } = buildAgreement(s, signed);
  const given = Object.keys(ministries).length;
  s.player.partyStanding = clamp(s.player.partyStanding - given * 1.5, 0, 100);
  formGovernment(s, coalition, { ministries, chairs, agreement, satisfaction });
  // סעיפי חקיקה בהסכם הופכים להצעות חוק ממשלתיות
  for (const item of agreement) {
    if (item.demand.kind !== 'bill') continue;
    createAgreementBill(s, item.demand.ref, item.partyId);
  }
  s.negotiation = null;
  addNews(s, `הממשלה בראשות ${s.player.name} הושבעה: ${coalition.map((c) => s.parties[c].short).join(', ')} (${seats} ח"כים)`, 'good', true);
  log(s, `השבעת ממשלה עם ${seats} ח"כים.`, 'career');
  return { ok: true, text: `ממשלת ${s.player.name} הושבעה! ${seats} ח"כים.` };
}

function createAgreementBill(s: GameState, templateId: string, partyId: string) {
  const t = templateById(templateId);
  const b: Bill = {
    id: newId(s, 'bill'), templateId, title: t.title, sponsor: 'player', scope: 2, stage: 'tabled', stageWeek: s.week, waitUntil: s.week + 3,
    exemption: false, govPosition: 'support', committeeId: t.committee, committeeProgress: 0, committeeNeeded: 0, amendments: 0, pushWeek: -1,
    sessionPending: false, votedThisWeek: false, government: true, agreementParty: partyId,
    history: [{ week: s.week, text: `סעיף בהסכם הקואליציוני עם ${s.parties[partyId].name}. תזכיר החוק פורסם להערות הציבור.` }],
  };
  s.bills.push(b);
}

/** מצב שותפה: השחקן מנהל משא ומתן על המחיר של המפלגה שלו */
export function partnerLeverage(s: GameState): { pivotal: boolean; altSeats: number } {
  const own = s.player.partyId!;
  const altSeats = coalitionSeats(s, proposeCoalition(s, [own]));
  return { pivotal: altSeats < 61, altSeats };
}

export function partnerAcceptChance(s: GameState): number {
  const n = s.negotiation!;
  const t = n.talks[0];
  const total = t.weights.reduce((a, b) => a + b, 0) || 1;
  const asked = t.weights.reduce((a, w, i) => a + (t.granted[i] ? w : 0), 0) / total;
  const { pivotal } = partnerLeverage(s);
  const fl = s.npcs[s.parties[n.formateurParty].leaderId];
  const att = fl ? fl.attitude / 200 : 0;
  return clamp(0.95 - asked * (pivotal ? 0.45 : 1.0) + att, 0.05, 0.95);
}

export function partnerSign(s: GameState): { ok: boolean; text: string } {
  const n = s.negotiation!;
  const t = n.talks[0];
  if (rand(s) < partnerAcceptChance(s)) {
    const plan = proposeCoalition(s);
    const coalition = plan.includes(t.partyId) ? plan : [...plan, t.partyId];
    const { ministries, chairs, agreement, satisfaction } = buildAgreement(s, [t]);
    s.flags.promisedMinistry = true;
    s.negotiation = null;
    formGovernment(s, coalition, { ministries, chairs, agreement, satisfaction });
    // תקציב שהושג – מגיע לבוחרים מיד
    for (const d of grantedOf(t)) if (d.kind === 'budget') changeApproval(s, d.sector, d.amount * 2.5);
    addNews(s, `${s.parties[t.partyId].name} בראשות ${s.player.name} מצטרפת לממשלה`, 'good', true);
    return { ok: true, text: 'נחתם! המפלגה שלך בממשלה.' };
  }
  t.attempts += 1;
  // הפורמטור מוריד את הדרישה הכבדה ביותר
  let worst = -1;
  t.granted.forEach((g, i) => {
    if (g && (worst < 0 || t.weights[i] > t.weights[worst])) worst = i;
  });
  if (worst >= 0) t.granted[worst] = false;
  const { pivotal } = partnerLeverage(s);
  if (!pivotal && t.attempts >= 3) {
    partnerDecline(s, 'הפורמטור החליט להקים ממשלה בלעדייך.');
    return { ok: false, text: 'נמאס להם – הם הקימו ממשלה בלעדייך.' };
  }
  return { ok: false, text: `הדרישה "${worst >= 0 ? demandLabel(t.demands[worst]) : ''}" נדחתה. אפשר לחתום על השאר או להתעקש.` };
}

export function partnerDecline(s: GameState, reason = 'נשארת באופוזיציה.') {
  const own = s.player.partyId;
  s.negotiation = null;
  completeCoalition(s, proposeCoalition(s, own ? [own] : []));
  s.player.consistency = clamp(s.player.consistency + 4, 0, 100);
  log(s, reason, 'career');
}

/** מעבר שבועי במשא ומתן; פקיעת המנדט */
export function tickNegotiation(s: GameState) {
  const n = s.negotiation;
  if (!n) return;
  for (const t of n.talks) if (!t.signed && !t.walkedOut) t.base -= 1.5;
  if (s.week < n.deadline) return;
  if (n.mode === 'partner') {
    partnerDecline(s, 'לא הגעתם להסכמה בזמן – הממשלה קמה בלעדייך.');
    return;
  }
  const own = n.formateurParty;
  s.negotiation = null;
  addNews(s, `${s.player.name} החזיר/ה את המנדט לנשיא – לא עלה בידו/ה להרכיב ממשלה`, 'bad', true);
  log(s, 'המנדט פקע.', 'career');
  const alt = proposeCoalition(s, [own]);
  if (coalitionSeats(s, alt) >= 61) completeCoalition(s, alt);
  else {
    completeCoalition(s, proposeCoalition(s));
    callEarlyElections(s, 'אף מועמד לא הצליח להרכיב ממשלה');
  }
}

export function extendMandate(s: GameState) {
  const n = s.negotiation;
  if (!n || n.extended || n.mode !== 'formateur') return;
  n.extended = true;
  n.deadline += 2;
  log(s, 'הנשיא האריך את המנדט ב-14 יום.', 'system');
}

// ---------------- תחזוקת הקואליציה ----------------

const pmParty = (s: GameState) => (s.coalition.pmId === 'player' ? s.player.partyId : s.npcs[s.coalition.pmId]?.partyId) ?? s.coalition.parties[0];

export function partnersOf(s: GameState) {
  const pm = pmParty(s);
  return s.coalition.parties.filter((p) => p !== pm);
}

export function recomputeStability(s: GameState) {
  const partners = partnersOf(s);
  if (!partners.length) {
    s.coalition.stability = 75;
    return;
  }
  const seats = partners.reduce((a, p) => a + s.parties[p].seats, 0) || 1;
  let st = partners.reduce((a, p) => a + (s.coalition.satisfaction[p] ?? 60) * s.parties[p].seats, 0) / seats;
  const total = coalitionSeats(s, s.coalition.parties);
  if (total < 61) st -= 20;
  else if (total < 64) st -= 6;
  s.coalition.stability = clamp(Math.round(st), 0, 100);
}

export function changeSatisfaction(s: GameState, partyId: string, d: number) {
  if (s.coalition.satisfaction[partyId] === undefined) return;
  s.coalition.satisfaction[partyId] = clamp(s.coalition.satisfaction[partyId] + d, 0, 100);
}

/** מפלגה פורשת מהקואליציה */
export function partyQuits(s: GameState, partyId: string, reason: string) {
  const c = s.coalition;
  c.parties = c.parties.filter((p) => p !== partyId);
  delete c.satisfaction[partyId];
  const pm = pmParty(s);
  // התיקים חוזרים למפלגת ראש הממשלה
  for (const [mid, holder] of Object.entries(s.ministers)) {
    if (mid === 'pm') continue;
    const holderParty = holder === 'player' ? s.player.partyId : s.npcs[holder]?.partyId;
    if (holderParty !== partyId) continue;
    if (holder === 'player') {
      s.player.ministry = null;
      s.ministryState = null;
      s.player.rank = 'mk';
    } else {
      s.npcs[holder].ministry = undefined;
      s.npcs[holder].title = undefined;
    }
    const repl = Object.values(s.npcs).find((n) => n.isMK && n.partyId === pm && !n.ministry);
    if (repl) {
      repl.ministry = mid;
      repl.title = ministryTitle(mid, repl.gender);
      s.ministers[mid] = repl.id;
    } else delete s.ministers[mid];
  }
  const seats = coalitionSeats(s, c.parties);
  addNews(s, `${s.parties[partyId].name} פורשת מהקואליציה: "${reason}". לממשלה נותרו ${seats} ח"כים`, 'bad', partyId === s.player.partyId);
  log(s, `${s.parties[partyId].name} פרשה מהקואליציה (${seats} ח"כים).`, 'system');
  if (seats < 61 && c.minoritySince === null) c.minoritySince = s.week;
  recomputeStability(s);
}

/** אי-אמון קונסטרוקטיבי: צריך 61 ח"כים שתומכים בממשלה חלופית. */
export function tryNoConfidence(s: GameState): { passed: boolean; text: string } {
  if (s.rules.presidential) return { passed: false, text: 'בשיטה הנשיאותית הכנסת לא יכולה להפיל את הממשלה באי-אמון.' };
  const pm = pmParty(s);
  const alt = proposeCoalition(s, [pm]);
  const altSeats = coalitionSeats(s, alt);
  const coalSeats = coalitionSeats(s, s.coalition.parties);
  if (coalSeats < 61 && altSeats >= 61 && chance(s, 0.6)) {
    const altPm = s.parties[[...alt].sort((a, b) => s.parties[b].seats - s.parties[a].seats)[0]];
    addNews(s, `אי-אמון קונסטרוקטיבי עבר! ממשלה חלופית בראשות ${altPm.leaderId === 'player' ? s.player.name : s.npcs[altPm.leaderId]?.name} הושבעה`, 'neutral', false, undefined, 'ערוץ המשכן');
    completeCoalition(s, alt);
    return { passed: true, text: 'הממשלה נפלה באי-אמון קונסטרוקטיבי!' };
  }
  return { passed: false, text: altSeats < 61 ? 'האופוזיציה לא הצליחה לגבש 61 תומכים לממשלה חלופית.' : 'ההצעה נדחתה – חלק מהאופוזיציה נעדר.' };
}

export function tickCoalition(s: GameState) {
  const c = s.coalition;
  const gov = govSatisfaction(s);
  const playerLeadsPartner = (p: string) => s.parties[p]?.leaderId === 'player' && c.pmId !== 'player';
  for (const p of partnersOf(s)) {
    if (playerLeadsPartner(p)) continue;
    let d = gov * 0.8 + (62 - (c.satisfaction[p] ?? 60)) * 0.03 + (rand(s) - 0.52) * 4;
    d -= c.agreement.filter((a) => a.partyId === p && a.status === 'pending' && s.week > a.dueWeek).length * 1.5;
    changeSatisfaction(s, p, d);
    if ((c.satisfaction[p] ?? 60) < 12 && chance(s, 0.5)) partyQuits(s, p, 'הממשלה הפרה את ההסכם');
  }
  // משברים פתאומיים: חוק הגיוס, תקציב, דת ומדינה...
  const npcPartners = partnersOf(s).filter((p) => !playerLeadsPartner(p));
  if (npcPartners.length && chance(s, 0.06)) {
    const p = npcPartners[Math.floor(rand(s) * npcPartners.length)];
    const reasons = ['חוק הגיוס', 'העברת תקציבים', 'עבודות בשבת', 'מינוי בכיר', 'הסכם הגז', 'רפורמה בכשרות', 'מדיניות הביטחון'];
    const reason = reasons[Math.floor(rand(s) * reasons.length)];
    changeSatisfaction(s, p, -(12 + rand(s) * 16));
    addNews(s, `משבר קואליציוני: ${s.parties[p].name} מחרימה את ישיבות הממשלה בעקבות ${reason}`, 'bad', false);
  }
  recomputeStability(s);
  if (c.minoritySince !== null) {
    if (coalitionSeats(s, c.parties) >= 61) c.minoritySince = null;
    else if (s.week - c.minoritySince >= 3) {
      c.minoritySince = null;
      const r = tryNoConfidence(s);
      if (!r.passed) callEarlyElections(s, 'ממשלת המיעוט איבדה את יכולת המשילות');
    }
  }
}

/** סעיפי הסכם: חוק שעבר או וטו שהופר */
export function onBillPassed(s: GameState, b: Bill) {
  for (const item of s.coalition.agreement) {
    if (item.status !== 'pending') continue;
    if (item.demand.kind === 'bill' && item.demand.ref === b.templateId) {
      item.status = 'done';
      changeSatisfaction(s, item.partyId, 15);
    }
    if (item.demand.kind === 'veto' && item.demand.ref === b.templateId) {
      item.status = 'broken';
      changeSatisfaction(s, item.partyId, -40);
      addNews(s, `${s.parties[item.partyId].name} זועמת: "הפרה בוטה של ההסכם הקואליציוני"`, 'bad', s.coalition.pmId === 'player');
    }
  }
}

/** אישור התקציב: סעיפי תקציב בהסכם מתממשים */
export function onBudgetPassed(s: GameState) {
  for (const item of s.coalition.agreement) {
    if (item.status !== 'pending' || item.demand.kind !== 'budget') continue;
    item.status = 'done';
    changeSatisfaction(s, item.partyId, 10);
    addWorldEffect(s, 'economy', -0.4 * item.demand.amount, 12, 'כספים קואליציוניים');
    if (s.player.partyId === item.partyId) changeApproval(s, item.demand.sector, item.demand.amount * 2);
  }
}

// ---------------- פעולות של ראש ממשלה / ראש מפלגה שותפה ----------------

export function meetPartner(s: GameState, partyId: string): string {
  s.player.ap -= 1;
  s.player.capital = Math.max(0, s.player.capital - 2);
  const gain = 6 + s.player.skills.negotiation / 15;
  changeSatisfaction(s, partyId, gain);
  const leader = s.npcs[s.parties[partyId].leaderId];
  if (leader) changeAttitude(s, leader.id, 5);
  recomputeStability(s);
  return `נפגשת עם ${leader?.name ?? 'ראש המפלגה'}. שביעות הרצון של ${s.parties[partyId].short} עלתה.`;
}

export function threatenQuit(s: GameState): string {
  const pm = s.npcs[s.coalition.pmId];
  if (pm) changeAttitude(s, pm.id, -12);
  s.player.capital += 5;
  const sec = mainSector(s, s.player.partyId!);
  changeApproval(s, sec, 2);
  s.flags.threatWeek = s.week;
  addNews(s, `${s.player.name} מאיים/ה לפרק את הקואליציה – ומשיג/ה הטבות ל${SECTOR_NAMES[sec]}`, 'neutral', true);
  return `האיום עבד: הון פוליטי +5, תדמית ב${SECTOR_NAMES[sec]} +2. ראש הממשלה לא שוכח.`;
}

export function playerPartyQuits(s: GameState): string {
  const pid = s.player.partyId!;
  const pm = s.npcs[s.coalition.pmId];
  if (pm) changeAttitude(s, pm.id, -40);
  s.player.consistency = clamp(s.player.consistency + 4, 0, 100);
  partyQuits(s, pid, 'לא נהיה חותמת גומי');
  return 'המפלגה שלך פרשה מהממשלה.';
}
