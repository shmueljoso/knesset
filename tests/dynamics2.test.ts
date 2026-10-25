import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type NewGameOptions } from '../src/engine';
import { performAction } from '../src/engine/actions';
import { CHAINS, CHAIN_EVENTS } from '../src/engine/data/chains';
import { eventById } from '../src/engine/data/events';
import { SHOCKS } from '../src/engine/data/shocks';
import { resolveEvent } from '../src/engine/systems/events';
import { onLawPassed } from '../src/engine/systems/issues';
import { activeOf, tourTarget } from '../src/engine/systems/projects';
import { runElection } from '../src/engine/systems/elections';
import { sectorWeights, shiftOpinion, tickSociety } from '../src/engine/systems/society';
import { editFields, setEdit, skipWeeks } from '../src/engine/systems/tools';
import { SECTORS } from '../src/engine/util';

const base: NewGameOptions = {
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 6,
};

describe('society', () => {
  it('population shifts yearly: haredim and Arab citizens grow; shares sum to 1', () => {
    const s = createGame(base);
    const h0 = sectorWeights(s).haredi;
    for (let y = 1; y <= 5; y++) {
      s.week = y * 52;
      tickSociety(s);
    }
    const w = sectorWeights(s);
    expect(w.haredi).toBeGreaterThan(h0 * 1.1);
    expect(SECTORS.reduce((a, x) => a + w[x], 0)).toBeCloseTo(1, 5);
    expect(s.news.some((n) => n.headline.startsWith('הלמ"ס'))).toBe(true);
  });

  it('a growing sector lifts the parties that lean on it; the election resets the reference', () => {
    const s = createGame(base);
    const haredi = Object.values(s.parties).find((p) => (p.sectors.haredi ?? 0) >= 0.9)!;
    const before = haredi.poll;
    s.demo.haredi = 1.5;
    for (let i = 0; i < 30; i++) endWeek((s.eventQueue = [], s));
    expect(haredi.poll).toBeGreaterThan(before);
    runElection(s);
    expect(s.demoRef.haredi).toBe(1.5);
  });

  it('dynamics off freezes demography and opinion; strong moves more', () => {
    const off = createGame(base);
    off.settings.dynamics = 'off';
    const strong = createGame(base);
    strong.settings.dynamics = 'strong';
    const normal = createGame(base);
    for (const g of [off, normal, strong]) {
      g.world.security = 10;
      g.mood.security = 30;
      shiftOpinion(g, { security: 30 }, 'בדיקה');
      g.week = 52;
      tickSociety(g);
    }
    expect(off.demo.haredi).toBe(1);
    const p = (g: typeof off) => Object.values(g.parties).find((x) => x.ideology.security > 0)!.id;
    const moved = (g: typeof off) => Math.abs(g.drift[p(g)]?.security ?? 0);
    expect(moved(off)).toBe(0);
    expect(moved(strong)).toBeGreaterThan(moved(normal));
    expect(moved(normal)).toBeGreaterThan(0);
  });

  it('a big shock moves parties permanently, with a cap', () => {
    const s = createGame(base);
    const party = Object.values(s.parties).find((p) => p.ideology.security > 20)!;
    const was = party.ideology.security;
    for (let i = 0; i < 40; i++) SHOCKS.find((x) => x.id === 'shock_war')!.setup(s);
    expect(party.ideology.security).toBeGreaterThan(was);
    expect(party.ideology.security - was).toBeLessThanOrEqual(20.01);
  });

  it('a party that collapses at the polls replaces its leader', () => {
    const s = createGame(base);
    const p = Object.values(s.parties).filter((x) => x.leaderId !== 'player' && x.id !== s.player.partyId).sort((a, b) => b.seats - a.seats)[0];
    const old = p.leaderId;
    p.poll = 0.5;
    p.base = 0.5;
    runElection(s);
    if (s.parties[p.id]) expect(s.parties[p.id].leaderId).not.toBe(old);
  });
});

