// לדמויות יש חיים משלהן: הן מעבירות חוקים בנושא שלהן, מסתבכות ומתפטרות, וזוממות נגד השחקן.
import { SCOPE_FACTOR, templateById } from '../data/bills';
import { chance, pick, rand } from '../rng';
import type { GameState, Npc } from '../types';
import { clamp } from '../util';
import { isCoalition } from './government';
import { onLawPassed, scheduleEvent } from './issues';
import { addNews } from './news';
import { addWorldEffect, takeStance } from './opinion';
import { addMemory } from './relationships';
import { log } from './report';

export const cosponsorKey = (npcId: string) => `cosp_${npcId}`;

/** ח"כ בולט/ה מעביר/ה חוק בנושא שלו/ה */
function npcLawPasses(s: GameState) {
  const cands = Object.values(s.npcs).filter(
    (n) => n.isMK && n.notable && !s.lawsPassed.some((l) => l.templateId === n.agenda && s.week - l.week < 104),
  );
  if (!cands.length) return;
  // שותפות של השחקן מגדילה את הסיכוי; ח"כי קואליציה מצליחים יותר
  const weighted = cands.flatMap((n) => Array(s.flags[cosponsorKey(n.id)] ? 4 : isCoalition(s, n.partyId) ? 2 : 1).fill(n) as Npc[]);
  const n = pick(s, weighted);
  const t = templateById(n.agenda);
  const scope = (1 + Math.floor(rand(s) * 2)) as 1 | 2;
  const co = s.flags[cosponsorKey(n.id)] === n.agenda;
  onLawPassed(s, { templateId: t.id, title: t.title, scope, sponsor: n.id, coSponsor: co || undefined });
  for (const [k, v] of Object.entries(t.world)) addWorldEffect(s, k as keyof typeof s.world, v! * SCOPE_FACTOR[scope] * 0.6, t.weeks, t.title, t.delay);
  addNews(s, `הכנסת אישרה את "${t.title}" של ${n.name}`, 'neutral', co, undefined, undefined, n.id);
  if (co) {
    s.player.reputation = clamp(s.player.reputation + 3, 0, 100);
    s.player.fame = clamp(s.player.fame + 2, 0, 100);
    takeStance(s, t.lean, 1.5);
    addMemory(s, n.id, `היה/תה שותף/ה שלי ל"${t.title}"`, 10);
    delete s.flags[cosponsorKey(n.id)];
    log(s, `"${t.title}" – שהיית שותף/ה להגשתו – עבר!`, 'vote');
  }
}

/** ח"כ מסתבך/ת ומתפטר/ת; הבא/ה ברשימה נכנס/ת */
function npcResigns(s: GameState) {
  const cands = Object.values(s.npcs).filter((n) => n.isMK && !n.ministry && n.partyId && s.parties[n.partyId].leaderId !== n.id);
  if (!cands.length) return;
  const n = pick(s, cands);
  const party = s.parties[n.partyId!];
  const next = party.list.find((id) => id !== 'player' && s.npcs[id] && !s.npcs[id].isMK);
  n.isMK = false;
  n.role = 'candidate';
  n.notable = false;
  for (const c of s.committees) {
    if (c.chairId === n.id && next) c.chairId = next;
    c.members = c.members.map((m) => (m === n.id && next ? next : m));
  }
  if (next) {
    const nn = s.npcs[next];
    nn.isMK = true;
    nn.role = 'mk';
    s.seating = s.seating.map((id) => (id === n.id ? next : id));
    addNews(s, `${n.name} התפטר/ה מהכנסת בעקבות פרשה; ${nn.name} נכנס/ת במקומו/ה`, 'neutral', false, undefined, undefined, n.id);
  }
  if (s.player.employerId === n.id) {
    s.player.employerId = null;
    if (s.player.rank === 'aide') s.player.rank = s.player.partyId ? 'activist' : 'citizen';
    log(s, 'הבוס שלך התפטר – איבדת את המשרה בלשכה.', 'career');
  }
}

/** מזימות: יריב מר מתכנן לפגוע בשחקן; בעל ברית נאמן אולי יזהיר */
function maybePlot(s: GameState) {
  if (s.week - Number(s.flags.plotWeek ?? -99) < 12) return;
  const plotters = Object.values(s.npcs).filter((n) => n.notable && n.attitude <= -45);
  if (!plotters.length) return;
  const vindictive = plotters.filter((n) => n.traits.includes('vindictive'));
  const plotter = pick(s, vindictive.length ? vindictive : plotters);
  s.flags.plotWeek = s.week;
  const allies = Object.values(s.npcs).filter((n) => n.attitude >= 50 && (n.traits.includes('loyal') || n.trust >= 65) && n.id !== plotter.id);
  if (allies.length) s.eventQueue.push({ eventId: 'plot_warning', ctx: { npc: plotter.id, npc2: pick(s, allies).id } });
  else scheduleEvent(s, 'plot_strike', 1, { npc: plotter.id });
}

export function tickNpcs(s: GameState) {
  if (chance(s, 0.05)) npcLawPasses(s);
  if (chance(s, 0.015)) npcResigns(s);
  if (chance(s, 0.06)) maybePlot(s);
  // שאפתנות: ח"כים שאפתנים צוברים השפעה לאט
  for (const n of Object.values(s.npcs)) {
    if (n.isMK && n.ambition > 75 && chance(s, 0.02)) n.influence = clamp(n.influence + 1, 0, 100);
  }
}
