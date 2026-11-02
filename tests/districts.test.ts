// שיטות בחירה: מחוזות, ארצית, מעורבת, אלקטורים, גבולות, חובת הצבעה, גיל 16 ואורך הכנסת (systems/districts.ts).
import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type GameState, type NewGameOptions } from '../src/engine';
import { DISTRICTS } from '../src/engine/data/districts';
import { BILL_TEMPLATES } from '../src/engine/data/bills';
import { makeLocalRng } from '../src/engine/rng';
import { runElection } from '../src/engine/systems/elections';
import {
  allocateBySystem, applyGerrymander, boostDistrict, composition, constituencyCounts, districtPull, districtShares, homeOf, moveHome, projectElection, systemKind, visitDistrict, voterModifier,
} from '../src/engine/systems/districts';
import { checkInvariants } from '../src/engine/systems/invariants';
import { onLawPassed, strikeLaw } from '../src/engine/systems/issues';
import { billBlocked, runPmRace } from '../src/engine/systems/regime';
import { isHarediParty } from '../src/engine/systems/facts';
import { SECTORS } from '../src/engine/util';
import { eventById } from '../src/engine/data/events';

const base = (seed = 3, extra: Partial<NewGameOptions> = {}): NewGameOptions => ({
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed, ...extra,
});

const votesOf = (s: GameState) => Object.fromEntries(Object.values(s.parties).map((p) => [p.id, p.poll * 1000]));
const avgSeats = (s: GameState, share: number, runs = 12) => {
  s.rules.districtShare = share;
  const tot: Record<string, number> = {};
  for (let i = 0; i < runs; i++) for (const [k, v] of Object.entries(allocateBySystem(s, votesOf(s), {}, makeLocalRng(i * 31 + 7)).seats)) tot[k] = (tot[k] ?? 0) + v / runs;
  return tot;
};

describe('districts and demographics', () => {
  it('120 seats across 12 districts, each composition sums to 1', () => {
    expect(DISTRICTS).toHaveLength(12);
    expect(DISTRICTS.reduce((a, d) => a + d.seats, 0)).toBe(120);
    for (const d of DISTRICTS) expect(SECTORS.reduce((a, k) => a + d.comp[k], 0)).toBeCloseTo(1, 5);
  });

  it('constituencies add up for every share', () => {
    for (const share of [0, 0.3, 0.5, 0.7, 1]) expect(Object.values(constituencyCounts(share)).reduce((a, b) => a + b, 0)).toBe(Math.round(120 * share));
  });

  it('district polls follow the national polls and local demographics', () => {
    const s = createGame(base());
    const sh = districtShares(s);
    for (const p of Object.values(s.parties)) {
      const nat = DISTRICTS.reduce((a, d) => a + (d.seats / 120) * (sh[d.id][p.id] ?? 0), 0);
      expect(Math.abs(nat - p.poll), p.name).toBeLessThan(1.6);
    }
    // מחוז ערבי – מפלגה ערבית מובילה; מחוז חרדי – מפלגה חרדית מובילה
    const lead = (id: string) => Object.entries(sh[id]).sort((a, b) => b[1] - a[1])[0][0];
    expect(s.parties[lead('triangle')].sectors.arab ?? 0).toBeGreaterThan(0.5);
    expect(isHarediParty(s.parties[lead('bnei_brak')])).toBe(true);
  });

  it('population changes move the district composition', () => {
    const s = createGame(base());
    const before = composition(s, DISTRICTS.find((d) => d.id === 'jerusalem')!).haredi;
    s.demo.haredi = 1.6;
    expect(composition(s, DISTRICTS.find((d) => d.id === 'jerusalem')!).haredi).toBeGreaterThan(before);
  });
});

