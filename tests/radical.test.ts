import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type GameState, type NewGameOptions } from '../src/engine';
import { BILL_TEMPLATES, templateById } from '../src/engine/data/bills';
import { COMMITTEE_DEFS } from '../src/engine/data/committees';
import { eventById } from '../src/engine/data/events';
import { TRANSFORM_INFO } from '../src/engine/data/transforms';
import { callEarlyElections, runElection } from '../src/engine/systems/elections';
import { tryNoConfidence } from '../src/engine/systems/coalition';
import { resolveEvent } from '../src/engine/systems/events';
import { onLawPassed, strikeChance } from '../src/engine/systems/issues';
import { createBill } from '../src/engine/systems/legislation';
import { forecast } from '../src/engine/systems/votes';
import { applyTransform, hasTransform, publicSupport } from '../src/engine/systems/transforms';
import type { TransformId } from '../src/engine/types';

const base: NewGameOptions = {
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 5,
};

const radicals = BILL_TEMPLATES.filter((t) => t.radical);

function drain(s: GameState, w = 0) {
  let g = 0;
  while (s.eventQueue.length && g++ < 20) {
    const ev = eventById(s.eventQueue[0].eventId);
    const ctx = s.eventQueue[0].ctx;
    const idx = ev ? Math.max(0, ev.choices.findIndex((c, i) => i >= w % ev.choices.length && (!c.requires || !c.requires(s, ctx)))) : 0;
    resolveEvent(s, idx);
  }
  s.eventQueue = [];
}

describe('new and radical bill templates', () => {
  it('are well formed', () => {
    const ids = new Set<string>();
    for (const t of BILL_TEMPLATES) {
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      expect(COMMITTEE_DEFS.some((c) => c.id === t.committee)).toBe(true);
      expect(t.scopes).toHaveLength(3);
      for (const [e] of t.aftermath ?? []) expect(eventById(e)).toBeDefined();
    }
    expect(radicals.length).toBeGreaterThanOrEqual(12);
    for (const t of radicals) {
      expect(TRANSFORM_INFO[t.radical!]).toBeDefined();
      expect(t.basic).toBeDefined();
    }
  });

  it('radical proposals almost never have a majority, and the public mostly says no', () => {
    const s = createGame(base);
    s.player.ap = 99;
    for (const t of radicals) {
      const b = createBill(s, t.id, 2);
      expect(typeof b).not.toBe('string');
      if (typeof b === 'string') continue;
      b.stage = 'final';
      const f = forecast(s, b);
      s.bills = [];
      const need = t.basic!.majority === 80 ? 80 : 61;
      expect(f.eFor).toBeLessThan(need);
      const sup = publicSupport(s, t.id);
      expect(sup).toBeGreaterThan(5);
      if (t.referendum) expect(sup).toBeLessThan(60);
    }
  });

  it('NPC agendas never pick radical proposals', () => {
    const s = createGame(base);
    for (const n of Object.values(s.npcs)) if (n.agenda) expect(templateById(n.agenda).radical).toBeUndefined();
  });
});

