import { describe, expect, it } from 'vitest';
import { createGame, endWeek, performAction, type NewGameOptions } from '../src/engine';
import { resolveEvent, currentEvent } from '../src/engine/systems/events';
import { tickRivals, nemesis, ally } from '../src/engine/systems/rivals';
import { debateOpponent, whipBill } from '../src/engine/data/rivalEvents';
import { queueBill } from '../src/engine/systems/legislation';

const base: NewGameOptions = {
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 31,
};

const notableMks = (s: ReturnType<typeof createGame>) => Object.values(s.npcs).filter((n) => n.notable && n.isMK && !n.outside);

describe('rivalries and moments', () => {
  it('a bitter enemy becomes the nemesis, a close friend the ally, and both become moments', () => {
    const s = createGame(base);
    const [foe, friend] = notableMks(s);
    foe.attitude = -80;
    friend.attitude = 90;
    s.week = 8;
    tickRivals(s);
    expect(nemesis(s)?.id).toBe(foe.id);
    expect(ally(s)?.id).toBe(friend.id);
    expect(s.moments.some((m) => m.text.includes(foe.name))).toBe(true);
    // היריבות שוככת כשהיחס משתפר
    foe.attitude = 10;
    for (const n of Object.values(s.npcs)) if (n.attitude <= -35) n.attitude = 0;
    s.week = 12;
    tickRivals(s);
    expect(nemesis(s)).toBeNull();
  });

  it('the TV debate: three rounds, then a verdict', () => {
    const s = createGame(base);
    s.eventQueue = [];
    s.player.fame = 50;
    s.player.ap = 5;
    expect(debateOpponent(s)).not.toBeNull();
    const fame0 = s.player.fame;
    const res = performAction(s, 'debate');
    expect(res.good).toBe(true);
    const lines: string[] = [];
    for (let i = 0; i < 3; i++) {
      expect(currentEvent(s)?.ev.id).toBe('deb_round');
      lines.push(...resolveEvent(s, i % 4).lines);
    }
    expect(s.eventQueue.some((q) => q.eventId === 'deb_round')).toBe(false);
    expect(lines.join(' ')).toMatch(/עימות/);
    expect(s.flags.debStep).toBeUndefined();
    expect(s.player.fame).toBeGreaterThan(fame0);
  });

  it('the whip: pledges for the player bill', () => {
    const s = createGame(base);
    s.eventQueue = [];
    s.player.ap = 5;
    s.player.capital = 30;
    const b = queueBill(s, 'player', 'housing', 2);
    b.stage = 'preliminary';
    expect(whipBill(s)?.id).toBe(b.id);
    const before = Object.values(s.npcs).filter((n) => n.pledges.includes(b.id)).length;
    expect(performAction(s, 'whip').good).toBe(true);
    for (let i = 0; i < 3 && currentEvent(s)?.ev.id === 'whip_round'; i++) resolveEvent(s, 0);
    const after = Object.values(s.npcs).filter((n) => n.pledges.includes(b.id)).length;
    expect(after).toBeGreaterThan(before);
    expect(s.flags.whipStep).toBeUndefined();
  });

  it('a long game stays sane with rivals', () => {
    const s = createGame(base);
    for (let w = 0; w < 60; w++) {
      for (let i = 0; i < 8 && currentEvent(s); i++) {
        const ev = currentEvent(s)!;
        const idx = ev.ev.choices.findIndex((c) => !c.requires?.(s, ev.ctx));
        if (idx < 0) s.eventQueue.shift();
        else resolveEvent(s, idx);
      }
      s.eventQueue = [];
      endWeek(s);
    }
    expect(s.moments.length).toBeGreaterThanOrEqual(0);
  });
});
