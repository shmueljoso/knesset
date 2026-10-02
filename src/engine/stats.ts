import type { GameState } from './types';
import { clamp } from './util';

type Gradual = 'fame' | 'reputation' | 'partyStanding';

/** כמה מכל תוספת באמת "נדבק": קשה לעלות כשכבר גבוה; מוכרות נבנית לאט מחוץ לכנסת. */
export function gainFactor(s: GameState, k: Gradual): number {
  const v = s.player[k];
  if (k === 'fame') return Math.pow(Math.max(0.05, 1 - v / 105), 1.6) * (s.player.isMK || v < 15 ? 1 : 0.6);
  return Math.max(0.1, 1 - v / 120);
}

/** שינוי מדד עם תשואה פוחתת */
export function addStat(s: GameState, k: Gradual, d: number) {
  const eff = d > 0 ? d * gainFactor(s, k) : d;
  s.player[k] = clamp(Math.round((s.player[k] + eff) * 10) / 10, 0, 100);
}
