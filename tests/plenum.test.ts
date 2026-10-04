import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type GameState, type NewGameOptions } from '../src/engine';
import { resolveEvent } from '../src/engine/systems/events';
import {
  appealToGovernment,
  createBill,
  finishVote,
  issueUltimatum,
  pressureRole,
  queueOtherVote,
  rescueInfo,
  rescueVote,
  startVote,
  ultimatumBlocked,
  ultimatumChance,
} from '../src/engine/systems/legislation';
import type { Bill } from '../src/engine/types';
import { migrate } from '../src/engine';
import { cabinetBlock, ministerialDecision } from '../src/engine/systems/legislation';

const base: NewGameOptions = {
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 10, security: 50, religion: 10, judiciary: 40 },
  partyId: 'tikva', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 8,
};

function blockedBill(s: GameState): Bill {
  s.player.ap = 10;
  const b = createBill(s, 'civil', 2) as Bill; // רחוק מהקואליציה הימנית
  b.stage = 'preliminary';
  b.govPosition = 'oppose';
  return b;
}

describe('pressure on the ministerial committee', () => {
  it('coalition MK can issue one ultimatum; success flips the cabinet, failure queues a showdown', () => {
    let flipped = 0;
    let refused = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = createGame({ ...base, seed });
      expect(pressureRole(s)).toBe('mk');
      const b = blockedBill(s);
      s.player.capital = 20;
      expect(ultimatumBlocked(s, b)).toBeNull();
      expect(ultimatumChance(s, b)).toBeGreaterThan(0);
      const r = issueUltimatum(s, b);
      if (r.ok) {
        flipped++;
        expect(b.govPosition).toBe('support');
      } else {
        refused++;
        expect(s.eventQueue.some((e) => e.eventId === 'ultimatum_refused')).toBe(true);
        // לסגת מהאיום
        resolveEvent(s, 3);
      }
      expect(ultimatumBlocked(s, b)).not.toBeNull();
    }
    expect(flipped + refused).toBe(8);
  });

  it('works on bills that already fell, and before the committee decides', () => {
    let revived = 0;
    let preempted = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const s = createGame({ ...base, partyId: 'oz', seed });
      s.parties.oz.leaderId = 'player';
      s.player.capital = 30;
      // הצעה שכבר נפלה בטרומית בגלל התנגדות הממשלה
      const fell = blockedBill(s);
      fell.stage = 'failed';
      fell.lastVote = { week: 0, stage: 'preliminary', for: 30, against: 60, abstain: 0, absent: 30, passed: false, seats: [] };
      expect(cabinetBlock(s, fell)).toBe('fell');
      if (issueUltimatum(s, fell).ok) {
        revived++;
        expect(fell.stage).toBe('preliminary');
        expect(fell.govPosition).toBe('support');
      }
      s.eventQueue = [];
      // הצעה שעוד לא הגיעה לוועדת השרים
      const early = createBill(s, 'shabbat', 2) as Bill;
      if (cabinetBlock(s, early) === 'before' && issueUltimatum(s, early).ok) {
        preempted++;
        expect(ministerialDecision(s, early)).toBe('support');
      }
      s.eventQueue = [];
    }
    expect(revived).toBeGreaterThan(0);
    expect(preempted).toBeGreaterThan(0);
  });

  it('old saves: government bills shelved by the committee are recognized', () => {
    const s = createGame(base);
    s.player.ap = 5;
    const b = createBill(s, 'housing', 2) as Bill;
    b.stage = 'failed';
    b.government = true;
    b.history.push({ week: 1, text: 'ועדת השרים לא אישרה את הצעת החוק הממשלתית.' });
    const old = JSON.parse(JSON.stringify(s));
    delete old.liveVote;
    const m = migrate(old);
    expect(m.bills.find((x) => x.id === b.id)!.cabinetRejected).toBe(true);
  });

  it('a rejected government bill can be revived by an appeal', () => {
    let revived = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const s = createGame({ ...base, seed });
      s.player.ministry = 'housing';
      s.player.ap = 5;
      const b = blockedBill(s);
      b.stage = 'failed';
      b.govPosition = 'oppose';
      b.cabinetRejected = true;
      if (appealToGovernment(s, b).ok) {
        revived++;
        expect(b.stage).toBe('first');
      }
    }
    expect(revived).toBeGreaterThan(0);
  });

  it('carrying out the threat as party leader takes the party out of the coalition', () => {
    const s = createGame({ ...base, partyId: 'oz' });
    s.parties.oz.leaderId = 'player';
    const b = blockedBill(s);
    s.eventQueue = [{ eventId: 'ultimatum_refused', ctx: { bill: b.id, npc: s.coalition.pmId, threat: 'x' } }];
    resolveEvent(s, 0);
    expect(s.coalition.parties).not.toContain('oz');
  });
});

