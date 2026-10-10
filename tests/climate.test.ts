import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type GameState, type NewGameOptions } from '../src/engine';
import { SCENARIOS } from '../src/engine/data/scenarios';
import { eventById } from '../src/engine/data/events';
import { SHOCKS } from '../src/engine/data/shocks';
import { radicalClimate, openWindow, windowOpen } from '../src/engine/systems/climate';
import { resolveEvent } from '../src/engine/systems/events';
import { finishVote, ministerialDecision, queueBill } from '../src/engine/systems/legislation';
import { forecast } from '../src/engine/systems/votes';
import { runPresidentVote, startPresidentRace } from '../src/engine/systems/president';
import { publicSupport } from '../src/engine/systems/transforms';

const base = (mod: NewGameOptions['mod'] = null, partyId = 'merkaz'): NewGameOptions => ({
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId, scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 3, mod,
});

const k2022 = SCENARIOS.find((x) => x.id === 'knesset-25-2022')!.mod;

describe('political climate', () => {
  it('a like-minded government plus a window makes annexation competitive; an opposed government does not', () => {
    const s = createGame(base(k2022, 'likud'));
    const b = queueBill(s, s.coalition.pmId, 'r_annex', 2);
    const before = forecast(s, b).eFor;
    const pubBefore = publicSupport(s, 'r_annex');
    openWindow(s, 'annexation', 26, 'בדיקה');
    expect(windowOpen(s, 'annexation')).toBe(true);
    b.govPosition = ministerialDecision(s, b);
    expect(b.govPosition).toBe('support');
    const after = forecast(s, b).eFor;
    expect(after).toBeGreaterThan(before + 5);
    expect(after).toBeGreaterThan(45);
    expect(publicSupport(s, 'r_annex')).toBeGreaterThan(pubBefore);
    expect(radicalClimate(s, 'r_annex').reasons.some((r) => r.includes('חלון'))).toBe(true);

    // ממשלה שמתנגדת לרעיון לא תהפוך אותו לאפשרי
    const p = createGame(base(k2022, 'likud'));
    const pb = queueBill(p, p.coalition.pmId, 'r_peace', 2);
    openWindow(p, 'peace', 26, 'בדיקה');
    pb.govPosition = ministerialDecision(p, pb);
    expect(forecast(p, pb).eFor).toBeLessThan(30);
  });

  it('shocks open windows', () => {
    const s = createGame(base());
    SHOCKS.find((x) => x.id === 'shock_crash')!.setup(s);
    expect(windowOpen(s, 'ubi') || windowOpen(s, 'libertarian')).toBe(true);
    SHOCKS.find((x) => x.id === 'shock_war')!.setup(s);
    expect(windowOpen(s, 'annexation')).toBe(true);
    for (let w = 0; w < 40; w++) s.week++;
    expect(windowOpen(s, 'annexation')).toBe(false);
  });

  it('a like-minded government in a window sometimes brings a revolution to a live vote', () => {
    let proposed = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = createGame({ ...base(k2022, 'likud'), seed });
      openWindow(s, 'annexation', 200, 'בדיקה');
      openWindow(s, 'sovereignty', 200, 'בדיקה');
      for (let w = 0; w < 120; w++) {
        if (s.eventQueue.some((e) => e.eventId === 'plenum_vote' && s.bills.find((b) => b.id === e.ctx.bill)?.templateId.startsWith('r_'))) {
          proposed++;
          break;
        }
        let g = 0;
        while (s.eventQueue.length && g++ < 10) {
          resolveEvent(s, 0);
          if (s.liveVote) finishVote(s);
        }
        s.eventQueue = [];
        endWeek(s);
      }
    }
    expect(proposed).toBeGreaterThan(0);
  });
});

describe('president', () => {
  it('a race runs in rounds and someone wins; the seat is refilled', () => {
    const s = createGame(base());
    startPresidentRace(s);
    expect(s.presidentRace?.candidates.length).toBeGreaterThanOrEqual(2);
    expect(s.eventQueue.some((e) => e.eventId === 'president_ballot')).toBe(true);
    resolveEvent(s, 0);
    const race = s.presidentRace!;
    expect(race.winner).toBeTruthy();
    expect(race.rounds.length).toBeGreaterThanOrEqual(1);
    expect(s.president?.id).toBe(race.winner);
    expect(s.npcs[race.winner!].isMK).toBe(false);
    expect(s.seating.filter((id) => id === race.winner)).toHaveLength(0);
    expect(Object.values(s.parties).reduce((a, p) => a + p.seats, 0)).toBe(120);
  });

  it('the player can run, and winning ends the career at the top', () => {
    let won = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s: GameState = createGame({ ...base(), seed });
      s.player.fame = 90;
      s.player.reputation = 90;
      for (const n of Object.values(s.npcs)) n.attitude = 80;
      startPresidentRace(s);
      s.presidentRace!.candidates = s.presidentRace!.candidates.slice(0, 2).concat('player');
      runPresidentVote(s, 'player');
      if (s.presidentRace!.winner === 'player') {
        won++;
        expect(s.gameOver).toBe('president');
      }
    }
    expect(won).toBeGreaterThan(0);
  });
});

describe('independent court', () => {
  it('court events exist and resolve', () => {
    const s = createGame(base());
    for (const id of ['court_draft', 'court_appointment', 'court_reasonable']) {
      expect(eventById(id)).toBeDefined();
      s.eventQueue = [{ eventId: id, ctx: {} }];
      resolveEvent(s, 1);
    }
    expect(windowOpen(s, 'sovereignty')).toBe(true);
  });
});
