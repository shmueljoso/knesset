import { describe, expect, it } from 'vitest';
import { createGame, endWeek, interact, type NewGameOptions } from '../src/engine';
import { foundCaucus, listForecast, playerSeatContribution, recruitToList } from '../src/engine/systems/influence';
import { onLawPassed } from '../src/engine/systems/issues';
import { createBill } from '../src/engine/systems/legislation';
import { checkMissions } from '../src/engine/systems/missions';
import { reactToLaw } from '../src/engine/systems/relationships';
import { forecast } from '../src/engine/systems/votes';
import { templateById } from '../src/engine/data/bills';

const base: NewGameOptions = {
  name: 'רונית לוי', gender: 'f', background: 'journalist',
  ideology: { econ: -30, security: 10, religion: -40, judiciary: -40 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 2, cover: 'none', beard: false, glasses: true, age: 40 }, seed: 31337,
};

describe('NPC personality', () => {
  it('every NPC has an agenda and remembers things the player did', () => {
    const s = createGame(base);
    const n = Object.values(s.npcs).find((x) => x.isMK && x.notable)!;
    expect(n.agenda).toBeTruthy();
    s.player.ap = 5;
    interact(s, n.id, 'attack');
    expect(n.memory.some((m) => m.text.includes('תקף'))).toBe(true);
  });

  it("passing someone's pet law makes them an ally", () => {
    const s = createGame(base);
    const n = Object.values(s.npcs).find((x) => x.notable && x.isMK)!;
    const before = n.attitude;
    const t = templateById(n.agenda);
    reactToLaw(s, t.id, t.lean, t.title);
    expect(n.attitude).toBeGreaterThanOrEqual(before + 10);
    expect(n.memory.length).toBeGreaterThan(0);
  });

  it('NPCs pass laws of their own over time', () => {
    const s = createGame(base);
    for (let i = 0; i < 80; i++) {
      s.eventQueue = [];
      endWeek(s);
    }
    expect(s.lawsPassed.some((l) => l.sponsor !== 'player')).toBe(true);
  });
});

describe('transparent influence', () => {
  it('player image in the party audience changes seat contribution', () => {
    const s = createGame(base);
    s.player.fame = 60;
    for (const k of Object.keys(s.player.approval) as (keyof typeof s.player.approval)[]) s.player.approval[k] = 70;
    const good = playerSeatContribution(s)!.seats;
    for (const k of Object.keys(s.player.approval) as (keyof typeof s.player.approval)[]) s.player.approval[k] = 30;
    const bad = playerSeatContribution(s)!.seats;
    expect(good).toBeGreaterThan(0.5);
    expect(bad).toBeLessThan(0);
    expect(listForecast(s)!.position).toBeGreaterThan(1);
  });

  it('recruiting a popular figure moves votes to the player party', () => {
    const s = createGame({ ...base, scenario: 'grassroots', partyId: null, background: 'entrepreneur' });
    const party = s.parties.merkaz;
    s.player.partyId = 'merkaz';
    party.leaderId = 'player';
    const cand = Object.values(s.npcs).find((n) => n.role === 'candidate' && n.partyId === 'mamlachti')!;
    cand.attitude = 90;
    cand.ideology = { ...s.player.ideology };
    cand.influence = 60;
    const before = party.base;
    recruitToList(s, cand);
    expect(party.base).toBeGreaterThan(before);
    expect(party.list).toContain(cand.id);
  });

  it('caucus members lean towards bills on the caucus issue', () => {
    const s = createGame(base);
    s.player.ap = 5;
    const b = createBill(s, 'housing', 2);
    if (typeof b === 'string') throw new Error(b);
    b.stage = 'preliminary';
    const before = forecast(s, b).eFor;
    const c = foundCaucus(s, 'housing');
    expect(c.members.length).toBeGreaterThan(2);
    expect(forecast(s, b).eFor).toBeGreaterThan(before);
  });

  it('missions complete and pay out', () => {
    const s = createGame(base);
    checkMissions(s);
    expect(s.missions.length).toBeGreaterThan(0);
    onLawPassed(s, { templateId: 'housing', title: 'x', scope: 1, sponsor: 'player' });
    s.counters.act_query = 1;
    s.missions = ['first_query'];
    const fame = s.player.fame;
    const done = checkMissions(s);
    expect(done.length).toBe(1);
    expect(s.player.fame).toBeGreaterThan(fame);
  });
});
