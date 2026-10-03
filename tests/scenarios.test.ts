import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type NewGameOptions } from '../src/engine';
import { SCENARIOS } from '../src/engine/data/scenarios';
import { emptyMod, modFromGame, validateMod } from '../src/engine/mods';
import { runElection } from '../src/engine/systems/elections';
import { coalitionSeats } from '../src/engine/systems/government';

const base = (partyId: string, mod: NewGameOptions['mod']): NewGameOptions => ({
  name: 'שחקן', gender: 'm', background: 'aide',
  ideology: { econ: 0, security: 30, religion: 0, judiciary: 0 },
  partyId, scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 7, mod,
});

describe('built-in scenarios', () => {
  for (const sc of SCENARIOS) {
    it(`${sc.id} validates, builds and runs`, () => {
      const { errors } = validateMod(sc.mod);
      expect(errors).toEqual([]);
      const first = sc.mod.parties.find((p) => p.seats > 0)!;
      const s = createGame(base(first.id, sc.mod));
      expect(s.seating).toHaveLength(120);
      expect(s.startDate).toBe(sc.mod.startDate);
      expect(s.knesset).toBe(sc.mod.knesset);
      expect(s.electionWeek).toBe(sc.mod.electionInWeeks);
      expect([...s.coalition.parties].sort()).toEqual([...(sc.mod.coalition ?? [])].sort());
      expect(coalitionSeats(s, s.coalition.parties)).toBeGreaterThanOrEqual(61);
      const leader = s.npcs[s.parties[first.id].leaderId];
      expect(leader?.name ?? s.player.name).toBe(first.members?.[0] ?? leader?.name);
      for (const [mid, name] of Object.entries(sc.mod.ministers ?? {})) {
        const holder = s.npcs[s.ministers[mid]];
        if (holder) expect(holder.name).toBe(name);
      }
      for (let w = 0; w < 60; w++) {
        s.eventQueue = [];
        endWeek(s);
      }
      expect(Object.values(s.parties).reduce((a, p) => a + p.seats, 0)).toBe(120);
    });
  }

  it('the 2026 scenario starts three weeks before the election and new parties can win seats', () => {
    const sc = SCENARIOS.find((x) => x.id === 'elections-2026')!;
    const s = createGame(base('likud', sc.mod));
    expect(s.npcs[s.coalition.pmId].name).toBe('בנימין נתניהו');
    expect(s.parties.yashar.seats).toBe(0);
    expect(s.parties.yashar.poll).toBeGreaterThan(15);
    s.week = s.electionWeek;
    runElection(s);
    expect(s.parties.yashar.seats).toBeGreaterThan(10);
  });
});

describe('editor helpers', () => {
  it('emptyMod is valid and playable; modFromGame round-trips', () => {
    expect(validateMod(emptyMod()).errors).toEqual([]);
    const s = createGame(base('party_a', emptyMod()));
    const out = modFromGame(s);
    expect(validateMod(out).errors).toEqual([]);
    expect(createGame(base(out.parties[0].id, out)).seating).toHaveLength(120);
  });
});
