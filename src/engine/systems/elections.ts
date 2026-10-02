import { addStat } from '../stats';
import { rand } from '../rng';
import type { GameState } from '../types';

import { spawnCandidate } from '../newGame';
import { startFormateur, startPartner } from './coalition';
import { applyRecruits } from './influence';
import { formGovernment, proposeCoalition } from './government';
import { addNews } from './news';
import { log } from './report';

export const THRESHOLD = 0.0325;

/**
 * חלוקת מנדטים לפי חוק בדר-עופר (שקול ל-D'Hondt) כולל הסכמי עודפים:
 * רשימות עם הסכם עודפים מתמודדות כגוש אחד על המושבים, ואז הגוש מתחלק ביניהן.
 */
export function allocateSeats(
  votes: Record<string, number>,
  surplus: Record<string, string | undefined> = {},
  seats = 120,
  threshold = THRESHOLD,
): Record<string, number> {
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  const passing = Object.keys(votes).filter((p) => votes[p] >= total * threshold);
  const result: Record<string, number> = Object.fromEntries(Object.keys(votes).map((p) => [p, 0]));
  // בניית יחידות (גושי עודפים)
  const units: string[][] = [];
  const seen = new Set<string>();
  for (const p of passing) {
    if (seen.has(p)) continue;
    const partner = surplus[p];
    if (partner && passing.includes(partner) && !seen.has(partner)) {
      units.push([p, partner]);
      seen.add(partner);
    } else units.push([p]);
    seen.add(p);
  }
  const unitVotes = units.map((u) => u.reduce((a, p) => a + votes[p], 0));
  const unitSeats = dhondt(unitVotes, seats);
  units.forEach((u, i) => {
    if (u.length === 1) result[u[0]] = unitSeats[i];
    else {
      const inner = dhondt(u.map((p) => votes[p]), unitSeats[i]);
      u.forEach((p, j) => (result[p] = inner[j]));
    }
  });
  return result;
}

function dhondt(votes: number[], seats: number): number[] {
  const out = votes.map(() => 0);
  for (let k = 0; k < seats; k++) {
    let best = -1;
    let bestQ = -1;
    votes.forEach((v, i) => {
      const q = v / (out[i] + 1);
      if (q > bestQ) {
        bestQ = q;
        best = i;
      }
    });
    if (best < 0) break;
    out[best] += 1;
  }
  return out;
}

/** ציון השחקן בפריימריז/אצל היו"ר – בסקאלה של primaryStrength של NPC (0-100). */
export function playerListScore(s: GameState): number {
  const p = s.player;
  const party = p.partyId ? s.parties[p.partyId] : null;
  if (!party) return 0;
  if (party.primaries) {
    return p.partyStanding * 0.45 + p.fame * 0.25 + p.primariesScore + p.reputation * 0.15 + (p.isMK ? 12 : 0);
  }
  const leader = s.npcs[party.leaderId];
  return (leader ? (leader.attitude + 100) / 2 : 50) * 0.5 + p.fame * 0.2 + p.reputation * 0.2 + p.partyStanding * 0.2 + (p.isMK ? 8 : 0);
}

/** בניית רשימות לקראת הבחירות; השחקן מוצב לפי הציון שלו. */
export function buildLists(s: GameState) {
  applyRecruits(s);
  for (const party of Object.values(s.parties)) {
    if (party.playerFounded) continue;
    const leader = party.leaderId;
    const cands = party.list.filter((id) => id !== 'player' && s.npcs[id]);
    const scored = cands
      .filter((id) => id !== leader)
      .map((id) => {
        const n = s.npcs[id];
        return { id, score: n.primaryStrength + (n.isMK ? 10 : 0) + (rand(s) - 0.5) * (party.primaries ? 30 : 12) };
      });
    const playerIn = s.player.partyId === party.id && (s.player.wantsList || s.player.isMK);
    let blocked = false;
    if (playerIn && s.player.defector && party.inOutgoingKnesset) blocked = true;
    if (playerIn && !blocked) scored.push({ id: 'player', score: playerListScore(s) });
    scored.sort((a, b) => b.score - a.score);
    if (leader === 'player') {
      party.list = ['player', ...scored.filter((x) => x.id !== 'player').map((x) => x.id)];
      s.player.listPosition = 1;
      continue;
    }
    party.list = [leader, ...scored.map((x) => x.id)];
    if (playerIn) {
      const pos = party.list.indexOf('player');
      s.player.listPosition = pos >= 0 ? pos + 1 : null;
      if (blocked) log(s, 'כ"פורש" אינך יכול להתמודד ברשימה של סיעה מהכנסת היוצאת.', 'career');
      else {
        s.player.rank = s.player.isMK ? s.player.rank : 'candidate';
        log(s, `שובצת במקום ה-${pos + 1} ברשימת ${party.name}.`, 'career');
        addNews(s, `${s.player.name} שובץ/ה במקום ה-${pos + 1} ברשימת ${party.short}`, pos + 1 <= party.seats ? 'good' : 'neutral', true);
      }
    }
  }
}

