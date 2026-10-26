import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type GameState, type NewGameOptions } from '../src/engine';
import { currentEvent, resolveEvent } from '../src/engine/systems/events';
import { checkInvariants } from '../src/engine/systems/invariants';
import { makeLocalRng } from '../src/engine/rng';
import { startPresidentRace } from '../src/engine/systems/president';
import { computeLegacy } from '../src/engine/systems/legacy';
import {
  CAMPAIGN_WINDOW, INITIATIVES, campaignAction, campaignMenu, declareBlocked, declareCandidacy, expectedVotes, initiativeBlocked, investInitiative, isPresident, presAction, presMenu,
  presidencyScore, previewField, runBlockers, withdrawCandidacy,
} from '../src/engine/systems/presidency';

const base = (seed = 3): NewGameOptions => ({
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed,
});

/** שחקן מוכר ומוערך, עם בחירות לנשיאות קרובות */
function ready(seed = 3, weeksToVote = 60): GameState {
  const s = createGame(base(seed));
  s.player.fame = 85;
  s.player.reputation = 85;
  s.player.capital = 40;
  s.player.money = 300;
  s.presidentNextWeek = s.week + weeksToVote;
  return s;
}

function resolveAll(s: GameState, r: () => number) {
  let g = 0;
  while (s.eventQueue.length && g++ < 30) {
    const cur = currentEvent(s);
    if (!cur) break;
    const ok = cur.ev.choices.map((_, i) => i).filter((i) => !cur.ev.choices[i].requires?.(s, cur.ctx));
    resolveEvent(s, ok[Math.floor(r() * ok.length)] ?? 0);
  }
  s.eventQueue = [];
}

function becomePres(seed: number): GameState | null {
  const s = ready(seed, 5);
  expect(declareCandidacy(s).ok).toBe(true);
  for (const n of Object.values(s.npcs)) if (n.isMK) s.presCampaign!.pledges.push(n.id);
  s.presCampaign!.momentum = 100;
  for (const n of Object.values(s.npcs)) n.attitude = 90;
  s.presidentNextWeek = s.week;
  startPresidentRace(s);
  return s.presidentRace?.winner === 'player' ? s : null;
}

