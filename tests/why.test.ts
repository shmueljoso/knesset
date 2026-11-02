import { describe, expect, it } from 'vitest';
import { createGame, endWeek, performAction, type NewGameOptions } from '../src/engine';
import { noteWhy, withCause } from '../src/engine/why';
import { migrate } from '../src/engine/migrate';

const base: NewGameOptions = {
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 5,
};

describe('why it happened', () => {
  it('attributes an action to its own label', () => {
    const s = createGame(base);
    s.eventQueue = [];
    s.player.ap = 5;
    performAction(s, 'speech');
    expect(s.whyLog.some((x) => x.k === 'fame' && x.c.includes('נאום במליאה') && x.d > 0)).toBe(true);
  });

  it('nested causes are counted once, by the outer one', () => {
    const s = createGame(base);
    s.whyLog = [];
    withCause(s, 'outer', () => {
      s.player.fame += 2;
      withCause(s, 'inner', () => {
        s.player.fame += 1;
      });
    });
    expect(s.whyLog).toEqual([{ k: 'fame', c: 'outer', d: 3 }]);
    noteWhy(s, 'fame', 0.001, 'tiny');
    expect(s.whyLog).toHaveLength(1);
  });

  it('the weekly report explains each stat; the parts add up to the change', () => {
    const s = createGame(base);
    let pollExplained = false;
    for (let w = 0; w < 12; w++) {
      s.eventQueue = [];
      s.player.ap = 4;
      performAction(s, 'speech');
      performAction(s, 'mingle');
      endWeek(s);
      const r = s.report!;
      expect(s.whyLog).toEqual([]);
      if (r.why?.some((x) => x.k === 'poll')) pollExplained = true;
      for (const k of ['fame', 'reputation', 'capital'] as const) {
        const total = r.after[k] - r.before[k];
        const parts = (r.why ?? []).filter((x) => x.k === k).reduce((a, x) => a + x.d, 0);
        // מעוגל לעשירית ומסונן מתחת ל-0.05 לכל גורם
        expect(Math.abs(total - parts)).toBeLessThan(0.6);
      }
    }
    expect(pollExplained).toBe(true);
  });

  it('old saves get an empty log', () => {
    const s = createGame(base) as unknown as Record<string, unknown>;
    delete s.whyLog;
    expect(migrate(s as never).whyLog).toEqual([]);
  });
});