describe('live votes', () => {
  it('own bill vote is staged, then applied on finish', () => {
    const s = createGame(base);
    s.player.ap = 5;
    const b = createBill(s, 'border', 1) as Bill;
    b.stage = 'preliminary';
    b.govPosition = 'support';
    const lv = startVote(s, b, 'own');
    expect(s.liveVote).toBe(lv);
    expect(lv.order).toHaveLength(120);
    expect(b.stage).toBe('preliminary');
    const r = finishVote(s)!;
    expect(s.liveVote).toBeNull();
    expect(b.stage).toBe(r.result.passed ? 'committee1' : 'failed');
  });

  it('rescue fetches absent supporters in a close vote', () => {
    let tried = 0;
    for (let seed = 1; seed < 40 && tried < 3; seed++) {
      const s = createGame({ ...base, seed });
      s.player.ap = 5;
      s.player.capital = 30;
      const b = createBill(s, 'housing', 2) as Bill;
      b.stage = 'preliminary';
      b.govPosition = 'free';
      startVote(s, b, 'own');
      const info = rescueInfo(s);
      if (!info) {
        finishVote(s);
        continue;
      }
      tried++;
      const before = s.liveVote!.result.for;
      rescueVote(s);
      expect(s.liveVote!.rescued).toBe(true);
      expect(s.liveVote!.result.for).toBeGreaterThanOrEqual(before);
      expect(s.liveVote!.result.for).toBe(s.liveVote!.result.seats.filter((x) => x === 'for').length);
      expect(rescueInfo(s)).toBeNull();
      finishVote(s);
    }
    expect(tried).toBeGreaterThan(0);
  });

  it('player votes on someone else\'s law; defying the party line costs standing', () => {
    const s = createGame(base);
    const sponsor = Object.values(s.npcs).find((n) => n.isMK && n.notable && n.partyId !== s.player.partyId)!;
    const b = queueOtherVote(s, sponsor.id, 'deathpenalty', 2);
    const ev = s.eventQueue.find((e) => e.eventId === 'plenum_vote')!;
    expect(ev.ctx.bill).toBe(b.id);
    const standing = s.player.partyStanding;
    s.eventQueue = [ev];
    // הסיעה הימנית בעד – השחקן מצביע נגד
    const line = ev.ctx.line;
    resolveEvent(s, 1);
    expect(s.liveVote?.playerVote).toBe('against');
    const r = finishVote(s)!;
    expect(r.text.length).toBeGreaterThan(0);
    if (line === 'בעד') expect(s.player.partyStanding).toBeLessThan(standing);
    expect(s.bills.find((x) => x.id === b.id)).toBeUndefined();
  });

  it('budget vote: passing keeps the government, failing triggers elections', () => {
    let fails = 0;
    let passes = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = createGame({ ...base, seed });
      // שותפה ממורמרת מאוד
      if (seed % 2) for (const p of s.coalition.parties) s.coalition.satisfaction[p] = 10;
      const e0 = s.electionWeek;
      queueOtherVote(s, s.ministers.finance ?? s.coalition.pmId, 'budget_law', 2);
      const ev = s.eventQueue.find((e) => e.eventId === 'budget_vote')!;
      s.eventQueue = [ev];
      resolveEvent(s, 0);
      const r = finishVote(s)!;
      if (r.result.passed) {
        passes++;
        expect(s.electionWeek).toBe(e0);
      } else {
        fails++;
        expect(s.electionWeek).toBeLessThan(e0);
      }
    }
    expect(passes).toBeGreaterThan(0);
    expect(fails).toBeGreaterThan(0);
  });

  it('a long MK career with plenum votes keeps invariants', () => {
    const s = createGame({ ...base, seed: 77 });
    let votes = 0;
    for (let w = 0; w < 260; w++) {
      let g = 0;
      while (s.eventQueue.length && g++ < 10) {
        if (['plenum_vote', 'budget_vote'].includes(s.eventQueue[0].eventId)) votes++;
        resolveEvent(s, w % 3);
        if (s.liveVote && w % 4 === 0 && rescueInfo(s)) rescueVote(s);
        if (s.liveVote) finishVote(s);
      }
      s.eventQueue = [];
      endWeek(s);
      expect(s.liveVote).toBeNull();
      expect(Object.values(s.parties).reduce((a, p) => a + p.seats, 0)).toBe(120);
      if (s.gameOver) break;
    }
    expect(votes).toBeGreaterThan(3);
  });
});
