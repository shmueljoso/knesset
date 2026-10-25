import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type NewGameOptions } from '../src/engine';
import { eventById } from '../src/engine/data/events';
import { resolveEvent } from '../src/engine/systems/events';
import { announceRetirement, foundByNpc, foundForecast, installLeader, quitForecast, tickFigures } from '../src/engine/systems/figures';
import { makeSurvey, publishSurvey } from '../src/engine/systems/surveys';

const base: NewGameOptions = {
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 4,
};

const seatsOk = (s: ReturnType<typeof createGame>) => {
  expect(s.seating.length).toBe(120);
  expect(new Set(s.seating).size).toBe(120);
  for (const p of Object.values(s.parties)) {
    const n = s.seating.filter((id) => (id === 'player' ? s.player.partyId === p.id : s.npcs[id]?.partyId === p.id)).length;
    expect(n).toBe(p.seats);
  }
};

describe('what-if polls', () => {
  it('forecasts founding and quitting sensibly', () => {
    const s = createGame(base);
    const star = Object.values(s.npcs).filter((n) => n.notable).sort((a, b) => b.influence - a.influence)[0];
    const f = foundForecast(s, star.id);
    expect(f.pct).toBeGreaterThan(0.5);
    expect(f.takes.length).toBeGreaterThan(0);
    expect(f.takes.every((t) => t.pct > 0)).toBe(true);
    const party = Object.values(s.parties).sort((a, b) => b.poll - a.poll)[0];
    const q = quitForecast(s, party.id);
    expect(q.pct).toBeLessThan(party.poll);
  });

  it('surveys carry what-ifs and a resign-pressure number; the player appears in them', () => {
    const s = createGame(base);
    s.player.fame = 60;
    publishSurvey(s);
    const sv = s.surveys[s.surveys.length - 1];
    expect(sv.resign).toBeGreaterThan(0);
    expect(sv.hypos!.length).toBeGreaterThan(0);
    expect(makeSurvey(s).hypos!.some((h) => h.who === 'player')).toBe(true);
  });
});

describe('leaders, retirement and new parties', () => {
  it('a retiring PM is replaced by a successor, with titles and seats consistent', () => {
    const s = createGame(base);
    const pm = s.npcs[s.coalition.pmId];
    const party = s.parties[pm.partyId!];
    announceRetirement(s, party.id, 'מטעמים אישיים');
    expect(s.succession).toHaveLength(1);
    s.week += 6;
    s.eventQueue = [];
    tickFigures(s);
    // השחקן אינו חבר בסיעה – ההחלפה אוטומטית
    expect(s.succession.length === 0 || s.eventQueue.some((e) => e.eventId === 'fg_succession')).toBe(true);
    if (s.succession.length === 0) {
      expect(party.leaderId).not.toBe(pm.id);
      expect(s.coalition.pmId).toBe(party.leaderId);
      expect(s.npcs[party.leaderId].ministry).toBe('pm');
      expect(pm.ministry).not.toBe('pm');
    }
    seatsOk(s);
  });

  it('a player in the party can run for the leadership after a retirement', () => {
    let won = 0;
    let offered = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = createGame({ ...base, seed, partyId: Object.keys(createGame(base).parties)[0] });
      const pid = s.player.partyId!;
      if (s.parties[pid].leaderId === 'player') continue;
      s.player.partyStanding = 90;
      s.player.fame = 70;
      s.player.reputation = 80;
      announceRetirement(s, pid, 'בדיקה');
      s.week += 6;
      s.eventQueue = [];
      tickFigures(s);
      const ev = s.eventQueue.find((e) => e.eventId === 'fg_succession');
      if (!ev) continue;
      offered++;
      expect(eventById('fg_succession')).toBeDefined();
      resolveEvent(s, 0);
      if (s.parties[pid].leaderId === 'player') won++;
      seatsOk(s);
    }
    expect(offered).toBeGreaterThan(0);
    expect(won).toBeGreaterThan(0);
  });

  it('an ambitious figure with enough buzz founds a party; the Knesset stays consistent', () => {
    const s = createGame(base);
    const n = Object.values(s.npcs).find((x) => x.isMK && x.notable && x.partyId && s.parties[x.partyId].leaderId !== x.id)!;
    n.ambition = 90;
    const from = n.partyId!;
    const before = Object.keys(s.parties).length;
    const p = foundByNpc(s, n.id)!;
    expect(p).toBeTruthy();
    expect(Object.keys(s.parties).length).toBe(before + 1);
    expect(p.leaderId).toBe(n.id);
    expect(n.partyId).toBe(p.id);
    expect(s.parties[from].list).not.toContain(n.id);
    seatsOk(s);
    expect(s.news.some((x) => x.headline.includes('הקים/ה מפלגה חדשה'))).toBe(true);
  });

  it('installLeader moves the premiership with the party leadership', () => {
    const s = createGame(base);
    const pm = s.npcs[s.coalition.pmId];
    const party = s.parties[pm.partyId!];
    const heir = party.list.map((id) => s.npcs[id]).find((n) => n && n.isMK && n.id !== pm.id)!;
    installLeader(s, party.id, heir.id, 'בדיקה');
    expect(s.coalition.pmId).toBe(heir.id);
    expect(s.ministers.pm).toBe(heir.id);
    expect(party.list[0]).toBe(heir.id);
  });

  it('long play stays consistent with retirements, coups and new parties', () => {
    const s = createGame(base);
    for (let w = 0; w < 700 && !s.gameOver; w++) {
      let g = 0;
      while (s.eventQueue.length && g++ < 20) resolveEvent(s, 0);
      s.eventQueue = [];
      if (s.negotiation?.mode === 'formateur') s.negotiation = null;
      endWeek(s);
      if (w % 100 === 99 && !s.negotiation) seatsOk(s);
    }
    expect(s.news.some((n) => /פרישה|פרש|הדחה|הקים\/ה מפלגה/.test(n.headline))).toBe(true);
  });
});
