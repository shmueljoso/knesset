import { describe, expect, it } from 'vitest';
import { createGame, endWeek, performAction, type NewGameOptions } from '../src/engine';
import { alerts, nextGoal, recommend, weekBrief } from '../src/engine/systems/advisor';

const base: NewGameOptions = {
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 7,
};

describe('advisor: the weekly brief on the home screen', () => {
  for (const scenario of ['freshman', 'grassroots'] as const) {
    it(`recommends up to 3 doable, distinct actions (${scenario})`, () => {
      const s = createGame({ ...base, scenario });
      s.eventQueue = [];
      const recs = recommend(s);
      expect(recs.length).toBeGreaterThan(0);
      expect(recs.length).toBeLessThanOrEqual(3);
      expect(new Set(recs.map((r) => r.id)).size).toBe(recs.length);
      for (const r of recs) {
        expect(r.why.length).toBeGreaterThan(3);
        const res = performAction(structuredClone(s), r.id);
        expect(res.good).not.toBe(false);
      }
      expect(nextGoal(s).length).toBeGreaterThan(5);
    });
  }

  it('is pure and deterministic', () => {
    const s = createGame(base);
    const before = JSON.stringify(s);
    const a = JSON.stringify(weekBrief(s));
    expect(JSON.stringify(weekBrief(s))).toBe(a);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('runs out of recommendations when time is up, and flags an empty purse', () => {
    const s = createGame(base);
    s.player.ap = 0;
    expect(recommend(s).filter((r) => r.ap > 0)).toHaveLength(0);
    s.player.money = 3;
    expect(alerts(s).some((a) => a.id === 'money')).toBe(true);
  });

  it('follows the needs: low money → fundraising rises', () => {
    const s = createGame({ ...base, scenario: 'grassroots' });
    s.eventQueue = [];
    s.player.money = 2;
    s.player.fame = 70;
    s.player.reputation = 70;
    expect(recommend(s).map((r) => r.id)).toContain('fundraise');
  });

  it('stays useful over a played season', () => {
    const s = createGame(base);
    for (let w = 0; w < 30; w++) {
      s.eventQueue = [];
      for (const r of recommend(s)) performAction(s, r.id);
      endWeek(s);
    }
    expect(weekBrief(s).alerts.length).toBeLessThanOrEqual(4);
  });
});
