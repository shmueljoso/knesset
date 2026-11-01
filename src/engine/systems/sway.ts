// השפעה מאחורי הקלעים: לדחוף שתי מפלגות לאיחוד, לשכנע ח"כ להקים מפלגה, לגייס ח"כים שיערקו אליך,
// ולעודד מרד נגד יו"ר של מפלגה אחרת. כל מהלך עולה זמן והון פוליטי, ומי שנכשל/ת – נחשף/ת.
import { chance } from '../rng';
import { addStat } from '../stats';
import type { GameState, Npc, Party } from '../types';
import { clamp, ideologyDistance } from '../util';
import { foundByNpc, foundForecast, installLeader, successors } from './figures';
import { mergeBlocked, mergeParties, synergy } from './mergers';
import { recomputeStability } from './coalition';
import { addNews } from './news';
import { addMemory, changeAttitude } from './relationships';
import { restoreNorwegian } from './regime';
import { log } from './report';
import { recountSeats } from './seats';

export interface SwayResult {
  ok: boolean;
  text: string;
}

export const SWAY_COST = { merge: 15, found: 10, defect: 12, oust: 18 } as const;
export type SwayKind = keyof typeof SWAY_COST;
const COOLDOWN = 8;

const isPres = (s: GameState) => s.president?.id === 'player' && !!s.presidency;
const myParty = (s: GameState): Party | null => (s.player.partyId ? s.parties[s.player.partyId] ?? null : null);
const leadsParty = (s: GameState, id: string) => Object.values(s.parties).some((p) => p.leaderId === id);

/** כמה כוח יש לשחקן להזיז אחרים (0–1): מוכרות, מוניטין, משא ומתן, ותפקיד */
export function clout(s: GameState): number {
  const p = s.player;
  const role = s.coalition.pmId === 'player' ? 0.25 : myParty(s)?.leaderId === 'player' ? 0.12 : p.ministry ? 0.06 : p.isMK ? 0.02 : 0;
  return clamp((p.fame / 100) * 0.3 + (p.reputation / 100) * 0.2 + (p.skills.negotiation / 100) * 0.2 + role, 0, 0.8);
}

function cooling(s: GameState, key: string): string | null {
  const w = Number(s.flags[`sway_${key}`] ?? -99);
  return s.week - w < COOLDOWN ? `ניסית לאחרונה – עוד ${COOLDOWN - (s.week - w)} שבועות` : null;
}

function common(s: GameState, kind: SwayKind): string | null {
  if (isPres(s)) return 'נשיא/ה לא מתערב/ת בפוליטיקה המפלגתית';
  if (!s.player.partyId && !s.player.isMK && s.player.fame < 30) return 'צריך מעמד פוליטי – מפלגה, מושב בכנסת או שם מוכר';
  if (s.player.ap < 1) return 'אין מספיק זמן השבוע';
  if (s.player.capital < SWAY_COST[kind]) return `צריך ${SWAY_COST[kind]} הון פוליטי`;
  return null;
}

function pay(s: GameState, kind: SwayKind, key: string) {
  s.player.ap -= 1;
  s.player.capital -= SWAY_COST[kind];
  s.flags[`sway_${key}`] = s.week;
}

/** ניסיון שנכשל עלול לדלוף */
function maybeLeak(s: GameState, headline: string) {
  if (chance(s, 0.35)) {
    addStat(s, 'reputation', -2);
    addNews(s, headline, 'bad', true);
    return ' והסיפור דלף לתקשורת.';
  }
  return '';
}

const att = (s: GameState, id: string | undefined) => (id && s.npcs[id] ? s.npcs[id].attitude : 0);

// ---------------- איחוד בין שתי מפלגות אחרות ----------------

