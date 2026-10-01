import type { Axis, GameState, Ideology, Sector } from './types';

export const SECTORS: Sector[] = ['secular', 'traditional', 'religious', 'haredi', 'arab', 'olim'];
export const SECTOR_NAMES: Record<Sector, string> = {
  secular: 'חילונים',
  traditional: 'מסורתיים',
  religious: 'דתיים-לאומיים',
  haredi: 'חרדים',
  arab: 'ערבים',
  olim: 'עולים',
};
export const SECTOR_WEIGHTS: Record<Sector, number> = {
  secular: 0.38,
  traditional: 0.21,
  religious: 0.1,
  haredi: 0.1,
  arab: 0.15,
  olim: 0.06,
};
/** העמדה הממוצעת (בקירוב) של כל מגזר על הצירים – משמשת לחישוב איך עמדות משפיעות על תדמית. */
export const SECTOR_IDEOLOGY: Record<Sector, Ideology> = {
  secular: { econ: 10, security: 0, religion: -70, judiciary: -40 },
  traditional: { econ: 0, security: 50, religion: 20, judiciary: 30 },
  religious: { econ: 30, security: 75, religion: 65, judiciary: 65 },
  haredi: { econ: -40, security: 25, religion: 95, judiciary: 60 },
  arab: { econ: -40, security: -75, religion: 10, judiciary: -50 },
  olim: { econ: 30, security: 60, religion: -60, judiciary: 10 },
};

export const AXES: Axis[] = ['econ', 'security', 'religion', 'judiciary'];
export const AXIS_NAMES: Record<Axis, [string, string, string]> = {
  econ: ['כלכלה', 'מדינת רווחה', 'שוק חופשי'],
  security: ['ביטחון ומדיניות', 'יוני', 'ניצי'],
  religion: ['דת ומדינה', 'חילוני', 'דתי'],
  judiciary: ['מערכת המשפט', 'בית משפט חזק', 'ריבונות הכנסת'],
};

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const round1 = (v: number) => Math.round(v * 10) / 10;

/** מרחק אידיאולוגי 0..1 */
export function ideologyDistance(a: Ideology, b: Ideology): number {
  return AXES.reduce((acc, ax) => acc + Math.abs(a[ax] - b[ax]), 0) / 800;
}

/** התאמה בין עמדה לבין "נטייה" חלקית (של הצעת חוק). -1..1 */
export function leanAlignment(ideo: Ideology, lean: Partial<Ideology>): number {
  let wSum = 0;
  let acc = 0;
  for (const ax of AXES) {
    const l = lean[ax];
    if (l === undefined || l === 0) continue;
    const w = Math.abs(l);
    wSum += w;
    acc += w * (1 - Math.abs(ideo[ax] - l) / 60);
  }
  return wSum === 0 ? 0 : clamp(acc / wSum, -1, 1);
}

export function newId(s: GameState, prefix: string): string {
  s.counter += 1;
  return `${prefix}${s.counter}`;
}

export function avgApproval(s: GameState): number {
  return SECTORS.reduce((a, sec) => a + s.player.approval[sec] * SECTOR_WEIGHTS[sec], 0);
}

export function fmtDelta(v: number, digits = 0): string {
  const r = digits ? v.toFixed(digits) : Math.round(v).toString();
  return v > 0 ? `+${r}` : r;
}

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
