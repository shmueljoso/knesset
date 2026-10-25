// דמויות ומפלגות בתנועה: פרישות ויורשים, הקמת מפלגות חדשות, הדחות, מורדים, ולחץ ציבורי –
// וסקרי "מה אם" שמראים מה היה קורה אם מישהו (גם את/ה) היה פורש, מקים רשימה או חוזר.
import { registerSpecial } from '../ops';
import { chance, pick, rand } from '../rng';
import type { GameState, Hypo, Ideology, Npc, Party, Succession } from '../types';
import { clamp, ideologyDistance } from '../util';
import { listsOpen, spawnParty } from './mergers';
import { addNews } from './news';
import { addMomentum, playerElectoralAppeal } from './opinion';
import { changeAttitude } from './relationships';
import { log } from './report';
import { vacateSeat } from './president';
import { scheduleEvent } from './issues';
import { latestSurvey } from './surveys';
import { addStat } from '../stats';

const thr = (s: GameState) => s.rules.threshold ?? 3.25;
const seatsOf = (s: GameState, pct: number) => (pct < thr(s) ? 0 : Math.round((pct / 100) * 120));
export const figureName = (s: GameState, id: string) => (id === 'player' ? s.player.name : s.npcs[id]?.name ?? '?');
const ideoOf = (s: GameState, id: string): Ideology => (id === 'player' ? s.player.ideology : s.npcs[id].ideology);
const partyIdOf = (s: GameState, id: string) => (id === 'player' ? s.player.partyId : s.npcs[id]?.partyId ?? null);
const leads = (s: GameState, id: string) => Object.values(s.parties).find((p) => p.leaderId === id);

// ---------------- תחזיות "מה אם" ----------------

export interface FoundForecast {
  pct: number;
  seats: number;
  takes: { party: string; pct: number }[];
}

