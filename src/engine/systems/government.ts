import { COMMITTEE_DEFS } from '../data/committees';
import { MINISTRY_DEFS } from '../data/ministries';
import type { AgreementItem, Committee, GameState, Npc } from '../types';
import { ideologyDistance } from '../util';

export const MINISTRIES: { id: string; m: string; f: string }[] = [
  { id: 'defense', m: 'שר הביטחון', f: 'שרת הביטחון' },
  { id: 'finance', m: 'שר האוצר', f: 'שרת האוצר' },
  { id: 'justice', m: 'שר המשפטים', f: 'שרת המשפטים' },
  { id: 'foreign', m: 'שר החוץ', f: 'שרת החוץ' },
  { id: 'interior', m: 'שר הפנים', f: 'שרת הפנים' },
  { id: 'education', m: 'שר החינוך', f: 'שרת החינוך' },
  { id: 'economy', m: 'שר הכלכלה', f: 'שרת הכלכלה' },
  { id: 'health', m: 'שר הבריאות', f: 'שרת הבריאות' },
  { id: 'housing', m: 'שר הבינוי והשיכון', f: 'שרת הבינוי והשיכון' },
  { id: 'transport', m: 'שר התחבורה', f: 'שרת התחבורה' },
  { id: 'welfare', m: 'שר הרווחה', f: 'שרת הרווחה' },
  { id: 'religion', m: 'השר לשירותי דת', f: 'השרה לשירותי דת' },
];

export const MINISTRY_PREFS: Record<string, string[]> = {
  yahadut: ['housing', 'health', 'religion'],
  shomrim: ['interior', 'religion', 'welfare', 'health'],
  emuna: ['defense', 'finance', 'justice', 'housing'],
  oz: ['finance', 'defense', 'interior'],
  brit: ['welfare', 'education', 'transport'],
  smol: ['education', 'welfare'],
  tzedek: ['welfare', 'interior'],
  shivyon: ['welfare'],
};

export const partyMKs = (s: GameState, partyId: string): string[] =>
  s.seating.filter((id) => (id === 'player' ? s.player.partyId === partyId : s.npcs[id]?.partyId === partyId));

export const coalitionSeats = (s: GameState, parties: string[]) =>
  parties.reduce((a, p) => a + (s.parties[p]?.seats ?? 0), 0);

export const isCoalition = (s: GameState, partyId: string | null) => !!partyId && s.coalition.parties.includes(partyId);

/** מציאת קואליציה סבירה: מתחילים מהמפלגות הגדולות ומוסיפים את הקרובות אידיאולוגית עד 61. */
export function proposeCoalition(s: GameState, exclude: string[] = []): string[] {
  const parties = Object.values(s.parties).filter((p) => p.seats > 0 && !exclude.includes(p.id));
  const bySeats = [...parties].sort((a, b) => b.seats - a.seats);
  const options: { members: string[]; seats: number; spread: number; lead: number }[] = [];
  for (const lead of bySeats.slice(0, 3)) {
    const members = [lead.id];
    let seats = lead.seats;
    const rest = parties.filter((p) => p.id !== lead.id);
    while (seats < 61) {
      const cand = rest
        .filter((p) => !members.includes(p.id))
        .filter((p) => !members.some((m) => s.parties[m].incompatible?.includes(p.id) || p.incompatible?.includes(m)))
        .map((p) => ({ p, d: ideologyDistance(p.ideology, lead.ideology) }))
        .filter((x) => x.d < 0.5)
        .sort((a, b) => a.d - b.d)[0];
      if (!cand) break;
      members.push(cand.p.id);
      seats += cand.p.seats;
    }
    if (seats >= 61) {
      const spread = Math.max(...members.map((m) => ideologyDistance(s.parties[m].ideology, lead.ideology)));
      options.push({ members, seats, spread, lead: lead.seats });
    }
  }
  if (options.length) {
    options.sort((a, b) => b.lead - a.lead || a.spread - b.spread);
    return options[0].members;
  }
  // ממשלת אחדות
  const members = [bySeats[0].id, bySeats[1].id];
  let seats = bySeats[0].seats + bySeats[1].seats;
  for (const p of bySeats.slice(2)) {
    if (seats >= 61) break;
    if (members.some((m) => s.parties[m].incompatible?.includes(p.id))) continue;
    members.push(p.id);
    seats += p.seats;
  }
  return members;
}

const nonPlayerMKs = (s: GameState, partyId: string) =>
  partyMKs(s, partyId)
    .filter((id) => id !== 'player')
    .map((id) => s.npcs[id])
    .sort((a, b) => b.influence - a.influence);

