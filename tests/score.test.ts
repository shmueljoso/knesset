import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type GameState, type NewGameOptions } from '../src/engine';
import { careerId, careerScore } from '../src/engine/systems/score';

const opts = (seed = 2, scenario: 'freshman' | 'grassroots' = 'freshman'): NewGameOptions => ({
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario,
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed,
});

function play(s: GameState, weeks: number) {
  for (let i = 0; i < weeks; i++) {
    s.eventQueue = [];
    endWeek(s);
  }
}

describe('normalised career score', () => {
  it('is in 0..1000 and has four components', () => {
    const s = createGame(opts());
    play(s, 60);
    const b = careerScore(s);
    expect(b.total).toBeGreaterThanOrEqual(0);
    expect(b.total).toBeLessThanOrEqual(1000);
    for (const k of ['peak', 'impact', 'country', 'standing'] as const) {
      expect(b[k]).toBeGreaterThanOrEqual(0);
      expect(b[k]).toBeLessThanOrEqual(100);
    }
  });

  it('a higher peak scores higher, everything else equal', () => {
    const a = createGame(opts());
    play(a, 104);
    const b = structuredClone(a);
    b.player.achievements.push('pm');
    b.career.pmWeeks = 100;
    expect(careerScore(b).total).toBeGreaterThan(careerScore(a).total + 100);
    expect(careerScore(b).peakLabel).toContain('ראש');
  });

  it('the same number of laws counts for less over a longer career', () => {
    const s = createGame(opts());
    play(s, 52);
    for (let i = 0; i < 3; i++) s.lawsPassed.push({ templateId: s.lawsPassed[0]?.templateId ?? 'min_wage', title: 'x', scope: 1, week: s.week, sponsor: 'player' });
    const short = careerScore(s).impact;
    s.week += 52 * 8;
    expect(careerScore(s).impact).toBeLessThan(short);
  });

  it('very short careers, convictions and edited games are marked down', () => {
    const s = createGame(opts());
    play(s, 10);
    expect(careerScore(s).mult).toBeLessThan(1);
    const t = createGame(opts());
    play(t, 80);
    const before = careerScore(t).total;
    t.gameOver = 'convicted';
    expect(careerScore(t).total).toBeLessThan(before);
    t.flags.usedTools = true;
    expect(careerScore(t).edited).toBe(true);
  });

  it('starting from the grassroots gets a difficulty bonus', () => {
    const s = createGame(opts(2, 'grassroots'));
    expect(careerScore(s).mult).toBeGreaterThan(careerScore(createGame(opts(2, 'freshman'))).mult);
  });

  it('career ids are stable for a game and differ between games', () => {
    const s = createGame(opts(5));
    const id = careerId(s);
    play(s, 5);
    expect(careerId(s)).toBe(id);
    expect(careerId(createGame(opts(6)))).not.toBe(id);
  });
});