describe('transformations', () => {
  for (const t of radicals) {
    it(`${t.radical} changes the state and its aftermath runs`, () => {
      const s = createGame({ ...base, seed: 40 });
      applyTransform(s, t.radical!, 2, 'player', t.id);
      expect(hasTransform(s, t.radical!)).toBe(true);
      for (const x of s.scheduled) expect(eventById(x.eventId)).toBeDefined();
      for (let w = 0; w < 60; w++) {
        drain(s, w);
        endWeek(s);
        expect(Object.values(s.parties).reduce((a, p) => a + p.seats, 0)).toBe(120);
        for (const v of Object.values(s.world)) expect(Number.isFinite(v)).toBe(true);
      }
    });
  }

  it('a referendum law waits for the vote and then passes or dies', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = createGame({ ...base, seed });
      onLawPassed(s, { templateId: 'r_secular', title: 'הפרדת הדת מהמדינה', scope: 2, sponsor: 'player' });
      expect(hasTransform(s, 'secular')).toBe(false);
      const ref = s.scheduled.find((x) => x.eventId === 'referendum')!;
      expect(ref).toBeDefined();
      s.eventQueue = [{ eventId: 'referendum', ctx: ref.ctx }];
      s.player.fame = 80;
      resolveEvent(s, 0);
      const rec = s.lawsPassed.find((l) => l.templateId === 'r_secular')!;
      expect(hasTransform(s, 'secular') || rec.struck).toBe(true);
    }
  });

  it('emergency postpones the elections; obeying the court restores them', () => {
    const s = createGame(base);
    const before = s.electionWeek;
    onLawPassed(s, { templateId: 'r_emergency', title: 'דחיית הבחירות', scope: 2, sponsor: 'player' });
    expect(s.electionWeek).toBe(before + 104);
    const court = s.scheduled.find((x) => x.eventId === 'radical_court')!;
    s.eventQueue = [{ eventId: 'radical_court', ctx: court.ctx }];
    resolveEvent(s, 0);
    expect(hasTransform(s, 'emergency')).toBe(false);
    expect(s.electionWeek).toBe(before);
  });

  it('presidential system blocks no-confidence and early elections; sovereignty ends judicial review', () => {
    const s = createGame(base);
    applyTransform(s, 'presidential', 2, 'npc', 'r_presidential');
    expect(tryNoConfidence(s).passed).toBe(false);
    const e = s.electionWeek;
    callEarlyElections(s, 'משבר');
    expect(s.electionWeek).toBe(e);
    const before = strikeChance(s, 'deathpenalty');
    applyTransform(s, 'sovereignty', 3, 'npc', 'r_sovereign');
    expect(before).toBeGreaterThan(0);
    expect(strikeChance(s, 'deathpenalty')).toBe(0);
  });

  it('the level matters: direct election vs presidential vs districts', () => {
    const direct = createGame(base);
    applyTransform(direct, 'presidential', 1, 'npc', 'r_presidential');
    expect(direct.rules.directPM).toBe(true);
    expect(direct.rules.presidential).toBeFalsy();
    const e = direct.electionWeek;
    callEarlyElections(direct, 'משבר');
    expect(direct.electionWeek).toBeLessThan(e); // בבחירה ישירה עדיין יש בחירות מוקדמות

    const districts = createGame(base);
    applyTransform(districts, 'presidential', 3, 'npc', 'r_presidential');
    expect(districts.rules.presidential && districts.rules.districts).toBe(true);
    for (let w = 0; w < 40; w++) endWeek(districts);
    districts.eventQueue = [];
    const big = Object.values(districts.parties).sort((a, b) => b.poll - a.poll)[0];
    const before = big.seats;
    runElection(districts);
    expect(districts.parties[big.id].seats).toBeGreaterThan(before);

    const mild = createGame(base);
    applyTransform(mild, 'sovereignty', 1, 'npc', 'r_sovereign');
    expect(strikeChance(mild, 'deathpenalty')).toBeGreaterThan(0);
    const mid = createGame(base);
    applyTransform(mid, 'sovereignty', 2, 'npc', 'r_sovereign');
    expect(strikeChance(mid, 'deathpenalty')).toBeLessThan(strikeChance(mild, 'deathpenalty'));

    const ann = createGame(base);
    applyTransform(ann, 'annexation', 1, 'npc', 'r_annex');
    expect(ann.scheduled.some((x) => x.eventId === 'annex_citizenship')).toBe(false);
    const ann3 = createGame(base);
    applyTransform(ann3, 'annexation', 3, 'npc', 'r_annex');
    expect(ann3.scheduled.some((x) => x.eventId === 'annex_citizenship')).toBe(true);
  });

  it('a halakhic state strikes civil marriage and Shabbat transport', () => {
    const s = createGame(base);
    onLawPassed(s, { templateId: 'civil', title: 'ברית הזוגיות', scope: 2, sponsor: 'npc' });
    onLawPassed(s, { templateId: 'shabbat', title: 'תחבורה בשבת', scope: 2, sponsor: 'npc' });
    applyTransform(s, 'halacha' as TransformId, 3, 'npc', 'r_halacha');
    expect(s.lawsPassed.filter((l) => ['civil', 'shabbat'].includes(l.templateId)).every((l) => l.struck)).toBe(true);
  });
});
