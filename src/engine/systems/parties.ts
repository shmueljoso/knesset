import { rand } from '../rng';
import type { GameState, Npc, Party } from '../types';
import { clamp, ideologyDistance, newId } from '../util';
import { partyMKs } from './government';
import { addNews } from './news';
import { playerElectoralAppeal } from './opinion';
import { changeAttitude } from './relationships';
import { log } from './report';

export const FOUND_COST = 150; // אלפי ₪: רישום אצל רשם המפלגות, אגרה ומטה ראשוני

type Result = { ok: boolean; text: string };

function partyPenalty(s: GameState, oldId: string, scale: number) {
  const old = s.parties[oldId];
  for (const n of Object.values(s.npcs)) {
    if (n.partyId !== oldId) continue;
    changeAttitude(s, n.id, (n.id === old.leaderId ? -45 : -18) * scale, { spread: false });
  }
}

/** עזיבת מפלגה שלא כח"כ: פגיעה במוניטין שגדלה עם כל מעבר נוסף. */
function leaveAsMember(s: GameState, newPartyId: string | null): string[] {
  const p = s.player;
  const notes: string[] = [];
  if (!p.partyId) return notes;
  const old = s.parties[p.partyId];
  const recent = s.week - p.memberSince < 52;
  const repLoss = 4 + (recent ? 6 : 0) + p.partySwitches * 2;
  p.reputation = clamp(p.reputation - repLoss, 0, 100);
  partyPenalty(s, old.id, 0.6);
  if (newPartyId) {
    const dist = ideologyDistance(old.ideology, s.parties[newPartyId].ideology);
    p.consistency = clamp(p.consistency - dist * 45, 0, 100);
    if (dist > 0.25) notes.push('מעבר חד אידיאולוגית פגע בעקביות שלך.');
  }
  if (p.employerId && s.npcs[p.employerId]?.partyId === old.id) {
    changeAttitude(s, p.employerId, -30);
    notes.push(`${s.npcs[p.employerId].name} פיטר/ה אותך מהלשכה.`);
    p.employerId = null;
  }
  old.list = old.list.filter((id) => id !== 'player');
  p.partySwitches += 1;
  p.listPosition = null;
  p.wantsList = false;
  p.primariesScore = 0;
  notes.unshift(`מוניטין -${repLoss}`);
  return notes;
}

export function joinParty(s: GameState, partyId: string): Result {
  const p = s.player;
  const party = s.parties[partyId];
  if (!party) return { ok: false, text: 'מפלגה לא קיימת' };
  if (p.partyId === partyId) return { ok: false, text: 'אתה כבר חבר במפלגה הזו' };
  if (p.isMK) return { ok: false, text: 'ח"כ לא יכול לעבור סיעה באמצע כנסת – רק פילוג (שליש מהסיעה) או פרישה.' };
  const notes = leaveAsMember(s, partyId);
  p.partyId = partyId;
  p.memberSince = s.week;
  p.partyStanding = clamp(8 + p.reputation * 0.15 + p.fame * 0.1, 0, 100);
  if (p.rank === 'citizen' || p.rank === 'candidate') p.rank = 'activist';
  if (p.rank === 'aide' && !p.employerId) p.rank = 'activist';
  for (const n of Object.values(s.npcs)) if (n.partyId === partyId) changeAttitude(s, n.id, 4, { spread: false });
  if (p.fame > 15) addNews(s, `${p.name} מצטרף/ת ל${party.name}`, 'neutral', true);
  log(s, `הצטרפת ל${party.name}.`, 'career');
  if (p.defector && party.inOutgoingKnesset) notes.push('שים לב: כ"פורש" לא תוכל לרוץ ברשימה הזו בבחירות הקרובות.');
  return { ok: true, text: [`הצטרפת ל${party.name}.`, ...notes].join(' ') };
}

export function leaveParty(s: GameState): Result {
  const p = s.player;
  if (!p.partyId) return { ok: false, text: 'אינך חבר במפלגה' };
  if (p.isMK) return { ok: false, text: 'כח"כ – השתמש בפרישה או בפילוג' };
  const name = s.parties[p.partyId].name;
  const notes = leaveAsMember(s, null);
  p.partyId = null;
  if (p.rank === 'activist' || p.rank === 'aide') p.rank = 'citizen';
  log(s, `עזבת את ${name}.`, 'career');
  return { ok: true, text: [`עזבת את ${name}.`, ...notes].join(' ') };
}

/** ח"כים בסיעה שמוכנים ללכת אחרי השחקן, ומספר הנדרשים לפילוג חוקי (שליש). */
export function splitInfo(s: GameState): { followers: Npc[]; needed: number; seats: number } {
  const p = s.player;
  if (!p.isMK || !p.partyId || s.parties[p.partyId].leaderId === 'player') return { followers: [], needed: 0, seats: 0 };
  const party = s.parties[p.partyId];
  const followers = partyMKs(s, party.id)
    .filter((id) => id !== 'player' && id !== party.leaderId)
    .map((id) => s.npcs[id])
    .filter((n) => n.attitude >= 55 && n.trust >= 40);
  return { followers, needed: Math.ceil(party.seats / 3), seats: party.seats };
}