/** יום הבחירות. */
export function runElection(s: GameState) {
  // ניצחון: קדנציה מלאה כראש ממשלה
  if (s.coalition.pmId === 'player' && s.week - s.coalition.formedWeek >= 150 && !s.flags.pmTermWin) {
    s.flags.pmTermWin = true;
    s.gameOver = 'pm_term';
  }
  const ranForKnesset = s.player.isMK || s.player.listPosition !== null;
  const votes: Record<string, number> = {};
  const turnout = 4_700_000 + Math.round(rand(s) * 400_000);
  for (const p of Object.values(s.parties)) {
    const noisy = Math.max(0.05, p.poll * (1 + (rand(s) - 0.5) * 0.18));
    votes[p.id] = noisy;
  }
  const totalShare = Object.values(votes).reduce((a, b) => a + b, 0);
  for (const id of Object.keys(votes)) votes[id] = Math.round((votes[id] / totalShare) * turnout);
  const surplus = Object.fromEntries(Object.values(s.parties).map((p) => [p.id, p.surplusPartner]));
  const seats = allocateSeats(votes, surplus, 120, (s.rules?.threshold ?? 3.25) / 100);

  // הרכב הכנסת החדשה
  for (const n of Object.values(s.npcs)) n.isMK = false;
  const wasMK = s.player.isMK;
  s.player.isMK = false;
  const seating: string[] = [];
  const order = Object.values(s.parties).sort(
    (a, b) => a.ideology.security + a.ideology.judiciary - (b.ideology.security + b.ideology.judiciary),
  );
  for (const p of order) {
    p.seats = seats[p.id];
    while (p.list.length < p.seats) spawnCandidate(s, p.id);
    const elected = p.list.slice(0, p.seats);
    for (const id of p.list) if (id !== 'player' && s.npcs[id]) s.npcs[id].partyId = p.id;
    for (const id of elected) {
      if (id === 'player') s.player.isMK = true;
      else {
        s.npcs[id].isMK = true;
        s.npcs[id].role = 'mk';
      }
    }
    for (const id of p.list.slice(p.seats)) if (id !== 'player' && s.npcs[id]) s.npcs[id].role = 'candidate';
    seating.push(...elected);
    p.inOutgoingKnesset = p.seats > 0;
    p.base = (votes[p.id] / turnout) * 100;
    p.poll = p.base;
  }
  // אם לרשימה אין מספיק מועמדים – מושבים לא מאוישים נשארים "ריקים" (נדיר)
  s.seating = seating;
  s.knesset += 1;
  s.player.defector = false;
  for (const n of Object.values(s.npcs)) n.pledges = [];

  const playerPos = s.player.listPosition;
  s.lastElection = { week: s.week, knesset: s.knesset, votes, seats, playerElected: s.player.isMK, playerPosition: playerPos };
  if (s.player.isMK) {
    if (!wasMK) {
      s.player.rank = 'mk';
      s.player.employerId = null;
      s.player.achievements.push('elected');
    }
    addStat(s, 'fame', 10);
    addStat(s, 'reputation', 5);
    log(s, `נבחרת לכנסת ה-${s.knesset}!`, 'career');
  } else if (wasMK) {
    s.player.rank = s.player.partyId ? 'activist' : 'citizen';
    s.player.committees = [];
    log(s, 'לא נבחרת מחדש לכנסת.', 'career');
  } else if (s.player.rank === 'candidate') s.player.rank = s.player.employerId ? 'aide' : 'activist';
  if (s.player.employerId && !s.npcs[s.player.employerId]?.isMK) {
    log(s, 'הבוס שלך לא נבחר מחדש – איבדת את המשרה כעוזר פרלמנטרי.', 'career');
    s.player.employerId = null;
    if (s.player.rank === 'aide') s.player.rank = 'activist';
  }
  if (s.player.isMK) {
    s.career.mkTerms += 1;
    s.career.electionsOutside = 0;
  } else if (ranForKnesset || s.career.mkTerms > 0) {
    s.career.electionsOutside += 1;
    if (s.career.electionsOutside >= 2 && !s.gameOver) s.gameOver = 'outside';
  }
  s.player.listPosition = null;
  s.player.wantsList = false;
  s.player.primariesScore = 0;
  // הצעות חוק שלא עברו – דין רציפות רק אם המגיש עדיין ח"כ
  for (const b of s.bills) {
    if (b.stage === 'passed' || b.stage === 'failed') continue;
    const stillMK = b.sponsor === 'player' ? s.player.isMK : s.npcs[b.sponsor]?.isMK;
    if (!stillMK) {
      b.stage = 'failed';
      b.history.push({ week: s.week, text: 'ההצעה נפלה עם פיזור הכנסת.' });
    } else b.history.push({ week: s.week, text: 'הוחל דין רציפות בכנסת החדשה.' });
  }

  const sorted = Object.values(s.parties).sort((a, b) => seats[b.id] - seats[a.id]);
  addNews(s, `תוצאות הבחירות לכנסת ה-${s.knesset}: ${sorted[0].name} הגדולה עם ${seats[sorted[0].id]} מנדטים`, 'neutral', false, undefined, 'ערוץ המשכן');
  const below = Object.values(s.parties).filter((p) => seats[p.id] === 0);
  if (below.length) addNews(s, `מתחת לאחוז החסימה: ${below.map((p) => p.name).join(', ')}`, 'neutral');

  // הקמת ממשלה: השחקן כפורמטור, כשותפה, או הקמה אוטומטית
  const playerParty = s.player.partyId ? s.parties[s.player.partyId] : null;
  const plan = proposeCoalition(s);
  const lead = [...plan].sort((a, b) => s.parties[b].seats - s.parties[a].seats)[0];
  if (playerParty && playerParty.leaderId === 'player' && s.player.isMK && playerParty.seats > 0) {
    if (lead === playerParty.id) startFormateur(s);
    else if (plan.includes(playerParty.id)) startPartner(s, lead);
    else completeCoalition(s, plan);
  } else completeCoalition(s, plan);

  s.electionWeek = s.week + 208;
  s.primariesWeek = s.electionWeek - 12;
}

export function completeCoalition(s: GameState, coalition: string[]) {
  formGovernment(s, coalition);
  const pmName = s.coalition.pmId === 'player' ? s.player.name : s.npcs[s.coalition.pmId].name;
  addNews(s, `${pmName} השביע/ה ממשלה חדשה: ${coalition.map((c) => s.parties[c].short).join(', ')} (${coalition.reduce((a, c) => a + s.parties[c].seats, 0)} ח"כים)`, 'neutral', false);
  log(s, `הוקמה ממשלה בראשות ${pmName}.`, s.coalition.pmId === 'player' ? 'career' : 'system');
}

export function callEarlyElections(s: GameState, reason: string) {
  if (s.electionWeek - s.week <= 14) return;
  s.electionWeek = s.week + 13;
  s.primariesWeek = s.week + 5;
  addNews(s, `${reason} – הכנסת התפזרה, בחירות בעוד כ-90 יום`, 'bad', false, undefined, 'ערוץ המשכן');
  log(s, `${reason}. בחירות מוקדמות נקבעו.`, 'system');
}
