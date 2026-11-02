// אירועים וכותרות לפי מה שקרה בפועל (systems/facts.ts, data/factEvents.ts).
import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type GameState, type NewGameOptions } from '../src/engine';
import { eventById } from '../src/engine/data/events';
import { currentEvent, resolveEvent } from '../src/engine/systems/events';
import { draftEnforced, exemptionInPlace, isHarediParty, worldFacts } from '../src/engine/systems/facts';
import { makeLocalRng } from '../src/engine/rng';

const base = (seed = 3): NewGameOptions => ({
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed,
});

const pass = (s: GameState, templateId: string, scope: 1 | 2 | 3 = 2, weeksAgo = 30) =>
  s.lawsPassed.push({ templateId, title: templateId, scope, week: s.week - weeksAgo, sponsor: 'x' });

const can = (s: GameState, id: string) => eventById(id)!.when!(s);

function court(s: GameState) {
  s.rules.noReview = false;
  s.rules.packedCourt = false;
}

function kickHaredim(s: GameState) {
  s.coalition.parties = s.coalition.parties.filter((p) => !isHarediParty(s.parties[p]));
}

describe('world facts', () => {
  it('the draft status follows the laws in force (the latest wins)', () => {
    const s = createGame(base());
    expect(worldFacts(s).draft).toBe('statusQuo');
    pass(s, 'draft', 2, 60);
    expect(worldFacts(s).draft).toBe('draftLaw');
    pass(s, 'yeshiva', 2, 10);
    expect(worldFacts(s).draft).toBe('exemptionLaw');
    s.lawsPassed[s.lawsPassed.length - 1].struck = true;
    expect(worldFacts(s).draft).toBe('draftLaw');
    pass(s, 'draft', 3, 1);
    expect(worldFacts(s).draft).toBe('fullDraft');
  });

  it('who is in government', () => {
    const s = createGame(base());
    const any = Object.values(s.parties).some((p) => isHarediParty(p) && s.coalition.parties.includes(p.id));
    expect(worldFacts(s).haredimInGov).toBe(any);
    kickHaredim(s);
    expect(worldFacts(s).haredimInGov).toBe(false);
  });
});

describe('events make sense for the situation', () => {
  it('no "haredim threaten the government" ruling when they are not in it, and no ruling against an exemption that does not exist', () => {
    const s = createGame(base());
    court(s);
    kickHaredim(s);
    expect(can(s, 'court_draft')).toBe(false);
    expect(can(s, 'court_draft_order')).toBe(true);
    pass(s, 'draft', 2, 40);
    expect(can(s, 'court_draft')).toBe(false);
    expect(can(s, 'court_draft_order')).toBe(false);
    expect(can(s, 'court_exemption_law')).toBe(false);
  });

  it('a draft law brings arrests, sanctions and enlistment news – not exemption protests', () => {
    const s = createGame(base());
    pass(s, 'draft', 2, 45);
    const f = worldFacts(s);
    expect(draftEnforced(f)).toBe(true);
    expect(can(s, 'draft_arrests')).toBe(true);
    expect(can(s, 'draft_sanctions')).toBe(true);
    expect(can(s, 'draft_success')).toBe(true);
    expect(can(s, 'reservists_exemption')).toBe(false);
  });

  it('an exemption law brings reservist protests and, later, a court ruling that can strike it', () => {
    const s = createGame(base());
    court(s);
    pass(s, 'yeshiva', 2, 25);
    expect(exemptionInPlace(worldFacts(s))).toBe(true);
    expect(can(s, 'reservists_exemption')).toBe(true);
    expect(can(s, 'court_exemption_law')).toBe(true);
    expect(can(s, 'draft_arrests')).toBe(false);
    // הפסיקה מבטלת את החוק – וחוזרים לפטור בלי חוק
    s.eventQueue = [{ eventId: 'court_exemption_law', ctx: { gov: '' } }];
    resolveEvent(s, 0);
    expect(worldFacts(s).draft).toBe('statusQuo');
  });

  it('the cabinet only debates yeshiva budgets when haredim sit in it', () => {
    const s = createGame(base());
    kickHaredim(s);
    expect(can(s, 'cab_haredi')).toBe(false);
  });

  it('a court ruling names a real law', () => {
    const s = createGame(base());
    expect(eventById('court_ruling')!.ctx!(s)).toBeNull();
    pass(s, 'metro', 2, 20);
    expect(eventById('court_ruling')!.ctx!(s)?.title).toBe('metro');
  });

  it('a long game never fires an event that contradicts the facts', () => {
    for (const seed of [2, 7, 11]) {
      const s = createGame(base(seed));
      const r = makeLocalRng(seed);
      for (let w = 0; w < 200 && !s.gameOver; w++) {
        endWeek(s);
        let guard = 0;
        while (s.eventQueue.length && guard++ < 20) {
          const cur = currentEvent(s);
          if (!cur) break;
          const f = worldFacts(s);
          const id = cur.ev.id;
          if (id === 'court_draft') expect(f.haredimInGov && f.draft === 'statusQuo').toBe(true);
          if (id === 'draft_arrests' || id === 'draft_sanctions') expect(draftEnforced(f)).toBe(true);
          if (id === 'reservists_exemption' || id === 'court_draft_order') expect(exemptionInPlace(f)).toBe(true);
          if (id === 'court_exemption_law') expect(f.draft).toBe('exemptionLaw');
          const ok = cur.ev.choices.map((_, i) => i).filter((i) => !cur.ev.choices[i].requires?.(s, cur.ctx));
          resolveEvent(s, ok[Math.floor(r() * ok.length)] ?? 0);
        }
        s.eventQueue = [];
      }
    }
  });
});
