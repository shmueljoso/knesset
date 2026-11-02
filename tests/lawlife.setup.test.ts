// חוקים בתוקף לאורך זמן (systems/lawlife.ts, data/lawEvents.ts) ועולם מותאם אישית בפתיחה (systems/setup.ts).
import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type GameState, type NewGameOptions } from '../src/engine';
import { EVENTS, eventById } from '../src/engine/data/events';
import { BILL_TEMPLATES } from '../src/engine/data/bills';
import { resolveEvent, currentEvent } from '../src/engine/systems/events';
import { checkInvariants } from '../src/engine/systems/invariants';
import { worldFacts, hasLaw } from '../src/engine/systems/facts';
import { lawsInForce, repealBlocked, repealByPlayer, tickLaws, govFit } from '../src/engine/systems/lawlife';
import { setEdit } from '../src/engine/systems/tools';
import { validateMod } from '../src/engine/mods';
import { SCENARIOS } from '../src/engine/data/scenarios';
import { makeLocalRng } from '../src/engine/rng';

const base = (seed = 3, extra: Partial<NewGameOptions> = {}): NewGameOptions => ({
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed, ...extra,
});

const pass = (s: GameState, templateId: string, weeksAgo = 30) =>
  s.lawsPassed.push({ templateId, title: BILL_TEMPLATES.find((t) => t.id === templateId)!.title, scope: 2, week: s.week - weeksAgo, sponsor: 'x' });

describe('events', () => {
  it('every event id is unique', () => {
    const ids = EVENTS.map((e) => e.id);
    expect(ids.filter((x, i) => ids.indexOf(x) !== i)).toEqual([]);
  });
});

describe('laws keep living after they pass', () => {
  it('domain events appear only while the law is in force', () => {
    const s = createGame(base());
    for (const [id, law] of [['rent_landlords', 'rent'], ['core_refusal', 'core'], ['death_sentence', 'deathpenalty'], ['vat_prices', 'vat_food']] as const) {
      expect(eventById(id)!.when!(s)).toBe(false);
      pass(s, law, 40);
      expect(eventById(id)!.when!(s)).toBe(true);
      s.lawsPassed[s.lawsPassed.length - 1].struck = true;
      expect(eventById(id)!.when!(s)).toBe(false);
    }
  });

  it('a state audit picks a real law and is not repeated for it', () => {
    const s = createGame(base());
    s.lawsPassed = [];
    pass(s, 'metro', 40);
    const ev = eventById('law_review')!;
    const ctx = ev.ctx!(s)!;
    expect(ctx.law).toBe('metro');
    s.eventQueue = [{ eventId: 'law_review', ctx }];
    resolveEvent(s, 1);
    expect(s.flags.rev_metro).toBe(s.week);
    expect(ev.when!(s)).toBe(false);
  });

  it('the prime minister can repeal a law; it stops being in force and its rule reverts', () => {
    const s = createGame(base());
    s.eventQueue = [];
    s.coalition.pmId = 'player';
    pass(s, 'yeshiva', 40);
    expect(worldFacts(s).draft).toBe('exemptionLaw');
    Object.assign(s.player, { capital: 50, ap: 5 });
    expect(repealBlocked(s, 'yeshiva')).toBeNull();
    expect(repealByPlayer(s, 'yeshiva').ok).toBe(true);
    expect(worldFacts(s).draft).toBe('statusQuo');
    expect(s.lawsPassed.at(-1)?.repealed).toBe(true);
  });

  it('a government that strongly opposes a law may repeal it on its own', () => {
    let repealed = false;
    for (let seed = 1; seed < 40 && !repealed; seed++) {
      const s = createGame(base(seed));
      s.week = 40;
      // חוק שהממשלה הכי מתנגדת לו
      const worst = BILL_TEMPLATES.filter((t) => !t.hidden && !t.radical && Object.keys(t.lean).length).sort((a, b) => govFit(s, a.id) - govFit(s, b.id))[0];
      if (govFit(s, worst.id) >= -0.45) continue;
      pass(s, worst.id, 40);
      for (let w = 0; w < 200 && !repealed; w++) {
        s.week += 4;
        tickLaws(s);
        repealed = !hasLaw(s, worst.id);
      }
      if (repealed) expect(checkInvariants(s)).toEqual([]);
    }
    expect(repealed).toBe(true);
  });

  it('a long game with laws coming and going stays consistent', () => {
    const s = createGame(base(9));
    const r = makeLocalRng(9);
    for (const id of ['rent', 'core', 'yeshiva', 'guns', 'metro', 'pension']) pass(s, id, 30);
    for (let w = 0; w < 160 && !s.gameOver; w++) {
      endWeek(s);
      let g = 0;
      while (s.eventQueue.length && g++ < 20) {
        const cur = currentEvent(s);
        if (!cur) break;
        const ok = cur.ev.choices.map((_, i) => i).filter((i) => !cur.ev.choices[i].requires?.(s, cur.ctx));
        resolveEvent(s, ok[Math.floor(r() * ok.length)] ?? 0);
      }
      s.eventQueue = [];
    }
    expect(checkInvariants(s)).toEqual([]);
    expect(lawsInForce(s).every((l) => !l.struck)).toBe(true);
  });
});

