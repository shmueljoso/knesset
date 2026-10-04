// הגרלת טלטלות ופעולות מיוחדות שהן מפעילות.
import { SHOCKS } from '../data/shocks';
import { registerSpecial } from '../ops';
import { chance, pickWeighted, rand } from '../rng';
import { addStat } from '../stats';
import type { GameState } from '../types';
import { clamp } from '../util';
import { executeMerger, mergeBlocked, playerLeads } from './mergers';
import { addNews } from './news';
import { joinParty } from './parties';
import { changeAttitude } from './relationships';
import { log } from './report';

const DRAMA_RATE = { calm: 0.4, normal: 1, wild: 2.2 } as const;

/** סיכוי שבועי לטלטלה (לפני תנאים) */
export function shockRate(s: GameState): number {
  const toE = s.electionWeek - s.week;
  return 0.03 * DRAMA_RATE[s.settings?.drama ?? 'normal'] * (toE > 0 && toE <= 16 ? 1.8 : 1);
}

export function rollShocks(s: GameState) {
  if (s.gameOver) return;
  const toE = s.electionWeek - s.week;
  // עימות טלוויזיוני ליו"רים, פעם אחת לפני כל בחירות
  const lead = playerLeads(s);
  const debateKey = `debate_${s.electionWeek}`;
  if (lead && toE >= 1 && toE <= 4 && lead.poll >= 2 && !s.flags[debateKey]) {
    s.flags[debateKey] = true;
    s.eventQueue.push({ eventId: 'tv_debate', ctx: {} });
    return;
  }
  if (s.week - Number(s.flags.lastShock ?? -99) < 6) return;
  if (!chance(s, shockRate(s))) return;
  const pool = SHOCKS.filter((d) => {
    const last = s.eventsFired[d.id];
    if (last !== undefined && s.week - last < 52) return false;
    return d.when ? d.when(s) : true;
  });
  const def = pickWeighted(s, pool, (d) => d.weight);
  if (!def) return;
  const ctx = def.setup(s);
  if (!ctx) return;
  s.eventsFired[def.id] = s.week;
  s.flags.lastShock = s.week;
  s.eventQueue.push({ eventId: def.id, ctx });
}

// ---- פעולות מיוחדות ----
registerSpecial('shock_merge_me', (s, ctx) => {
  // ההסכמה כבר הוגרלה בבחירה עצמה – כאן רק מבצעים
  const me = playerLeads(s);
  if (!me || !s.parties[ctx.party]) return;
  const blocked = mergeBlocked(s, me.id, ctx.party);
  return blocked ?? executeMerger(s, ctx.party, { lead: 'me', share: 'fair' }).text;
});

registerSpecial('shock_merge_them', (s, ctx) => {
  const me = playerLeads(s);
  if (!me || !s.parties[ctx.party]) return;
  const blocked = mergeBlocked(s, me.id, ctx.party);
  return blocked ?? executeMerger(s, ctx.party, { lead: 'them', share: 'fair' }).text;
});

registerSpecial('join_new_party', (s, ctx) => {
  const r = joinParty(s, ctx.party);
  if (!r.ok) return r.text;
  s.player.wantsList = true;
  s.flags.promisedSlot = `${ctx.party}:4`;
  return `${r.text} הובטח לך המקום ה-4 ברשימה.`;
});

registerSpecial('join_rebels', (s, ctx) => {
  const r = joinParty(s, ctx.party);
  if (!r.ok) return r.text;
  s.player.wantsList = true;
  s.flags.promisedSlot = `${ctx.party}:2`;
  return `${r.text} את/ה מספר 2 ברשימת המורדים.`;
});

registerSpecial('run_for_leader', (s, ctx) => {
  const party = s.parties[ctx.party];
  const p = s.player;
  if (!party || p.partyId !== party.id || party.leaderId === 'player') return;
  const rival = s.npcs[party.leaderId === ctx.npc ? (party.list.find((id) => id !== ctx.npc && id !== 'player' && s.npcs[id]) ?? '') : party.leaderId];
  const mine = p.partyStanding * 0.5 + p.fame * 0.3 + p.reputation * 0.2 + rand(s) * 20;
  const theirs = 35 + (rival?.influence ?? 40) * 0.3 + rand(s) * 20;
  if (mine > theirs) {
    const old = party.leaderId;
    party.leaderId = 'player';
    party.list = ['player', ...party.list.filter((id) => id !== 'player')];
    p.listPosition = 1;
    p.partyStanding = 90;
    addStat(s, 'fame', 8);
    if (!p.achievements.includes('leader')) p.achievements.push('leader');
    if (s.npcs[old]) changeAttitude(s, old, -40);
    addNews(s, `${p.name} נבחר/ה ליו"ר ${party.name}`, 'good', true, undefined, 'ערוץ המשכן');
    log(s, `נבחרת ליו"ר ${party.name}!`, 'career');
    return `ניצחת! את/ה יו"ר ${party.name}.`;
  }
  if (rival && party.leaderId !== rival.id) {
    party.leaderId = rival.id;
    party.list = [rival.id, ...party.list.filter((id) => id !== rival.id)];
  }
  p.partyStanding = clamp(p.partyStanding - 10, 0, 100);
  if (rival) changeAttitude(s, rival.id, -20);
  return `הפסדת במרוץ ל${rival?.name ?? 'יריב/ה'}. לפחות עכשיו כולם יודעים שאת/ה בעניין.`;
});