export function urgeMergeBlocked(s: GameState, a: string, b: string): string | null {
  const c = common(s, 'merge');
  if (c) return c;
  const mine = s.player.partyId;
  if (a === mine || b === mine) return 'לאיחוד עם המפלגה שלך – "איחודים ובריתות" במטה המפלגה';
  return mergeBlocked(s, a, b) ?? cooling(s, `merge_${[a, b].sort().join('_')}`);
}

export function urgeMergeChance(s: GameState, a: string, b: string): number {
  const pa = s.parties[a];
  const pb = s.parties[b];
  if (!pa || !pb) return 0;
  const thr = s.rules?.threshold ?? 3.25;
  const weak = (p: Party) => (p.poll < thr ? 0.22 : p.poll < thr + 1.5 ? 0.1 : 0);
  const dist = ideologyDistance(pa.ideology, pb.ideology);
  const friends = (att(s, pa.leaderId) + att(s, pb.leaderId)) / 400;
  const big = Math.min(pa.poll, pb.poll) > 12 ? -0.15 : 0; // שתי מפלגות גדולות – אגו
  return clamp(0.1 + weak(pa) + weak(pb) - dist * 1.2 + friends + clout(s) * 0.5 + big, 0.03, 0.85);
}

export function urgeMerge(s: GameState, a: string, b: string): SwayResult {
  const blocked = urgeMergeBlocked(s, a, b);
  if (blocked) return { ok: false, text: blocked };
  pay(s, 'merge', `merge_${[a, b].sort().join('_')}`);
  const [keep, gone] = s.parties[a].poll >= s.parties[b].poll ? [a, b] : [b, a];
  const pk = s.parties[keep];
  const pg = s.parties[gone];
  if (!chance(s, urgeMergeChance(s, a, b))) {
    changeAttitude(s, pg.leaderId, -3, { spread: false });
    return { ok: false, text: `${s.npcs[pg.leaderId]?.name ?? pg.name} לא מוכן/ה לוותר על העצמאות.${maybeLeak(s, `${s.player.name} ניסה/תה לתווך איחוד בין ${pk.short} ל${pg.short} – ונכשל/ה`)}` };
  }
  const goneName = pg.name;
  const gain = synergy(pk, pg);
  mergeParties(s, keep, gone, 'fair');
  for (const id of [pk.leaderId]) {
    changeAttitude(s, id, 8, { spread: false });
    addMemory(s, id, 'תיווך/ה את האיחוד שלנו', 6);
  }
  addStat(s, 'fame', 2);
  addNews(s, `איחוד: ${goneName} מצטרפת ל${pk.name}. מאחורי הקלעים – ${s.player.name}`, 'neutral', true, gain < 0.95 ? 'פרשנים: חלק מהבוחרים לא יעברו.' : undefined, 'ערוץ המשכן');
  log(s, `תיווכת איחוד בין ${pk.name} ל${goneName}.`, 'career');
  return { ok: true, text: `${goneName} ו${pk.name} ירוצו יחד. התיווך שלך נזקף לזכותך.` };
}

// ---------------- לשכנע ח"כ / דמות להקים מפלגה ----------------

export function urgeFoundBlocked(s: GameState, id: string): string | null {
  const c = common(s, 'found');
  if (c) return c;
  const n = s.npcs[id];
  if (!n || n.role === 'journalist' || n.role === 'lobbyist') return 'לא דמות פוליטית';
  if (leadsParty(s, id)) return 'כבר עומד/ת בראש מפלגה';
  if (n.ministry) return 'שר/ה בממשלה לא יעזוב/תעזוב עכשיו';
  if (n.partyId && n.partyId === s.player.partyId) return 'זה יפלג את המפלגה שלך';
  if (Object.keys(s.parties).length >= 16) return 'אין מקום למפלגה נוספת';
  return cooling(s, `found_${id}`);
}

