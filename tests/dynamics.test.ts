import { describe, expect, it } from 'vitest';
import { ACTIONS, actionBlocked, createGame, endWeek, migrate, performAction, type GameState, type NewGameOptions } from '../src/engine';
import { GUIDE_ENTRIES } from '../src/engine/data/guide';
import { SCENARIOS } from '../src/engine/data/scenarios';
import { SHOCKS, SHOCK_EVENTS } from '../src/engine/data/shocks';
import { eventById } from '../src/engine/data/events';
import { earlyStart } from '../src/engine/mods';
import { buildLists, runElection } from '../src/engine/systems/elections';
import { resolveEvent } from '../src/engine/systems/events';
import { executeMerger, mergeBlocked, mergeParties, proposeMerger, spawnParty, tickPartyDynamics } from '../src/engine/systems/mergers';
import { foundParty } from '../src/engine/systems/parties';
import { addMomentum, pollSeats, updatePolls } from '../src/engine/systems/opinion';

const base: NewGameOptions = {
  name: 'שחקן', gender: 'f', background: 'journalist',
  ideology: { econ: 0, security: 20, religion: -20, judiciary: 0 },
  partyId: 'merkaz', scenario: 'grassroots',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 11,
};

const seatSum = (s: GameState) => Object.values(s.parties).reduce((a, p) => a + p.seats, 0);
const pollSum = (s: GameState) => Object.values(s.parties).reduce((a, p) => a + p.poll, 0);

function noOrphans(s: GameState) {
  for (const id of s.coalition.parties) expect(s.parties[id]).toBeDefined();
  for (const n of Object.values(s.npcs)) if (n.partyId) expect(s.parties[n.partyId]).toBeDefined();
  if (s.player.partyId) expect(s.parties[s.player.partyId]).toBeDefined();
  for (const p of Object.values(s.parties)) {
    if (p.surplusPartner) expect(s.parties[p.surplusPartner]).toBeDefined();
    if (p.leaderId !== 'player') expect(s.npcs[p.leaderId]).toBeDefined();
  }
}

describe('momentum', () => {
  it('a new party with big momentum close to the election wins seats; hype fades otherwise', () => {
    const s = createGame({ ...base, seed: 3 });
    s.primariesWeek = 30;
    s.electionWeek = 36;
    const p = spawnParty(s, { names: ['בדיקה חדשה'], ideology: { econ: 10, security: 40, religion: -20, judiciary: -10 }, sectors: { secular: 1 }, momentum: 12, bio: '' });
    expect(p.seats).toBe(0);
    expect(p.list.length).toBe(15);
    for (let w = 0; w < 6; w++) {
      s.eventQueue = [];
      updatePolls(s);
    }
    expect(pollSeats(p.poll)).toBeGreaterThanOrEqual(8);
    runElection(s);
    expect(s.parties[p.id].seats).toBeGreaterThanOrEqual(8);
    expect(s.parties[p.id].momentum).toBe(0);
    expect(seatSum(s)).toBe(120);

    const t = createGame({ ...base, seed: 4 });
    addMomentum(t, 'brit', 10);
    for (let w = 0; w < 80; w++) updatePolls(t);
    expect(Math.abs(t.parties.brit.momentum ?? 0)).toBeLessThan(0.5);
  });
});

describe('mergers', () => {
  it('merging keeps 120 seats, leaves no orphans and helps two small lists pass the threshold', () => {
    const s = createGame({ ...base, seed: 5 });
    s.parties.smol.poll = 2.4;
    s.parties.shivyon.poll = 2.6;
    expect(mergeBlocked(s, 'shivyon', 'smol')).toBeNull();
    const merged = mergeParties(s, 'shivyon', 'smol', 'fair', 'הרשימה המשותפת');
    expect(s.parties.smol).toBeUndefined();
    expect(merged.name).toBe('הרשימה המשותפת');
    expect(merged.poll).toBeGreaterThan(3.25);
    expect(seatSum(s)).toBe(120);
    noOrphans(s);
    for (let w = 0; w < 5; w++) {
      s.eventQueue = [];
      endWeek(s);
    }
    expect(seatSum(s)).toBe(120);
  });

  it('is blocked after the lists close and between coalition and opposition', () => {
    const s = createGame({ ...base, seed: 6 });
    const coal = s.coalition.parties[0];
    const opp = Object.values(s.parties).find((p) => p.seats > 0 && !s.coalition.parties.includes(p.id))!;
    expect(mergeBlocked(s, coal, opp.id)).toMatch(/קואליציה/);
    s.week = s.primariesWeek;
    expect(mergeBlocked(s, 'smol', 'shivyon')).toMatch(/הרשימות/);
  });

  it('player leader can merge under the other leader and becomes #2', () => {
    const s = createGame({ ...base, partyId: null, background: 'entrepreneur', seed: 8 });
    s.player.money = 500;
    expect(foundParty(s, 'הדרך שלי', '#f59e0b').ok).toBe(true);
    const mine = s.player.partyId!;
    const r = executeMerger(s, 'merkaz', { lead: 'them', share: 'fair' });
    expect(r.ok).toBe(true);
    expect(s.parties[mine]).toBeUndefined();
    expect(s.player.partyId).toBe('merkaz');
    expect(s.parties.merkaz.leaderId).not.toBe('player');
    expect(s.parties.merkaz.list.indexOf('player')).toBe(1);
    buildLists(s);
    expect(s.player.listPosition).toBe(2);
    noOrphans(s);
  });

  it('player leader keeps #1 when merging in a smaller party; proposals respect the lists deadline', () => {
    const s = createGame({ ...base, partyId: null, background: 'entrepreneur', seed: 9 });
    s.player.money = 500;
    foundParty(s, 'הדרך שלי', '#f59e0b');
    const before = s.parties[s.player.partyId!].poll;
    const r = executeMerger(s, 'smol', { lead: 'me', share: 'fair' });
    expect(r.ok).toBe(true);
    const mine = s.parties[s.player.partyId!];
    expect(mine.leaderId).toBe('player');
    expect(mine.list[0]).toBe('player');
    expect(mine.poll).toBeGreaterThan(before);
    for (let w = 0; w < 4; w++) updatePolls(s);
    expect(mine.poll).toBeGreaterThan(before);
    s.week = s.primariesWeek;
    expect(proposeMerger(s, 'shivyon', { lead: 'me', share: 'high' }).ok).toBe(false);
  });

  it('small NPC parties merge on their own before the lists close', () => {
    let merges = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = createGame({ ...base, seed, partyId: null });
      s.parties.smol.poll = 2.2;
      s.parties.shivyon.poll = 2.5;
      s.primariesWeek = s.week + 12;
      const n = Object.keys(s.parties).length;
      for (let w = 0; w < 11; w++) {
        tickPartyDynamics(s);
        s.week += 1;
      }
      if (Object.keys(s.parties).length < n) merges++;
      noOrphans(s);
    }
    expect(merges).toBeGreaterThan(0);
  });
});

