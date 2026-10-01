import type { GameState } from './types';

/** Mulberry32 – מחולל אקראי דטרמיניסטי שמצבו נשמר בתוך ה-GameState. */
export function nextRandom(seed: number): [number, number] {
  let t = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

export function rand(s: GameState): number {
  const [v, next] = nextRandom(s.rng);
  s.rng = next;
  return v;
}

export function randInt(s: GameState, min: number, max: number): number {
  return min + Math.floor(rand(s) * (max - min + 1));
}

export function chance(s: GameState, p: number): boolean {
  return rand(s) < p;
}

export function pick<T>(s: GameState, arr: readonly T[]): T {
  return arr[Math.floor(rand(s) * arr.length)];
}

export function pickWeighted<T>(s: GameState, items: readonly T[], weight: (t: T) => number): T | null {
  const total = items.reduce((a, t) => a + Math.max(0, weight(t)), 0);
  if (total <= 0) return null;
  let r = rand(s) * total;
  for (const t of items) {
    r -= Math.max(0, weight(t));
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

export function shuffle<T>(s: GameState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** RNG עצמאי (לא נוגע במצב המשחק) – ליצירת עולם ולאווטארים. */
export function makeLocalRng(seed: number) {
  let st = seed | 0;
  return () => {
    const [v, n] = nextRandom(st);
    st = n;
    return v;
  };
}
