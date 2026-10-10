import { describe, expect, it } from 'vitest';
import { createGame, endWeek, performAction, type NewGameOptions } from '../src/engine';
import { eventById } from '../src/engine/data/events';
import { emptyMod, modFromGame, validateMod } from '../src/engine/mods';
import { buildLists } from '../src/engine/systems/elections';
import { currentEvent, resolveEvent } from '../src/engine/systems/events';
import { finishVote, startVote, noConfidenceBill } from '../src/engine/systems/legislation';
import { startScandal } from '../src/engine/systems/scandals';
import { applyTransform } from '../src/engine/systems/transforms';
import { tryNoConfidence } from '../src/engine/systems/coalition';

const base: NewGameOptions = {
  name: 'שחקן', gender: 'f', background: 'journalist',
  ideology: { econ: 0, security: 20, religion: -20, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 21,
};

describe('interview mini-game', () => {
  it('three questions in a row, then a verdict', () => {
    for (const pick of [0, 1, 2]) {
      const s = createGame(base);
      s.player.location = 'studio';
      s.player.ap = 5;
      performAction(s, 'interview');
      const seen: string[] = [];
      let last: string[] = [];
      for (let i = 0; i < 3; i++) {
        const cur = currentEvent(s)!;
        seen.push(cur.ev.id);
        last = resolveEvent(s, pick).lines;
      }
      expect(seen[0]).toBe('iv_issue');
      expect(['iv_loyalty', 'iv_coalition']).toContain(seen[1]);
      expect(seen[2]).toBe('iv_gotcha');
      expect(s.eventQueue.some((e) => e.eventId.startsWith('iv_'))).toBe(false);
      expect(last.join(' ')).toMatch(/ראיון/);
      expect(s.flags.ivStep).toBeUndefined();
    }
  });
});

describe('live no-confidence', () => {
  it('player files no-confidence and it is a live vote needing 61', () => {
    const s = createGame({ ...base, scenario: 'freshman' });
    const b = noConfidenceBill(s, 'player');
    const lv = startVote(s, b, 'noconf', 'for');
    expect(lv.majority).toBe(61);
    const pm = s.coalition.pmId;
    const r = finishVote(s)!;
    if (r.result.passed) expect(s.coalition.pmId).not.toBe(pm);
    else expect(s.coalition.pmId).toBe(pm);
  });

  it('direct election: a successful no-confidence calls elections', () => {
    const s = createGame(base);
    applyTransform(s, 'presidential', 1, 'npc', 'r_presidential');
    for (const p of s.coalition.parties.slice(1)) s.coalition.parties = s.coalition.parties.filter((x) => x !== p);
    const before = s.electionWeek;
    let fell = false;
    for (let i = 0; i < 10 && !fell; i++) fell = tryNoConfidence(s).passed;
    expect(fell).toBe(true);
    expect(s.electionWeek).toBeLessThan(before);
  });
});

describe('primaries night', () => {
  it('building the lists records the player\'s place for the live reveal', () => {
    const s = createGame({ ...base, scenario: 'grassroots', partyId: 'tikva' });
    s.player.wantsList = true;
    buildLists(s);
    expect(s.lastPrimaries).not.toBeNull();
    expect(s.lastPrimaries!.list).toContain('player');
    expect(s.lastPrimaries!.playerPos).toBe(s.player.listPosition);
    expect(s.flags.showPrimaries).toBe(true);
  });
});

describe('realism events', () => {
  it('budget talks, commission, appointments and wishes all resolve', () => {
    for (const id of ['budget_talks', 'budget_demand', 'commission_report', 'appoint_ag', 'appoint_police', 'npc_wish_broken']) {
      expect(eventById(id)).toBeDefined();
    }
    const s = createGame(base);
    const npc = Object.values(s.npcs).find((n) => n.isMK && n.notable)!;
    s.eventQueue = [{ eventId: 'npc_wish', ctx: { npc: npc.id, wish: 'עזרה' } }];
    resolveEvent(s, 1); // להבטיח ולא לקיים
    expect(s.scheduled.some((x) => x.eventId === 'npc_wish_broken')).toBe(true);
    s.eventQueue = [{ eventId: 'budget_talks', ctx: {} }];
    resolveEvent(s, 0);
    s.eventQueue = [{ eventId: 'commission_report', ctx: {} }];
    resolveEvent(s, 2);
  });

  it('a pardon can end a case at the indictment stage', () => {
    let pardoned = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = createGame({ ...base, seed });
      startScandal(s, 'בדיקה', 50);
      s.scandal!.stage = 5;
      s.player.reputation = 80;
      s.eventQueue = [{ eventId: 'scandal_stage', ctx: { stageName: 'כתב אישום', source: 'בדיקה' } }];
      resolveEvent(s, 3);
      if (!s.scandal) pardoned++;
    }
    expect(pardoned).toBeGreaterThan(0);
    expect(pardoned).toBeLessThan(20);
  });
});

describe('custom events from the editor', () => {
  it('are validated, loaded into the game and can fire', () => {
    const mod = emptyMod();
    mod.events = [{ title: 'חתונה של ח"כ', body: 'הוזמנת.', choices: [{ label: 'ללכת', fame: 2 }, { label: 'לשלוח מתנה', money: -5, reputation: 1 }] }];
    expect(validateMod(mod).errors).toEqual([]);
    const s = createGame({ ...base, partyId: 'party_a', mod });
    expect(s.customEvents).toHaveLength(1);
    s.eventQueue = [{ eventId: 'custom_0', ctx: {} }];
    expect(currentEvent(s)!.ev.title).toBe('חתונה של ח"כ');
    const fame = s.player.fame;
    resolveEvent(s, 0);
    expect(s.player.fame).toBeGreaterThan(fame);
    expect(modFromGame(s).events).toHaveLength(1);
    // מופיעים גם בהגרלה השבועית
    let fired = false;
    for (let w = 0; w < 200 && !fired; w++) {
      if (s.eventQueue.some((e) => e.eventId === 'custom_0')) fired = true;
      let guard = 0;
      while (s.eventQueue.length && guard++ < 10) {
        resolveEvent(s, 0);
        if (s.liveVote) finishVote(s);
      }
      s.eventQueue = [];
      endWeek(s);
    }
    expect(fired).toBe(true);
  });

  it('rejects broken events', () => {
    const mod = emptyMod();
    mod.events = [{ title: '', body: 'x', choices: [] }];
    expect(validateMod(mod).errors.length).toBeGreaterThan(0);
  });
});
