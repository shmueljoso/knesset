import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type GameState, type NewGameOptions } from '../src/engine';
import { SHOCKS } from '../src/engine/data/shocks';
import { swearIn } from '../src/engine/systems/coalition';
import { callEarlyElections, runElection } from '../src/engine/systems/elections';
import { onLawPassed } from '../src/engine/systems/issues';
import { createBill } from '../src/engine/systems/legislation';
import { billBlocked, termLimited } from '../src/engine/systems/regime';
import { publishSurvey } from '../src/engine/systems/surveys';
import { applyTransform, hasTransform } from '../src/engine/systems/transforms';

const base = (seed = 5): NewGameOptions => ({
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed,
});

/** השחקן הופך ליו"ר המפלגה */
function makeLeader(s: GameState) {
  const party = s.parties[s.player.partyId!];
  party.leaderId = 'player';
  party.list = ['player', ...party.list.filter((x) => x !== 'player')];
  s.player.wantsList = true;
}

const seatsOk = (s: GameState) => {
  expect(s.seating).toHaveLength(120);
  expect(new Set(s.seating).size).toBe(120);
  for (const p of Object.values(s.parties)) {
    const n = s.seating.filter((id) => (id === 'player' ? s.player.partyId === p.id : s.npcs[id]?.partyId === p.id)).length;
    expect(n).toBe(p.seats);
  }
};

describe('direct election of the prime minister', () => {
  it('election night includes a PM race, and the winner heads the government', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = createGame(base(seed));
      s.rules.directPM = true;
      runElection(s);
      const race = s.lastElection!.pmRace!;
      expect(race).toBeTruthy();
      expect(race.rounds[0].candidates.length).toBeGreaterThanOrEqual(2);
      const total = race.rounds[0].pct.reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(98);
      expect(total).toBeLessThan(102);
      if (!s.negotiation) {
        expect(s.coalition.pmId).toBe(race.winner);
        expect(s.coalition.parties).toContain(race.parties[race.winner]);
      }
    }
  });

  it('a player who leads a party can win and form the government even with a small party', () => {
    let won = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = createGame(base(seed));
      s.rules.presidential = true;
      makeLeader(s);
      s.player.fame = 95;
      s.player.reputation = 95;
      s.parties.merkaz.poll = 9;
      publishSurvey(s); // הסקר רואה את השחקן כמועמד/ת
      runElection(s);
      const race = s.lastElection!.pmRace!;
      expect(race.rounds[0].candidates).toContain('player');
      if (race.winner !== 'player') continue;
      won++;
      expect(s.negotiation?.mode).toBe('formateur');
      // בשיטה נשיאותית אין צורך ב-61
      const r = swearIn(s);
      expect(r.ok).toBe(true);
      expect(s.coalition.pmId).toBe('player');
      expect(s.coalition.stability).toBeGreaterThanOrEqual(70);
    }
    expect(won).toBeGreaterThan(0);
  });

  it('no direct race without the rule', () => {
    const s = createGame(base());
    runElection(s);
    expect(s.lastElection!.pmRace).toBeUndefined();
  });
});

