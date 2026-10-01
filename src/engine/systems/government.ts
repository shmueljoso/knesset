import { COMMITTEE_DEFS } from '../data/committees';
import type { Committee, GameState, Npc } from '../types';
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

const MINISTRY_PREFS: Record<string, string[]> = {
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

/** הקמת ממשלה: חלוקת תיקים, יו"ר כנסת, יו"ר ועדות וחברות בוועדות. */
export function formGovernment(s: GameState, coalition: string[]) {
  for (const n of Object.values(s.npcs)) {
    n.title = undefined;
    n.ministry = undefined;
  }
  const lead = [...coalition].sort((a, b) => s.parties[b].seats - s.parties[a].seats)[0];
  const pmId = s.parties[lead].leaderId;
  s.coalition = { parties: coalition, pmId, stability: 70, formedWeek: s.week };
  s.ministers = { pm: pmId };
  if (pmId === 'player') {
    s.player.rank = 'minister';
    if (!s.player.achievements.includes('pm')) s.player.achievements.push('pm');
  } else {
    const pm = s.npcs[pmId];
    pm.title = pm.gender === 'm' ? 'ראש הממשלה' : 'ראשת הממשלה';
    pm.ministry = 'pm';
  }

  const counts: Record<string, number> = Object.fromEntries(coalition.map((p) => [p, p === lead ? 1 : 0]));
  const remaining = MINISTRIES.map((m) => m.id);
  while (remaining.length) {
    const party = [...coalition].sort(
      (a, b) => s.parties[b].seats / (counts[b] + 1) - s.parties[a].seats / (counts[a] + 1),
    )[0];
    const prefs = MINISTRY_PREFS[party] ?? [];
    const mid = prefs.find((p) => remaining.includes(p)) ?? remaining[0];
    const cand = nonPlayerMKs(s, party).find((n) => !n.ministry);
    remaining.splice(remaining.indexOf(mid), 1);
    counts[party] += 1;
    if (!cand) continue;
    const def = MINISTRIES.find((m) => m.id === mid)!;
    cand.ministry = mid;
    cand.title = cand.gender === 'm' ? def.m : def.f;
    s.ministers[mid] = cand.id;
  }

  const speaker = nonPlayerMKs(s, lead).find((n) => !n.ministry);
  if (speaker) {
    speaker.ministry = 'speaker';
    speaker.title = speaker.gender === 'm' ? 'יו"ר הכנסת' : 'יו"ר הכנסת';
  }
  const opposition = Object.values(s.parties)
    .filter((p) => p.seats > 0 && !coalition.includes(p.id))
    .sort((a, b) => b.seats - a.seats)[0];
  if (opposition) {
    const ol = s.npcs[opposition.leaderId];
    if (ol) ol.title = ol.gender === 'm' ? 'יו"ר האופוזיציה' : 'יו"רית האופוזיציה';
  }
  assignCommittees(s);
}

export function assignCommittees(s: GameState) {
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
      const pool = partyMKs(s, p.id).filter((id) => id === 'player' || !s.npcs[id].ministry);
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
    const chairParty = [...chairPartyPool].sort(
      (a, b) => b.seats / ((chairCount[b.id] ?? 0) + 1) - a.seats / ((chairCount[a.id] ?? 0) + 1),
    )[0];
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
  }
}
