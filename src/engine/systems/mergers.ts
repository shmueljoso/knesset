// איחודי מפלגות, הסכמי עודפים, מפלגות חדשות "יש מאין" והצבעה אסטרטגית.
import { NEW_PARTY_COLORS } from '../data/parties';
import { makeNpc, spawnCandidate } from '../newGame';
import { pickAgenda } from '../migrate';
import { chance, makeLocalRng, pick, rand } from '../rng';
import type { GameState, Ideology, Party, Sector } from '../types';
import { AXES, clamp, ideologyDistance, newId } from '../util';
import { recomputeStability } from './coalition';
import { addNews } from './news';
import { addMomentum, pollSeats } from './opinion';
import { addMemory, changeAttitude } from './relationships';
import { log } from './report';

export type Share = 'low' | 'fair' | 'high';
export interface MergeTerms {
  lead: 'me' | 'them';
  share: Share;
}

type Result = { ok: boolean; text: string };

export const SHARE_NAMES: Record<Share, string> = { low: 'מעט מקומות', fair: 'לפי הכוח', high: 'נדיב' };

export const listsOpen = (s: GameState) => s.week < s.primariesWeek;
const threshold = (s: GameState) => s.rules?.threshold ?? 3.25;

/** כמה מהקולות נשמרים באיחוד: איחוד רחוק אידיאולוגית מאבד מצביעים */
export function synergy(a: Party, b: Party): number {
  return clamp(1.03 - ideologyDistance(a.ideology, b.ideology) * 0.6, 0.75, 1.03);
}

export function mergeBlocked(s: GameState, a: string, b: string): string | null {
  const pa = s.parties[a];
  const pb = s.parties[b];
  if (!pa || !pb || a === b) return 'מפלגה לא קיימת';
  if (!listsOpen(s)) return 'הרשימות כבר הוגשו – איחוד אפשרי רק לפני סגירת הרשימות';
  if (s.negotiation) return 'באמצע משא ומתן קואליציוני';
  if (pa.seats > 0 && pb.seats > 0 && s.coalition.parties.includes(a) !== s.coalition.parties.includes(b)) return 'אחת בקואליציה והשנייה באופוזיציה';
  if (pa.incompatible?.includes(b) || pb.incompatible?.includes(a)) return 'המפלגות פסלו זו את זו';
  return null;
}

/** סידור מחדש של הרשימה לפי מקומות שמורים מהסכם איחוד */
export function applySlots(party: Party) {
  if (!party.slots) return;
  const reserved = Object.entries(party.slots)
    .filter(([id]) => party.list.includes(id))
    .sort((a, b) => a[1] - b[1]);
  const ids = new Set(reserved.map(([id]) => id));
  const list = party.list.filter((id) => !ids.has(id));
  for (const [id, pos] of reserved) list.splice(Math.min(pos - 1, list.length), 0, id);
  party.list = list;
}

/** מזהי הרשימה של מפלגה, לפי הסדר, כולל השחקן אם הוא בה */
function members(s: GameState, party: Party): string[] {
  const list = [...party.list];
  const running = party.leaderId === 'player' || s.player.isMK || s.player.wantsList;
  if (s.player.partyId === party.id && running && !list.includes('player')) list.splice(party.leaderId === 'player' ? 0 : list.length, 0, 'player');
  return list;
}

/**
 * איחוד: goneId נבלעת ב-keepId. היו"ר של keep עומד בראש הרשימה, ולצד השני
 * נשמרים מקומות ריאליים לפי ההסכם.
 */
