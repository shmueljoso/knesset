// בחירת נשיא המדינה בכנסת: הצבעה חשאית בסבבים, כל שבע שנים.
import { registerSpecial } from '../ops';
import { spawnCandidate } from '../newGame';
import { pick, rand } from '../rng';
import type { GameState } from '../types';
import { clamp, ideologyDistance } from '../util';
import { addNews } from './news';
import { changeAttitude } from './relationships';
import { log } from './report';

export const PRESIDENT_TERM = 364; // שבע שנים

/** האם השחקן יכול להתמודד בעצמו (מוכר, מוערך, לא ראש ממשלה) */
export function playerCanRunForPresident(s: GameState): boolean {
  const p = s.player;
  return p.isMK && p.fame >= 55 && p.reputation >= 60 && s.coalition.pmId !== 'player' && !s.scandal;
}

function pickCandidates(s: GameState): string[] {
  const pmParty = s.npcs[s.coalition.pmId]?.partyId ?? s.player.partyId;
  const pool = Object.values(s.npcs).filter((n) => n.isMK && n.notable && !n.ministry && n.id !== s.coalition.pmId && !Object.values(s.parties).some((p) => p.leaderId === n.id));
  const camp = pool.filter((n) => n.partyId === pmParty || (n.partyId && s.coalition.parties.includes(n.partyId)));
  const opp = pool.filter((n) => n.partyId && !s.coalition.parties.includes(n.partyId));
  const center = [...pool].sort((a, b) => Math.abs(a.ideology.security) + Math.abs(a.ideology.religion) - (Math.abs(b.ideology.security) + Math.abs(b.ideology.religion)));
  const out: string[] = [];
  for (const list of [camp, opp, center]) {
    const c = list.find((n) => !out.includes(n.id)) ?? (list.length ? pick(s, list) : null);
    if (c && !out.includes(c.id)) out.push(c.id);
  }
  return out.slice(0, 3);
}

/** פתיחת מרוץ לנשיאות: ח"כ מקבל/ת פתק; אחרת ההצבעה מתקיימת ברקע */
export function startPresidentRace(s: GameState) {
  const candidates = pickCandidates(s);
  if (candidates.length < 2) {
    s.presidentNextWeek = s.week + 26;
    return;
  }
  s.presidentRace = { candidates, rounds: [], winner: null, playerVote: null };
  if (s.player.isMK)
    s.eventQueue.push({
      eventId: 'president_ballot',
      ctx: { c0: candidates[0], c1: candidates[1], c2: candidates[2] ?? '', c0Name: candName(s, candidates[0]), c1Name: candName(s, candidates[1]), c2Name: candidates[2] ? candName(s, candidates[2]) : '', c2Sep: candidates[2] ? `, ${candName(s, candidates[2])}` : '' },
    });
  else runPresidentVote(s, null);
}

function candName(s: GameState, id: string) {
  return id === 'player' ? s.player.name : s.npcs[id]?.name ?? '?';
}

/** ספירת הקולות: סבב א' ו-ב' דורשים 61; בסבב השלישי מספיק רוב רגיל בין שניים */
export function runPresidentVote(s: GameState, playerVote: string | null) {
  const race = s.presidentRace;
  if (!race) return;
  race.playerVote = playerVote;
  let alive = [...race.candidates];
  const pmParty = s.npcs[s.coalition.pmId]?.partyId ?? s.player.partyId;
  for (let round = 1; round <= 3; round++) {
    const counts = alive.map(() => 0);
    for (const id of s.seating) {
      if (id === 'player') {
        const i = playerVote ? alive.indexOf(playerVote) : -1;
        if (i >= 0) counts[i]++;
        continue;
      }
      const v = s.npcs[id];
      if (!v) continue;
      const w = alive.map((c) => {
        const cand = c === 'player' ? { ideology: s.player.ideology, partyId: s.player.partyId } : s.npcs[c];
        let score = -ideologyDistance(v.ideology, cand.ideology) * 5 + (cand.partyId === v.partyId ? 1.2 : 0);
        if (c === 'player') score += v.attitude / 40;
        else score += (s.npcs[c]?.influence ?? 50) / 80;
        if (cand.partyId && v.partyId && s.coalition.parties.includes(cand.partyId) === s.coalition.parties.includes(v.partyId)) score += 0.5;
        if (cand.partyId === pmParty && v.partyId && s.coalition.parties.includes(v.partyId)) score += 0.3;
        return Math.exp(score);
      });
      const total = w.reduce((a, b) => a + b, 0);
      let r = rand(s) * total;
      let k = 0;
      while (r > w[k] && k < w.length - 1) r -= w[k++];
      if (rand(s) > 0.04) counts[k]++; // פתקים לבנים
    }
    race.rounds.push({ candidates: [...alive], counts });
    const best = counts.indexOf(Math.max(...counts));
    if (counts[best] >= 61 || round === 3 || alive.length === 1) {
      race.winner = alive[best];
      break;
    }
    // שני המובילים עולים לסבב הבא
    alive = alive.map((c, i) => ({ c, n: counts[i] })).sort((a, b) => b.n - a.n).slice(0, 2).map((x) => x.c);
  }
  applyPresidentResult(s);
}