export function urgeFoundChance(s: GameState, id: string): number {
  const n = s.npcs[id];
  if (!n) return 0;
  const f = foundForecast(s, id);
  const buzz = (s.buzz?.[id] ?? 0) / 100;
  return clamp(0.05 + n.ambition / 250 + f.pct / 25 + buzz * 0.4 + n.attitude / 400 + clout(s) * 0.3, 0.03, 0.85);
}

export function urgeFound(s: GameState, id: string): SwayResult {
  const blocked = urgeFoundBlocked(s, id);
  if (blocked) return { ok: false, text: blocked };
  pay(s, 'found', `found_${id}`);
  const n = s.npcs[id];
  if (!chance(s, urgeFoundChance(s, id))) {
    s.buzz[id] = clamp((s.buzz?.[id] ?? 0) + 10, 0, 100);
    return { ok: false, text: `${n.name}: "אני עוד לא שם." אבל הרעיון נזרע – הבאזז סביבו/ה גדל.${maybeLeak(s, `${s.player.name} דוחף/ת את ${n.name} להקים מפלגה`)}` };
  }
  const from = n.partyId ? s.parties[n.partyId] : null;
  const party = foundByNpc(s, id);
  if (!party) return { ok: false, text: 'המהלך לא יצא לפועל' };
  changeAttitude(s, id, 12, { spread: false });
  addMemory(s, id, 'עודד/ה אותי להקים מפלגה', 8);
  if (from?.leaderId && s.npcs[from.leaderId]) changeAttitude(s, from.leaderId, -10, { spread: false });
  recomputeStability(s);
  log(s, `${n.name} הקים/ה את ${party.name} בעידודך.`, 'career');
  return { ok: true, text: `${n.name} הקים/ה את "${party.name}"${from ? ` ולוקח/ת קולות מ${from.short}` : ''}.` };
}

// ---------------- ערקים: ח"כים שעוברים אליך ----------------

/** מי ילך אחרי הח"כ אם יעבור/תעבור (לפילוג חוקי צריך שליש מהסיעה) */
export function defectGroup(s: GameState, id: string): { group: string[]; needed: number; immediate: boolean } {
  const n = s.npcs[id];
  const mine = myParty(s);
  if (!n?.partyId || !mine) return { group: [], needed: 0, immediate: false };
  const from = s.parties[n.partyId];
  const needed = Math.max(1, Math.ceil(from.seats / 3));
  const mates = Object.values(s.npcs)
    .filter((m) => m.id !== id && m.isMK && m.partyId === from.id && !m.ministry && !leadsParty(s, m.id))
    .filter((m) => ideologyDistance(m.ideology, mine.ideology) < 0.3 && (m.attitude > 15 || (n.friends.includes(m.id) && m.attitude > 0)))
    .sort((a, b) => b.attitude - a.attitude);
  const group = n.isMK ? [id, ...mates.slice(0, Math.max(0, needed - 1)).map((m) => m.id)] : [id];
  return { group, needed, immediate: n.isMK && group.length >= needed };
}

export function courtDefectorBlocked(s: GameState, id: string): string | null {
  const c = common(s, 'defect');
  if (c) return c;
  const mine = myParty(s);
  if (!mine) return 'צריך מפלגה משלך';
  if (mine.leaderId !== 'player' && s.player.partyStanding < 50) return 'צריך מעמד 50 במפלגה (או להיות היו"ר)';
  const n = s.npcs[id];
  if (!n || (n.role !== 'mk' && n.role !== 'candidate')) return 'לא דמות פוליטית';
  if (n.partyId === mine.id) return 'כבר במפלגה שלך';
  if (n.pledgedTo === mine.id) return 'כבר התחייב/ה לרוץ איתך';
  if (leadsParty(s, id)) return 'עומד/ת בראש מפלגה – זה כבר איחוד';
  if (n.ministry) return 'שר/ה בממשלה – קודם יצטרך/תצטרך להתפטר';
  return cooling(s, `defect_${id}`);
}