describe('Norwegian law', () => {
  it('ministers give up their seats to the next on the list, and get them back when they leave office', () => {
    const s = createGame(base());
    const ministers = Object.values(s.npcs).filter((n) => n.isMK && n.ministry && n.ministry !== 'pm' && n.ministry !== 'speaker').length;
    expect(ministers).toBeGreaterThan(0);
    onLawPassed(s, { templateId: 'norwegian', title: 'החוק הנורבגי', scope: 2, sponsor: 'npc' });
    const swaps = Object.keys(s.norwegianSwaps);
    expect(swaps.length).toBeGreaterThan(0);
    for (const id of swaps) {
      expect(s.seating).not.toContain(id);
      expect(s.npcs[id].ministry).toBeTruthy();
    }
    seatsOk(s);
    // שר/ה שמפוטר/ת חוזר/ת לכנסת
    const m = swaps[0];
    const repl = s.norwegianSwaps[m];
    s.npcs[m].ministry = undefined;
    endWeek(s);
    expect(s.seating).toContain(m);
    // מי שנכנס/ה במקומו/ה יוצא/ת – אלא אם נכנס/ה עכשיו במקום שר/ה אחר/ת מאותה סיעה
    if (s.seating.includes(repl)) expect(Object.values(s.norwegianSwaps)).toContain(repl);
    seatsOk(s);
  });

  it('the player, next in line, enters the Knesset', () => {
    const s = createGame(base());
    const pid = s.coalition.parties[0];
    const party = s.parties[pid];
    s.player.partyId = pid;
    s.player.isMK = false;
    s.seating = s.seating.filter((x) => x !== 'player');
    // השחקן הבא/ה ברשימה אחרי הנבחרים
    const elected = party.list.filter((id) => s.npcs[id]?.isMK);
    party.list = [...elected, 'player', ...party.list.filter((id) => !elected.includes(id) && id !== 'player')];
    while (s.seating.length < 120) s.seating.push(elected[0]);
    s.seating = s.seating.slice(0, 120);
    onLawPassed(s, { templateId: 'norwegian', title: 'החוק הנורבגי', scope: 1, sponsor: 'npc' });
    expect(s.player.isMK).toBe(true);
    expect(s.seating).toContain('player');
  });
});

describe('term limits', () => {
  it('a PM who served the limit cannot head the next government', () => {
    const s = createGame(base());
    const pm = s.coalition.pmId;
    onLawPassed(s, { templateId: 'termlimit', title: 'הגבלת כהונה', scope: 2, sponsor: 'npc' });
    s.pmTerms[pm] = { total: 1, streak: 1 }; // הקדנציה הנוכחית תהיה השנייה
    runElection(s);
    expect(termLimited(s, pm)).toBe(true);
    expect(s.coalition.pmId).not.toBe(pm);
    expect(Object.values(s.parties).some((p) => p.leaderId === pm)).toBe(false);
  });
});

describe('a different country blocks contradicting laws', () => {
  it('halacha state blocks civil marriage; volunteer army ends the draft question', () => {
    const s = createGame(base());
    applyTransform(s, 'halacha', 2, 'npc', 'r_halacha');
    expect(billBlocked(s, 'civil')).toBeTruthy();
    expect(typeof createBill(s, 'civil', 2)).toBe('string');
    applyTransform(s, 'volunteer', 2, 'npc', 'r_volunteer_army');
    expect(billBlocked(s, 'draft')).toBeTruthy();
    expect(SHOCKS.find((x) => x.id === 'shock_draft')!.when!(s)).toBe(false);
    s.issues.draft = 80;
    for (let i = 0; i < 60; i++) endWeek((s.eventQueue = [], s));
    expect(s.issues.draft).toBeLessThan(25);
  });

  it('a revolution undoes its opposite', () => {
    const s = createGame(base());
    applyTransform(s, 'peace', 2, 'npc', 'r_peace');
    applyTransform(s, 'annexation', 2, 'npc', 'r_annex');
    expect(hasTransform(s, 'peace')).toBe(false);
    expect(hasTransform(s, 'annexation')).toBe(true);
  });

  it('a rigid constitution sends every regime change to a referendum', () => {
    const s = createGame(base());
    applyTransform(s, 'constitution', 3, 'npc', 'r_constitution');
    onLawPassed(s, { templateId: 'r_sovereign', title: 'ריבונות', scope: 2, sponsor: 'npc' });
    expect(hasTransform(s, 'sovereignty')).toBe(false);
    expect(s.scheduled.some((x) => x.eventId === 'referendum' && x.ctx.law === 'r_sovereign')).toBe(true);
  });

  it('emergency rule blocks early elections', () => {
    const s = createGame(base());
    applyTransform(s, 'emergency', 3, 'npc', 'r_emergency');
    const before = s.electionWeek;
    callEarlyElections(s, 'בדיקה');
    expect(s.electionWeek).toBe(before);
  });
});
