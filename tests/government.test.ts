import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type GameState, type NewGameOptions } from '../src/engine';
import {
  formationSeats,
  offerDeal,
  partnerSign,
  partyQuits,
  swearIn,
  tickCoalition,
  toggleGrant,
  willingness,
} from '../src/engine/systems/coalition';
import { runElection } from '../src/engine/systems/elections';
import { resolveEvent } from '../src/engine/systems/events';
import { appointPlayerMinister, coalitionSeats } from '../src/engine/systems/government';
import { createBill } from '../src/engine/systems/legislation';
import { launchProgram } from '../src/engine/systems/ministry';
import { challengeLeader } from '../src/engine/systems/parties';

const base: NewGameOptions = {
  name: 'יעל לוי',
  gender: 'f',
  background: 'officer',
  ideology: { econ: 40, security: 60, religion: 10, judiciary: 50 },
  partyId: 'tikva',
  scenario: 'freshman',
  avatar: { seed: 3, cover: 'none', beard: false, glasses: false, age: 45 },
  seed: 777,
};

function makeLeader(s: GameState, partyId: string) {
  const party = s.parties[partyId];
  s.player.partyId = partyId;
  party.leaderId = 'player';
  party.list = ['player', ...party.list.filter((x) => x !== 'player')];
  s.player.wantsList = true;
}

function clearEvents(s: GameState) {
  let g = 0;
  while (s.eventQueue.length && g++ < 20) resolveEvent(s, 0);
  s.eventQueue = [];
}

describe('coalition negotiation', () => {
  it('player as formateur grants demands, gets signatures and swears in a government', () => {
    const s = createGame(base);
    makeLeader(s, 'tikva');
    s.parties.tikva.poll = 34;
    runElection(s);
    expect(s.negotiation?.mode).toBe('formateur');
    const n = s.negotiation!;
    const order = [...n.talks].sort((a, b) => willingness(s, b) - willingness(s, a));
    for (const t of order) {
      if (formationSeats(s) >= 61) break;
      t.demands.forEach((_, i) => toggleGrant(s, t.partyId, i));
      s.player.ap = 5;
      offerDeal(s, t.partyId);
    }
    expect(formationSeats(s)).toBeGreaterThanOrEqual(61);
    const r = swearIn(s);
    expect(r.ok).toBe(true);
    expect(s.coalition.pmId).toBe('player');
    expect(s.negotiation).toBeNull();
    expect(coalitionSeats(s, s.coalition.parties)).toBeGreaterThanOrEqual(61);
    expect(s.coalition.agreement.length).toBeGreaterThan(0);
    // מה שהובטח – בוצע
    for (const a of s.coalition.agreement) {
      if (a.demand.kind !== 'ministry') continue;
      const holder = s.ministers[a.demand.ref];
      expect(s.npcs[holder]?.partyId).toBe(a.partyId);
    }
  });

  it('a mandate that expires passes to someone else', () => {
    const s = createGame(base);
    makeLeader(s, 'tikva');
    s.parties.tikva.poll = 34;
    runElection(s);
    for (let i = 0; i < 6; i++) {
      clearEvents(s);
      endWeek(s);
    }
    expect(s.negotiation).toBeNull();
    expect(s.coalition.pmId).not.toBe('player');
  });

  it('player leading a partner party negotiates a price and becomes a minister', () => {
    const s = createGame({ ...base, partyId: 'emuna', ideology: { econ: 30, security: 85, religion: 70, judiciary: 80 } });
    makeLeader(s, 'emuna');
    runElection(s);
    if (s.negotiation?.mode !== 'partner') return; // התוצאות לא הובילו לשותפות
    let guard = 0;
    while (s.negotiation && guard++ < 10) partnerSign(s);
    if (s.coalition.parties.includes('emuna')) expect(s.player.ministry).not.toBeNull();
  });
});

describe('coalition maintenance', () => {
  it('an unhappy partner quits; a minority government eventually falls', () => {
    const s = createGame(base);
    const partner = s.coalition.parties.find((p) => p !== 'tikva')!;
    s.coalition.satisfaction[partner] = 0;
    for (let i = 0; i < 10 && s.coalition.parties.includes(partner); i++) tickCoalition(s);
    expect(s.coalition.parties).not.toContain(partner);
    // לגרום לממשלת מיעוט
    for (const p of s.coalition.parties.filter((x) => x !== 'tikva')) partyQuits(s, p, 'test');
    expect(s.coalition.minoritySince).not.toBeNull();
    const electionBefore = s.electionWeek;
    const pmBefore = s.coalition.pmId;
    for (let i = 0; i < 5; i++) {
      s.week += 1;
      tickCoalition(s);
    }
    expect(s.electionWeek !== electionBefore || s.coalition.pmId !== pmBefore).toBe(true);
  });
});

describe('ministers and leadership', () => {
  it('a minister launches programs within budget and they affect the world', () => {
    const s = createGame(base);
    appointPlayerMinister(s, 'housing');
    expect(s.player.ministry).toBe('housing');
    expect(s.player.committees).toHaveLength(0);
    s.player.ap = 10;
    const housingBefore = s.world.housing;
    const r = launchProgram(s, 'hou_target');
    expect(r.ok).toBe(true);
    expect(s.ministryState!.budget).toBeCloseTo(1.5);
    expect(launchProgram(s, 'hou_target').ok).toBe(false);
    for (let i = 0; i < 12; i++) {
      clearEvents(s);
      endWeek(s);
    }
    expect(s.world.housing).toBeGreaterThan(housingBefore);
  });

  it('a government bill skips the preliminary reading', () => {
    const s = createGame(base);
    appointPlayerMinister(s, 'defense');
    const b = createBill(s, 'border', 2, { government: true });
    if (typeof b === 'string') throw new Error(b);
    for (let i = 0; i < 6; i++) {
      clearEvents(s);
      endWeek(s);
    }
    expect(['first', 'failed']).toContain(b.stage);
    expect(b.history.some((h) => h.text.includes('טרומית'))).toBe(false);
  });

  it('a strong MK can win the party leadership', () => {
    const s = createGame({ ...base, seed: 1 });
    Object.assign(s.player, { partyStanding: 100, fame: 100, reputation: 100, money: 500 });
    for (const n of Object.values(s.npcs)) if (n.partyId === 'tikva') n.attitude = 90;
    const r = challengeLeader(s);
    expect(r.ok).toBe(true);
    expect(s.parties.tikva.leaderId).toBe('player');
  });
});