describe('election systems', () => {
  it('every system fills exactly 120 seats', () => {
    const s = createGame(base());
    for (const share of [0, 0.3, 0.5, 0.7, 1]) {
      s.rules.districtShare = share;
      const r = allocateBySystem(s, votesOf(s), {}, makeLocalRng(5));
      expect(Object.values(r.seats).reduce((a, b) => a + b, 0), `share ${share}`).toBe(120);
      expect(Object.values(r.listSeats).reduce((a, b) => a + b, 0)).toBe(120 - Math.round(120 * share));
    }
  });

  it('winner-take-all rewards the biggest parties and squeezes small scattered ones (UK style)', () => {
    const s = createGame(base());
    const biggest = Object.values(s.parties).sort((a, b) => b.poll - a.poll)[0];
    const smallScattered = Object.values(s.parties).filter((p) => !isHarediParty(p) && (p.sectors.arab ?? 0) < 0.5 && p.poll > 3 && p.poll < 9);
    const pr = avgSeats(s, 0);
    const fptp = avgSeats(s, 1);
    expect(fptp[biggest.id]).toBeGreaterThan(pr[biggest.id] + 6);
    expect(smallScattered.reduce((a, p) => a + fptp[p.id], 0)).toBeLessThan(smallScattered.reduce((a, p) => a + pr[p.id], 0));
  });

  it('a mixed system sits between proportional and winner-take-all', () => {
    const s = createGame(base());
    const biggest = Object.values(s.parties).sort((a, b) => b.poll - a.poll)[0].id;
    const a = avgSeats(s, 0)[biggest];
    const m = avgSeats(s, 0.5)[biggest];
    const f = avgSeats(s, 1)[biggest];
    expect(m).toBeGreaterThan(a);
    expect(m).toBeLessThan(f);
  });

  it('concentrated sectoral parties win district seats even below the national threshold', () => {
    const s = createGame(base());
    const haredim = Object.values(s.parties).filter((p) => isHarediParty(p));
    const others = Object.values(s.parties).filter((p) => !isHarediParty(p));
    const rest = others.reduce((a, p) => a + p.poll, 0);
    for (const p of haredim) p.poll = 1.5; // כל אחת מתחת לחסימה (3.25)
    for (const p of others) p.poll = (p.poll / rest) * (100 - 1.5 * haredim.length);
    const pr = avgSeats(s, 0);
    const fptp = avgSeats(s, 1);
    expect(haredim.reduce((a, p) => a + pr[p.id], 0)).toBe(0);
    expect(haredim.reduce((a, p) => a + fptp[p.id], 0)).toBeGreaterThan(0.8);
  });

  it('projection is stable between calls and follows the system', () => {
    const s = createGame(base());
    s.rules.districtShare = 1;
    const a = projectElection(s);
    expect(projectElection(s)).toBe(a);
    expect(Object.values(a.seats).reduce((x, y) => x + y, 0)).toBe(120);
    expect(systemKind(s)).toBe('fptp');
  });
});

describe('a real election under the new systems', () => {
  it('seating stays consistent and results carry the district map', () => {
    for (const share of [0.3, 1]) {
      const s = createGame(base(6));
      s.eventQueue = [];
      s.rules.districtShare = share;
      runElection(s);
      expect(checkInvariants(s), `share ${share}`).toEqual([]);
      expect(s.seating).toHaveLength(120);
      expect(s.lastElection?.districts).toHaveLength(12);
      expect(s.lastElection?.system).toBe(share === 1 ? 'fptp' : 'mixed');
      expect(s.electionWeek - s.week).toBe(208);
    }
  });

  it('the player gets in through the home district without a realistic list place', () => {
    let viaDistrict = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = createGame(base(seed, { district: 'telaviv' }));
      s.eventQueue = [];
      s.rules.districtShare = 1;
      s.player.district = 'telaviv';
      s.player.wantsList = true;
      s.player.isMK = false;
      s.seating = s.seating.map((id) => (id === 'player' ? s.parties.merkaz.list.find((x) => x !== 'player' && s.npcs[x] && !s.seating.includes(x)) ?? id : id));
      const party = s.parties[s.player.partyId!];
      party.list = [...party.list.filter((x) => x !== 'player'), 'player']; // אחרון ברשימה
      boostDistrict(s, 'telaviv', party.id, 25);
      s.week = s.electionWeek;
      runElection(s);
      if (s.player.isMK) viaDistrict++;
      expect(checkInvariants(s)).toEqual([]);
    }
    // מרכז חזקה בת"א והמועמד/ת מקומי/ת: נבחרים למרות המקום האחרון ברשימה
    expect(viaDistrict).toBeGreaterThanOrEqual(8);
  });

  it('local work moves the district, moving home costs money, and bias fades', () => {
    const s = createGame(base());
    s.player.ap = 5;
    s.player.money = 100;
    const before = districtShares(s).shfela[s.player.partyId!];
    expect(visitDistrict(s, 'shfela').ok).toBe(true);
    expect(districtShares(s).shfela[s.player.partyId!]).toBeGreaterThan(before);
    expect(visitDistrict(s, 'shfela').ok).toBe(false); // קירור
    expect(moveHome(s, 'negev').ok).toBe(true);
    expect(s.player.district).toBe('negev');
    expect(s.player.money).toBe(70);
    expect(moveHome(s, 'haifa').ok).toBe(false);
    for (let i = 0; i < 80; i++) endWeek(s), (s.eventQueue = []);
    expect(Math.abs(s.districtBias.shfela?.[s.player.partyId!] ?? 0)).toBeLessThan(1.2);
  });

  it('local MKs lean toward laws that help their district', () => {
    const s = createGame(base());
    s.rules.districtShare = 1;
    const arabLaw = { arab: 10, secular: 0 };
    const arabMk = Object.values(s.npcs).find((n) => n.isMK)!;
    arabMk.district = 'triangle';
    const telAvivMk = Object.values(s.npcs).filter((n) => n.isMK)[1];
    telAvivMk.district = 'bnei_brak';
    expect(districtPull(s, arabMk, arabLaw)).toBeGreaterThan(districtPull(s, telAvivMk, arabLaw));
    s.rules.districtShare = 0;
    expect(districtPull(s, arabMk, arabLaw)).toBe(0);
    expect(homeOf(s, arabMk.id)).toBe('triangle');
  });
});