describe('shocks', () => {
  it('every shock has a matching event and every event resolves', () => {
    for (const d of SHOCKS) expect(eventById(d.id)).toBeDefined();
    for (const e of SHOCK_EVENTS) expect(e.choices.length).toBeGreaterThan(0);
    const s = createGame({ ...base, seed: 12 });
    for (const d of SHOCKS) {
      if (d.when && !d.when(s)) continue;
      const ctx = d.setup(s);
      if (!ctx) continue;
      s.eventQueue = [{ eventId: d.id, ctx }];
      const ev = eventById(d.id)!;
      const idx = ev.choices.findIndex((c) => !c.requires || !c.requires(s, ctx));
      expect(idx).toBeGreaterThanOrEqual(0);
      resolveEvent(s, idx);
      noOrphans(s);
      expect(seatSum(s)).toBe(120);
    }
  });

  it('10 years on "wild" across seeds: no crash, 120 seats, bounded party count', () => {
    for (const seed of [21, 22, 23]) {
      const s = createGame({ ...base, seed, drama: 'wild' });
      let shocks = 0;
      for (let w = 0; w < 520; w++) {
        let guard = 0;
        while (s.player.ap > 0 && guard++ < 6) {
          const avail = ACTIONS.filter((a) => a.loc === s.player.location && a.ap > 0 && !actionBlocked(s, a));
          if (!avail.length) {
            s.player.location = (['plenum', 'studio', 'partyhq', 'field', 'cafeteria'] as const)[(w + guard) % 5];
            continue;
          }
          performAction(s, avail[(w + guard) % avail.length].id);
        }
        let g2 = 0;
        while (s.eventQueue.length && g2++ < 10) {
          if (s.eventQueue[0].eventId.startsWith('shock_')) shocks++;
          resolveEvent(s, (w + g2) % 2);
        }
        s.eventQueue = [];
        endWeek(s);
        expect(seatSum(s)).toBe(120);
        expect(s.seating).toHaveLength(120);
        expect(Math.abs(pollSum(s) - 100)).toBeLessThan(1);
        expect(Object.keys(s.parties).length).toBeLessThan(20);
        if (s.gameOver) break;
      }
      noOrphans(s);
      expect(shocks).toBeGreaterThan(2);
    }
  });
});

describe('guide, early start and old saves', () => {
  it('guide entries point to real actions', () => {
    for (const e of GUIDE_ENTRIES) expect(ACTIONS.some((a) => a.id === e.id)).toBe(true);
    expect(GUIDE_ENTRIES.some((e) => e.id === 'interview')).toBe(true);
    expect(GUIDE_ENTRIES.some((e) => e.id === 'home_circle')).toBe(true);
  });

  it('early start reopens the lists for the 2026 scenario', () => {
    const mod = earlyStart(SCENARIOS.find((x) => x.id === 'elections-2026')!.mod);
    const s = createGame({ ...base, partyId: 'likud', mod });
    expect(s.electionWeek).toBe(20);
    expect(s.primariesWeek).toBeGreaterThan(0);
    expect(mergeBlocked(s, 'democrats', 'joint') ?? '').not.toMatch(/הרשימות/);
  });

  it('migrates old saves without settings or momentum', () => {
    const s = createGame({ ...base, seed: 30 }) as Partial<GameState> as GameState;
    delete (s as Partial<GameState>).settings;
    for (const p of Object.values(s.parties)) delete p.momentum;
    const m = migrate(JSON.parse(JSON.stringify(s)));
    expect(m.settings.drama).toBe('normal');
    endWeek(m);
    expect(seatSum(m)).toBe(120);
  });
});
