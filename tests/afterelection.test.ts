import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type NewGameOptions } from '../src/engine';
import { SCENARIOS } from '../src/engine/data/scenarios';
import { checkInvariants } from '../src/engine/systems/invariants';
import { returnMandate, swearIn } from '../src/engine/systems/coalition';
import type { ModFile } from '../src/engine/mods';

const k2022 = SCENARIOS.find((x) => x.id === 'knesset-25-2022')!.mod;

const opts = (mod: ModFile, partyId: string, asLeader = true): NewGameOptions => ({
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 20, security: 40, religion: 10, judiciary: 30 },
  partyId, scenario: 'freshman', asLeader, mod,
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 50 }, seed: 3,
});

const largest = (m: ModFile) => [...m.parties].sort((a, b) => b.seats - a.seats)[0];

describe('starting the day after the elections', () => {
  it('the player can start as the leader of a real party', () => {
    const s = createGame(opts(k2022, largest(k2022).id));
    const p = s.parties[largest(k2022).id];
    expect(p.leaderId).toBe('player');
    expect(p.list[0]).toBe('player');
    expect(s.player.isMK).toBe(true);
    expect(s.seating).toHaveLength(120);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('the leader of the largest bloc gets the mandate and can swear in a government', () => {
    const mod: ModFile = { ...k2022, afterElection: true };
    const s = createGame(opts(mod, largest(mod).id));
    expect(s.negotiation?.mode).toBe('formateur');
    expect(s.electionWeek).toBeGreaterThan(150);
    expect(checkInvariants(s)).toEqual([]);
    for (const t of s.negotiation!.talks) t.signed = true;
    const r = swearIn(s);
    expect(r.ok).toBe(true);
    expect(s.coalition.pmId).toBe('player');
    expect(checkInvariants(s)).toEqual([]);
  });

  it('returning the mandate: someone else forms a government, or it is repeat elections', () => {
    const mod: ModFile = { ...k2022, afterElection: true };
    const s = createGame(opts(mod, largest(mod).id));
    const r = returnMandate(s);
    expect(r.ok).toBe(true);
    expect(s.negotiation).toBeNull();
    const repeat = s.electionWeek < 30;
    if (!repeat) expect(s.coalition.parties.reduce((a, id) => a + s.parties[id].seats, 0)).toBeGreaterThanOrEqual(61);
    expect(checkInvariants(s)).toEqual([]);
    for (let i = 0; i < 20; i++) {
      s.eventQueue = [];
      endWeek(s);
    }
    expect(checkInvariants(s)).toEqual([]);
  });

  it('if nobody else can reach 61, returning the mandate means repeat elections', () => {
    const mod: ModFile = {
      name: 'מבוי סתום', afterElection: true, coalition: ['a', 'c'],
      parties: [
        { id: 'a', name: 'ימין', color: '#2563eb', ideology: { econ: 50, security: 70, religion: 40, judiciary: 60 }, seats: 60 },
        { id: 'b', name: 'שמאל', color: '#dc2626', ideology: { econ: -70, security: -80, religion: -70, judiciary: -80 }, seats: 57 },
        { id: 'c', name: 'ימין קטן', color: '#16a34a', ideology: { econ: 60, security: 80, religion: 60, judiciary: 70 }, seats: 3 },
      ],
    };
    const s = createGame(opts(mod, 'a'));
    expect(s.negotiation?.mode).toBe('formateur');
    const r = returnMandate(s);
    expect(r.text).toContain('בחירות חוזרות');
    expect(s.electionWeek).toBeLessThan(20);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('as an ordinary MK, the government is formed for you', () => {
    const mod: ModFile = { ...k2022, afterElection: true };
    const s = createGame(opts(mod, largest(mod).id, false));
    expect(s.negotiation).toBeNull();
    expect(s.coalition.parties.reduce((a, id) => a + s.parties[id].seats, 0)).toBeGreaterThanOrEqual(61);
    expect(checkInvariants(s)).toEqual([]);
  });
});