function applyPresidentResult(s: GameState) {
  const race = s.presidentRace!;
  const w = race.winner!;
  const last = race.rounds[race.rounds.length - 1];
  const votes = last.counts[last.candidates.indexOf(w)];
  s.presidentNextWeek = s.week + PRESIDENT_TERM;
  s.flags.showPresident = s.player.isMK;
  if (w === 'player') {
    s.president = { id: 'player', name: s.player.name, sinceWeek: s.week };
    addNews(s, `${s.player.name} נבחר/ה לנשיא/ת המדינה (${votes} קולות)`, 'good', true, undefined, 'ערוץ המשכן');
    log(s, 'נבחרת לנשיאות המדינה!', 'career');
    s.gameOver = 'president';
    return;
  }
  const n = s.npcs[w];
  s.president = { id: w, name: n?.name ?? '?', sinceWeek: s.week };
  if (n) {
    // הנשיא/ה עוזב/ת את הכנסת; הבא/ה ברשימה נכנס/ת במקומו/ה
    vacateSeat(s, n.id);
    n.title = 'נשיא/ת המדינה';
    if (race.playerVote === w) changeAttitude(s, w, 25);
    else if (race.playerVote) changeAttitude(s, w, -8);
  }
  addNews(s, `${n?.name ?? '?'} נבחר/ה לנשיא/ת המדינה בסבב ה-${race.rounds.length} (${votes} קולות)`, 'neutral', race.playerVote === w, undefined, 'ערוץ המשכן');
}

function vacateSeat(s: GameState, id: string) {
  const n = s.npcs[id];
  const party = n?.partyId ? s.parties[n.partyId] : null;
  if (!n || !party) return;
  let next = party.list.find((x) => x !== 'player' && s.npcs[x] && !s.npcs[x].isMK && x !== id);
  if (!next) next = spawnCandidate(s, party.id).id;
  n.isMK = false;
  n.role = 'candidate';
  party.list = party.list.filter((x) => x !== id);
  const nn = s.npcs[next];
  nn.isMK = true;
  nn.role = 'mk';
  s.seating = s.seating.map((x) => (x === id ? next! : x));
  for (const c of s.committees) {
    if (c.chairId === id) c.chairId = next;
    c.members = c.members.map((m) => (m === id ? next! : m));
  }
  if (s.player.employerId === id) {
    s.player.employerId = null;
    if (s.player.rank === 'aide') s.player.rank = s.player.partyId ? 'activist' : 'citizen';
  }
}

/** תוספת לסיכוי חנינה לפי היחס של הנשיא/ה */
export function pardonBonus(s: GameState): number {
  const pr = s.president;
  if (!pr || pr.id === 'player') return 0;
  return clamp((s.npcs[pr.id]?.attitude ?? 0) / 300, -0.1, 0.25);
}

export function tickPresident(s: GameState) {
  if (s.presidentRace?.winner && !s.flags.showPresident) s.presidentRace = null;
  if (s.week >= (s.presidentNextWeek ?? Infinity) && !s.presidentRace && !s.negotiation) startPresidentRace(s);
}

for (const i of [0, 1, 2]) registerSpecial(`president_vote_${i}`, (s, ctx) => {
  const id = ctx[`c${i}`];
  runPresidentVote(s, id || null);
});
registerSpecial('president_run', (s) => {
  const race = s.presidentRace;
  if (!race) return;
  race.candidates = [...race.candidates.slice(0, 2), 'player'];
  runPresidentVote(s, 'player');
});
registerSpecial('president_blank', (s) => runPresidentVote(s, null));

export const presidentLabel = (s: GameState, id: string) => candName(s, id);
