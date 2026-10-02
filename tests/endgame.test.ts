import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGame, endWeek, type GameState, type NewGameOptions } from '../src/engine';
import { migrate } from '../src/engine/migrate';
import { validateMod } from '../src/engine/mods';
import { choiceBlocked, currentEvent, resolveEvent } from '../src/engine/systems/events';
import { computeLegacy, retire } from '../src/engine/systems/legacy';
import { onLawPassed } from '../src/engine/systems/issues';
import { startScandal } from '../src/engine/systems/scandals';

const base: NewGameOptions = {
  name: 'דנה ברק', gender: 'f', background: 'aide',
  ideology: { econ: 0, security: 20, religion: -20, judiciary: 0 },
  partyId: 'tikva', scenario: 'freshman',
  avatar: { seed: 5, cover: 'none', beard: false, glasses: false, age: 44 }, seed: 99,
};

describe('scandals and endings', () => {
  it('a scandal either closes or ends in court', () => {
    let convicted = 0;
    let survived = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = createGame({ ...base, seed });
      startScandal(s, 'בדיקה', 90);
      for (let w = 0; w < 40 && s.scandal; w++) {
        endWeek(s);
        let g = 0;
        while (s.eventQueue.length && g++ < 10) {
          const cur = currentEvent(s)!;
          const idx = cur.ev.id === 'scandal_stage' ? 1 : cur.ev.choices.findIndex((c) => !choiceBlocked(s, c, cur.ctx));
          resolveEvent(s, Math.max(0, idx));
        }
        s.eventQueue = [];
      }
      if (s.gameOver === 'convicted') convicted++;
      else if (!s.scandal) survived++;
    }
    expect(convicted + survived).toBe(12);
    expect(convicted).toBeGreaterThan(0);
  });

  it('legacy reflects laws and roles', () => {
    const s = createGame(base);
    const empty = computeLegacy(s).score;
    onLawPassed(s, { templateId: 'housing', title: 'חוק הדיור בהישג יד', scope: 2, sponsor: 'player' });
    s.player.achievements.push('minister');
    retire(s);
    const L = computeLegacy(s);
    expect(s.gameOver).toBe('retired');
    expect(L.score).toBeGreaterThan(empty + 25);
    expect(L.laws).toHaveLength(1);
    expect(L.title.length).toBeGreaterThan(0);
  });

  it('old saves migrate to the new state shape', () => {
    const s = createGame(base) as Partial<GameState> & GameState;
    const old = JSON.parse(JSON.stringify(s));
    delete old.issues;
    delete old.lawsPassed;
    delete old.rules;
    delete old.missions;
    for (const n of Object.values(old.npcs) as GameState['npcs'][string][]) {
      delete (n as Partial<typeof n>).agenda;
      delete (n as Partial<typeof n>).memory;
    }
    const g = migrate(old);
    expect(g.issues.housing).toBeGreaterThan(0);
    expect(g.rules.threshold).toBe(3.25);
    expect(Object.values(g.npcs).every((n) => n.agenda && Array.isArray(n.memory))).toBe(true);
    endWeek(g);
  });
});

describe('real-Knesset mods', () => {
  it('the template validates and builds a game', () => {
    const raw = JSON.parse(readFileSync('mods/TEMPLATE.real-knesset.json', 'utf8'));
    const { mod, errors } = validateMod(raw);
    expect(errors).toEqual([]);
    const s = createGame({ ...base, partyId: 'party_a', mod });
    expect(s.mod).toBe(raw.name);
    expect(Object.keys(s.parties)).toEqual(['party_a', 'party_b', 'party_c']);
    expect(s.seating).toHaveLength(120);
    expect(Object.values(s.npcs).some((n) => n.name === 'שם ראשון ברשימה')).toBe(true);
    expect(s.coalition.parties).toEqual(['party_a', 'party_c']);
  });

  it('bad files are rejected with readable errors', () => {
    expect(validateMod({ name: 'x', parties: [{ id: 'a', name: 'A', color: 'red', seats: 10, ideology: {} }, { id: 'a', name: 'B', color: '#ffffff', seats: 5, ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 } }] }).errors.length).toBeGreaterThan(2);
  });
});
