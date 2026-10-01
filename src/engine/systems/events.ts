import { EVENTS, debtCollectCandidate, eventById, type EventChoice, type GameEvent } from '../data/events';
import { applyOps, fill, registerSpecial, type Ctx, type Op } from '../ops';
import { chance, pickWeighted, rand, shuffle } from '../rng';
import type { GameState } from '../types';
import { clamp } from '../util';
import { changeAttitude, changeTrust } from './relationships';
import { log } from './report';
import { recomputeAp } from './staff';
import { changeSatisfaction, recomputeStability } from './coalition';
import { appointPlayerMinister, ministryTitle } from './government';
import { fireFromMinistry, resignMinistry } from './ministry';
import { addNews } from './news';

export function currentEvent(s: GameState): { ev: GameEvent; ctx: Ctx } | null {
  while (s.eventQueue.length) {
    const p = s.eventQueue[0];
    const ev = eventById(p.eventId);
    if (ev) return { ev, ctx: p.ctx };
    s.eventQueue.shift();
  }
  return null;
}

export function choiceBlocked(s: GameState, c: EventChoice, ctx: Ctx): string | null {
  return c.requires ? c.requires(s, ctx) : null;
}

export function choiceOps(s: GameState, c: EventChoice, ctx: Ctx): Op[] {
  return [...(c.ops ?? []), ...(c.dyn ? c.dyn(s, ctx) : [])];
}

export function resolveEvent(s: GameState, idx: number): { lines: string[]; success: boolean } {
  const cur = currentEvent(s);
  if (!cur) return { lines: [], success: false };
  const c = cur.ev.choices[idx];
  if (!c || choiceBlocked(s, c, cur.ctx)) return { lines: ['הבחירה לא זמינה'], success: false };
  s.eventQueue.shift();
  let success = true;
  const lines: string[] = [];
  if (c.chance) success = rand(s) < clamp(c.chance.p(s, cur.ctx), 0.05, 0.95);
  if (success) {
    lines.push(...applyOps(s, choiceOps(s, c, cur.ctx), cur.ctx));
    if (c.result) lines.unshift(c.result);
  } else {
    lines.push(...applyOps(s, c.chance!.fail, cur.ctx));
    lines.unshift(c.chance!.failText);
  }
  log(s, `${fill(s, cur.ev.title, cur.ctx)} – ${c.label}`, 'event');
  return { lines, success };
}

/** הגרלת אירועים שבועית. */
export function rollEvents(s: GameState) {
  const debt = debtCollectCandidate(s);
  if (debt && chance(s, 0.35)) s.eventQueue.push({ eventId: 'debt_collect', ctx: debt });

  const count = (chance(s, 0.8) ? 1 : 0) + (chance(s, 0.25) ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const pool = EVENTS.filter((e) => {
      if (e.queued) return false;
      if (s.eventQueue.some((q) => q.eventId === e.id)) return false;
      const last = s.eventsFired[e.id];
      if (last !== undefined && e.once) return false;
      if (last !== undefined && s.week - last < (e.cooldown ?? 6)) return false;
      return e.when ? e.when(s) : true;
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      const ev = pickWeighted(s, pool, (e) => e.weight ?? 3);
      if (!ev) break;
      const ctx = ev.ctx ? ev.ctx(s) : {};
      if (!ctx) continue;
      s.eventQueue.push({ eventId: ev.id, ctx });
      s.eventsFired[ev.id] = s.week;
      break;
    }
  }
}

// ---- פעולות מיוחדות שאירועים מפעילים ----
registerSpecial('wants_list', (s) => {
  s.player.wantsList = true;
  s.player.partyStanding = clamp(s.player.partyStanding + 1, 0, 100);
  return 'נרשמת כמועמד/ת. עכשיו צריך לגייס תמיכה במטה המפלגה.';
});

registerSpecial('become_chair', (s) => {
  const c = s.committees.find((x) => s.player.committees.includes(x.id));
  if (!c) return;
  const prev = s.npcs[c.chairId];
  if (prev) {
    prev.title = undefined;
    changeAttitude(s, prev.id, -20);
  }
  c.chairId = 'player';
  s.player.rank = 'chair';
  s.player.fame = clamp(s.player.fame + 5, 0, 100);
  if (!s.player.achievements.includes('chair')) s.player.achievements.push('chair');
  return `מונית ליו"ר ${c.name}!`;
});

registerSpecial('take_aide_job', (s, ctx) => {
  s.player.employerId = ctx.npc;
  s.player.rank = 'aide';
  s.player.money += 5;
  return 'מתחיל/ה לעבוד בלשכה. עכשיו אפשר לנסח הצעות חוק בשם הח"כ.';
});

registerSpecial('rested', (s) => {
  s.flags.rested = true;
});

registerSpecial('lobby_money', (s) => {
  s.flags.lobbyMoney = true;
});

registerSpecial('fire_disloyal', (s) => {
  const st = [...s.player.staff].sort((a, b) => a.loyalty - b.loyalty)[0];
  if (!st) return;
  s.player.staff = s.player.staff.filter((x) => x.id !== st.id);
  recomputeAp(s);
  return `${st.name} פוטר/ה.`;
});

registerSpecial('forgive_staff', (s) => {
  const st = [...s.player.staff].sort((a, b) => a.loyalty - b.loyalty)[0];
  if (st) st.loyalty = clamp(st.loyalty + 25, 0, 100);
});

registerSpecial('rebels', (s) => {
  const mates = Object.values(s.npcs).filter((n) => n.isMK && n.partyId === s.player.partyId && n.id !== s.parties[n.partyId!].leaderId);
  for (const n of shuffle(s, mates).slice(0, 3)) {
    changeAttitude(s, n.id, 15);
    changeTrust(s, n.id, 12);
  }
  return 'שלושה ח"כים בסיעה מתקרבים אליך.';
});

// ---- שלב 2 ----
registerSpecial('take_ministry', (s) => {
  const mid = Object.entries(s.ministers).find(([m, id]) => m !== 'pm' && s.npcs[id]?.partyId === s.player.partyId)?.[0];
  if (!mid) return;
  const prev = s.npcs[s.ministers[mid]];
  if (prev) changeAttitude(s, prev.id, -40);
  appointPlayerMinister(s, mid);
  addNews(s, `${s.player.name} מונה/תה ל${ministryTitle(mid, s.player.gender)}`, 'good', true);
  return `מונית ל${ministryTitle(mid, s.player.gender)}!`;
});
registerSpecial('fired', (s) => {
  fireFromMinistry(s);
  return 'פוטרת מהממשלה.';
});
registerSpecial('resign', (s) => resignMinistry(s));
registerSpecial('partner_give', (s, ctx) => {
  changeSatisfaction(s, ctx.party, 15);
  recomputeStability(s);
});
registerSpecial('partner_job', (s, ctx) => {
  changeSatisfaction(s, ctx.party, 8);
  recomputeStability(s);
});
registerSpecial('partner_refuse', (s, ctx) => {
  changeSatisfaction(s, ctx.party, -15);
  recomputeStability(s);
});
registerSpecial('ministry_perf', (s) => {
  if (s.ministryState) s.ministryState.performance = clamp(s.ministryState.performance + 5, 0, 100);
});