export interface GovOptions {
  /** חלוקת תיקים שסוכמה במשא ומתן: משרד → מפלגה */
  ministries?: Record<string, string>;
  /** ראשויות ועדות שסוכמו: ועדה → מפלגה */
  chairs?: Record<string, string>;
  agreement?: AgreementItem[];
  satisfaction?: Record<string, number>;
}

export const ministryTitle = (mid: string, gender: 'm' | 'f') => {
  const def = MINISTRIES.find((m) => m.id === mid);
  return def ? (gender === 'm' ? def.m : def.f) : '';
};

/** האם השחקן ראוי לתיק כשהמפלגה שלו נכנסת לממשלה */
function playerMinisterEligible(s: GameState, partyId: string): boolean {
  const p = s.player;
  if (!p.isMK || p.defector || p.partyId !== partyId) return false;
  if (s.parties[partyId].leaderId === 'player') return true;
  // ח"כ בקדנציה ראשונה לא מקבל תיק בהקמת הממשלה (אלא אם הובטח במשא ומתן)
  return (p.partyStanding >= 60 && p.reputation >= 50 && s.career.mkTerms >= 2) || !!s.flags.promisedMinistry;
}

/** הקמת ממשלה: חלוקת תיקים, יו"ר כנסת, יו"ר ועדות וחברות בוועדות. */
export function formGovernment(s: GameState, coalition: string[], opts: GovOptions = {}) {
  for (const n of Object.values(s.npcs)) {
    n.title = undefined;
    n.ministry = undefined;
  }
  s.player.ministry = null;
  const lead = s.negotiation?.formateurParty && coalition.includes(s.negotiation.formateurParty)
    ? s.negotiation.formateurParty
    : [...coalition].sort((a, b) => s.parties[b].seats - s.parties[a].seats)[0];
  const pmId = s.parties[lead].leaderId;
  const satisfaction: Record<string, number> = {};
  for (const p of coalition) satisfaction[p] = opts.satisfaction?.[p] ?? 68;
  s.coalition = { parties: coalition, pmId, stability: 70, formedWeek: s.week, satisfaction, agreement: opts.agreement ?? [], minoritySince: null };
  s.ministers = { pm: pmId };
  if (pmId === 'player') {
    s.player.rank = 'minister';
    if (!s.player.achievements.includes('pm')) s.player.achievements.push('pm');
  } else {
    const pm = s.npcs[pmId];
    pm.title = pm.gender === 'm' ? 'ראש הממשלה' : 'ראשת הממשלה';
    pm.ministry = 'pm';
  }

  // הקצאת תיקים: קודם מה שסוכם, ואת השאר לפי גודל (D'Hondt) והעדפות
  const alloc: Record<string, string> = { ...(opts.ministries ?? {}) };
  const counts: Record<string, number> = Object.fromEntries(coalition.map((p) => [p, p === lead ? 1 : 0]));
  for (const party of Object.values(alloc)) if (counts[party] !== undefined) counts[party] += 1;
  const remaining = MINISTRIES.map((m) => m.id).filter((m) => !alloc[m]);
  while (remaining.length) {
    const party = opts.ministries
      ? lead
      : [...coalition].sort((a, b) => s.parties[b].seats / (counts[b] + 1) - s.parties[a].seats / (counts[a] + 1))[0];
    const prefs = MINISTRY_PREFS[party] ?? [];
    const mid = prefs.find((p) => remaining.includes(p)) ?? remaining[0];
    remaining.splice(remaining.indexOf(mid), 1);
    counts[party] += 1;
    alloc[mid] = party;
  }
  // השחקן כשר: מנהיג מפלגה מקבל את התיק הבכיר, ח"כ בכיר – תיק נוסף של המפלגה
  let playerMinistry: string | null = null;
  const pp = s.player.partyId;
  if (pp && coalition.includes(pp) && pmId !== 'player' && playerMinisterEligible(s, pp)) {
    const mine = MINISTRIES.map((m) => m.id).filter((m) => alloc[m] === pp);
    if (mine.length) playerMinistry = s.parties[pp].leaderId === 'player' ? mine[0] : mine[mine.length - 1];
  }
  for (const m of MINISTRIES) {
    const party = alloc[m.id];
    if (m.id === playerMinistry) {
      appointPlayerMinister(s, m.id);
      continue;
    }
    const cand = nonPlayerMKs(s, party).find((n) => !n.ministry);
    if (!cand) continue;
    cand.ministry = m.id;
    cand.title = cand.gender === 'm' ? m.m : m.f;
    s.ministers[m.id] = cand.id;
  }
  delete s.flags.promisedMinistry;

  const speaker = nonPlayerMKs(s, lead).find((n) => !n.ministry);
  if (speaker) {
    speaker.ministry = 'speaker';
    speaker.title = 'יו"ר הכנסת';
  }
  const opposition = Object.values(s.parties)
    .filter((p) => p.seats > 0 && !coalition.includes(p.id))
    .sort((a, b) => b.seats - a.seats)[0];
  if (opposition) {
    const ol = s.npcs[opposition.leaderId];
    if (ol) ol.title = ol.gender === 'm' ? 'יו"ר האופוזיציה' : 'יו"רית האופוזיציה';
  }
  assignCommittees(s, opts.chairs);
}

