import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type GameState, type NewGameOptions } from '../src/engine';
import { eventById } from '../src/engine/data/events';
import { allocateSeats } from '../src/engine/systems/elections';
import { onLawPassed, requiredMajority, strikeLaw, tickIssues } from '../src/engine/systems/issues';
import { createBill } from '../src/engine/systems/legislation';
import { addWorldEffect } from '../src/engine/systems/opinion';
import { runVote } from '../src/engine/systems/votes';

const base: NewGameOptions = {
  name: 'אבי כהן', gender: 'm', background: 'officer',
  ideology: { econ: 0, security: 30, religion: -30, judiciary: -20 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 9, cover: 'none', beard: false, glasses: false, age: 50 }, seed: 4242,
};

function clear(s: GameState) {
  s.eventQueue = [];
}

describe('issues react to laws', () => {
  it('passing a housing law cools the issue and stops housing protests', () => {
    const s = createGame(base);
    s.world.housing = 15;
    s.issues.housing = 80;
    s.world.affordability = 75; // מחאת הדיור מגיבה גם ליוקר המחיה – מנטרלים אותו
    s.issues.cost = 20;
    const protest = eventById('housing_protest')!;
    expect(protest.when!(s)).toBe(true);
    onLawPassed(s, { templateId: 'housing', title: 'חוק הדיור בהישג יד', scope: 2, sponsor: 'player' });
    expect(s.issues.housing).toBeLessThan(50);
    for (let i = 0; i < 20; i++) {
      clear(s);
      tickIssues(s);
      s.week += 1;
    }
    expect(s.issues.housing).toBeLessThanOrEqual(40);
    expect(protest.when!(s)).toBe(false);
    // אירוע ההמשך מתוזמן
    expect(s.scheduled.some((x) => x.eventId === 'housing_delivered')).toBe(true);
  });

  it('a bad world heats an issue over time', () => {
    const s = createGame(base);
    s.world.security = 10;
    const before = s.issues.security;
    for (let i = 0; i < 30; i++) tickIssues(s);
    expect(s.issues.security).toBeGreaterThan(before + 15);
  });
});

describe('basic laws and rules', () => {
  it('a Basic Law needs an absolute majority in the final reading', () => {
    const s = createGame(base);
    expect(requiredMajority(s, 'override')).toBe(61);
    const b = createBill(s, 'override', 2);
    if (typeof b === 'string') throw new Error(b);
    b.stage = 'final';
    for (const n of Object.values(s.npcs)) n.attitude = 0;
    const r = runVote(s, b);
    expect(r.passed).toBe(r.for >= 61);
    s.rules.entrench = true;
    expect(requiredMajority(s, 'override')).toBe(80);
  });

  it('raising the threshold knocks out a small list', () => {
    const s = createGame(base);
    onLawPassed(s, { templateId: 'threshold', title: 'x', scope: 2, sponsor: 'player' });
    expect(s.rules.threshold).toBe(4);
    const votes = { a: 600, b: 300, c: 64, d: 36 };
    expect(allocateSeats(votes, {}, 120, 0.0325).d).toBeGreaterThan(0);
    expect(allocateSeats(votes, {}, 120, s.rules.threshold / 100).d).toBe(0);
  });

  it('striking a law removes its remaining effects', () => {
    const s = createGame(base);
    onLawPassed(s, { templateId: 'deathpenalty', title: 'חוק עונש מוות למחבלים', scope: 2, sponsor: 'n1' });
    addWorldEffect(s, 'cohesion', -10, 20, 'חוק עונש מוות למחבלים');
    expect(s.scheduled.some((x) => x.eventId === 'petition')).toBe(true);
    strikeLaw(s, 'deathpenalty');
    expect(s.effects.some((e) => e.source === 'חוק עונש מוות למחבלים')).toBe(false);
    expect(s.lawsPassed[s.lawsPassed.length - 1].struck).toBe(true);
  });

  it('scheduled aftermath events reach the queue', () => {
    const s = createGame(base);
    onLawPassed(s, { templateId: 'draft', title: 'חוק השוויון בנטל', scope: 2, sponsor: 'player' });
    let seen = false;
    for (let i = 0; i < 6 && !seen; i++) {
      endWeek(s);
      seen = s.eventQueue.some((q) => q.eventId === 'draft_backlash');
      clear(s);
    }
    expect(seen).toBe(true);
  });
});
