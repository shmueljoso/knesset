import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type NewGameOptions } from '../src/engine';
import { KEEP, MemoryBackend, SaveManager, decode, encode, fromBase64, looksLikeSave, pruneIds, toBase64, type SaveMeta } from '../src/saves';

const opts: NewGameOptions = {
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 4,
};

describe('saves', () => {
  it('compresses and restores a game exactly', async () => {
    const g = createGame(opts);
    for (let i = 0; i < 5; i++) {
      g.eventQueue = [];
      endWeek(g);
    }
    const json = JSON.stringify(g);
    const { data, gz } = await encode(json);
    expect(gz).toBe(true);
    expect(data.byteLength).toBeLessThan(json.length / 2);
    expect(await decode(data, gz)).toBe(json);
    expect(fromBase64(toBase64(data))).toEqual(data);
  });

  it('keeps a bounded number of each kind, newest first', () => {
    const list: SaveMeta[] = [];
    for (let i = 0; i < 20; i++) list.push({ id: `a${i}`, kind: 'auto', name: '', player: '', week: i, date: '', savedAt: i, bytes: 1, gz: true });
    for (let i = 0; i < 3; i++) list.push({ id: `m${i}`, kind: 'manual', name: '', player: '', week: i, date: '', savedAt: i, bytes: 1, gz: true });
    const drop = pruneIds(list);
    expect(drop).toHaveLength(20 - KEEP.auto);
    expect(drop).toContain('a0');
    expect(drop).not.toContain('a19');
    expect(drop.some((id) => id.startsWith('m'))).toBe(false);
  });

  it('save → list → load → rename → delete round-trip, with pruning', async () => {
    const m = new SaveManager(new MemoryBackend());
    const g = createGame(opts);
    const meta = await m.save(g, 'manual', 'הקריירה שלי');
    for (let i = 0; i < KEEP.auto + 3; i++) {
      g.week += 1;
      await m.save(g, 'auto');
    }
    const list = await m.list();
    expect(list.filter((x) => x.kind === 'auto')).toHaveLength(KEEP.auto);
    expect(list.find((x) => x.id === meta.id)?.name).toBe('הקריירה שלי');
    const back = await m.load(meta.id);
    expect(back?.player.name).toBe('שחקן');
    expect(back?.week).toBe(0);
    const auto = list.find((x) => x.kind === 'auto')!;
    await m.rename(auto.id, 'לפני הבחירות');
    const after = await m.list();
    expect(after.find((x) => x.id === auto.id)).toMatchObject({ kind: 'manual', name: 'לפני הבחירות' });
    await m.remove(meta.id);
    expect((await m.list()).some((x) => x.id === meta.id)).toBe(false);
    expect((await m.latest())?.savedAt).toBeGreaterThan(0);
  });

  it('recognises save files and rejects other JSON', () => {
    expect(looksLikeSave(createGame(opts))).toBe(true);
    expect(looksLikeSave({ hello: 1 })).toBe(false);
    expect(looksLikeSave(null)).toBe(false);
  });
});
