import { SCOPE_FACTOR, templateById } from '../data/bills';
import { rand } from '../rng';
import type { Bill, BillStage, GameState, Ideology, Npc, VoteResult } from '../types';
import { AXES, leanAlignment, sigmoid } from '../util';
import { isCoalition } from './government';
import { debtsWith } from './relationships';
import { requiredMajority } from './issues';
import { caucusBonus } from './influence';

export type Line = 'for' | 'against' | 'free';
export const LINE_NAMES: Record<Line, string> = { for: 'בעד', against: 'נגד', free: 'חופש הצבעה' };

export function billImpact(b: Bill): number {
  return SCOPE_FACTOR[b.scope] * Math.max(0.3, 1 - 0.15 * b.amendments);
}

/** הנטייה האידיאולוגית בפועל של ההצעה: היקף גדול = קיצוני יותר, הסתייגויות = מתון יותר. */
export function billLean(b: Bill): Partial<Ideology> {
  const t = templateById(b.templateId);
  const f = (0.75 + 0.25 * SCOPE_FACTOR[b.scope]) * Math.max(0.4, 1 - 0.12 * b.amendments);
  const out: Partial<Ideology> = {};
  for (const ax of AXES) if (t.lean[ax] !== undefined) out[ax] = t.lean[ax]! * f;
  return out;
}

export function sponsorParty(s: GameState, b: Bill): string | null {
  return b.sponsor === 'player' ? s.player.partyId : s.npcs[b.sponsor]?.partyId ?? null;
}

export function partyLine(s: GameState, partyId: string, b: Bill): Line {
  const p = s.parties[partyId];
  const align = leanAlignment(p.ideology, billLean(b));
  const sp = sponsorParty(s, b);
  if (sp === partyId) return align < -0.3 ? 'free' : 'for';
  // חוקים שמשנים את כללי המשחק: כל מפלגה מצביעה לפי האינטרס שלה
  const rule = templateById(b.templateId).rule;
  if (rule === 'threshold') return p.seats >= 12 ? 'for' : 'against';
  if (rule === 'norwegian') return isCoalition(s, partyId) ? 'for' : 'against';
  if (rule === 'termLimit') return partyId === (s.npcs[s.coalition.pmId]?.partyId ?? s.player.partyId) ? 'against' : isCoalition(s, partyId) ? 'free' : 'for';
  // הצעה מרחיקת לכת: אין משמעת קואליציונית – כל מפלגה לפי המצפון והבוחרים
  if (templateById(b.templateId).radical) {
    if (sp === partyId) return align > 0.55 ? 'for' : 'free';
    return align > 0.7 ? 'for' : align < 0.4 ? 'against' : 'free';
  }
  if (isCoalition(s, partyId)) {
    if (b.govPosition === 'support') return 'for';
    if (b.govPosition === 'oppose') return align > 0.75 ? 'free' : 'against';
    return align > 0.5 ? 'for' : align < 0.1 ? 'against' : 'free';
  }
  let score = align;
  if (sp && !isCoalition(s, sp)) score += 0.15;
  if (sp && isCoalition(s, sp) && b.govPosition === 'support') score -= 0.15;
  return score > 0.25 ? 'for' : score < 0 ? 'against' : 'free';
}

const ABSENT_BASE: Partial<Record<BillStage, number>> = { preliminary: 0.3, first: 0.22, final: 0.14 };

export interface SeatProb {
  id: string;
  pFor: number;
  pAgainst: number;
  pAbstain: number;
  pAbsent: number;
  line: Line;
}

export function mkProbs(s: GameState, n: Npc, b: Bill, line: Line): SeatProb {
  const align = leanAlignment(n.ideology, billLean(b));
  let score = line === 'for' ? 1.3 : line === 'against' ? -1.3 : 0;
  score += align * (n.traits.includes('principled') ? 1.7 : 1.1);
  if (b.sponsor === 'player') {
    score += (n.attitude / 100) * 0.9;
    if (n.pledges.includes(b.id)) score += n.traits.includes('loyal') ? 3 : n.traits.includes('opportunist') ? 1.2 : 2;
    if (debtsWith(s, n.id, 'owes_player').length) score += 0.4;
    score += caucusBonus(s, n.id, b.templateId);
  }
  // מרחיק לכת: פחד מההשלכות ומשמירה על הסטטוס קוו
  if (templateById(b.templateId).radical) score -= n.traits.includes('principled') && align > 0.7 ? 0.2 : 0.9;
  let absent = ABSENT_BASE[b.stage] ?? 0.2;
  // ח"כ קואליציה שתומך אבל הממשלה מתנגדת – יעדיף להיעדר מאשר להפר משמעת
  if (line === 'against' && score > 0) absent += 0.25;
  if (Math.abs(score) < 0.5) absent += 0.1;
  absent = Math.min(0.8, absent);
  const pAbstain = 0.04;
  const pv = 1 - absent - pAbstain;
  const pf = sigmoid(2.2 * score);
  return { id: n.id, pFor: pv * pf, pAgainst: pv * (1 - pf), pAbstain, pAbsent: absent, line };
}

export function forecast(s: GameState, b: Bill) {
  const lines: Record<string, Line> = {};
  for (const p of Object.values(s.parties)) if (p.seats > 0) lines[p.id] = partyLine(s, p.id, b);
  const seats: (SeatProb | null)[] = s.seating.map((id) => {
    if (id === 'player') return null;
    const n = s.npcs[id];
    return mkProbs(s, n, b, lines[n.partyId!] ?? 'free');
  });
  let eFor = s.seating.includes('player') ? 1 : 0;
  let eAgainst = 0;
  for (const sp of seats) {
    if (!sp) continue;
    eFor += sp.pFor;
    eAgainst += sp.pAgainst;
  }
  const swing = seats
    .filter((x): x is SeatProb => !!x)
    .filter((x) => {
      const share = x.pFor / Math.max(0.01, x.pFor + x.pAgainst);
      return share > 0.25 && share < 0.75;
    })
    .sort((a, b) => s.npcs[b.id].influence - s.npcs[a.id].influence);
  return { lines, seats, eFor, eAgainst, swing };
}

export function runVote(s: GameState, b: Bill): VoteResult {
  const f = forecast(s, b);
  const seats: VoteResult['seats'] = [];
  let cFor = 0;
  let cAgainst = 0;
  let cAbstain = 0;
  let cAbsent = 0;
  s.seating.forEach((id, i) => {
    let v: VoteResult['seats'][number];
    if (id === 'player') v = b.sponsor === 'player' || b.sponsor === s.player.employerId ? 'for' : 'abstain';
    else {
      const p = f.seats[i]!;
      const r = rand(s);
      v = r < p.pFor ? 'for' : r < p.pFor + p.pAgainst ? 'against' : r < p.pFor + p.pAgainst + p.pAbstain ? 'abstain' : 'absent';
    }
    seats.push(v);
    if (v === 'for') cFor++;
    else if (v === 'against') cAgainst++;
    else if (v === 'abstain') cAbstain++;
    else cAbsent++;
  });
  const maj = b.stage === 'final' ? requiredMajority(s, b.templateId) : null;
  const passed = maj ? cFor >= maj : cFor > cAgainst;
  return { week: s.week, stage: b.stage, for: cFor, against: cAgainst, abstain: cAbstain, absent: cAbsent, passed, seats };
}