describe('presidential campaign', () => {
  it('declaring is gated by the conditions and the time window', () => {
    const s = createGame(base());
    expect(runBlockers(s).length).toBeGreaterThan(0);
    expect(declareBlocked(s)).toBeTruthy();
    const r = ready(3, CAMPAIGN_WINDOW + 40);
    expect(declareBlocked(r)).toContain('מוקדם מדי');
    r.presidentNextWeek = r.week + CAMPAIGN_WINDOW - 5;
    expect(declareBlocked(r)).toBeNull();
    r.coalition.pmId = 'player';
    expect(declareBlocked(r)).toContain('ראש/ת ממשלה');
  });

  it('actions build momentum and pledges, cost resources and cool down', () => {
    const s = ready();
    expect(campaignAction(s, 'rally').ok).toBe(false);
    declareCandidacy(s);
    const m0 = s.presCampaign!.momentum;
    s.player.ap = 6;
    const res = campaignAction(s, 'rally');
    expect(res.ok).toBe(true);
    expect(s.presCampaign!.momentum).toBeGreaterThan(m0);
    expect(campaignAction(s, 'rally').ok).toBe(false); // בקירור
    for (const b of ['own', 'coalition', 'opposition']) campaignAction(s, `court:${b}`);
    expect(s.presCampaign!.pledges.length).toBeGreaterThan(0);
    expect(campaignMenu(s).some((a) => a.id.startsWith('deal:'))).toBe(true);
    const sample = campaignMenu(s).find((a) => a.id.startsWith('vision:unity'))!;
    expect(campaignAction(s, sample.id).ok).toBe(true);
    expect(s.presCampaign!.theme).toBe('unity');
  });

  it('a campaign raises the expected vote count and the poll shows the player', () => {
    const s = ready();
    const before = expectedVotes(s).find((x) => x.id === 'player')!.votes;
    declareCandidacy(s);
    s.player.ap = 9;
    s.presCampaign!.momentum = 90;
    for (const n of Object.values(s.npcs)) if (n.isMK && n.partyId === s.player.partyId) s.presCampaign!.pledges.push(n.id);
    const after = expectedVotes(s).find((x) => x.id === 'player')!.votes;
    expect(after).toBeGreaterThan(before);
    expect(previewField(s)).toContain('player');
    const sum = expectedVotes(s).reduce((a, b) => a + b.votes, 0);
    expect(sum).toBeGreaterThan(100);
  });

  it('campaigning wins more often than running cold', () => {
    let warm = 0;
    let cold = 0;
    for (let seed = 1; seed <= 14; seed++) {
      const a = ready(seed, 5);
      declareCandidacy(a);
      a.player.ap = 20;
      a.player.capital = 80;
      a.presCampaign!.momentum = 80;
      for (const b of ['own', 'coalition', 'opposition']) campaignAction(a, `court:${b}`);
      a.presidentNextWeek = a.week;
      startPresidentRace(a);
      if (a.presidentRace?.winner === 'player') warm++;
      const b = ready(seed, 5);
      b.presidentNextWeek = b.week;
      startPresidentRace(b);
      if (b.eventQueue[0]?.eventId === 'president_ballot') {
        resolveEvent(b, 3);
        if (b.presidentRace?.winner === 'player') cold++;
      }
    }
    expect(warm).toBeGreaterThan(cold);
    expect(warm).toBeGreaterThan(2);
  });

  it('withdrawing or losing costs reputation; becoming PM voids the campaign', () => {
    const s = ready();
    declareCandidacy(s);
    const rep = s.player.reputation;
    expect(withdrawCandidacy(s).ok).toBe(true);
    expect(s.player.reputation).toBeLessThan(rep);
    declareCandidacy(s);
    s.coalition.pmId = 'player';
    endWeek(s);
    expect(s.presCampaign).toBeNull();
  });
});