describe('custom world at the start', () => {
  it('rules, laws in force, state, mood and polls – and the game is locked', () => {
    const s = createGame(base(4, {
      setup: {
        rules: { presidential: true, threshold: 2 },
        laws: [{ id: 'yeshiva', scope: 2 }, { id: 'norwegian', scope: 1 }],
        transforms: ['secular'],
        world: { economy: 20, security: 80 },
        issues: { housing: 90 },
        mood: { security: 30 },
        polls: { merkaz: 30 },
      },
    }));
    expect(s.rules.presidential).toBe(true);
    expect(s.rules.threshold).toBe(2);
    expect(s.rules.norwegian).toBe(true);
    expect(worldFacts(s).draft).toBe('exemptionLaw');
    expect(worldFacts(s).civilMarriage).toBe(true);
    expect(s.world.economy).toBe(20);
    expect(s.world.security).toBe(80);
    expect(s.issues.housing).toBe(90);
    expect(s.mood.security).toBe(30);
    expect(s.parties.merkaz.poll).toBe(30);
    const total = Object.values(s.parties).reduce((a, p) => a + p.poll, 0);
    expect(total).toBeCloseTo(100, 0);
    expect(s.settings.locked).toBe(true);
    expect(s.flags.customStart).toBe(true);
    // נעול: הכלים המתקדמים לא משנים מספרים
    expect(setEdit(s, 'player.reputation', 99)).toBe(false);
    expect(checkInvariants(s)).toEqual([]);
    s.eventQueue = [];
    endWeek(s);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('an unlocked custom world still allows editing; normal games are unaffected', () => {
    const s = createGame(base(4, { setup: { world: { economy: 30 }, locked: false } }));
    expect(s.settings.locked).toBe(false);
    expect(setEdit(s, 'player.reputation', 70)).toBe(true);
    const n = createGame(base(4));
    expect(n.settings.locked).toBeFalsy();
    expect(n.flags.customStart).toBeUndefined();
  });

  it('scenario files can list laws in force', () => {
    const mod = structuredClone(SCENARIOS[0].mod);
    mod.laws = [{ id: 'draft', scope: 2 }];
    expect(validateMod(mod).errors).toEqual([]);
    expect(validateMod({ ...mod, laws: [{ id: 'nope', scope: 2 }] }).errors.join()).toMatch(/nope/);
    const s = createGame(base(2, { mod, scenario: 'freshman', partyId: mod.parties[0].id }));
    expect(worldFacts(s).draft).toBe('draftLaw');
    expect(s.settings.locked).toBeFalsy();
  });
});