export function mergeParties(s: GameState, keepId: string, goneId: string, share: Share = 'fair', name?: string): Party {
  const keep = s.parties[keepId];
  const gone = s.parties[goneId];
  const syn = synergy(keep, gone);
  const total = keep.poll + gone.poll || 1;
  const w = keep.poll / total;
  // רשימה ומקומות שמורים
  const goneMembers = members(s, gone);
  const combined = (keep.poll + gone.poll) * syn;
  const realistic = Math.max(2, pollSeats(combined, 0));
  const frac = clamp((gone.poll / total) * (share === 'low' ? 0.6 : share === 'high' ? 1.4 : 1), 0.08, 0.6);
  const n = clamp(Math.round(realistic * frac), 1, goneMembers.length);
  const step = Math.max(2, Math.round(1 / frac));
  const slots: Record<string, number> = { ...(keep.slots ?? {}) };
  goneMembers.slice(0, n).forEach((id, j) => (slots[id] = 2 + j * step));
  keep.list = [...members(s, keep), ...goneMembers];
  if (keep.leaderId === 'player') keep.list = ['player', ...keep.list.filter((id) => id !== 'player')];
  keep.slots = slots;
  applySlots(keep);
  // מאפיינים
  keep.ideology = Object.fromEntries(AXES.map((a) => [a, Math.round(keep.ideology[a] * w + gone.ideology[a] * (1 - w))])) as Ideology;
  for (const [sec, v] of Object.entries(gone.sectors) as [Sector, number][]) keep.sectors[sec] = Math.max(keep.sectors[sec] ?? 0, v);
  keep.seats += gone.seats;
  keep.inOutgoingKnesset = keep.seats > 0;
  if (keep.playerFounded) keep.absorbed = (keep.absorbed ?? 0) + gone.poll * syn;
  else keep.base = (keep.base + (gone.playerFounded ? gone.poll : gone.base)) * syn;
  keep.poll = combined;
  keep.momentum = ((keep.momentum ?? 0) + (gone.momentum ?? 0)) * 0.5;
  keep.mergedFrom = [...(keep.mergedFrom ?? []), gone.name];
  keep.incompatible = [...new Set([...(keep.incompatible ?? []), ...(gone.incompatible ?? [])])].filter((x) => x !== keepId && x !== goneId);
  if (name?.trim()) {
    keep.name = name.trim();
    keep.short = name.trim().split(' ')[0];
  }
  // אנשים
  for (const npc of Object.values(s.npcs)) if (npc.partyId === goneId) npc.partyId = keepId;
  if (s.player.partyId === goneId) {
    s.player.partyId = keepId;
    s.player.memberSince = s.week;
    s.player.wantsList = s.player.wantsList || s.player.isMK || gone.leaderId === 'player';
  }
  const pos = keep.list.indexOf('player');
  if (s.player.partyId === keepId && pos >= 0 && (s.player.listPosition !== null || pos === 0 || gone.leaderId === 'player')) s.player.listPosition = pos + 1;
  // קואליציה
  if (s.coalition.parties.includes(goneId)) {
    if (!s.coalition.parties.includes(keepId)) {
      s.coalition.parties.push(keepId);
      s.coalition.satisfaction[keepId] = s.coalition.satisfaction[goneId] ?? 60;
    }
    s.coalition.parties = s.coalition.parties.filter((p) => p !== goneId);
  }
  removeParty(s, goneId, keepId);
  recomputeStability(s);
  return keep;
}

/** מחיקת מפלגה וניקוי כל ההפניות אליה */
export function removeParty(s: GameState, id: string, heir?: string) {
  delete s.coalition.satisfaction[id];
  s.coalition.parties = s.coalition.parties.filter((p) => p !== id);
  for (const a of s.coalition.agreement) if (a.partyId === id && heir) a.partyId = heir;
  s.coalition.agreement = s.coalition.agreement.filter((a) => s.parties[a.partyId] && a.partyId !== id);
  for (const p of Object.values(s.parties)) {
    if (p.surplusPartner === id) p.surplusPartner = undefined;
    if (p.incompatible) p.incompatible = p.incompatible.filter((x) => x !== id);
  }
  for (const b of s.bills) if (b.agreementParty === id) b.agreementParty = heir;
  delete s.parties[id];
}

// ---------- הצעת איחוד מהשחקן ----------

export function playerLeads(s: GameState): Party | null {
  const party = s.player.partyId ? s.parties[s.player.partyId] : null;
  return party && party.leaderId === 'player' ? party : null;
}

export function mergeChance(s: GameState, partyId: string, terms: MergeTerms): number {
  const me = playerLeads(s);
  const them = s.parties[partyId];
  if (!me || !them) return 0;
  const thr = threshold(s);
  const desperate = them.poll < thr ? 0.3 : them.poll < thr + 1.2 ? 0.15 : 0;
  const dist = ideologyDistance(me.ideology, them.ideology);
  const ratio = them.poll / (me.poll + them.poll || 1);
  const att = s.npcs[them.leaderId]?.attitude ?? 0;
  let p = 0.2 + desperate - dist * 1.3 + att / 250;
  p += terms.lead === 'them' ? 0.3 : -(ratio - 0.3) * 0.9;
  p += terms.share === 'low' ? -0.15 : terms.share === 'high' ? 0.12 : 0;
  if (me.poll < thr && them.poll >= thr && terms.lead === 'me') p -= 0.15;
  return clamp(p, 0.03, 0.95);
}

