// התפטרויות וביטולים (systems/resign.ts) והשפעה על אחרים (systems/sway.ts).
import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type GameState, type NewGameOptions } from '../src/engine';
import { checkInvariants } from '../src/engine/systems/invariants';
import { becomePresident, isPresident } from '../src/engine/systems/presidency';
import { joinParty, foundParty } from '../src/engine/systems/parties';
import { cancellables, playerRoles, resignRole } from '../src/engine/systems/resign';
import { applyPledges, courtDefector, courtDefectorBlocked, defectGroup, oustLeader, oustTarget, urgeMerge, urgeMergeBlocked } from '../src/engine/systems/sway';
import { startProject } from '../src/engine/systems/projects';

const base = (seed = 3): NewGameOptions => ({
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed,
});

const ok = (s: GameState) => expect(checkInvariants(s)).toEqual([]);

/** שחקן חזק: מוכר, מוערך, עם הון וזמן */
function strong(s: GameState) {
  Object.assign(s.player, { fame: 95, reputation: 95, capital: 500, ap: 6 });
  s.player.skills.negotiation = 95;
}

/** מנסה שוב ושוב (שבועות שונים – בלי קירור) עד הצלחה */
function retry(s: GameState, fn: () => { ok: boolean }) {
  for (let i = 0; i < 40; i++) {
    s.player.ap = 6;
    s.player.capital = 500;
    if (fn().ok) return true;
    s.week += 9;
  }
  return false;
}

describe('resigning and cancelling', () => {
  it('a sitting president cannot join a party or run, and can resign back to politics', () => {
    const s = createGame(base());
    s.eventQueue = [];
    becomePresident(s, 70);
    s.president = { id: 'player', name: s.player.name, sinceWeek: s.week };
    s.presidentNextWeek = s.week + 364;
    expect(isPresident(s)).toBe(true);
    expect(joinParty(s, 'merkaz').ok).toBe(false);
    expect(foundParty(s, 'שלי', '#a855f7').ok).toBe(false);
    const role = playerRoles(s).find((r) => r.id === 'presidency')!;
    expect(role.blocked).toBeNull();
    const r = resignRole(s, 'presidency');
    expect(r.ok).toBe(true);
    expect(isPresident(s)).toBe(false);
    expect(s.presidency?.resignedWeek).toBe(s.week);
    expect(s.presidentNextWeek).toBe(s.week + 3);
    ok(s);
    expect(joinParty(s, 'merkaz').ok).toBe(true);
    // הכנסת בוחרת נשיא/ה חדש/ה
    for (let i = 0; i < 5; i++) {
      s.eventQueue = [];
      endWeek(s);
    }
    expect(s.president?.id).not.toBe('player');
    ok(s);
  });

  it('resigning from the Knesset: the next on the list takes the seat', () => {
    const s = createGame(base());
    s.eventQueue = [];
    expect(s.player.isMK).toBe(true);
    const seats = s.parties.merkaz.seats;
    const r = resignRole(s, 'knesset');
    expect(r.ok).toBe(true);
    expect(s.player.isMK).toBe(false);
    expect(s.seating).not.toContain('player');
    expect(s.parties.merkaz.seats).toBe(seats);
    expect(s.player.partyId).toBe('merkaz');
    ok(s);
    s.eventQueue = [];
    endWeek(s);
    ok(s);
  });

  it('withdrawing a bill and stopping a project', () => {
    const s = createGame(base());
    s.eventQueue = [];
    s.bills.push({ ...structuredClone(s.bills[0] ?? ({} as never)), id: 'b_test', sponsor: 'player', title: 'חוק בדיקה', stage: 'committee1', history: [] } as never);
    startProject(s, 'ads');
    const c = cancellables(s);
    expect(c.map((x) => x.id.split(':')[0])).toEqual(expect.arrayContaining(['bill', 'project']));
    expect(resignRole(s, 'bill:b_test').ok).toBe(true);
    expect(s.bills.find((b) => b.id === 'b_test')?.stage).toBe('failed');
    expect(resignRole(s, c.find((x) => x.id.startsWith('project:'))!.id).ok).toBe(true);
    expect(s.projects).toHaveLength(0);
  });
});

