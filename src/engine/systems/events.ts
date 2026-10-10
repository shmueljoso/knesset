import { addStat } from '../stats';
import { EVENTS, debtCollectCandidate, eventById, type EventChoice, type GameEvent } from '../data/events';
import { applyOps, fill, registerSpecial, type Ctx, type Op } from '../ops';
import { chance, pickWeighted, rand, shuffle } from '../rng';
import type { CustomEvent, GameState } from '../types';
import { clamp } from '../util';
import { changeAttitude, changeTrust } from './relationships';
import { log } from './report';
import { recomputeAp } from './staff';
import { changeSatisfaction, playerPartyQuits, recomputeStability } from './coalition';
import { appointPlayerMinister, ministryTitle } from './government';
import { fireFromMinistry, resignMinistry } from './ministry';
import { addNews } from './news';
import { scandalAttack, scandalCooperate, scandalPardon, scandalStepDown } from './scandals';
import { changeApproval } from './opinion';
import { reenactLaw, scheduleEvent, strikeChance, strikeLaw } from './issues';
import { templateById } from '../data/bills';
import { leanAlignment } from '../util';

/** אירוע שהשחקן כתב בעורך → אירוע משחק רגיל */
export function customToEvent(c: CustomEvent): GameEvent {
  return {
    id: c.id,
    title: c.title,
    body: c.body,
    icon: c.icon || '📜',
    weight: c.weight ?? 2,
    cooldown: 20,
    choices: c.choices.map((ch) => ({
      label: ch.label,
      ops: [
        ...(ch.fame ? [{ op: 'fame' as const, d: ch.fame }] : []),
        ...(ch.reputation ? [{ op: 'reputation' as const, d: ch.reputation }] : []),
        ...(ch.partyStanding ? [{ op: 'partyStanding' as const, d: ch.partyStanding }] : []),
        ...(ch.money ? [{ op: 'money' as const, d: ch.money }] : []),
        ...(ch.capital ? [{ op: 'capital' as const, d: ch.capital }] : []),
        ...(ch.approval ? [{ op: 'approval' as const, sector: 'all' as const, d: ch.approval }] : []),
        { op: 'log' as const, text: `${c.title} – ${ch.label}` },
      ],
    })),
  };
}