export function courtDefectorChance(s: GameState, id: string): number {
  const n = s.npcs[id];
  const mine = myParty(s);
  if (!n || !mine) return 0;
  const from = n.partyId ? s.parties[n.partyId] : null;
  const dist = ideologyDistance(n.ideology, mine.ideology);
  const better = from ? clamp((mine.poll - from.poll) / 30, -0.15, 0.2) : 0.1;
  const unhappy = from && s.npcs[from.leaderId] ? clamp(-(n.primaryStrength - 50) / 200, -0.1, 0.15) : 0.05;
  const loyal = n.traits.includes('loyal') ? -0.15 : n.traits.includes('opportunist') ? 0.12 : 0;
  return clamp(0.08 + n.attitude / 220 - dist * 1.4 + better + unhappy + loyal + clout(s) * 0.4, 0.03, 0.8);
}

/** מצטרפ/ת: אם מביא/ה שליש מהסיעה – עוברים מיד (פילוג חוקי); אחרת – התחייבות לרוץ איתך בבחירות הבאות */
export function courtDefector(s: GameState, id: string): SwayResult {
  const blocked = courtDefectorBlocked(s, id);
  if (blocked) return { ok: false, text: blocked };
  pay(s, 'defect', `defect_${id}`);
  const n = s.npcs[id];
  const mine = myParty(s)!;
  if (!chance(s, courtDefectorChance(s, id))) {
    changeAttitude(s, id, -4, { spread: false });
    return { ok: false, text: `${n.name}: "אני נשאר/ת בבית שלי."${maybeLeak(s, `${s.player.name} ניסה/תה לגנוב את ${n.name}`)}` };
  }
  const from = n.partyId ? s.parties[n.partyId] : null;
  const { group, immediate } = defectGroup(s, id);
  changeAttitude(s, id, 10, { spread: false });
  addMemory(s, id, 'הביא/ה אותי למפלגה', 6);
  if (from && s.npcs[from.leaderId]) changeAttitude(s, from.leaderId, -12, { spread: false });
  if (immediate && from) {
    restoreNorwegian(s);
    for (const g of group) moveTo(s, s.npcs[g], mine);
    recountSeats(s);
    // ח"כים שעברו בין גושים משנים את הקואליציה
    recomputeStability(s);
    const names = group.map((g) => s.npcs[g].name);
    addNews(s, `פילוג ב${from.name}: ${names.join(', ')} עוברים ל${mine.name}`, 'good', true, `המהלך של ${s.player.name}.`, 'ערוץ המשכן');
    log(s, `${names.length} ח"כים עברו מ${from.name} ל${mine.name}.`, 'career');
    return { ok: true, text: group.length > 1 ? `${names.join(', ')} – ${group.length} ח"כים עוברים אליך בפילוג חוקי!` : `${n.name} עובר/ת אליך מיד.` };
  }
  // אין שליש: מתחייב/ת לרוץ איתך בבחירות הבאות (ועד אז נשאר/ת בסיעה)
  n.pledgedTo = mine.id;
  if (!n.isMK) {
    moveTo(s, n, mine);
    addNews(s, `${n.name} מצטרף/ת ל${mine.name}`, 'good', true);
    return { ok: true, text: `${n.name} מצטרף/ת לרשימה שלך.` };
  }
  addNews(s, `${n.name} סיכם/ה עם ${mine.short}: ירוץ/תרוץ איתם בבחירות הבאות`, 'neutral', true, from ? `ב${from.short} זועמים.` : undefined);
  return { ok: true, text: `${n.name} התחייב/ה לרוץ איתך בבחירות הבאות. עד אז, החוק לא מאפשר לעבור בלי שליש מהסיעה.` };
}

function moveTo(s: GameState, n: Npc, to: Party) {
  for (const p of Object.values(s.parties)) p.list = p.list.filter((x) => x !== n.id);
  n.partyId = to.id;
  delete n.pledgedTo;
  // אחרי היו"ר והמקומות השמורים – באמצע הרשימה הריאלית
  const pos = clamp(Math.round(to.list.length / 2), 1, to.list.length);
  to.list.splice(pos, 0, n.id);
}

