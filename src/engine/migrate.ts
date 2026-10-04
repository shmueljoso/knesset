import { BILL_TEMPLATES } from './data/bills';
import { ISSUES } from './data/issues';
import { makeLocalRng } from './rng';
import { checkMissions } from './systems/missions';
import type { GameState, IssueId, Npc } from './types';
import { leanAlignment } from './util';

/** "הנושא" של דמות: אחת משלוש התבניות הקרובות לה אידיאולוגית. */
export function pickAgenda(n: Npc, seed: number): string {
  const rnd = makeLocalRng(seed);
  const ranked = BILL_TEMPLATES.filter((t) => Object.keys(t.lean).length && !t.rule && !t.radical)
    .map((t) => ({ id: t.id, a: leanAlignment(n.ideology, t.lean) }))
    .sort((a, b) => b.a - a.a);
  return ranked[Math.floor(rnd() * 3)]?.id ?? ranked[0].id;
}

/** השלמת שדות של שלב 3 (משחק חדש ושמירות ישנות). */
export function ensurePhase3(g: GameState) {
  for (const n of Object.values(g.npcs)) {
    if (!n.agenda) n.agenda = pickAgenda(n, g.seed + n.id.length * 131 + Number(n.id.replace(/\D/g, '') || 0));
    if (n.ambition === undefined) n.ambition = Math.round(makeLocalRng(g.seed ^ Number(n.id.replace(/\D/g, '') || 1))() * 100);
    if (!n.memory) n.memory = [];
  }
  if (!g.issues) {
    g.issues = Object.fromEntries(ISSUES.map((i) => [i.id, i.base])) as Record<IssueId, number>;
    g.issueTrend = Object.fromEntries(ISSUES.map((i) => [i.id, 0])) as Record<IssueId, number>;
  }
  g.lawsPassed ??= [];
  g.rules ??= { threshold: 3.25, norwegian: false, termLimit: false, override: false, entrench: false, equality: false };
  g.scheduled ??= [];
  g.counters ??= {};
  g.missions ??= [];
  g.missionsDone ??= [];
  g.caucuses ??= [];
  g.scandal ??= null;
  g.mod ??= null;
  g.settings ??= { drama: 'normal' };
  g.transforms ??= [];
  g.liveVote ??= null;
  if (!g.missions.length && !g.missionsDone.length) checkMissions(g);
  g.career ??= {
    mkTerms: g.player.isMK ? 1 : 0,
    peakSeats: g.player.partyId ? g.parties[g.player.partyId].seats : 0,
    roles: [],
    pmWeeks: 0,
    electionsOutside: 0,
    startWorld: Object.values(g.world).reduce((a, b) => a + b, 0) / 6,
  };
}

/** השלמת שדות חסרים בשמירות מגרסאות קודמות. */
export function migrate(g: GameState): GameState {
  const c = g.coalition as Partial<GameState['coalition']> & GameState['coalition'];
  if (!c.satisfaction) c.satisfaction = Object.fromEntries(c.parties.map((p) => [p, 65]));
  if (!c.agreement) c.agreement = [];
  if (c.minoritySince === undefined) c.minoritySince = null;
  if (g.negotiation === undefined) g.negotiation = null;
  if (g.ministryState === undefined) g.ministryState = null;
  if (g.player.ministry === undefined) g.player.ministry = null;
  ensurePhase3(g);
  return g;
}