export function mergeForecast(s: GameState, partyId: string, terms: MergeTerms) {
  const me = playerLeads(s)!;
  const them = s.parties[partyId];
  const poll = (me.poll + them.poll) * synergy(me, them);
  return {
    poll,
    seats: pollSeats(poll, threshold(s)),
    separate: pollSeats(me.poll, threshold(s)) + pollSeats(them.poll, threshold(s)),
    position: terms.lead === 'me' ? 1 : 2,
    chance: mergeChance(s, partyId, terms),
    lost: Math.round((1 - synergy(me, them)) * 100),
  };
}

export function proposeMerger(s: GameState, partyId: string, terms: MergeTerms, name?: string): Result {
  const me = playerLeads(s);
  if (!me) return { ok: false, text: 'רק יו"ר מפלגה יכול/ה לנהל איחוד' };
  const blocked = mergeBlocked(s, me.id, partyId);
  if (blocked) return { ok: false, text: blocked };
  const cool = Number(s.flags[`mergeAsk_${partyId}`] ?? -99);
  if (s.week - cool < 8) return { ok: false, text: 'הם דחו אותך לאחרונה. נסה/י שוב בעוד כמה שבועות.' };
  const them = s.parties[partyId];
  const leader = s.npcs[them.leaderId];
  if (rand(s) > mergeChance(s, partyId, terms)) {
    s.flags[`mergeAsk_${partyId}`] = s.week;
    if (leader) changeAttitude(s, leader.id, -6, { spread: false });
    addNews(s, `${them.short} דחתה את הצעת האיחוד של ${me.short}`, 'neutral', true);
    return { ok: false, text: `${leader?.name ?? 'היו"ר'} דחה/תה את ההצעה. "לא עכשיו."` };
  }
  return executeMerger(s, partyId, terms, name);
}

/** ביצוע איחוד שהוסכם (בלי הגרלה) */
export function executeMerger(s: GameState, partyId: string, terms: MergeTerms, name?: string): Result {
  const me = playerLeads(s);
  if (!me || !s.parties[partyId]) return { ok: false, text: 'האיחוד לא יצא לפועל' };
  const them = s.parties[partyId];
  const leader = s.npcs[them.leaderId];
  const oldName = me.name;
  if (terms.lead === 'me') {
    mergeParties(s, me.id, partyId, terms.share === 'low' ? 'low' : terms.share === 'high' ? 'high' : 'fair', name);
    if (leader) {
      changeAttitude(s, leader.id, 10);
      addMemory(s, leader.id, 'איחד/ה איתי את הרשימות', 8);
    }
  } else {
    // השחקן מוותר על הראשות ומקבל את המקום השני; המפלגה שלו נבלעת
    const share: Share = terms.share === 'low' ? 'high' : terms.share === 'high' ? 'low' : 'fair';
    const merged = mergeParties(s, partyId, me.id, share, name);
    merged.slots = { ...(merged.slots ?? {}), player: 2 };
    applySlots(merged);
    s.player.listPosition = merged.list.indexOf('player') + 1;
    s.player.partyStanding = 75;
    if (leader) changeAttitude(s, leader.id, 15);
  }
  const merged = s.parties[s.player.partyId!];
  addNews(s, `איחוד: ${oldName} ו${them.name} ירוצו ברשימה משותפת${merged.leaderId === 'player' ? ` בראשות ${s.player.name}` : ''}`, 'good', true, undefined, 'ערוץ המשכן');
  log(s, `איחוד עם ${them.name}. הרשימה המשותפת: ${merged.name}.`, 'career');
  return { ok: true, text: `סגרתם! ${merged.name} בסקרים: ${pollSeats(merged.poll, threshold(s))} מנדטים. את/ה במקום ה-${s.player.listPosition ?? 1}.` };
}

export function surplusBlocked(s: GameState, partyId: string): string | null {
  const me = playerLeads(s);
  if (!me) return 'רק יו"ר מפלגה';
  if (me.surplusPartner) return `כבר יש לך הסכם עודפים עם ${s.parties[me.surplusPartner]?.short ?? ''}`;
  if (s.parties[partyId]?.surplusPartner) return 'כבר חתמו עם מפלגה אחרת';
  if (s.week >= s.electionWeek) return 'מאוחר מדי';
  return null;
}

