import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type NewGameOptions } from '../src/engine';
import { figurePool } from '../src/engine/newGame';
import { SCENARIOS } from '../src/engine/data/scenarios';
import { checkInvariants } from '../src/engine/systems/invariants';
import { MEDIA_PACK, activeJournalists, makeColumn, outletName, setMediaMode } from '../src/engine/systems/media';
import { ABILITIES, abilityBlocked, hireStaff, maxStaff, staffAbility, staffAdvice, staffCandidates } from '../src/engine/systems/staff';
import { performAction } from '../src/engine';
import { resolveEvent } from '../src/engine/systems/events';

const k2022 = SCENARIOS.find((x) => x.id === 'knesset-25-2022')!.mod;
const base = (o: Partial<NewGameOptions> = {}): NewGameOptions => ({
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 11, ...o,
});

describe('playing as an existing figure', () => {
  it('the preview pool matches the real game: same people, same places', () => {
    const pool = figurePool({ mod: k2022, seed: 21, scenario: 'freshman' });
    const big = [...k2022.parties].sort((a, b) => b.seats - a.seats)[0];
    const leader = pool[big.id].find((f) => f.leader)!;
    expect(leader.name).toBe(big.members![0]);
    const s = createGame(base({ mod: k2022, seed: 21, partyId: big.id, name: leader.name, gender: leader.gender, asFigure: { npcId: leader.id } }));
    expect(s.player.name).toBe(leader.name);
    expect(s.parties[big.id].leaderId).toBe('player');
    expect(s.npcs[leader.id]).toBeUndefined();
    expect(s.seating).toContain('player');
    expect(checkInvariants(s)).toEqual([]);
    // מישהו מאמצע הרשימה (ח"כ) ומישהו שלא נבחר (מועמד/ת)
    const mid = pool[big.id].find((f) => f.pos === 5)!;
    const t = createGame(base({ mod: k2022, seed: 21, partyId: big.id, name: mid.name, gender: mid.gender, asFigure: { npcId: mid.id } }));
    expect(t.player.listPosition).toBe(5);
    expect(t.player.isMK).toBe(mid.isMK);
    const cand = pool[big.id].find((f) => !f.isMK)!;
    const u = createGame(base({ mod: k2022, seed: 21, partyId: big.id, name: cand.name, gender: cand.gender, asFigure: { npcId: cand.id } }));
    expect(u.player.isMK).toBe(false);
    expect(u.player.rank).toBe('candidate');
    expect(checkInvariants(u)).toEqual([]);
  });

  it('works in the fictional world too, and the game keeps running', () => {
    const pool = figurePool({ mod: null, seed: 5, scenario: 'freshman' });
    const f = pool.merkaz[2];
    const s = createGame(base({ seed: 5, name: f.name, gender: f.gender, asFigure: { npcId: f.id } }));
    expect(s.player.name).toBe(f.name);
    for (let i = 0; i < 30; i++) {
      s.eventQueue = [];
      endWeek(s);
    }
    expect(checkInvariants(s)).toEqual([]);
  });

  it('a famous journalist enters politics: real media turns on, and they leave the studio', () => {
    const s = createGame(base({ scenario: 'grassroots', partyId: null, asFigure: { journalist: 'amit_segal' } }));
    expect(s.player.name).toBe('עמית סגל');
    expect(s.player.fame).toBeGreaterThan(70);
    expect(s.settings.media).toBe('real');
    expect(activeJournalists(s).some((n) => n.realId === 'amit_segal')).toBe(false);
    expect(activeJournalists(s).length).toBe(MEDIA_PACK.journalists.length - 1);
    expect(s.news.some((n) => n.headline.includes('נכנס/ת לפוליטיקה'))).toBe(true);
  });
});

describe('real media', () => {
  it('real scenarios get real outlets and journalists; the toggle swaps them', () => {
    const s = createGame(base({ mod: k2022, partyId: k2022.parties[0].id }));
    expect(s.settings.media).toBe('real');
    expect(activeJournalists(s).map((n) => n.name)).toContain('עמית סגל');
    expect(outletName(s, 'ערוץ המשכן')).toBe('חדשות 12');
    setMediaMode(s, 'fictional');
    expect(activeJournalists(s).every((n) => !n.realId)).toBe(true);
    expect(outletName(s, 'ערוץ המשכן')).toBe('ערוץ המשכן');
    setMediaMode(s, 'real');
    expect(activeJournalists(s).length).toBe(MEDIA_PACK.journalists.length);
  });

  it('journalists write bylined columns over the weeks', () => {
    const s = createGame(base({ mod: k2022, partyId: k2022.parties[0].id }));
    s.player.fame = 70;
    for (let i = 0; i < 20; i++) {
      s.eventQueue = [];
      endWeek(s);
    }
    const cols = s.news.filter((n) => n.byline);
    expect(cols.length).toBeGreaterThan(5);
    expect(cols.some((n) => MEDIA_PACK.journalists.some((j) => j.name === n.byline))).toBe(true);
    const j = activeJournalists(s)[0];
    expect(makeColumn(s, j)?.headline).toBeTruthy();
  });

  it('the interview has a named host', () => {
    const s = createGame(base({ mod: k2022, partyId: k2022.parties[0].id }));
    s.player.location = 'studio';
    s.player.ap = 6;
    performAction(s, 'interview');
    expect(s.flags.ivHost).toBeTruthy();
    for (let i = 0; i < 3; i++) resolveEvent(s, 1);
    expect(s.flags.ivHost).toBeUndefined();
  });
});

describe('staff', () => {
  it('six roles, more slots for senior players, abilities with cooldowns and advice', () => {
    const s = createGame(base());
    s.player.reputation = 90;
    s.player.money = 500;
    expect(maxStaff(s)).toBe(4);
    const roles = ['spokesperson', 'advisor', 'pollster', 'campaign'] as const;
    for (const r of roles) expect(hireStaff(s, staffCandidates(s).find((c) => c.role === r)!)).toContain('הצטרף');
    expect(s.player.staff).toHaveLength(4);
    expect(staffAdvice(s).length).toBeGreaterThanOrEqual(3);
    for (const r of roles) {
      s.player.ap = 5;
      expect(ABILITIES[r]).toBeTruthy();
      expect(abilityBlocked(s, r)).toBeNull();
      const res = staffAbility(s, r);
      expect(res.ok).toBe(true);
      expect(abilityBlocked(s, r)).toContain('קירור');
    }
  });
});
