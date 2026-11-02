import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type NewGameOptions } from '../src/engine';
import { autoChoice } from '../src/engine/systems/autopilot';
import { checkInvariants } from '../src/engine/systems/invariants';

const base: NewGameOptions = {
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 60, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 11,
};

describe('simple mode: small events decide themselves', () => {
  it('auto-resolves random events and logs the decision', () => {
    const s = createGame({ ...base, simple: true });
    expect(s.settings.simple).toBe(true);
    let manual = 0;
    for (let w = 0; w < 40; w++) {
      // אירועים שנשארו לשחקן (מתוזמנים / שרשראות) – מכריעים כמו שחקן
      manual += s.eventQueue.length;
      s.eventQueue = [];
      endWeek(s);
    }
    expect(s.autoDecisions.length).toBeGreaterThan(10);
    for (const d of s.autoDecisions) expect(d.choice.length).toBeGreaterThan(0);
    expect(checkInvariants(s)).toEqual([]);
    // במצב רגיל יש הרבה יותר החלטות ידניות
    const e = createGame(base);
    let manualExpert = 0;
    for (let w = 0; w < 40; w++) {
      manualExpert += e.eventQueue.length;
      e.eventQueue = [];
      endWeek(e);
    }
    expect(e.autoDecisions).toEqual([]);
    expect(manual).toBeLessThan(manualExpert);
  });

  it('is deterministic', () => {
    const run = () => {
      const s = createGame({ ...base, simple: true });
      for (let w = 0; w < 20; w++) {
        s.eventQueue = [];
        endWeek(s);
      }
      return JSON.stringify(s.autoDecisions) + s.player.fame;
    };
    expect(run()).toBe(run());
  });

  it('picks an available choice', () => {
    const s = createGame(base);
    s.eventQueue = [];
    for (let w = 0; w < 30 && !s.eventQueue.length; w++) endWeek(s);
    if (s.eventQueue.length) expect(autoChoice(s)).toBeGreaterThanOrEqual(0);
  });
});
