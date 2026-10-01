import { rand } from '../rng';
import type { Debt, GameState, Npc, Trait } from '../types';
import { clamp, ideologyDistance, newId } from '../util';

export const TRAIT_INFO: Record<Trait, { name: string; desc: string }> = {
  loyal: { name: 'נאמן', desc: 'עומד בהתחייבויות, סולח לאט אבל זוכר טוב.' },
  vindictive: { name: 'נקמן', desc: 'פגיעה בו כואבת פי אחד וחצי – וזה יחזור אליך.' },
  leaker: { name: 'מדליף', desc: 'מה שתגיד לו עלול להגיע לכותרות.' },
  opportunist: { name: 'אופורטוניסט', desc: 'נצמד לכוח. ככל שאתה מוכר וחזק – הוא ידידותי יותר.' },
  principled: { name: 'עקרוני', desc: 'אידיאולוגיה קודמת לדילים. קשה לקנות אותו.' },
  vain: { name: 'תאב כבוד', desc: 'מחמאה פומבית שווה אצלו כפליים.' },
  pragmatic: { name: 'פרגמטי', desc: 'סוחר בטובות ביעילות. "תן וקח".' },
};

export function attitudeLabel(a: number): string {
  if (a >= 70) return 'בעל ברית';
  if (a >= 40) return 'ידידותי';
  if (a >= 15) return 'חיובי';
  if (a > -15) return 'ניטרלי';
  if (a > -40) return 'מסויג';
  if (a > -70) return 'עוין';
  return 'אויב';
}

export function attitudeColor(a: number): string {
  if (a >= 40) return 'var(--good)';
  if (a >= 15) return 'var(--good-soft)';
  if (a > -15) return 'var(--muted)';
  if (a > -40) return 'var(--warn)';
  return 'var(--bad)';
}

/** שינוי יחס של NPC כלפי השחקן, בהתחשב בתכונות שלו. מחזיר את השינוי בפועל. */
export function changeAttitude(s: GameState, id: string, delta: number, opts: { public?: boolean; spread?: boolean } = {}): number {
  const n = s.npcs[id];
  if (!n || delta === 0) return 0;
  let d = delta;
  if (d < 0 && n.traits.includes('vindictive')) d *= 1.5;
  if (d < 0 && n.traits.includes('loyal')) d *= 0.75;
  if (d > 0 && opts.public && n.traits.includes('vain')) d *= 1.7;
  if (d > 0 && n.traits.includes('opportunist')) d *= 0.6 + (s.player.fame + s.player.capital) / 120;
  if (d > 0 && n.traits.includes('principled')) d *= 1 - ideologyDistance(n.ideology, s.player.ideology);
  const before = n.attitude;
  n.attitude = clamp(Math.round(n.attitude + d), -100, 100);
  if (opts.spread !== false && Math.abs(delta) >= 15) {
    for (const f of n.friends) {
      const fn = s.npcs[f];
      if (fn) fn.attitude = clamp(Math.round(fn.attitude + d * 0.25), -100, 100);
    }
  }
  return n.attitude - before;
}

export function changeTrust(s: GameState, id: string, delta: number) {
  const n = s.npcs[id];
  if (n) n.trust = clamp(Math.round(n.trust + delta), 0, 100);
}

export function revealTrait(s: GameState, id: string): Trait | null {
  const n = s.npcs[id];
  if (!n) return null;
  const hidden = n.traits.filter((t) => !n.knownTraits.includes(t));
  if (!hidden.length) return null;
  const t = hidden[Math.floor(rand(s) * hidden.length)];
  n.knownTraits.push(t);
  return t;
}

export function addDebt(s: GameState, npcId: string, dir: Debt['dir'], reason: string): Debt {
  const d: Debt = { id: newId(s, 'debt'), npcId, dir, reason, week: s.week };
  s.player.debts.push(d);
  return d;
}

export function debtsWith(s: GameState, npcId: string, dir?: Debt['dir']): Debt[] {
  return s.player.debts.filter((d) => d.npcId === npcId && (!dir || d.dir === dir));
}

export function clearDebt(s: GameState, npcId: string, dir: Debt['dir']): boolean {
  const i = s.player.debts.findIndex((d) => d.npcId === npcId && d.dir === dir);
  if (i < 0) return false;
  s.player.debts.splice(i, 1);
  return true;
}

/** דעיכה שבועית: קשר שלא מתחזקים נחלש לכיוון ניטרלי. */
export function decayRelationships(s: GameState) {
  for (const n of Object.values(s.npcs)) {
    if (s.week - n.lastContact < 6) continue;
    const baseline = n.partyId && n.partyId === s.player.partyId ? 8 : 0;
    const rate = n.traits.includes('loyal') ? 0.5 : 1;
    if (n.attitude > baseline + 1) n.attitude = Math.round(n.attitude - rate);
    else if (n.attitude < baseline - 1 && !n.traits.includes('vindictive')) n.attitude = Math.round(n.attitude + rate * 0.5);
  }
}

export const npcIsPresent = (s: GameState, id: string) => (s.presence[s.player.location] ?? []).includes(id);

export function isLeader(s: GameState, n: Npc) {
  return !!n.partyId && s.parties[n.partyId]?.leaderId === n.id;
}
