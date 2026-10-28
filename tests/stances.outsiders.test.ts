import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type NewGameOptions } from '../src/engine';
import { SCENARIOS } from '../src/engine/data/scenarios';
import { checkInvariants } from '../src/engine/systems/invariants';
import { changeStance, stanceBlocked, stancePreview } from '../src/engine/systems/stances';
import { takeStance } from '../src/engine/systems/opinion';
import { setEdit } from '../src/engine/systems/tools';
import { tireIssue } from '../src/engine/systems/issues';
import { rollEvents } from '../src/engine/systems/events';
import { FIGURES_PACK, activeOutsiders, recruitFigure, tickOutsiders } from '../src/engine/systems/outsiders';
import { setMediaMode } from '../src/engine/systems/media';

const k2022 = SCENARIOS.find((x) => x.id === 'knesset-25-2022')!.mod;
const base = (o: Partial<NewGameOptions> = {}): NewGameOptions => ({
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 40, religion: -20, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 6, ...o,
});

describe('changing your opinions mid-game', () => {
  it('a public change moves the axis, costs consistency, and cools down', () => {
    const s = createGame(base());
    s.player.ap = 5;
    const c0 = s.player.consistency;
    const pv = stancePreview(s, 'security', -45);
    expect(pv.flip).toBe(false);
    const r = changeStance(s, 'security', -25);
    expect(r.ok).toBe(true);
    expect(s.player.ideology.security).toBe(15);
    expect(s.player.consistency).toBeLessThan(c0);
    expect(stanceBlocked(s, 'security')).toContain('שבועות');
    expect(s.news[0].aboutPlayer).toBe(true);
    // תפנית: מעבר מצד לצד
    s.player.ap = 5;
    expect(stancePreview(s, 'religion', 45).flip).toBe(true);
  });

  it('repeated statements drift you toward them; edit tools can set them directly', () => {
    const s = createGame(base());
    const before = s.player.ideology.econ;
    for (let i = 0; i < 10; i++) takeStance(s, { econ: 80 }, 1.5);
    expect(s.player.ideology.econ).toBeGreaterThan(before + 3);
    expect(setEdit(s, 'ideology.judiciary', 66)).toBe(true);
    expect(s.player.ideology.judiciary).toBe(66);
    expect(s.flags.usedTools).toBe(true);
  });
});

describe('recurring issues tire the public', () => {
  it('after repeated protests on an issue, its events stop for a while and salience drops', () => {
    const s = createGame(base());
    s.issues.housing = 90;
    s.world.housing = 10;
    for (let i = 0; i < 3; i++) tireIssue(s, 'housing', 25);
    expect(s.news.some((n) => n.headline.includes('המחאות דועכות'))).toBe(true);
    let fired = 0;
    for (let i = 0; i < 30; i++) {
      s.eventQueue = [];
      rollEvents(s);
      if (s.eventQueue.some((e) => e.eventId === 'housing_protest')) fired++;
    }
    expect(fired).toBe(0);
    const hot = s.issues.housing;
    for (let i = 0; i < 20; i++) {
      s.eventQueue = [];
      endWeek(s);
    }
    expect(s.issues.housing).toBeLessThan(hot);
  });
});

describe('public figures outside the Knesset', () => {
  it('exist in real mode only, act weekly, and can be recruited', () => {
    const s = createGame(base({ mod: k2022, partyId: k2022.parties[0].id, asLeader: true }));
    expect(activeOutsiders(s).length).toBeGreaterThan(10);
    expect(activeOutsiders(s).map((n) => n.name)).toContain('יוסי כהן');
    setMediaMode(s, 'fictional');
    expect(activeOutsiders(s)).toHaveLength(0);
    setMediaMode(s, 'real');
    const news0 = s.news.length;
    for (let i = 0; i < 40; i++) tickOutsiders(s);
    expect(s.news.length).toBeGreaterThan(news0);
    // גיוס לרשימה
    const runner = activeOutsiders(s).find((n) => FIGURES_PACK.figures.find((f) => `rf_${f.id}` === n.id)?.canRun)!;
    runner.attitude = 100;
    let ok = false;
    for (let i = 0; i < 12 && !ok; i++) {
      s.player.ap = 5;
      delete s.flags[`recruit_${runner.id}`];
      ok = recruitFigure(s, runner.id).ok;
    }
    expect(ok).toBe(true);
    expect(s.parties[s.player.partyId!].list[1]).toBe(runner.id);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('two years of real-mode play stay consistent', () => {
    const s = createGame(base({ mod: k2022, partyId: k2022.parties[0].id }));
    for (let i = 0; i < 104; i++) {
      s.eventQueue = [];
      endWeek(s);
    }
    expect(checkInvariants(s)).toEqual([]);
  });
});
