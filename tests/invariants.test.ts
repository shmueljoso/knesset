import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type GameState, type NewGameOptions } from '../src/engine';
import { checkInvariants } from '../src/engine/systems/invariants';
import { resolveEvent } from '../src/engine/systems/events';
import { finishVote } from '../src/engine/systems/legislation';
import { makeLocalRng } from '../src/engine/rng';
import { SCENARIOS } from '../src/engine/data/scenarios';
import { swearIn, startFormateur, partnerSign, partnerDecline, offerDeal, cancelDeal, tryNoConfidence } from '../src/engine/systems/coalition';
import { challengeLeader, defect, foundParty, joinParty, leaveParty, splitFaction, recruitCandidate } from '../src/engine/systems/parties';
import { announceRetirement, dissolveKnesset, foundByNpc, resignPremiership, stepDownLeader } from '../src/engine/systems/figures';
import { executeMerger, proposeSurplus } from '../src/engine/systems/mergers';

const base = (seed: number, partyId: string | null = 'merkaz', scenario: 'freshman' | 'grassroots' = 'freshman'): NewGameOptions => ({
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId, scenario,
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed,
});

/** מפעיל פעולה אקראית של השחקן על עולם המשחק – כולל פעולות מסוכנות, כדי למצוא מצבים שבורים */
function randomAction(s: GameState, r: () => number): string {
  const parties = Object.values(s.parties);
  const pickP = () => parties[Math.floor(r() * parties.length)];
  const npcs = Object.values(s.npcs).filter((n) => n.notable);
  const pickN = () => npcs[Math.floor(r() * npcs.length)];
  const k = Math.floor(r() * 19);
  s.player.money = Math.max(s.player.money, 400);
  s.player.ap = 6;
  switch (k) {
    case 0: return `split:${splitFaction(s, 'חדשה', '#22c55e').ok}`;
    case 1: return `defect:${defect(s).ok}`;
    case 2: return `join:${joinParty(s, pickP().id).ok}`;
    case 3: return `leave:${leaveParty(s).ok}`;
    case 4: return `found:${foundParty(s, 'מפלגה שלי', '#a855f7').ok}`;
    case 5: return `challenge:${challengeLeader(s).ok}`;
    case 6: return `resign:${resignPremiership(s).ok}`;
    case 7: return `dissolve:${dissolveKnesset(s).ok}`;
    case 8: return `stepdown:${stepDownLeader(s).ok}`;
    case 9: {
      const p = pickP();
      announceRetirement(s, p.id, 'בדיקה');
      return 'announce';
    }
    case 10: return `npcfound:${!!foundByNpc(s, pickN()?.id)}`;
    case 11: return `merge:${s.player.partyId ? executeMerger(s, pickP().id, { lead: r() < 0.5 ? 'me' : 'them', share: 'fair' }).ok : false}`;
    case 12: return `surplus:${s.player.partyId ? proposeSurplus(s, pickP().id).ok : false}`;
    case 13: return `noconf:${tryNoConfidence(s).passed}`;
    case 14: {
      if (s.negotiation?.mode === 'formateur') {
        for (const t of s.negotiation.talks) if (r() < 0.6) t.signed = true;
        if (r() < 0.4) cancelDeal(s, s.negotiation.talks[Math.floor(r() * s.negotiation.talks.length)].partyId);
        return `swear:${swearIn(s).ok}`;
      }
      return 'noop';
    }
    case 15: {
      if (s.negotiation?.mode === 'partner') return r() < 0.5 ? `psign:${partnerSign(s).ok}` : (partnerDecline(s), 'pdecline');
      if (s.negotiation?.mode === 'formateur') return `offer:${offerDeal(s, s.negotiation.talks[0].partyId).ok}`;
      return 'noop';
    }
    case 16: return `recruit:${recruitCandidate(s).ok}`;
    case 17: {
      if (!s.negotiation && s.player.partyId && s.parties[s.player.partyId].leaderId === 'player' && s.parties[s.player.partyId].seats > 0) startFormateur(s);
      return 'formateur';
    }
    default: return 'noop';
  }
}

/** חלק מהמשחקים עם כללים אחרים: בחירה ישירה, שיטה נשיאותית, החוק הנורבגי, הגבלת כהונה */
export const rulesSetup = (sd: number) => (g: GameState) => {
  if (sd % 4 === 1) g.rules.directPM = true;
  if (sd % 4 === 2) g.rules.presidential = true;
  if (sd % 3 === 0) {
    g.rules.norwegian = true;
    g.rules.norwegianLimit = 5;
  }
  if (sd % 5 === 0) {
    g.rules.termLimit = true;
    g.rules.termLimitScope = 2;
  }
};