export function proposeSurplus(s: GameState, partyId: string): Result {
  const blocked = surplusBlocked(s, partyId);
  if (blocked) return { ok: false, text: blocked };
  const me = playerLeads(s)!;
  const them = s.parties[partyId];
  const p = clamp(0.85 - ideologyDistance(me.ideology, them.ideology) * 1.6 + (s.npcs[them.leaderId]?.attitude ?? 0) / 300, 0.05, 0.95);
  if (rand(s) > p) return { ok: false, text: `${them.short} העדיפה לא לחתום איתך.` };
  me.surplusPartner = them.id;
  them.surplusPartner = me.id;
  addNews(s, `${me.short} ו${them.short} חתמו על הסכם עודפים`, 'neutral', true);
  return { ok: true, text: 'נחתם הסכם עודפים: בחלוקת המושבים האחרונים תתמודדו כגוש אחד.' };
}

/** המתחרה הישירה: המפלגה הקרובה ביותר אידיאולוגית (מתחרה על אותם מצביעים) */
export function directRival(s: GameState): Party | null {
  const mine = s.player.partyId ? s.parties[s.player.partyId] : null;
  if (!mine) return null;
  return (
    Object.values(s.parties)
      .filter((p) => p.id !== mine.id && p.poll >= 1.5)
      .map((p) => ({ p, score: ideologyDistance(p.ideology, mine.ideology) - Math.min(p.poll, 20) / 200 }))
      .sort((a, b) => a.score - b.score)[0]?.p ?? null
  );
}

// ---------- מפלגות חדשות ----------

export interface Archetype {
  names: string[];
  ideology: Ideology;
  sectors: Partial<Record<Sector, number>>;
  momentum: number;
  bio: string;
}

function freeColor(s: GameState): string {
  const used = new Set(Object.values(s.parties).map((p) => p.color));
  return NEW_PARTY_COLORS.find((c) => !used.has(c)) ?? pick(s, NEW_PARTY_COLORS);
}

/** מפלגה חדשה עם יו"ר בולט/ת ורשימה; מתחילה כמעט מאפס ועולה במומנטום. */
export function spawnParty(s: GameState, arch: Archetype): Party {
  const id = newId(s, 'np');
  const used = new Set(Object.values(s.parties).map((p) => p.name));
  const name = arch.names.find((n) => !used.has(n)) ?? `${pick(s, arch.names)} ${s.knesset}`;
  const party: Party = {
    id,
    name,
    short: name.split(' ')[0],
    color: freeColor(s),
    ideology: { ...arch.ideology },
    leaderId: '',
    seats: 0,
    poll: 0.8,
    base: 0.8,
    primaries: false,
    sectors: { ...arch.sectors },
    list: [],
    inOutgoingKnesset: false,
  };
  s.parties[id] = party;
  const rnd = makeLocalRng(s.seed + s.counter * 104729);
  const names = new Set(Object.values(s.npcs).map((n) => n.name));
  const leader = makeNpc(rnd, names, newId(s, 'nl'), { id, ideology: arch.ideology, namePool: { jewish: 1 } }, 'candidate', 0);
  leader.bio = arch.bio;
  leader.agenda = pickAgenda(leader, s.seed + s.counter * 37);
  leader.influence = 80;
  leader.primaryStrength = 95;
  leader.notable = true;
  s.npcs[leader.id] = leader;
  party.leaderId = leader.id;
  party.list.push(leader.id);
  for (let i = 0; i < 14; i++) spawnCandidate(s, id);
  addMomentum(s, id, arch.momentum);
  return party;
}