/** מינוי השחקן לשר (מחליף את מי שהחזיק בתיק). */
export function appointPlayerMinister(s: GameState, mid: string) {
  const prev = s.ministers[mid];
  if (prev && s.npcs[prev]) {
    s.npcs[prev].ministry = undefined;
    s.npcs[prev].title = undefined;
  }
  s.ministers[mid] = 'player';
  s.player.ministry = mid;
  s.player.rank = 'minister';
  s.player.committees = [];
  for (const c of s.committees) c.members = c.members.filter((m) => m !== 'player');
  const def = MINISTRY_DEFS.find((m) => m.id === mid);
  s.ministryState = {
    id: mid,
    budget: def?.budget ?? 2,
    performance: 50,
    dgId: null,
    dgType: null,
    programs: [],
    budgetAskedWeek: -99,
    since: s.week,
  };
  if (!s.player.achievements.includes('minister')) s.player.achievements.push('minister');
}

export function assignCommittees(s: GameState, chairs: Record<string, string> = {}) {
  const coalition = s.coalition.parties;
  const committees: Committee[] = [];
  const chairCount: Record<string, number> = {};
  const used = new Set<string>();
  const load: Record<string, number> = {};
  const seated = Object.values(s.parties).filter((p) => p.seats > 0);

  for (const def of COMMITTEE_DEFS) {
    // חלוקת מושבים בוועדה לפי שיטת השארית הגדולה
    const quotas = seated.map((p) => ({ id: p.id, q: (p.seats / 120) * def.size }));
    const alloc: Record<string, number> = Object.fromEntries(quotas.map((x) => [x.id, Math.floor(x.q)]));
    let left = def.size - Object.values(alloc).reduce((a, b) => a + b, 0);
    for (const x of [...quotas].sort((a, b) => (b.q % 1) - (a.q % 1))) {
      if (left <= 0) break;
      alloc[x.id] += 1;
      left -= 1;
    }
    const members: string[] = [];
    for (const p of seated) {
      const pool = partyMKs(s, p.id).filter((id) => (id === 'player' ? !s.player.ministry : !s.npcs[id].ministry));
      const prio = pool.sort((a, b) => {
        const pa = a === 'player' ? (s.player.committees.includes(def.id) ? -1 : 1) : 0;
        const pb = b === 'player' ? (s.player.committees.includes(def.id) ? -1 : 1) : 0;
        if (pa !== pb) return pa - pb;
        return (load[a] ?? 0) - (load[b] ?? 0);
      });
      const chosen = prio.slice(0, alloc[p.id]);
      for (const id of chosen) load[id] = (load[id] ?? 0) + 1;
      members.push(...chosen);
    }
    // יו"ר
    const chairPartyPool = def.oppositionChair ? seated.filter((p) => !coalition.includes(p.id)) : seated.filter((p) => coalition.includes(p.id));
    const agreed = chairs[def.id] ? s.parties[chairs[def.id]] : undefined;
    const chairParty =
      agreed && agreed.seats > 0
        ? agreed
        : [...chairPartyPool].sort((a, b) => b.seats / ((chairCount[b.id] ?? 0) + 1) - a.seats / ((chairCount[a.id] ?? 0) + 1))[0];
    chairCount[chairParty.id] = (chairCount[chairParty.id] ?? 0) + 1;
    let chair: Npc | undefined = nonPlayerMKs(s, chairParty.id).find((n) => !n.ministry && !used.has(n.id) && s.parties[chairParty.id].leaderId !== n.id);
    if (!chair) chair = nonPlayerMKs(s, chairParty.id).find((n) => !n.ministry);
    const chairId = chair ? chair.id : members.find((m) => m !== 'player') ?? '';
    if (chair) {
      used.add(chair.id);
      if (!chair.title) chair.title = `יו"ר ${def.name}`;
    }
    if (chairId && !members.includes(chairId)) {
      const idx = members.findIndex((m) => m !== 'player' && s.npcs[m]?.partyId === chairParty.id);
      if (idx >= 0) members[idx] = chairId;
      else members.push(chairId);
    }
    committees.push({ id: def.id, name: def.name, chairId, members, topics: def.topics });
  }
  s.committees = committees;
  if (s.player.isMK) {
    s.player.committees = committees.filter((c) => c.members.includes('player')).map((c) => c.id);
    if (s.player.rank === 'chair' && !committees.some((c) => c.chairId === 'player')) s.player.rank = 'mk';
  }
}