export function run(seed: number, opts: NewGameOptions, weeks: number, setup?: (s: GameState) => void, stopOn?: (v: string) => boolean, onStop?: (s: GameState, hist: string[]) => void, onStep?: (s: GameState, hist: string[]) => void): { violations: { week: number; action: string; v: string; trace: string }[]; actions: Record<string, number> } {
  const s = createGame(opts);
  setup?.(s);
  const r = makeLocalRng(seed * 7919 + 13);
  const violations: { week: number; action: string; v: string; trace: string }[] = [];
  const hist: string[] = [];
  let stopped = false;
  const actions: Record<string, number> = {};
  const check = (action: string) => {
    hist.push(`${s.week}:${action}`);
    onStep?.(s, hist);
    if (hist.length > 8) hist.shift();
    for (const v of checkInvariants(s)) {
      violations.push({ week: s.week, action, v, trace: hist.join(' > ') });
      if (stopOn?.(v) && !stopped) {
        stopped = true;
        onStop?.(s, hist);
      }
    }
  };
  check('start');
  for (let w = 0; w < weeks && !s.gameOver; w++) {
    if (r() < (process.env.STRESS ? 0.7 : 0.35)) {
      const a = randomAction(s, r);
      actions[a.split(':')[0]] = (actions[a.split(':')[0]] ?? 0) + 1;
      check(a);
    }
    let g = 0;
    while ((s.eventQueue.length || s.liveVote) && g++ < 25) {
      if (s.liveVote) {
        finishVote(s);
        continue;
      }
      resolveEvent(s, Math.floor(r() * 3));
    }
    s.eventQueue = [];
    if (s.negotiation && r() < 0.5) {
      if (s.negotiation.mode === 'formateur') for (const t of s.negotiation.talks) t.signed = true;
      swearIn(s);
    }
    endWeek(s);
    check(`week${w}`);
  }
  return { violations, actions };
}

describe('state invariants under random play', () => {
  it('random player actions never leave parties, leaders, seats or the coalition inconsistent', () => {
    const all: Record<string, Set<string>> = {};
    const actions: Record<string, number> = {};
    const configs: NewGameOptions[] = [];
    for (let seed = 1; seed <= (process.env.STRESS ? 70 : 16); seed++) configs.push(base(seed, 'merkaz'));
    for (let seed = 101; seed <= (process.env.STRESS ? 140 : 108); seed++) configs.push(base(seed, 'tikva', 'grassroots'));
    for (const opts of configs) {
      const sd = opts.seed ?? 1;
      const res = run(sd, opts, 400, rulesSetup(sd));
      for (const [a, n] of Object.entries(res.actions)) actions[a] = (actions[a] ?? 0) + n;
      for (const x of res.violations) (all[x.v.replace(/[0-9.]+/g, '#').replace(/[^ #א-ת:a-z]/gi, '').replace(/^[^:]*(?=: )/, '').slice(0, 60)] ??= new Set()).add(`seed ${opts.seed} · ${x.v} :: ${x.trace}`);
    }
    const lines = Object.entries(all).map(([k, v]) => `${k}  (x${v.size})  e.g. ${[...v][0]}`);
    console.log('ACTIONS ' + JSON.stringify(actions));
    console.log('VIOLATIONS\n' + (lines.join('\n') || 'none'));
    expect(lines).toEqual([]);
  }, 900000);

  it('every built-in scenario survives random play too (real parties, real coalitions)', () => {
    const bad: string[] = [];
    for (const sc of SCENARIOS) {
      const first = sc.mod.parties.find((p) => p.seats > 0)!;
      for (const seed of [31, 32, 33]) {
        const opts = { ...base(seed, first.id), mod: sc.mod, background: 'aide' as const };
        const res = run(seed, opts, 300, rulesSetup(seed % 2 ? 3 : 4));
        for (const x of res.violations.slice(0, 3)) bad.push(`${sc.id} seed ${seed}: ${x.v} :: ${x.trace}`);
      }
    }
    if (bad.length) console.log('SCENARIO VIOLATIONS\n' + bad.slice(0, 12).join('\n'));
    expect(bad).toEqual([]);
  }, 240000);
});