function makePlayerParty(s: GameState, name: string, color: string, seats: number): Party {
  const id = newId(s, 'pp');
  const party: Party = {
    id,
    name,
    short: name.split(' ')[0],
    color,
    ideology: { ...s.player.ideology },
    leaderId: 'player',
    seats,
    poll: 0,
    base: 0,
    primaries: false,
    sectors: {},
    list: ['player'],
    playerFounded: true,
    foundedWeek: s.week,
    inOutgoingKnesset: seats > 0,
  };
  s.parties[id] = party;
  s.player.partyId = id;
  s.player.memberSince = s.week;
  s.player.partyStanding = 100;
  s.player.listPosition = 1;
  s.player.wantsList = true;
  party.poll = Math.max(0.5, playerElectoralAppeal(s));
  party.base = party.poll;
  return party;
}

/** פילוג חוקי: לפחות שליש מהסיעה עוזב יחד ומקים סיעה חדשה. */
export function splitFaction(s: GameState, name: string, color: string): Result {
  const info = splitInfo(s);
  const p = s.player;
  if (!p.partyId) return { ok: false, text: 'אינך בסיעה' };
  const group = info.followers.slice(0, Math.max(info.needed - 1, info.followers.length));
  if (group.length + 1 < info.needed) return { ok: false, text: `לפילוג חוקי צריך ${info.needed} ח"כים (כולל אותך). יש לך ${group.length + 1}.` };
  const old = s.parties[p.partyId];
  partyPenalty(s, old.id, 1.2);
  p.reputation = clamp(p.reputation - 8, 0, 100);
  p.consistency = clamp(p.consistency - 5, 0, 100);
  p.partySwitches += 1;
  old.list = old.list.filter((id) => id !== 'player' && !group.some((g) => g.id === id));
  old.seats -= group.length + 1;
  const party = makePlayerParty(s, name, color, group.length + 1);
  for (const g of group) {
    g.partyId = party.id;
    party.list.push(g.id);
  }
  // העברת מושבים במליאה: הסיעה החדשה יושבת יחד
  s.seating = [...s.seating.filter((id) => id !== 'player' && !group.some((g) => g.id === id)), 'player', ...group.map((g) => g.id)];
  addNews(s, `פילוג ב${old.name}: ${p.name} ועוד ${group.length} ח"כים מקימים את "${name}"`, 'neutral', true);
  log(s, `פילוג חוקי: הקמת את סיעת ${name}.`, 'career');
  return { ok: true, text: `הפילוג אושר בוועדת הכנסת. ${name} היא סיעה עם ${group.length + 1} מנדטים.` };
}

/** פרישה יחידנית ("פורש"): לא ניתן להתמנות לשר בכנסת הזו ולא לרוץ ברשימה של סיעה קיימת בבחירות הבאות. */
export function defect(s: GameState): Result {
  const p = s.player;
  if (!p.isMK || !p.partyId) return { ok: false, text: 'רק ח"כ בסיעה יכול לפרוש' };
  if (s.parties[p.partyId].leaderId === 'player') return { ok: false, text: 'את/ה יו"ר הסיעה – אי אפשר לפרוש ממנה' };
  const old = s.parties[p.partyId];
  partyPenalty(s, old.id, 1.6);
  p.reputation = clamp(p.reputation - 18, 0, 100);
  p.consistency = clamp(p.consistency - 10, 0, 100);
  p.partyStanding = 0;
  p.partySwitches += 1;
  p.defector = true;
  old.seats -= 1;
  old.list = old.list.filter((id) => id !== 'player');
  p.partyId = null;
  p.listPosition = null;
  addNews(s, `${p.name} פורש/ת מ${old.name} ונשאר/ת ח"כ יחיד/ה`, 'bad', true);
  log(s, `פרשת מ${old.name}. הוכרזת כ"פורש".`, 'career');
  return { ok: true, text: 'פרשת מהסיעה. ועדת הכנסת הכריזה עליך כ"פורש": לא תוכל להתמנות לשר בכנסת הזו, ולא לרוץ ברשימה של סיעה קיימת בבחירות הבאות. מפלגה חדשה – מותר.' };
}