/** בבחירות: מי שהתחייב/ה עובר/ת לרשימה החדשה */
export function applyPledges(s: GameState) {
  for (const n of Object.values(s.npcs)) {
    if (!n.pledgedTo) continue;
    const to = s.parties[n.pledgedTo];
    if (!to || leadsParty(s, n.id)) {
      delete n.pledgedTo;
      continue;
    }
    moveTo(s, n, to);
  }
}

// ---------------- מרד נגד יו"ר של מפלגה אחרת ----------------

export function oustTarget(s: GameState, partyId: string): Npc | null {
  const p = s.parties[partyId];
  if (!p || p.leaderId === 'player') return null;
  return successors(s, partyId, p.leaderId).find((n) => n.isMK || n.notable) ?? null;
}

export function oustBlocked(s: GameState, partyId: string): string | null {
  const c = common(s, 'oust');
  if (c) return c;
  const p = s.parties[partyId];
  if (!p) return 'מפלגה לא קיימת';
  if (p.id === s.player.partyId) return 'במפלגה שלך – "להתמודד על ראשות המפלגה"';
  if (p.leaderId === 'player' || !s.npcs[p.leaderId]) return 'אין יו"ר להדיח';
  if (!oustTarget(s, partyId)) return 'אין מי שיוביל/תוביל מרד';
  if (s.negotiation) return 'באמצע משא ומתן קואליציוני';
  return cooling(s, `oust_${partyId}`);
}

export function oustChance(s: GameState, partyId: string): number {
  const p = s.parties[partyId];
  const ch = oustTarget(s, partyId);
  if (!p || !ch) return 0;
  const slump = clamp((p.base - p.poll) / 10, -0.1, 0.25); // יו"ר שמפסיד/ה מנדטים – פגיע/ה
  const pm = s.coalition.pmId === p.leaderId ? -0.12 : 0;
  return clamp(0.05 + slump + ch.ambition / 400 + ch.attitude / 400 + clout(s) * 0.35 + pm - att(s, p.leaderId) / 500, 0.03, 0.7);
}

export function oustLeader(s: GameState, partyId: string): SwayResult {
  const blocked = oustBlocked(s, partyId);
  if (blocked) return { ok: false, text: blocked };
  pay(s, 'oust', `oust_${partyId}`);
  const p = s.parties[partyId];
  const old = s.npcs[p.leaderId];
  const ch = oustTarget(s, partyId)!;
  if (!chance(s, oustChance(s, partyId))) {
    changeAttitude(s, old.id, -15, { spread: false });
    addMemory(s, old.id, 'ניסה/תה להדיח אותי', -10);
    return { ok: false, text: `המרד ב${p.short} דוכא. ${old.name} יודע/ת מי עמד/ה מאחוריו.${maybeLeak(s, `${s.player.name} מאחורי ניסיון ההדחה ב${p.short}`)}` };
  }
  installLeader(s, partyId, ch.id, 'מרד פנימי');
  changeAttitude(s, ch.id, 15, { spread: false });
  addMemory(s, ch.id, 'עזר/ה לי להגיע לראשות המפלגה', 10);
  changeAttitude(s, old.id, -20, { spread: false });
  recomputeStability(s);
  addNews(s, `מהפך ב${p.name}: ${ch.name} מדיח/ה את ${old.name}`, 'neutral', true, `השמועות: ${s.player.name} משך/ה בחוטים.`, 'ערוץ המשכן');
  log(s, `עזרת ל${ch.name} להדיח את ${old.name} מראשות ${p.name}.`, 'career');
  return { ok: true, text: `${ch.name} הוא/היא היו"ר החדש/ה של ${p.short}, וחייב/ת לך.` };
}