/** פילוג במפלגה של NPC: מורדים לוקחים כשליש מהרשימה */
export function npcSplit(s: GameState, fromId: string, arch: Omit<Archetype, 'ideology' | 'sectors'>): Party | null {
  const from = s.parties[fromId];
  if (!from || from.leaderId === 'player') return null;
  const rebels = from.list.filter((id) => id !== from.leaderId && id !== 'player' && s.npcs[id]).slice(1, 1 + Math.max(2, Math.round(from.list.length / 3)));
  const rebelLeader = s.npcs[rebels[0]];
  if (!rebelLeader) return null;
  const id = newId(s, 'np');
  const name = arch.names.find((n) => !Object.values(s.parties).some((p) => p.name === n)) ?? `${pick(s, arch.names)} ${s.knesset}`;
  const ideology = Object.fromEntries(AXES.map((a) => [a, clamp(from.ideology[a] + (rand(s) - 0.5) * 30, -100, 100)])) as Ideology;
  const mkRebels = rebels.filter((r) => s.npcs[r].isMK);
  const party: Party = {
    id,
    name,
    short: name.split(' ')[0],
    color: freeColor(s),
    ideology,
    leaderId: rebelLeader.id,
    seats: mkRebels.length,
    poll: Math.max(0.5, from.poll * 0.15),
    base: Math.max(0.5, from.base * 0.15),
    primaries: false,
    sectors: { ...from.sectors },
    list: rebels,
    inOutgoingKnesset: mkRebels.length > 0,
  };
  from.list = from.list.filter((x) => !rebels.includes(x));
  from.seats -= mkRebels.length;
  from.base *= 0.88;
  from.poll *= 0.88;
  for (const r of rebels) s.npcs[r].partyId = id;
  s.parties[id] = party;
  if (s.coalition.parties.includes(fromId) && mkRebels.length) {
    s.coalition.parties.push(id);
    s.coalition.satisfaction[id] = 35;
  }
  addMomentum(s, id, arch.momentum);
  addMomentum(s, fromId, -arch.momentum * 0.4);
  recomputeStability(s);
  return party;
}

// ---------- דינמיקה שבועית ----------

const MERGE_NAMES = ['ביחד', 'הגוש המאוחד', 'הרשימה המשותפת', 'האיחוד', 'כוח משותף'];

/** מפלגות קטנות שמחפשות שותפה; הצבעה אסטרטגית סמוך לבחירות. */
export function tickPartyDynamics(s: GameState) {
  const thr = threshold(s);
  const toClose = s.primariesWeek - s.week;
  const parties = Object.values(s.parties);
  // איחודי NPC לפני סגירת הרשימות
  if (toClose >= 1 && toClose <= 12 && !s.negotiation) {
    for (const p of parties) {
      if (!s.parties[p.id] || p.leaderId === 'player' || p.poll >= thr + 0.8) continue;
      if (!chance(s, 0.06 * (s.settings?.drama === 'wild' ? 1.6 : s.settings?.drama === 'calm' ? 0.6 : 1))) continue;
      const partner = Object.values(s.parties)
        .filter((q) => q.id !== p.id && !mergeBlocked(s, p.id, q.id))
        .map((q) => ({ q, d: ideologyDistance(p.ideology, q.ideology) }))
        .filter((x) => x.d < 0.28)
        .sort((a, b) => a.d - b.d)[0]?.q;
      if (!partner) continue;
      if (partner.leaderId === 'player') {
        if (!s.eventQueue.some((e) => e.eventId === 'merger_offer')) s.eventQueue.push({ eventId: 'merger_offer', ctx: { party: p.id, npc: p.leaderId } });
        continue;
      }
      const [keep, gone] = partner.poll >= p.poll ? [partner, p] : [p, partner];
      const playerInvolved = s.player.partyId === keep.id || s.player.partyId === gone.id;
      const goneName = gone.name;
      mergeParties(s, keep.id, gone.id, 'fair', keep.poll < thr && gone.poll < thr ? pick(s, MERGE_NAMES) : undefined);
      addNews(s, `איחוד לפני הבחירות: ${goneName} מצטרפת ל${keep.name}`, 'neutral', playerInvolved, undefined, 'ערוץ המשכן');
      if (playerInvolved) s.eventQueue.push({ eventId: 'merger_announced', ctx: { party: keep.id, gone: goneName } });
    }
  }
  // הצבעה אסטרטגית: "לא לזרוק את הקול"
  const toElection = s.electionWeek - s.week;
  if (toElection >= 1 && toElection <= 6) {
    for (const p of Object.values(s.parties)) {
      if (p.poll <= 1 || p.poll >= thr) continue;
      const near = Object.values(s.parties)
        .filter((q) => q.id !== p.id && q.poll >= thr)
        .sort((a, b) => ideologyDistance(a.ideology, p.ideology) - ideologyDistance(b.ideology, p.ideology))[0];
      if (!near) continue;
      const moved = p.poll * 0.04;
      p.poll -= moved;
      near.poll += moved;
      p.momentum = (p.momentum ?? 0) - moved;
    }
  }
}