describe('moving others behind the scenes', () => {
  it('a president stays out of party politics', () => {
    const s = createGame(base());
    s.eventQueue = [];
    becomePresident(s, 70);
    s.president = { id: 'player', name: s.player.name, sinceWeek: s.week };
    s.presidentNextWeek = s.week + 364;
    const mk = Object.values(s.npcs).find((n) => n.isMK)!;
    expect(courtDefectorBlocked(s, mk.id)).toMatch(/נשיא/);
  });

  it('an MK who brings a third of the faction defects at once (legal split)', () => {
    const s = createGame(base(5));
    s.eventQueue = [];
    strong(s);
    s.parties.merkaz.leaderId = 'player';
    // מפלגה קטנה: 3 מנדטים, אחד מספיק לשליש
    const small = Object.values(s.parties).filter((p) => p.id !== 'merkaz' && p.seats > 0 && p.seats <= 3 && Object.values(s.npcs).some((n) => n.isMK && n.partyId === p.id && n.id !== p.leaderId && !n.ministry))[0];
    if (!small) return;
    const target = Object.values(s.npcs).find((n) => n.isMK && n.partyId === small.id && n.id !== small.leaderId && !n.ministry)!;
    target.attitude = 100;
    target.ideology = { ...s.parties.merkaz.ideology };
    target.traits = ['opportunist'];
    expect(defectGroup(s, target.id).immediate).toBe(true);
    const before = s.parties.merkaz.seats;
    expect(retry(s, () => courtDefector(s, target.id))).toBe(true);
    expect(target.partyId).toBe('merkaz');
    expect(s.parties.merkaz.seats).toBe(before + 1);
    ok(s);
  });

  it('otherwise the MK pledges to run with you at the next election', () => {
    const s = createGame(base(6));
    s.eventQueue = [];
    strong(s);
    s.parties.merkaz.leaderId = 'player';
    const big = Object.values(s.parties).filter((p) => p.id !== 'merkaz').sort((a, b) => b.seats - a.seats)[0];
    const target = Object.values(s.npcs).find((n) => n.isMK && n.partyId === big.id && n.id !== big.leaderId && !n.ministry)!;
    // אף אחד מחבריו לא בא איתו
    for (const n of Object.values(s.npcs)) if (n.partyId === big.id && n.id !== target.id) n.attitude = -50;
    target.attitude = 100;
    target.ideology = { ...s.parties.merkaz.ideology };
    expect(defectGroup(s, target.id).immediate).toBe(false);
    expect(retry(s, () => courtDefector(s, target.id))).toBe(true);
    expect(target.partyId).toBe(big.id);
    expect(target.pledgedTo).toBe('merkaz');
    ok(s);
    applyPledges(s);
    expect(target.partyId).toBe('merkaz');
    expect(s.parties.merkaz.list).toContain(target.id);
    expect(big.list).not.toContain(target.id);
  });

  it('brokering a merger between two other parties, and a revolt against a leader', () => {
    const s = createGame(base(7));
    s.eventQueue = [];
    strong(s);
    const others = Object.values(s.parties).filter((p) => p.id !== 'merkaz').sort((a, b) => a.poll - b.poll);
    const pair = others.flatMap((a) => others.map((b) => [a, b] as const)).find(([a, b]) => a.id !== b.id && !urgeMergeBlocked(s, a.id, b.id));
    if (pair) {
      const n = Object.keys(s.parties).length;
      if (retry(s, () => urgeMerge(s, pair[0].id, pair[1].id))) {
        expect(Object.keys(s.parties).length).toBe(n - 1);
        ok(s);
      }
    }
    const p = Object.values(s.parties).find((x) => x.id !== 'merkaz' && oustTarget(s, x.id) && s.coalition.pmId !== x.leaderId)!;
    const ch = oustTarget(s, p.id)!;
    p.base = p.poll + 10; // היו"ר בצניחה
    ch.ambition = 100;
    ch.attitude = 100;
    expect(retry(s, () => oustLeader(s, p.id))).toBe(true);
    expect(s.parties[p.id].leaderId).toBe(ch.id);
    ok(s);
  });
});