describe('presidency', () => {
  it('winning the vote moves the player out of the Knesset, party and ministry cleanly', () => {
    let s: GameState | null = null;
    for (let seed = 1; seed <= 10 && !s; seed++) s = becomePres(seed);
    expect(s).toBeTruthy();
    const g = s!;
    expect(isPresident(g)).toBe(true);
    expect(g.gameOver).toBeNull();
    expect(g.player.isMK).toBe(false);
    expect(g.player.partyId).toBeNull();
    expect(g.seating).not.toContain('player');
    expect(g.seating).toHaveLength(120);
    expect(g.eventQueue.some((e) => e.eventId === 'pres_welcome')).toBe(true);
    expect(checkInvariants(g)).toEqual([]);
    resolveEvent(g, 1);
    expect(g.presidency!.theme).toBe('law');
  });

  it('the party leader who is elected hands the party to an heir', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = ready(seed, 5);
      const party = s.parties[s.player.partyId!];
      const before = party.id;
      party.leaderId = 'player';
      declareCandidacy(s);
      for (const n of Object.values(s.npcs)) if (n.isMK) s.presCampaign!.pledges.push(n.id);
      s.presCampaign!.momentum = 100;
      for (const n of Object.values(s.npcs)) n.attitude = 90;
      s.presidentNextWeek = s.week;
      startPresidentRace(s);
      if (s.presidentRace?.winner !== 'player') continue;
      expect(s.parties[before]?.leaderId).not.toBe('player');
      expect(checkInvariants(s)).toEqual([]);
      return;
    }
    throw new Error('no seed produced a win');
  });

  it('unity moves with actions and the world; initiatives complete and change the country', () => {
    const s = becomePres(1) ?? becomePres(2) ?? becomePres(3)!;
    s.eventQueue = [];
    const pr = s.presidency!;
    const u0 = pr.unity;
    s.player.ap = 9;
    expect(presAction(s, 'speech').ok).toBe(true);
    expect(pr.unity).toBeGreaterThan(u0);
    expect(presAction(s, 'speech').ok).toBe(false); // בקירור
    const v = presMenu(s);
    expect(v.visit).toHaveLength(6);
    expect(v.tables.length).toBe(5);
    const need = INITIATIVES.find((i) => i.id === 'heritage')!.need;
    const eff = s.effects.length;
    for (let i = 0; i < need; i++) {
      s.player.ap = 3;
      expect(initiativeBlocked(s, 'heritage')).toBeNull();
      const r = investInitiative(s, 'heritage');
      expect(r.ok).toBe(true);
      if (i < need - 1) expect(initiativeBlocked(s, 'heritage')).toBe('כבר השקעת בה השבוע');
      endWeek(s);
      s.eventQueue = [];
    }
    expect(pr.initiatives.find((i) => i.id === 'heritage')!.done).toBe(true);
    expect(s.effects.length).toBeGreaterThan(eff);
    expect(presidencyScore(s)).toBeGreaterThan(0);
    expect(s.presidency!.deeds.some((d) => d.includes('יוזמה'))).toBe(true);
    // לא יותר משתי יוזמות פעילות במקביל
    s.player.ap = 9;
    s.week += 1;
    investInitiative(s, 'service');
    investInitiative(s, 'periphery');
    expect(initiativeBlocked(s, 'science')).toContain('במקביל');
  });

  it('a full seven-year term stays consistent and ends with a legacy', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = becomePres(seed);
      if (!s) continue;
      const r = makeLocalRng(seed * 31);
      let weeks = 0;
      const bad: string[] = [];
      while (!s.gameOver && weeks < 420) {
        resolveAll(s, r);
        if (r() < 0.7) {
          s.player.ap = 4;
          const m = presMenu(s);
          const all = [...m.visit, ...m.tables, ...m.general].filter((a) => !a.blocked);
          if (all.length) presAction(s, all[Math.floor(r() * all.length)].id);
          const open = INITIATIVES.filter((i) => !initiativeBlocked(s, i.id));
          if (open.length && r() < 0.6) investInitiative(s, open[Math.floor(r() * open.length)].id);
        }
        endWeek(s);
        weeks++;
        if (weeks % 8 === 0) for (const v of checkInvariants(s)) bad.push(`w${s.week}: ${v}`);
        expect(s.presidency!.unity).toBeGreaterThanOrEqual(0);
        expect(s.presidency!.unity).toBeLessThanOrEqual(100);
        expect(s.presidency!.trust).toBeGreaterThanOrEqual(0);
        expect(s.presidency!.trust).toBeLessThanOrEqual(100);
      }
      expect(bad).toEqual([]);
      expect(['president_term', 'president_removed']).toContain(s.gameOver);
      const L = computeLegacy(s);
      expect(L.roles.some((x) => x.includes('נשיא'))).toBe(true);
      expect(L.score).toBeGreaterThan(60);
      return;
    }
    throw new Error('no seed produced a win');
  }, 120000);

  it('low trust for months gets the president removed', () => {
    const s = becomePres(1) ?? becomePres(2) ?? becomePres(3)!;
    s.eventQueue = [];
    for (let i = 0; i < 40 && !s.gameOver; i++) {
      s.presidency!.trust = 3;
      s.eventQueue = [];
      endWeek(s);
    }
    expect(s.gameOver).toBe('president_removed');
  });

  it('the mandate doctrine shapes the government after an election', () => {
    const s = becomePres(1) ?? becomePres(2) ?? becomePres(3)!;
    s.eventQueue = [];
    s.flags.mandateDoctrine = 'broad';
    s.electionWeek = s.week + 1;
    s.primariesWeek = s.week - 5;
    s.rules.directPM = false;
    s.rules.presidential = false;
    endWeek(s);
    const seats = s.coalition.parties.reduce((a, id) => a + s.parties[id].seats, 0);
    expect(seats).toBeGreaterThanOrEqual(61);
    expect(checkInvariants(s)).toEqual([]);
  });
});
