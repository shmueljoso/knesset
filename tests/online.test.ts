import { beforeEach, describe, expect, it } from 'vitest';
import { createGame, endWeek, type NewGameOptions } from '../src/engine';

class MemStorage {
  m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
}
(globalThis as { localStorage?: Storage }).localStorage = new MemStorage() as unknown as Storage;

const { MockBackend } = await import('../src/online/mock');
const online = await import('../src/online');
const { isoWeek, weeklyChallenge } = await import('../src/online/challenge');

const opts: NewGameOptions = {
  name: 'שחקנית', gender: 'f', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 8,
};

function game() {
  const g = createGame(opts);
  for (let i = 0; i < 30; i++) {
    g.eventQueue = [];
    endWeek(g);
  }
  return g;
}

describe('online (mock server)', () => {
  beforeEach(() => localStorage.clear());

  it('accounts: sign up, wrong password, unique names, delete', async () => {
    const b = new MockBackend();
    await b.signUp('a@x.com', 'secret1');
    await b.setDisplayName('אלפא');
    await b.signOut();
    await expect(b.signIn('a@x.com', 'nope')).rejects.toThrow();
    await b.signUp('b@x.com', 'secret2');
    await expect(b.setDisplayName('אלפא')).rejects.toThrow(/duplicate/);
    expect(online.friendlyError(new Error('duplicate key profiles_name_unique'))).toBe('השם הזה כבר תפוס');
    await b.deleteAccount();
    expect(await b.currentUser()).toBeNull();
  });

  it('cloud save round-trip through the online layer, and the 12-slot limit', async () => {
    const b = new MockBackend();
    online.useOnline.setState({ backend: b, status: 'signedIn' });
    await b.signUp('c@x.com', 'secret3');
    const g = game();
    await online.uploadGame(g);
    const back = await online.downloadGame(online.CURRENT_SLOT);
    expect(back.week).toBe(g.week);
    expect(back.player.name).toBe('שחקנית');
    for (let i = 0; i < 11; i++) await online.uploadGame(g, `s${i}`);
    await expect(online.uploadGame(g, 'one-too-many')).rejects.toThrow(/12/);
    expect((await online.listCloud()).length).toBe(12);
  });

  it('scores: publish, leaderboard order, challenge and fastest boards; offline queue', async () => {
    const b = new MockBackend();
    online.useOnline.setState({ backend: b, status: 'signedOut' });
    const g = game();
    // בלי חשבון: נשמר בתור ובשיאים המקומיים
    expect(await online.publishScore(g)).toBe('queued');
    expect(online.localRecords()).toHaveLength(1);
    await b.signUp('d@x.com', 'secret4');
    await b.setDisplayName('דלתא');
    online.useOnline.setState({ status: 'signedIn' });
    await online.flushPending();
    let rows = await online.fetchBoard('all');
    expect(rows).toHaveLength(1);
    expect(rows[0].display_name).toBe('דלתא');
    // פרסום חוזר של אותה קריירה מעדכן את אותה שורה
    expect(await online.publishScore(g)).toBe('sent');
    expect(await online.fetchBoard('all')).toHaveLength(1);
    const ch = createGame({ ...opts, seed: 99, challenge: '2026-W44' });
    ch.career.firstPmWeek = 40;
    await online.publishScore(ch);
    expect((await online.fetchBoard('challenge', { challenge: '2026-W44' })).map((r) => r.challenge)).toEqual(['2026-W44']);
    expect((await online.fetchBoard('fastest')).map((r) => r.pm_week)).toEqual([40]);
    const edited = createGame({ ...opts, seed: 5 });
    edited.flags.usedTools = true;
    await online.publishScore(edited);
    rows = await online.fetchBoard('all');
    expect(rows.every((r) => !r.edited)).toBe(true);
    expect((await online.fetchBoard('mine')).length).toBe(3);
  });
});

describe('weekly challenge', () => {
  it('is the same for everyone in a week and changes between weeks', () => {
    const a = weeklyChallenge(new Date('2026-10-26T08:00:00'));
    const b = weeklyChallenge(new Date('2026-11-01T22:00:00'));
    const c = weeklyChallenge(new Date('2026-11-02T08:00:00'));
    expect(a.id).toBe(b.id);
    expect(a.seed).toBe(b.seed);
    expect(c.id).not.toBe(a.id);
    expect(isoWeek(new Date('2026-01-01')).week).toBe(1);
    const g1 = createGame({ ...opts, seed: a.seed, scenario: a.scenario, challenge: a.id });
    const g2 = createGame({ ...opts, name: 'מישהו אחר', seed: a.seed, scenario: a.scenario, challenge: a.id });
    expect(Object.keys(g1.parties)).toEqual(Object.keys(g2.parties));
    expect(g1.flags.challenge).toBe(a.id);
  });
});