describe('chains', () => {
  it('all chain events exist, and rules point to real events', () => {
    for (const r of CHAINS) expect(eventById(r.event)).toBeDefined();
    expect(CHAIN_EVENTS.length).toBeGreaterThanOrEqual(13);
  });

  it('a religious law angers a religious partner: ultimatum, then freeze or fall', () => {
    let seen = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = createGame({ ...base, seed });
      const rel = Object.values(s.parties).find((p) => p.ideology.religion >= 55 && p.seats > 0 && p.leaderId !== s.coalition.pmId);
      if (!rel) continue;
      if (!s.coalition.parties.includes(rel.id)) {
        s.coalition.parties.push(rel.id);
        s.coalition.satisfaction[rel.id] = 60;
      }
      onLawPassed(s, { templateId: 'civil', title: 'ברית הזוגיות', scope: 2, sponsor: 'npc' });
      const ult = s.scheduled.find((x) => x.eventId === 'ch_ultimatum');
      if (!ult) continue;
      seen++;
      s.eventQueue = [{ eventId: 'ch_ultimatum', ctx: ult.ctx }];
      resolveEvent(s, 0);
      expect(s.lawsPassed.find((l) => l.templateId === 'civil')!.struck).toBe(true);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('war leads to reservists, who lead to protest if ignored', () => {
    const s = createGame(base);
    s.eventQueue = [{ eventId: 'ch_reservists', ctx: {} }];
    resolveEvent(s, 2);
    expect(s.scheduled.some((x) => x.eventId === 'ch_reservists_protest')).toBe(true);
  });

  it('a judicial escalation ladder: protest -> pilots -> strike', () => {
    const s = createGame(base);
    s.issues.judiciary = 70;
    s.eventQueue = [{ eventId: 'ch_jc_protest', ctx: { law: 'ag_split', title: 'פיצול' } }];
    resolveEvent(s, 0);
    expect(s.scheduled.some((x) => x.eventId === 'ch_jc_pilots')).toBe(true);
    s.eventQueue = [{ eventId: 'ch_jc_pilots', ctx: { law: 'ag_split', title: 'פיצול' } }];
    resolveEvent(s, 0);
    expect(s.scheduled.some((x) => x.eventId === 'ch_jc_strike')).toBe(true);
  });
});

describe('projects', () => {
  it('a tour runs for weeks, lifting the target sector; branches build a lasting machine', () => {
    const s = createGame(base);
    s.player.location = 'field';
    s.player.ap = 6;
    s.player.money = 200;
    const target = tourTarget(s);
    const was = s.player.approval[target];
    expect(performAction(s, 'project_tour').good).toBe(true);
    expect(activeOf(s, 'tour')!.sector).toBe(target);
    for (let i = 0; i < 7; i++) endWeek((s.eventQueue = [], s));
    expect(activeOf(s, 'tour')).toBeUndefined();
    expect(s.player.approval[target]).toBeGreaterThan(was);

    s.player.location = 'partyhq';
    s.player.ap = 6;
    const base0 = s.parties.merkaz.base;
    expect(performAction(s, 'project_branches').good).toBe(true);
    for (let i = 0; i < 13; i++) endWeek((s.eventQueue = [], s));
    expect(s.flags.machine).toBe(1);
    expect(s.parties.merkaz.base).toBeGreaterThan(base0);
  });

  it('supporters give income; at most three projects at once', () => {
    const s = createGame(base);
    s.player.money = 500;
    s.player.ap = 20;
    const loc = (l: string, id: string) => {
      s.player.location = l as 'field';
      return performAction(s, id);
    };
    expect(loc('field', 'project_tour').good).toBe(true);
    expect(loc('partyhq', 'project_branches').good).toBe(true);
    expect(loc('studio', 'project_ads').good).toBe(true);
    expect(loc('plaza', 'project_supporters').good).toBe(false);
  });
});

describe('advanced tools', () => {
  it('skip weeks resolves events automatically and stops for elections or negotiations', () => {
    const s = createGame(base);
    const w0 = s.week;
    const r = skipWeeks(s, 13);
    expect(r.weeks).toBeGreaterThan(0);
    expect(s.week).toBeGreaterThan(w0);
    expect(s.flags.usedTools).toBe(true);
    const e = createGame(base);
    e.electionWeek = e.week + 4;
    const r2 = skipWeeks(e, 30);
    expect(r2.weeks).toBeLessThan(30);
    expect(r2.stopped).toBeTruthy();
  });

  it('edits numbers within limits and flags the save', () => {
    const s = createGame(base);
    expect(editFields(s).length).toBeGreaterThan(40);
    expect(setEdit(s, 'player.money', 999)).toBe(true);
    expect(s.player.money).toBe(999);
    setEdit(s, 'world.economy', 500);
    expect(s.world.economy).toBe(100);
    setEdit(s, 'issue.housing', 12);
    expect(s.issues.housing).toBe(12);
    setEdit(s, 'mood.security', -20);
    expect(s.mood.security).toBe(-20);
    const id = Object.keys(s.parties)[0];
    setEdit(s, `party.${id}`, 30);
    expect(s.parties[id].poll).toBeGreaterThan(20);
    expect(Object.values(s.parties).reduce((a, p) => a + p.poll, 0)).toBeCloseTo(100, 3);
    expect(setEdit(s, 'nope.x', 1)).toBe(false);
    expect(s.flags.usedTools).toBe(true);
  });
});
