import { describe, expect, it } from 'vitest';
import { ACTIONS, actionBlocked, createGame, endWeek, performAction, type GameState, type NewGameOptions } from '../src/engine';
import { allocateSeats } from '../src/engine/systems/elections';
import { bringToVote, createBill, ministerialDecision, STAGES } from '../src/engine/systems/legislation';
import { defect, foundParty, joinParty, splitInfo } from '../src/engine/systems/parties';
import { resolveEvent } from '../src/engine/systems/events';
import { forecast } from '../src/engine/systems/votes';

const base: NewGameOptions = {
  name: 'נועה ישראלי',
  gender: 'f',
  background: 'aide',
  ideology: { econ: -20, security: 20, religion: -40, judiciary: -30 },
  partyId: 'merkaz',
  scenario: 'grassroots',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 35 },
  seed: 1234,
};

function clearEvents(s: GameState) {
  let guard = 0;
  while (s.eventQueue.length && guard++ < 20) resolveEvent(s, 0);
  s.eventQueue = [];
}

describe('world generation', () => {
  it('creates a 120-seat Knesset with a 61+ coalition', () => {
    const s = createGame(base);
    expect(s.seating).toHaveLength(120);
    expect(new Set(s.seating).size).toBe(120);
    const coalSeats = s.coalition.parties.reduce((a, p) => a + s.parties[p].seats, 0);
    expect(coalSeats).toBeGreaterThanOrEqual(61);
    expect(s.ministers.justice).toBeTruthy();
    expect(s.committees).toHaveLength(8);
    for (const c of s.committees) expect(c.members).toContain(c.chairId);
  });

  it('is deterministic for the same seed', () => {
    const a = createGame(base);
    const b = createGame(base);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('places the aide with an employer from the chosen party', () => {
    const s = createGame(base);
    expect(s.player.employerId).toBeTruthy();
    expect(s.npcs[s.player.employerId!].partyId).toBe('merkaz');
  });

  it('freshman scenario seats the player as an MK', () => {
    const s = createGame({ ...base, scenario: 'freshman', background: 'officer' });
    expect(s.player.isMK).toBe(true);
    expect(s.seating).toContain('player');
    expect(s.player.committees.length).toBeGreaterThan(0);
  });
});

describe('Bader-Ofer seat allocation', () => {
  it('allocates exactly 120 seats and drops lists under the threshold', () => {
    const seats = allocateSeats({ a: 400000, b: 300000, c: 200000, d: 100000, e: 20000 });
    expect(Object.values(seats).reduce((x, y) => x + y, 0)).toBe(120);
    expect(seats.e).toBe(0);
  });

  it('matches a hand-computed D\'Hondt example', () => {
    // 10 מושבים, ללא אחוז חסימה: 100/80/30/20 => 5/4/1/0 (D'Hondt)
    const seats = allocateSeats({ a: 100, b: 80, c: 30, d: 20 }, {}, 10, 0);
    expect(seats).toEqual({ a: 5, b: 4, c: 1, d: 0 });
  });

  it('a surplus agreement can only help the pair', () => {
    const votes = { a: 100, b: 80, c: 33, d: 31 };
    const without = allocateSeats(votes, {}, 10, 0);
    const withPair = allocateSeats(votes, { c: 'd', d: 'c' }, 10, 0);
    expect(withPair.c + withPair.d).toBeGreaterThanOrEqual(without.c + without.d);
  });
});

describe('legislation pipeline', () => {
  it('moves a private bill from tabling through the ministerial committee', () => {
    const s = createGame({ ...base, scenario: 'freshman' });
    const b = createBill(s, 'housing', 2);
    expect(typeof b).not.toBe('string');
    if (typeof b === 'string') return;
    expect(b.stage).toBe('tabled');
    for (let i = 0; i < 9; i++) {
      clearEvents(s);
      endWeek(s);
    }
    expect(['preliminary', 'committee1', 'first', 'failed']).toContain(b.stage);
    expect(b.govPosition).not.toBeNull();
  });

  it('a bill can reach the final stage and pass with pledges', () => {
    const s = createGame({ ...base, scenario: 'freshman', partyId: 'tikva', ideology: { econ: 40, security: 60, religion: 10, judiciary: 50 } });
    const b = createBill(s, 'border', 1);
    if (typeof b === 'string') throw new Error(b);
    // כולם תומכים – בודקים שהמכונה מגיעה ל"עבר"
    for (const n of Object.values(s.npcs)) n.attitude = 90;
    let guard = 0;
    while (b.stage !== 'passed' && b.stage !== 'failed' && guard++ < 200) {
      clearEvents(s);
      s.player.ap = 10;
      if (['preliminary', 'first', 'final'].includes(b.stage) && !b.votedThisWeek) {
        for (const id of s.seating) if (s.npcs[id]) s.npcs[id].pledges.push(b.id);
        try {
          bringToVote(s, b);
        } catch (e) {
          throw e;
        }
      }
      if (b.stage === 'committee1' || b.stage === 'committee2') b.pushWeek = s.week;
      endWeek(s);
    }
    expect(b.stage).toBe('passed');
    expect(b.history.length).toBeGreaterThan(5);
    expect(STAGES).toContain('passed');
  });

  it('government opposes a bill far from the coalition', () => {
    const s = createGame({ ...base, scenario: 'freshman', partyId: 'smol' });
    const b = createBill(s, 'civil', 3);
    if (typeof b === 'string') throw new Error(b);
    expect(ministerialDecision(s, b)).toBe('oppose');
    b.stage = 'preliminary';
    b.govPosition = 'oppose';
    const f = forecast(s, b);
    expect(f.eAgainst).toBeGreaterThan(f.eFor);
  });
});

describe('parties and switching', () => {
  it('switching parties costs reputation, more so when repeated', () => {
    const s = createGame({ ...base, background: 'journalist' });
    const r0 = s.player.reputation;
    joinParty(s, 'mamlachti');
    const r1 = s.player.reputation;
    joinParty(s, 'brit');
    const r2 = s.player.reputation;
    expect(r1).toBeLessThan(r0);
    expect(r0 - r1).toBeLessThan(r1 - r2);
    expect(s.player.partySwitches).toBe(2);
  });

  it('an MK cannot simply join another faction; defecting marks them as "פורש"', () => {
    const s = createGame({ ...base, scenario: 'freshman' });
    expect(joinParty(s, 'tikva').ok).toBe(false);
    const res = defect(s);
    expect(res.ok).toBe(true);
    expect(s.player.defector).toBe(true);
    expect(s.player.partyId).toBeNull();
  });

  it('a legal split requires a third of the faction', () => {
    const s = createGame({ ...base, scenario: 'freshman' });
    const info = splitInfo(s);
    expect(info.needed).toBe(Math.ceil(s.parties.merkaz.seats / 3));
  });

  it('founding a party costs money and puts the player at #1', () => {
    const s = createGame({ ...base, background: 'entrepreneur', partyId: null });
    const res = foundParty(s, 'עתיד חדש', '#ff8800');
    expect(res.ok).toBe(true);
    const party = s.parties[s.player.partyId!];
    expect(party.playerFounded).toBe(true);
    expect(party.list[0]).toBe('player');
  });
});

describe('long simulation', () => {
  it('runs 260 weeks with a random player without breaking invariants', () => {
    for (const scenario of ['grassroots', 'freshman'] as const) {
      const s = createGame({ ...base, scenario, seed: 99 });
      let elections = 0;
      for (let w = 0; w < 260; w++) {
        let guard = 0;
        while (s.player.ap > 0 && guard++ < 10) {
          const loc = (['plenum', 'committees', 'offices', 'cafeteria', 'factions', 'plaza', 'studio', 'partyhq', 'field'] as const)[(w + guard) % 9];
          s.player.location = loc;
          const avail = ACTIONS.filter((a) => a.loc === loc && a.ap > 0 && !actionBlocked(s, a));
          if (!avail.length) break;
          performAction(s, avail[(w * 7 + guard) % avail.length].id);
        }
        let g2 = 0;
        while (s.eventQueue.length && g2++ < 10) resolveEvent(s, w % 2);
        s.eventQueue = [];
        const before = s.knesset;
        endWeek(s);
        if (s.knesset !== before) elections++;
        const seats = Object.values(s.parties).reduce((a, p) => a + p.seats, 0);
        expect(seats).toBe(120);
        expect(s.seating.length).toBe(120);
        for (const v of Object.values(s.world)) expect(Number.isFinite(v)).toBe(true);
        expect(Number.isFinite(s.player.fame)).toBe(true);
        const pollSum = Object.values(s.parties).reduce((a, p) => a + p.poll, 0);
        expect(Math.abs(pollSum - 100)).toBeLessThan(1);
      }
      expect(elections).toBeGreaterThanOrEqual(1);
      JSON.parse(JSON.stringify(s));
    }
  });
});