export function currentEvent(s: GameState): { ev: GameEvent; ctx: Ctx } | null {
  while (s.eventQueue.length) {
    const p = s.eventQueue[0];
    const custom = (s.customEvents ?? []).find((c) => c.id === p.eventId);
    const ev = custom ? customToEvent(custom) : eventById(p.eventId);
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
    const pool = [...EVENTS, ...(s.customEvents ?? []).map(customToEvent)].filter((e) => {
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
  addStat(s, 'partyStanding', 1);
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
  addStat(s, 'fame', 5);
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
registerSpecial('quit_coalition', (s) => playerPartyQuits(s));
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

// ---- שלב 3: בג"ץ ----
registerSpecial('court_rule', (s, ctx) => {
  const p = strikeChance(s, ctx.law);
  if (rand(s) < p) {
    strikeLaw(s, ctx.law);
    addNews(s, `בג"ץ פסל את "${ctx.title}"`, 'neutral', false, 'ברוב של 7 שופטים מול 2 קבע בית המשפט שהחוק פוגע בזכויות יסוד באופן לא מידתי.', 'ערוץ המשכן');
    if (s.rules.override) scheduleEvent(s, 'override_reenact', 1, ctx);
    return `בג"ץ פסל את החוק (סיכוי היה ${Math.round(p * 100)}%). ההשפעות שלו מתבטלות.`;
  }
  addNews(s, `בג"ץ דחה את העתירות נגד "${ctx.title}"`, 'neutral');
  return `בג"ץ דחה את העתירה (סיכוי פסילה היה ${Math.round(p * 100)}%). החוק נשאר.`;
});

registerSpecial('override_vote', (s, ctx) => {
  const t = templateById(ctx.law);
  const coal = s.coalition.parties;
  const seats = coal.reduce((a, p) => a + s.parties[p].seats, 0) || 1;
  const support = coal.reduce((a, p) => a + leanAlignment(s.parties[p].ideology, t.lean) * s.parties[p].seats, 0) / seats;
  if (support > 0.3 && s.coalition.stability >= 35) {
    reenactLaw(s, ctx.law);
    addNews(s, `הכנסת חוקקה מחדש את "${ctx.title}" בפסקת ההתגברות`, 'neutral', false, undefined, 'ערוץ המשכן');
    return 'הקואליציה חוקקה את החוק מחדש. הסערה רק מתחילה.';
  }
  return 'לקואליציה אין רוב לחקיקה מחדש. הפסיקה נשארת.';
});

// ---- שלב 3: דמויות ----
registerSpecial('alliance', (s, ctx) => {
  const n = s.npcs[ctx.npc];
  if (!n) return;
  for (const b of s.bills) if ((b.sponsor === 'player' || b.sponsor === s.player.employerId) && b.stage !== 'passed' && b.stage !== 'failed' && !n.pledges.includes(b.id)) n.pledges.push(b.id);
  s.flags[`ally_${n.id}`] = true;
  return `${n.name} יתמוך/תתמוך בהצעות החוק שלך.`;
});
registerSpecial('cosponsor', (s, ctx) => {
  s.flags[`cosp_${ctx.npc}`] = ctx.agenda;
});
registerSpecial('plot_go', (s, ctx) => {
  scheduleEvent(s, 'plot_strike', 1, { npc: ctx.npc });
});

// ---- שלב 3: חקירה ----
registerSpecial('scandal_coop', (s) => scandalCooperate(s));
registerSpecial('scandal_attack', (s) => scandalAttack(s));
registerSpecial('scandal_step', (s) => scandalStepDown(s));
registerSpecial('scandal_pardon', (s) => scandalPardon(s));
registerSpecial('wish_broken', (s, ctx) => {
  scheduleEvent(s, 'npc_wish_broken', 4 + Math.floor(rand(s) * 6), { npc: ctx.npc });
});

// ---- תקציב: משא ומתן עם השותפות ----
registerSpecial('budget_give_all', (s) => {
  for (const p of partnersOfPM(s)) changeSatisfaction(s, p, 12);
  recomputeStability(s);
});
registerSpecial('budget_give_one', (s) => {
  const p = partnersOfPM(s).sort((a, b) => (s.coalition.satisfaction[a] ?? 60) - (s.coalition.satisfaction[b] ?? 60))[0];
  if (!p) return;
  changeSatisfaction(s, p, 18);
  recomputeStability(s);
  return `${s.parties[p].name} קיבלה את רוב התוספות.`;
});
registerSpecial('budget_none', (s) => {
  for (const p of partnersOfPM(s)) changeSatisfaction(s, p, -8);
  recomputeStability(s);
});
registerSpecial('budget_win', (s) => {
  const sec = mainSectorOf(s);
  if (sec) changeApproval(s, sec, 3);
  return 'התוספת אושרה – הבוחרים שלך יודעים מי הביא אותה.';
});
registerSpecial('budget_small', (s) => {
  const sec = mainSectorOf(s);
  if (sec) changeApproval(s, sec, 1.5);
});

function partnersOfPM(s: GameState): string[] {
  const pm = s.coalition.pmId === 'player' ? s.player.partyId : s.npcs[s.coalition.pmId]?.partyId;
  return s.coalition.parties.filter((p) => p !== pm && s.parties[p]);
}
function mainSectorOf(s: GameState) {
  const party = s.player.partyId ? s.parties[s.player.partyId] : null;
  if (!party) return null;
  return (Object.entries(party.sectors) as [keyof typeof party.sectors, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