describe('electoral college, gerrymandering and other laws', () => {
  it('an electoral race distributes all 120 electors to the winners of each district', () => {
    for (const seed of [2, 4, 9]) {
      const s = createGame(base(seed));
      s.eventQueue = [];
      s.rules.directPM = true;
      s.rules.electoral = true;
      runElection(s);
      const race = s.lastElection!.pmRace!;
      expect(race.electoral).toBeTruthy();
      expect(Object.values(race.electoral!.electors).reduce((a, b) => a + b, 0)).toBe(120);
      const top = Object.entries(race.electoral!.electors).sort((a, b) => b[1] - a[1])[0][0];
      expect(race.winner === top || race.electoral!.electors[race.winner] === race.electoral!.electors[top]).toBe(true);
      expect(Object.keys(race.electoral!.perDistrict)).toHaveLength(12);
    }
  });

  it('electoral college can elect a PM who lost the popular vote', () => {
    let upsets = 0;
    for (let seed = 1; seed <= 40 && upsets === 0; seed++) {
      const s = createGame(base(seed));
      s.rules.directPM = true;
      s.rules.electoral = true;
      for (const p of Object.values(s.parties)) p.seats = Math.max(p.seats, 1);
      const race = runPmRace(s, votesOf(s));
      if (race?.electoral && race.electoral.popular !== race.winner) upsets++;
    }
    expect(upsets).toBeGreaterThan(0);
  });

  it('a gerrymander law helps the coalition win constituencies, and striking it reverts', () => {
    let gain = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const s = createGame(base(seed));
      s.rules.districtShare = 1;
      const coal = (st: GameState, res: Record<string, number>) => st.coalition.parties.reduce((a, p) => a + (res[p] ?? 0), 0);
      const before = coal(s, avgSeats(s, 1, 8));
      onLawPassed(s, { templateId: 'redistrict', title: 'שרטוט', scope: 3, sponsor: 'npc' });
      expect(Object.keys(s.gerryBias).length).toBeGreaterThan(0);
      const after = coal(s, avgSeats(s, 1, 8));
      gain += after - before;
      strikeLaw(s, 'redistrict');
      expect(s.gerryBias).toEqual({});
    }
    expect(gain).toBeGreaterThan(8);
    void applyGerrymander;
  });

  it('election-system laws change the rules and can be undone; blocked when they make no sense', () => {
    const s = createGame(base());
    expect(billBlocked(s, 'redistrict')).toMatch(/אין מחוזות/);
    expect(billBlocked(s, 'elect_proportional')).toMatch(/ארצית/);
    expect(billBlocked(s, 'elect_college')).toMatch(/בחירה ישירה/);
    onLawPassed(s, { templateId: 'elect_districts', title: 'מחוזות', scope: 2, sponsor: 'npc' });
    expect(s.rules.districtShare).toBe(0.5);
    expect(systemKind(s)).toBe('mixed');
    expect(billBlocked(s, 'redistrict')).toBeNull();
    onLawPassed(s, { templateId: 'elect_districts', title: 'מחוזות', scope: 3, sponsor: 'npc' });
    expect(s.rules.districtShare).toBe(1);
    onLawPassed(s, { templateId: 'elect_proportional', title: 'יחסית', scope: 1, sponsor: 'npc' });
    expect(s.rules.districtShare).toBe(0);
    s.rules.directPM = false;
    onLawPassed(s, { templateId: 'elect_college', title: 'אלקטורים', scope: 1, sponsor: 'npc' });
    expect(s.rules.electoral).toBe(true);
    expect(s.rules.directPM).toBe(true);
    strikeLaw(s, 'elect_college');
    expect(s.rules.electoral).toBe(false);
    expect(s.rules.directPM).toBe(false);
  });

  it('compulsory voting lifts Arab parties, age 16 lifts young-leaning ones', () => {
    const s = createGame(base());
    const arab = Object.values(s.parties).find((p) => (p.sectors.arab ?? 0) >= 0.6)!;
    const haredi = Object.values(s.parties).find((p) => isHarediParty(p))!;
    expect(voterModifier(s, arab)).toBe(1);
    onLawPassed(s, { templateId: 'compulsory_vote', title: 'חובה', scope: 1, sponsor: 'npc' });
    expect(voterModifier(s, arab)).toBeGreaterThan(1.1);
    expect(voterModifier(s, haredi)).toBeLessThan(voterModifier(s, arab));
    const left = Object.values(s.parties).sort((a, b) => a.ideology.religion - b.ideology.religion)[0];
    onLawPassed(s, { templateId: 'vote_age_16', title: 'גיל', scope: 1, sponsor: 'npc' });
    expect(voterModifier(s, left)).toBeGreaterThan(voterModifier(s, haredi));
  });

  it('term length moves the next election and the cycle after it', () => {
    const s = createGame(base());
    const e0 = s.electionWeek;
    onLawPassed(s, { templateId: 'term_length', title: 'אורך', scope: 2, sponsor: 'npc' });
    expect(s.rules.termWeeks).toBe(260);
    expect(s.electionWeek).toBe(e0 + 52);
    s.eventQueue = [];
    runElection(s);
    expect(s.electionWeek - s.week).toBe(260);
  });

  it('mandatory primaries switch every party, and revert only what they changed', () => {
    const s = createGame(base());
    const was = Object.values(s.parties).filter((p) => p.primaries).map((p) => p.id);
    onLawPassed(s, { templateId: 'all_primaries', title: 'פריימריז', scope: 1, sponsor: 'npc' });
    expect(Object.values(s.parties).every((p) => p.primaries)).toBe(true);
    strikeLaw(s, 'all_primaries');
    expect(Object.values(s.parties).filter((p) => p.primaries).map((p) => p.id).sort()).toEqual(was.sort());
  });

  it('electoral laws are well formed and the events exist', () => {
    const ids = ['elect_districts', 'elect_proportional', 'elect_college', 'redistrict', 'compulsory_vote', 'vote_age_16', 'term_length', 'all_primaries'];
    for (const id of ids) {
      const t = BILL_TEMPLATES.find((x) => x.id === id)!;
      expect(t, id).toBeTruthy();
      expect(t.rule).toBeTruthy();
      expect(t.effects?.length).toBeGreaterThan(0);
    }
    for (const id of ['dist_system_changed', 'dist_gerry_outcry', 'dist_electoral_upset', 'dist_local_demand', 'dist_marginal', 'dist_independent', 'dist_wasted_vote']) expect(eventById(id), id).toBeTruthy();
    // אירועי מחוז לא מופיעים בשיטה ארצית
    const s = createGame(base());
    expect(eventById('dist_local_demand')!.when!(s)).toBe(false);
    s.rules.districtShare = 1;
    expect(eventById('dist_local_demand')!.when!(s)).toBe(true);
  });
});
