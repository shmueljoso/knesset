import { it, expect } from 'vitest';
import { createGame, endWeek } from '../src/engine';
import { resolveEvent } from '../src/engine/systems/events';
import { finishVote } from '../src/engine/systems/legislation';
const mk = (seed: number) => createGame({ name: 'x', gender: 'm', background: 'journalist', ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 }, partyId: 'tikva', scenario: 'grassroots', avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed });
const play = (seed: number) => {
  const s = mk(seed);
  for (let w = 0; w < 300 && !s.gameOver; w++) {
    let g = 0;
    while ((s.eventQueue.length || s.liveVote) && g++ < 25) { if (s.liveVote) { finishVote(s); continue; } resolveEvent(s, 0); }
    s.eventQueue = [];
    endWeek(s);
  }
  return JSON.stringify([s.week, s.knesset, Object.keys(s.parties).length, s.lawsPassed.length, s.coalition.parties, Math.round(s.world.economy * 10)]);
};
it('same seed, same result, even after other games in the same process', () => {
  const a = play(24);
  play(5); play(7);
  const b = play(24);
  expect(b).toBe(a);
});
