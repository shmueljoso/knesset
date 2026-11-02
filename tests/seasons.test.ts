import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type NewGameOptions } from '../src/engine';
import { SEASON_WEEKS, goalMetric, seasonProgress, startSeason, tickSeason } from '../src/engine/systems/seasons';
import { migrate } from '../src/engine/migrate';

const base: NewGameOptions = {
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 21,
};

describe('seasons', () => {
  it('a new game starts season 1 with three role-fitting goals, not yet met', () => {
    for (const scenario of ['freshman', 'grassroots'] as const) {
      const s = createGame({ ...base, scenario });
      expect(s.season.n).toBe(1);
      expect(s.season.goals).toHaveLength(3);
      for (const g of s.season.goals) {
        expect(goalMetric(s, g.kind, s.season.start)).toBeLessThan(g.target);
        expect(g.text.length).toBeGreaterThan(4);
      }
      if (scenario === 'freshman') expect(s.season.goals[0].kind).toBe('laws');
    }
  });

  it('reaching a goal rewards once', () => {
    const s = createGame(base);
    const g = s.season.goals.find((x) => x.kind === 'fame') ?? s.season.goals[0];
    g.kind = 'fame';
    g.target = s.player.fame + 1;
    s.player.fame += 5;
    const cap = s.player.capital;
    tickSeason(s);
    expect(g.done).toBe(true);
    expect(seasonProgress(s, g)).toBe(1);
    expect(s.player.capital).toBe(cap + 4);
    tickSeason(s);
    expect(s.player.capital).toBe(cap + 4);
  });

  it('after a year: a review with a grade and a new season', () => {
    const s = createGame(base);
    for (let w = 0; w < SEASON_WEEKS + 1; w++) {
      s.eventQueue = [];
      endWeek(s);
    }
    expect(s.seasonLog).toHaveLength(1);
    expect(['A', 'B', 'C', 'D']).toContain(s.seasonLog[0].grade);
    expect(s.season.n).toBe(2);
    expect(s.flags.showSeason).toBe(true);
  });

  it('goals are deterministic per seed and old saves get a season', () => {
    const a = createGame(base);
    const b = createGame(base);
    expect(a.season).toEqual(b.season);
    const old = createGame(base) as unknown as Record<string, unknown>;
    delete old.season;
    delete old.seasonLog;
    const m = migrate(old as never);
    expect(m.season.goals.length).toBeGreaterThan(0);
    expect(m.seasonLog).toEqual([]);
    startSeason(m, 2);
    expect(m.season.n).toBe(2);
  });
});