/** כמה היה מקבל/ת מי שמקים/ה רשימה חדשה, ומאיפה הקולות באים */
export function foundForecast(s: GameState, id: string): FoundForecast {
  const own = partyIdOf(s, id);
  let pct: number;
  if (id === 'player') pct = clamp(playerElectoralAppeal(s) * 1.1 + 0.5 + s.player.fame / 40, 0.3, 14);
  else {
    const n = s.npcs[id];
    const ownParty = n.partyId ? s.parties[n.partyId] : null;
    pct = 0.7 + (n.influence / 100) * 4.2 + (n.ambition > 70 ? 0.5 : 0) + (ownParty ? ownParty.poll * (ownParty.leaderId === id ? 0.3 : 0.06) : 0.8);
    if (s.retired.some((r) => r.id === id)) pct += 1.2; // געגוע
  }
  pct = clamp(pct, 0.3, 15);
  const ideo = ideoOf(s, id);
  const parties = Object.values(s.parties).filter((p) => p.poll > 0.5);
  const w = parties.map((p) => p.poll * Math.exp(-ideologyDistance(p.ideology, ideo) * 4) * (p.id === own ? 1.8 : 1));
  const tot = w.reduce((a, b) => a + b, 0) || 1;
  const takes = parties
    .map((p, i) => ({ party: p.id, pct: Math.min(p.poll * 0.5, (pct * w[i]) / tot) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);
  return { pct: Math.round(pct * 10) / 10, seats: seatsOf(s, pct), takes };
}

/** מה קורה למפלגה כשהיו"ר פורש/ת: חלק מהכוח האישי נעלם */
export function quitForecast(s: GameState, partyId: string): { pct: number; seats: number; now: number } {
  const p = s.parties[partyId];
  const lead = p.leaderId === 'player' ? clamp(s.player.fame / 100, 0.1, 1) * 100 : s.npcs[p.leaderId]?.influence ?? 50;
  const pct = Math.max(0.2, p.poll * (1 - (0.1 + (lead / 100) * 0.2)));
  return { pct: Math.round(pct * 10) / 10, seats: seatsOf(s, pct), now: seatsOf(s, p.poll) };
}

export function mergeSeats(s: GameState, a: Party, b: Party): { pct: number; seats: number; sum: number } {
  const pct = (a.poll + b.poll) * 0.95;
  return { pct: Math.round(pct * 10) / 10, seats: seatsOf(s, pct), sum: seatsOf(s, a.poll) + seatsOf(s, b.poll) };
}

/** בוחר 2-4 תרחישי "מה אם" לסקר הנוכחי */
export function makeHypos(s: GameState): Hypo[] {
  const out: Hypo[] = [];
  const name = (id: string) => (id === 'player' ? s.player.name : figureName(s, id));
  const partyName = (id: string) => s.parties[id]?.short ?? '?';
  const foundHypo = (id: string): Hypo => {
    const f = foundForecast(s, id);
    return {
      kind: 'found', who: id, pct: f.pct, seats: f.seats,
      text: `אם ${name(id)} יקים/תקים מפלגה`,
      detail: f.takes.length ? `לוקח/ת בעיקר מ${f.takes.map((t) => partyName(t.party)).join(' ו')}` : undefined,
    };
  };
  // את/ה: מי שאין לו/ה מפלגה או לא יו"ר – "אם תקים"; יו"ר – "אם תפרוש"
  const mine = s.player.partyId ? s.parties[s.player.partyId] : null;
  if (s.player.fame >= 12) {
    if (!mine || mine.leaderId !== 'player') out.push(foundHypo('player'));
    else {
      const q = quitForecast(s, mine.id);
      out.push({ kind: 'quit', who: 'player', pct: q.pct, seats: q.seats, text: `אם ${s.player.name} יפרוש/תפרוש מראשות ${mine.short}`, detail: `כרגע: ${q.now} מנדטים` });
    }
  }
  // ראש הממשלה פורש
  const pm = s.npcs[s.coalition.pmId];
  if (pm?.partyId && chance(s, 0.55)) {
    const q = quitForecast(s, pm.partyId);
    out.push({ kind: 'quit', who: pm.id, pct: q.pct, seats: q.seats, text: `אם ${pm.name} יפרוש/תפרוש מראשות הממשלה: ${s.parties[pm.partyId].short}`, detail: `כרגע: ${q.now} מנדטים` });
  }
  // שאפתנים או פורשים שחוזרים
  const cands = [
    ...Object.values(s.npcs).filter((n) => n.notable && n.ambition >= 55 && !leads(s, n.id) && n.attitude > -100),
    ...s.retired.map((r) => s.npcs[r.id]).filter(Boolean),
  ];
  if (cands.length) {
    const n = pick(s, cands.sort((a, b) => b.influence + b.ambition - (a.influence + a.ambition)).slice(0, 5));
    const h = foundHypo(n.id);
    if (s.retired.some((r) => r.id === n.id)) h.kind = 'comeback', (h.text = `אם ${n.name} יחזור/תחזור לפוליטיקה ויקים רשימה`);
    out.push(h);
  }
  // איחוד בין שתי קטנות
  const small = Object.values(s.parties).filter((p) => p.poll > 0.8 && p.poll < thr(s) + 1.5 && p.leaderId !== 'player');
  for (const a of small) {
    const b = small.find((x) => x.id !== a.id && ideologyDistance(a.ideology, x.ideology) < 0.3);
    if (!b) continue;
    const m = mergeSeats(s, a, b);
    out.push({ kind: 'merge', who: a.id, pct: m.pct, seats: m.seats, text: `אם ${a.short} ו${b.short} יתאחדו`, detail: `לבד: ${m.sum} מנדטים` });
    break;
  }
  return out.slice(0, 4);
}

/** כמה אחוזים חושבים שראש הממשלה צריך לפרוש: תלוי באהדה, בפרשות וביציבות */
export function resignPressure(s: GameState, govApproval: number): number {
  let v = 22 + (50 - govApproval) * 0.9 + (100 - s.coalition.stability) * 0.12;
  if (s.coalition.pmId === 'player' && s.scandal) v += 8 + s.scandal.stage * 4;
  return Math.round(clamp(v, 6, 85));
}

// ---------------- החלפת יו"ר ----------------

/** מחליף יו"ר מפלגה, כולל ראש הממשלה, תארים ויו"ר האופוזיציה */
export function installLeader(s: GameState, partyId: string, newId: string, why: string) {
  const p = s.parties[partyId];
  if (!p || (newId !== 'player' && !s.npcs[newId])) return;
  const old = p.leaderId;
  p.leaderId = newId;
  p.list = [newId, ...p.list.filter((x) => x !== newId)];
  const o = old !== 'player' ? s.npcs[old] : null;
  const wasOpp = o?.title?.includes('האופוזיציה');
  if (o) {
    if (o.ministry === 'pm') o.ministry = undefined;
    if (o.title === 'ראש הממשלה' || o.title === 'ראשת הממשלה' || wasOpp) o.title = undefined;
  }
  if (s.coalition.pmId === old) {
    s.coalition.pmId = newId;
    s.ministers.pm = newId;
    if (newId === 'player') {
      s.player.rank = 'minister';
      if (!s.player.achievements.includes('pm')) s.player.achievements.push('pm');
    } else {
      const n = s.npcs[newId];
      n.title = n.gender === 'm' ? 'ראש הממשלה' : 'ראשת הממשלה';
      n.ministry = 'pm';
    }
    s.coalition.stability = clamp(s.coalition.stability - 6, 0, 100);
  } else if (wasOpp && newId !== 'player') {
    const n = s.npcs[newId];
    n.title = n.gender === 'm' ? 'יו"ר האופוזיציה' : 'יו"רית האופוזיציה';
  }
  if (newId === 'player') {
    s.player.listPosition = 1;
    s.player.partyStanding = 92;
    if (!s.player.achievements.includes('leader')) s.player.achievements.push('leader');
    addStat(s, 'fame', 6);
  }
  addMomentum(s, partyId, 0.8); // "דם חדש"
  void why;
}

function leaveParliament(s: GameState, id: string, why: string) {
  const n = s.npcs[id];
  if (!n) return;
  if (n.isMK) vacateSeat(s, id);
  n.partyId = null;
  n.title = undefined;
  n.ministry = undefined;
  s.retired.push({ id, week: s.week, why });
}

function successors(s: GameState, partyId: string, exclude: string): Npc[] {
  const p = s.parties[partyId];
  return p.list
    .map((id) => s.npcs[id])
    .filter((n): n is Npc => !!n && n.id !== exclude && n.isMK)
    .sort((a, b) => b.influence + b.primaryStrength * 0.5 - (a.influence + a.primaryStrength * 0.5))
    .slice(0, 3);
}

/** יו"ר מכריז/ה על פרישה: ההחלטה על היורש/ת בעוד כמה שבועות */
export function announceRetirement(s: GameState, partyId: string, why: string) {
  const p = s.parties[partyId];
  if (!p || p.leaderId === 'player' || s.succession.some((x) => x.partyId === partyId)) return;
  const old = s.npcs[p.leaderId];
  if (!old) return;
  const isPM = s.coalition.pmId === old.id;
  s.succession.push({ partyId, week: s.week + 5, why, oldLeader: old.id });
  addNews(
    s,
    `${old.name} הודיע/ה על פרישה מראשות ${p.name}${isPM ? ' – וגם מראשות הממשלה' : ''}`,
    'neutral',
    partyId === s.player.partyId,
    `${why}. המאבק על הירושה כבר התחיל: ${successors(s, partyId, old.id).map((n) => n.name).join(', ')}.`,
    'ערוץ המשכן',
  );
  if (isPM) addMomentum(s, partyId, -0.8);
}

/** העברת השרביט: אוטומטית, או כאירוע אם את/ה יכול/ה להתמודד */
function resolveSuccession(s: GameState, x: Succession) {
  const p = s.parties[x.partyId];
  if (!p) return;
  const cands = successors(s, x.partyId, x.oldLeader);
  const me = s.player;
  const eligible = p.id === me.partyId && me.isMK && me.partyStanding >= 45 && me.fame >= 20 && p.leaderId !== 'player';
  if (eligible && cands.length >= 2) {
    s.eventQueue.push({
      eventId: 'fg_succession',
      ctx: { party: p.id, partyName: p.name, old: x.oldLeader, c0: cands[0].id, c0Name: cands[0].name, c1: cands[1].id, c1Name: cands[1].name },
    });
    return;
  }
  finishSuccession(s, x.partyId, cands[0]?.id);
}

function finishSuccession(s: GameState, partyId: string, winner: string | undefined, oldId?: string) {
  const p = s.parties[partyId];
  const old = oldId ?? s.succession.find((x) => x.partyId === partyId)?.oldLeader ?? p.leaderId;
  s.succession = s.succession.filter((x) => x.partyId !== partyId);
  if (winner) {
    installLeader(s, partyId, winner, 'פרישה');
    addNews(s, `${figureName(s, winner)} נבחר/ה ליו"ר ${p.name} במקום ${figureName(s, old)}`, 'neutral', winner === 'player' || partyId === s.player.partyId, undefined, 'ערוץ המשכן');
  }
  // הפורש/ת: לרוב נשאר/ת ח"כ; לפעמים עוזב/ת את החיים הפוליטיים (ואז אפשר לשאול "מה אם יחזור")
  if (old !== 'player' && s.npcs[old] && old !== winner) {
    if (chance(s, 0.5)) leaveParliament(s, old, 'פרש מהפוליטיקה');
    else s.npcs[old].ambition = Math.max(10, s.npcs[old].ambition - 30);
  }
}

registerSpecial('fg_run', (s, ctx) => {
  const p = s.parties[ctx.party];
  if (!p) return;
  const me = s.player;
  const top = s.npcs[ctx.c0];
  const pr = clamp(0.15 + me.partyStanding / 250 + me.fame / 300 + me.reputation / 400 - (top?.influence ?? 50) / 400, 0.08, 0.75);
  if (rand(s) < pr) {
    finishSuccession(s, p.id, 'player', ctx.old);
    log(s, `נבחרת ליו"ר ${p.name}!`, 'career');
    addNews(s, `רעידת אדמה ב${p.name}: ${me.name} ניצח/ה את ${ctx.c0Name} ונבחר/ה ליו"ר`, 'good', true, undefined, 'ערוץ המשכן');
    return `ניצחת! את/ה יו"ר ${p.name}.`;
  }
  me.partyStanding = clamp(me.partyStanding - 10, 0, 100);
  changeAttitude(s, ctx.c0, -10);
  finishSuccession(s, p.id, ctx.c0, ctx.old);
  return `הפסדת. ${ctx.c0Name} נבחר/ה ליו"ר.`;
});
registerSpecial('fg_back0', (s, ctx) => {
  changeAttitude(s, ctx.c0, 14);
  finishSuccession(s, ctx.party, ctx.c0, ctx.old);
  return `${ctx.c0Name} נבחר/ה ליו"ר ויזכור לך את התמיכה.`;
});
registerSpecial('fg_back1', (s, ctx) => {
  changeAttitude(s, ctx.c1, 14);
  const win = rand(s) < 0.4 ? ctx.c1 : ctx.c0;
  if (win === ctx.c0) changeAttitude(s, ctx.c0, -6);
  finishSuccession(s, ctx.party, win, ctx.old);
  return win === ctx.c1 ? `${ctx.c1Name} ניצח/ה בזכותך!` : `${ctx.c1Name} הפסיד/ה. ${ctx.c0Name} הוא/היא היו"ר.`;
});
registerSpecial('fg_stay', (s, ctx) => {
  finishSuccession(s, ctx.party, ctx.c0, ctx.old);
});

// ---------------- הקמת מפלגה על ידי דמות ----------------

/** דמות (NPC) עוזבת ומקימה רשימה חדשה; מי שחזרה מפרישה – מבטלת את הפרישה */
export function foundByNpc(s: GameState, id: string): Party | null {
  const n = s.npcs[id];
  if (!n || leads(s, id) || Object.keys(s.parties).length >= 16) return null;
  const from = n.partyId ? s.parties[n.partyId] : null;
  const [first, ...rest] = n.name.split(' ');
  const last = rest.join(' ') || first;
  const f = foundForecast(s, id);
  const party = spawnParty(s, {
    names: [`הדרך של ${first}`, `${last} ביחד`, `מפלגת ${last}`, `הרשימה של ${first}`],
    ideology: { ...n.ideology },
    sectors: from ? { ...from.sectors } : { secular: 1, traditional: 0.5 },
    momentum: 1.5 + f.pct / 3,
    bio: 'מקים/ה מפלגה אחרי חודשי ספקולציות.',
  });
  const gen = party.leaderId;
  // הדמות הופכת ליו"ר; היו"ר שנוצר בינתיים נשאר ברשימה
  if (from) {
    from.list = from.list.filter((x) => x !== id);
    if (n.isMK) from.seats = Math.max(0, from.seats - 1);
    from.base *= 0.97;
    from.poll *= 0.97;
  }
  n.partyId = party.id;
  party.leaderId = id;
  party.list = [id, ...party.list.filter((x) => x !== id)];
  party.seats = n.isMK ? 1 : 0;
  party.inOutgoingKnesset = n.isMK;
  party.poll = Math.max(party.poll, f.pct * 0.6);
  party.base = party.poll;
  s.retired = s.retired.filter((r) => r.id !== id);
  s.buzz[id] = 0;
  void gen;
  addNews(s, `${n.name} הקים/ה מפלגה חדשה: "${party.name}"`, 'neutral', false, `סקרים אחרונים נתנו ${f.seats} מנדטים. ${f.takes[0] ? `הכי נפגעת: ${s.parties[f.takes[0].party]?.name}.` : ''}`, 'ערוץ המשכן');
  return party;
}

// ---------------- שבוע אחר שבוע ----------------

export function tickFigures(s: GameState) {
  const sv = latestSurvey(s);
  // באז: סקר "מה אם" שנותן הרבה מנדטים מדליק את הדמות; בלי חיזוק הוא דועך
  for (const [id, v] of Object.entries(s.buzz)) s.buzz[id] = Math.max(0, v * 0.985 - 0.2);
  if (sv && sv.week === s.week) {
    for (const h of sv.hypos ?? []) if ((h.kind === 'found' || h.kind === 'comeback') && h.seats >= 5) s.buzz[h.who] = Math.min(100, (s.buzz[h.who] ?? 0) + h.seats * 4);
  }
  // התבגרות
  if (s.week > 0 && s.week % 52 === 0) for (const n of Object.values(s.npcs)) if (n.notable) n.avatar.age = Math.min(80, n.avatar.age + 1);

  const toElection = s.electionWeek - s.week;
  const calm = !s.negotiation && toElection > 8;
  // העברת שרביט שהגיע זמנה
  for (const x of [...s.succession]) if (s.week >= x.week && !s.eventQueue.some((e) => e.eventId === 'fg_succession')) resolveSuccession(s, x);
  if (!calm) return;

  // פרישות: גיל, ירידה בסקרים, ולחץ ציבורי על ראש הממשלה
  for (const p of Object.values(s.parties)) {
    if (p.leaderId === 'player' || !s.npcs[p.leaderId] || p.seats === 0) continue;
    const n = s.npcs[p.leaderId];
    const falling = p.poll < p.base * 0.72;
    let h = 0.0003 + Math.max(0, n.avatar.age - 62) * 0.0004 + (falling ? 0.0025 : 0);
    if (s.coalition.pmId === n.id) {
      h *= 0.6;
      if ((sv?.resign ?? 0) >= 60) h += 0.01;
    }
    if (chance(s, h)) {
      const why = falling ? 'אחרי ירידה מתמשכת בסקרים' : n.avatar.age >= 66 ? `בגיל ${n.avatar.age}, "הגיע הזמן לדור הבא"` : 'מטעמים אישיים';
      announceRetirement(s, p.id, why);
    }
  }
  // הדחה: מפלגה שקורסת מדיחה את היו"ר
  for (const p of Object.values(s.parties)) {
    if (p.leaderId === 'player' || !s.npcs[p.leaderId] || p.seats < 4 || s.succession.some((x) => x.partyId === p.id)) continue;
    if (p.poll < p.base * 0.6 && chance(s, 0.012)) {
      const rival = successors(s, p.id, p.leaderId).find((n) => n.ambition >= 55);
      if (!rival) continue;
      const old = s.npcs[p.leaderId];
      installLeader(s, p.id, rival.id, 'הדחה');
      addNews(s, `הדחה ב${p.name}: ${rival.name} מחליף/ה את ${old.name} אחרי הקריסה בסקרים`, 'neutral', p.id === s.player.partyId, undefined, 'ערוץ המשכן');
    }
  }
  // הקמת מפלגה: דמות עם באז גבוה ושאפתנות
  if (listsOpen(s) && Object.keys(s.parties).length < 13 && s.week - Number(s.flags.fgFoundWeek ?? -99) >= 40) {
    for (const [id, v] of Object.entries(s.buzz)) {
      if (id === 'player' || v < 75 || !s.npcs[id]) continue;
      const n = s.npcs[id];
      if (n.ambition >= 60 && chance(s, 0.03)) {
        if (foundByNpc(s, id)) s.flags.fgFoundWeek = s.week;
        break;
      }
    }
  }
  // מורדים במפלגה של השחקן
  const mine = s.player.partyId ? s.parties[s.player.partyId] : null;
  if (mine?.leaderId === 'player' && mine.poll < mine.base * 0.85 && chance(s, 0.012) && !s.eventQueue.some((e) => e.eventId === 'fg_rebels')) {
    const rebel = mine.list.map((id) => s.npcs[id]).filter((n): n is Npc => !!n && n.isMK && n.ambition >= 65 && n.influence >= 40)[0];
    if (rebel) s.eventQueue.push({ eventId: 'fg_rebels', ctx: { npc: rebel.id, npcName: rebel.name } });
  }
  // לחץ ציבורי עלייך: להקים מפלגה, או לפרוש מהנהגה שנכשלת
  if (s.week - Number(s.flags.fgCallWeek ?? -99) >= 52 && !s.eventQueue.some((e) => e.eventId.startsWith('fg_call'))) {
    const f = foundForecast(s, 'player');
    if ((s.buzz.player ?? 0) >= 70 && (!mine || mine.leaderId !== 'player') && !s.player.defector) {
      s.flags.fgCallWeek = s.week;
      s.eventQueue.push({ eventId: 'fg_call_found', ctx: { seats: String(f.seats), pct: String(f.pct), takes: f.takes[0] ? s.parties[f.takes[0].party]?.short ?? '' : '' } });
    } else if (mine?.leaderId === 'player' && mine.poll < mine.base * 0.62 && mine.seats >= 3) {
      const q = quitForecast(s, mine.id);
      s.flags.fgCallWeek = s.week;
      s.eventQueue.push({ eventId: 'fg_call_retire', ctx: { party: mine.id, partyName: mine.name, seats: String(q.seats), now: String(q.now) } });
    }
  }
  void scheduleEvent;
}

registerSpecial('fg_call_decline', (s) => {
  s.buzz.player = 0;
});
registerSpecial('fg_call_hint', (s) => {
  s.buzz.player = 55;
  addNews(s, `ספקולציות: ${s.player.name} שוקל/ת להקים מפלגה`, 'neutral', true, undefined, 'פוליטיקה עכשיו');
  addStat(s, 'fame', 2);
});
registerSpecial('fg_step_down', (s, ctx) => {
  const p = s.parties[ctx.party];
  if (!p) return;
  const cands = successors(s, p.id, 'player');
  const heir = cands[0];
  if (!heir) return 'אין מחליף/ה ראוי/ה – את/ה נשאר/ת.';
  installLeader(s, p.id, heir.id, 'פרישה');
  s.player.partyStanding = clamp(s.player.partyStanding - 10, 0, 100);
  addStat(s, 'reputation', 3);
  addNews(s, `${s.player.name} פורש/ת מראשות ${p.name}; ${heir.name} ייכנס/תיכנס לנעליו/ה`, 'neutral', true, 'הצעד נחשב לאחראי – גם מי שלא אוהב אותך מודה בכך.', 'ערוץ המשכן');
  return `${heir.name} יו"ר ${p.name}. את/ה ממשיך/ה כח"כ.`;
});
registerSpecial('fg_rebels_split', (s, ctx) => {
  const f = foundByNpc(s, ctx.npc);
  return f ? `${ctx.npcName} עזב/ה והקים/ה את "${f.name}".` : 'הם איימו – ונשארו.';
});