export function foundParty(s: GameState, name: string, color: string): Result {
  const p = s.player;
  if (!name.trim()) return { ok: false, text: 'צריך שם למפלגה' };
  if (p.money < FOUND_COST) return { ok: false, text: `נדרשים ${FOUND_COST} אלף ₪ לרישום ולהקמת מטה` };
  if (p.isMK && p.partyId) return { ok: false, text: 'כח"כ בסיעה – קודם פילוג או פרישה' };
  if (Object.values(s.parties).some((x) => x.playerFounded && x.id === p.partyId)) return { ok: false, text: 'כבר יש לך מפלגה' };
  const notes = p.partyId ? leaveAsMember(s, null) : [];
  p.money -= FOUND_COST;
  const party = makePlayerParty(s, name.trim(), color, p.isMK ? 1 : 0);
  if (p.isMK) s.seating = [...s.seating.filter((id) => id !== 'player'), 'player'];
  p.rank = p.isMK ? p.rank : 'candidate';
  addNews(s, `${p.name} מקים/ה מפלגה חדשה: "${party.name}"`, 'neutral', true);
  log(s, `הקמת את ${party.name}. נרשמה אצל רשם המפלגות.`, 'career');
  return { ok: true, text: [`"${party.name}" נרשמה אצל רשם המפלגות. אתה עומד/ת בראשה.`, ...notes].join(' ') };
}

/** גיוס מועמד/ת לרשימה של מפלגת השחקן. */
export function recruitCandidate(s: GameState): Result {
  const p = s.player;
  const party = p.partyId ? s.parties[p.partyId] : null;
  if (!party?.playerFounded) return { ok: false, text: 'רק למפלגה שהקמת' };
  const pool = Object.values(s.npcs)
    .filter((n) => n.role === 'candidate' && !party.list.includes(n.id))
    .filter((n) => ideologyDistance(n.ideology, p.ideology) < 0.3 && n.attitude > -10)
    .sort((a, b) => b.attitude + b.influence - (a.attitude + a.influence));
  const target = pool[Math.floor(rand(s) * Math.min(5, pool.length))];
  if (!target) return { ok: false, text: 'לא נמצאו מועמדים מתאימים כרגע' };
  const pr = clamp(0.3 + target.attitude / 150 + p.reputation / 200 + party.poll / 30, 0.1, 0.9);
  if (rand(s) > pr) return { ok: false, text: `${target.name} לא השתכנע/ה להצטרף.` };
  if (target.partyId) s.parties[target.partyId].list = s.parties[target.partyId].list.filter((x) => x !== target.id);
  target.partyId = party.id;
  party.list.push(target.id);
  changeAttitude(s, target.id, 15);
  return { ok: true, text: `${target.name} מצטרף/ת לרשימה במקום ה-${party.list.length}!` };
}

/** התמודדות על ראשות המפלגה מול היו"ר המכהן. */
export function leadershipBlocked(s: GameState): string | null {
  const p = s.player;
  const party = p.partyId ? s.parties[p.partyId] : null;
  if (!party) return 'צריך מפלגה';
  if (party.leaderId === 'player') return 'את/ה כבר יו"ר המפלגה';
  if (!p.isMK) return 'רק ח"כ יכול להתמודד על ראשות המפלגה';
  if (p.partyStanding < 60) return 'נדרש מעמד במפלגה 60+';
  if (p.fame < 30) return 'נדרשת מוכרות 30+';
  if (p.money < 60) return 'קמפיין פנימי עולה 60 אלף ₪';
  return null;
}

export function challengeLeader(s: GameState): Result {
  const blocked = leadershipBlocked(s);
  if (blocked) return { ok: false, text: blocked };
  const p = s.player;
  const party = s.parties[p.partyId!];
  const leader = s.npcs[party.leaderId];
  p.money -= 60;
  const supporters = partyMKs(s, party.id).filter((id) => id !== 'player' && s.npcs[id] && s.npcs[id].attitude >= 40).length;
  const mine = p.partyStanding * 0.5 + p.fame * 0.3 + p.reputation * 0.2 + supporters * 2 + rand(s) * 15;
  const theirs = 45 + (leader?.influence ?? 50) * 0.25 + (s.coalition.pmId === leader?.id ? 10 : 0) + rand(s) * 15;
  if (mine > theirs) {
    party.leaderId = 'player';
    party.list = ['player', ...party.list.filter((id) => id !== 'player')];
    p.listPosition = 1;
    p.partyStanding = 95;
    p.fame = clamp(p.fame + 8, 0, 100);
    if (leader) {
      changeAttitude(s, leader.id, -70);
      leader.influence = clamp(leader.influence - 20, 0, 100);
    }
    if (!p.achievements.includes('leader')) p.achievements.push('leader');
    addNews(s, `רעידת אדמה ב${party.name}: ${p.name} ניצח/ה את ${leader?.name ?? 'היו"ר'} ונבחר/ה ליו"ר`, 'good', true);
    log(s, `נבחרת ליו"ר ${party.name}!`, 'career');
    return { ok: true, text: `ניצחת! את/ה יו"ר ${party.name}. בבחירות הבאות – מועמד/ת לראשות הממשלה.` };
  }
  p.partyStanding = clamp(p.partyStanding - 25, 0, 100);
  p.reputation = clamp(p.reputation - 5, 0, 100);
  if (leader) changeAttitude(s, leader.id, -45);
  addNews(s, `${leader?.name ?? 'היו"ר'} הביס/ה את ${p.name} בהתמודדות על ראשות ${party.short}`, 'bad', true);
  return { ok: false, text: 'הפסדת. היו"ר לא ישכח את הניסיון.' };
}
