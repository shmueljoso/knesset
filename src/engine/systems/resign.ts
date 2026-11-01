// התפטרויות וביטולים: כל תפקיד שיש לשחקן – ומה קורה אם עוזבים אותו. מקום אחד לכולם.
import { addStat } from '../stats';
import type { GameState } from '../types';
import { clamp } from '../util';
import { playerPartyQuits } from './coalition';
import { resignBlocked, resignPremiership, stepDownBlocked, stepDownLeader } from './figures';
import { isCoalition } from './government';
import { resignMinistry } from './ministry';
import { addNews } from './news';
import { defect, leaveParty } from './parties';
import { isPresident, vacatePlayerSeat, withdrawCandidacy } from './presidency';
import { PROJECT_INFO } from './projects';
import { restoreNorwegian } from './regime';
import { log } from './report';
import { recountSeats } from './seats';

export interface Role {
  id: string;
  icon: string;
  title: string;
  /** מה יקרה אם עוזבים */
  effect: string;
  blocked: string | null;
  danger?: boolean;
}

export interface Result {
  ok: boolean;
  text: string;
}

const party = (s: GameState) => (s.player.partyId ? s.parties[s.player.partyId] ?? null : null);

/** כל התפקידים וההתחייבויות של השחקן כרגע */
export function playerRoles(s: GameState): Role[] {
  const p = s.player;
  const my = party(s);
  const out: Role[] = [];
  if (isPresident(s))
    out.push({ id: 'presidency', icon: '🏛️', title: 'נשיא/ת המדינה', effect: 'הכנסת תבחר נשיא/ה חדש/ה תוך כמה שבועות. את/ה חוזר/ת לחיים האזרחיים, ומותר לחזור לפוליטיקה.', blocked: null, danger: true });
  if (s.coalition.pmId === 'player')
    out.push({ id: 'pm', icon: '👑', title: 'ראש/ת הממשלה', effect: 'השרביט עובר לראש הסיעה הגדולה בקואליציה, בלי בחירות. את/ה נשאר/ת ח"כ.', blocked: resignBlocked(s), danger: true });
  if (my && my.leaderId === 'player')
    out.push({ id: 'leader', icon: '🪑', title: `יו"ר ${my.name}`, effect: 'היורש/ת מהרשימה נכנס/ת. אם המפלגה מובילה את הממשלה – גם ראשות הממשלה עוברת.', blocked: stepDownBlocked(s) });
  if (p.ministry && p.ministry !== 'pm' && s.coalition.pmId !== 'player')
    out.push({ id: 'ministry', icon: '🗂️', title: 'שר/ה בממשלה', effect: 'התיק עובר לח"כ אחר מהמפלגה. הציבור מעריך מי שמוותר על כיסא.', blocked: null });
  if (my && my.leaderId === 'player' && isCoalition(s, my.id) && s.coalition.pmId !== 'player')
    out.push({ id: 'coalition', icon: '🚪', title: `${my.short} בקואליציה`, effect: 'המפלגה עוזבת את הממשלה, וכל השרים שלה מתפטרים. ראש הממשלה לא ישכח.', blocked: null, danger: true });
  for (const c of s.committees.filter((c) => c.chairId === 'player'))
    out.push({ id: `chair:${c.id}`, icon: '⚖️', title: `יו"ר ${c.name}`, effect: 'הראשות עוברת לח"כ אחר מהקואליציה. נשאר/ת חבר/ת בוועדה.', blocked: null });
  if (p.isMK)
    out.push({ id: 'knesset', icon: '🏛️', title: 'חבר/ת כנסת', effect: 'הבא/ה ברשימה נכנס/ת במקומך. החוקים הפרטיים שלך נופלים. נשאר/ת במפלגה ואפשר לרוץ שוב בבחירות הבאות.', blocked: s.coalition.pmId === 'player' ? 'ראש הממשלה חייב/ת להיות ח"כ – קודם להתפטר מראשות הממשלה' : null, danger: true });
  if (!p.isMK && p.wantsList)
    out.push({ id: 'list', icon: '🗳️', title: 'מועמד/ת ברשימה לכנסת', effect: 'לא תרוץ/י בבחירות הקרובות. דמי ההרשמה לא חוזרים.', blocked: s.week >= s.primariesWeek ? 'הרשימות כבר הוגשו' : null });
  if (s.presCampaign)
    out.push({ id: 'campaign', icon: '🎗️', title: 'מועמד/ת לנשיאות', effect: 'פורש/ת מהמרוץ. המוניטין נפגע מעט.', blocked: null });
  if (p.employerId && s.npcs[p.employerId])
    out.push({ id: 'aide', icon: '📎', title: `עוזר/ת של ${s.npcs[p.employerId].name}`, effect: 'עוזב/ת את הלשכה. הח"כ לא ישמח/תשמח.', blocked: null });
  if (my && my.leaderId !== 'player')
    out.push(
      p.isMK
        ? { id: 'party', icon: '🔀', title: `חבר/ת ${my.name}`, effect: 'פרישה מהסיעה: הכרזה כ"פורש" – בלי מינוי לשר בכנסת הזו, ובלי ריצה ברשימה קיימת בבחירות הבאות.', blocked: null, danger: true }
        : { id: 'party', icon: '🔀', title: `חבר/ת ${my.name}`, effect: 'עוזב/ת את המפלגה. המוניטין נפגע מעט.', blocked: null },
    );
  return out;
}

/** דברים שהתחלת ואפשר לבטל */
export function cancellables(s: GameState): Role[] {
  const out: Role[] = [];
  for (const b of s.bills.filter((b) => b.sponsor === 'player' && b.stage !== 'passed' && b.stage !== 'failed'))
    out.push({ id: `bill:${b.id}`, icon: '📜', title: `הצעת החוק "${b.title}"`, effect: 'ההצעה יורדת מסדר היום. מי שתמך/ה בה יתאכזב/תתאכזב.', blocked: s.liveVote?.billId === b.id ? 'באמצע הצבעה' : null });
  for (const pr of s.projects ?? [])
    out.push({ id: `project:${pr.id}`, icon: PROJECT_INFO[pr.kind].icon, title: `מיזם: ${PROJECT_INFO[pr.kind].name}`, effect: `עוצר/ת את המיזם (נשארו ${Math.max(0, pr.start + pr.weeks - s.week)} שבועות). הכסף שהושקע לא חוזר.`, blocked: null });
  return out;
}

export function resignRole(s: GameState, id: string): Result {
  const role = [...playerRoles(s), ...cancellables(s)].find((r) => r.id === id);
  if (!role) return { ok: false, text: 'התפקיד כבר לא שלך' };
  if (role.blocked) return { ok: false, text: role.blocked };
  const [kind, ref] = id.split(':');
  switch (kind) {
    case 'presidency':
      return resignPresidency(s);
    case 'pm':
      return resignPremiership(s);
    case 'leader':
      return stepDownLeader(s);
    case 'ministry':
      return { ok: true, text: resignMinistry(s) };
    case 'coalition':
      return { ok: true, text: playerPartyQuits(s) };
    case 'chair':
      return resignChair(s, ref);
    case 'knesset':
      return resignKnesset(s);
    case 'list':
      s.player.wantsList = false;
      s.player.listPosition = null;
      s.player.primariesScore = 0;
      for (const q of Object.values(s.parties)) if (q.leaderId !== 'player') q.list = q.list.filter((x) => x !== 'player');
      log(s, 'משכת את המועמדות לרשימה.', 'career');
      return { ok: true, text: 'משכת את המועמדות. הפעם בלי לרוץ.' };
    case 'campaign':
      return withdrawCandidacy(s);
    case 'aide': {
      const boss = s.npcs[s.player.employerId!];
      s.player.employerId = null;
      if (s.player.rank === 'aide') s.player.rank = s.player.partyId ? 'activist' : 'citizen';
      if (boss) {
        boss.attitude = clamp(boss.attitude - 10, -100, 100);
        log(s, `עזבת את הלשכה של ${boss.name}.`, 'career');
      }
      return { ok: true, text: 'עזבת את הלשכה. מעכשיו – על דעת עצמך.' };
    }
    case 'party':
      return s.player.isMK ? defect(s) : leaveParty(s);
    case 'bill':
      return withdrawBill(s, ref);
    case 'project':
      return cancelProject(s, ref);
  }
  return { ok: false, text: 'לא ידוע' };
}

/** התפטרות מהכנסת: הבא/ה ברשימה נכנס/ת. שר/ה ויו"ר מפלגה יכולים להמשיך גם בלי מושב */
export function resignKnesset(s: GameState): Result {
  const p = s.player;
  if (!p.isMK) return { ok: false, text: 'את/ה לא ח"כ' };
  if (s.coalition.pmId === 'player') return { ok: false, text: 'ראש הממשלה חייב/ת להיות ח"כ' };
  restoreNorwegian(s);
  if (!p.isMK) {
    recountSeats(s);
    return { ok: true, text: 'השר/ה שפינה לך את המושב חזר/ה לכנסת – וכבר לא היית ח"כ.' };
  }
  vacatePlayerSeat(s);
  p.isMK = false;
  p.committees = [];
  for (const c of s.committees) c.members = c.members.filter((m) => m !== 'player');
  for (const c of s.caucuses) c.members = c.members.filter((m) => m !== 'player');
  for (const b of s.bills) {
    if (b.sponsor === 'player' && b.stage !== 'passed' && b.stage !== 'failed' && !b.govPosition) {
      b.stage = 'failed';
      b.history.push({ week: s.week, text: 'ההצעה נפלה: המגיש/ה התפטר/ה מהכנסת.' });
    }
  }
  p.listPosition = null;
  p.wantsList = false;
  if (p.rank === 'mk' || p.rank === 'chair') p.rank = p.partyId ? 'activist' : 'citizen';
  s.flags.leftKnesset = s.week;
  recountSeats(s);
  addStat(s, 'fame', 2);
  const my = party(s);
  addNews(s, `${p.name} מתפטר/ת מהכנסת`, 'neutral', true, my?.leaderId === 'player' ? 'ימשיך/תמשיך להוביל את המפלגה מבחוץ.' : p.ministry ? 'ימשיך/תמשיך לכהן כשר/ה.' : undefined, 'ערוץ המשכן');
  log(s, 'התפטרת מהכנסת.', 'career');
  return { ok: true, text: `התפטרת מהכנסת.${p.ministry ? ' את/ה ממשיך/ה כשר/ה.' : ''}${my?.leaderId === 'player' ? ' את/ה עדיין יו"ר המפלגה.' : ''} אפשר לרוץ שוב בבחירות הבאות.` };
}

export function resignChair(s: GameState, committeeId: string): Result {
  const c = s.committees.find((x) => x.id === committeeId);
  if (!c || c.chairId !== 'player') return { ok: false, text: 'את/ה לא יו"ר הוועדה' };
  const next = c.members.map((m) => s.npcs[m]).find((n) => n?.isMK && n.partyId && s.coalition.parties.includes(n.partyId)) ?? Object.values(s.npcs).find((n) => n.isMK && n.partyId && s.coalition.parties.includes(n.partyId) && !n.ministry);
  if (!next) return { ok: false, text: 'אין מי שיחליף/תחליף' };
  c.chairId = next.id;
  if (!c.members.includes(next.id)) c.members.push(next.id);
  if (s.player.rank === 'chair' && !s.committees.some((x) => x.chairId === 'player')) s.player.rank = 'mk';
  log(s, `פרשת מראשות ${c.name}; ${next.name} מחליף/ה אותך.`, 'career');
  return { ok: true, text: `${next.name} יו"ר ${c.name}. את/ה נשאר/ת חבר/ת ועדה.` };
}

/** התפטרות מהנשיאות: הכנסת בוחרת מחליף/ה, והשחקן חוזר/ת לחיים האזרחיים (ורשאי/ת לחזור לפוליטיקה) */
export function resignPresidency(s: GameState): Result {
  if (!isPresident(s)) return { ok: false, text: 'את/ה לא נשיא/ה' };
  const pr = s.presidency!;
  pr.resignedWeek = s.week;
  s.president = null;
  s.presidentNextWeek = s.week + 3;
  s.player.rank = 'citizen';
  const early = pr.weeks < 104;
  addStat(s, 'reputation', early ? -6 : -2);
  addNews(s, `${s.player.name} מתפטר/ת מנשיאות המדינה`, 'neutral', true, `אחרי ${Math.round((pr.weeks / 52) * 10) / 10} שנים. הכנסת תבחר נשיא/ה חדש/ה בעוד כ-3 שבועות.`, 'ערוץ המשכן');
  log(s, 'התפטרת מנשיאות המדינה.', 'career');
  return { ok: true, text: `התפטרת מהנשיאות${early ? ' – מוקדם, והציבור תוהה למה' : ''}. מעכשיו את/ה אזרח/ית, ואפשר להצטרף למפלגה ולחזור לפוליטיקה.` };
}

export function withdrawBill(s: GameState, billId: string): Result {
  const b = s.bills.find((x) => x.id === billId && x.sponsor === 'player');
  if (!b || b.stage === 'passed' || b.stage === 'failed') return { ok: false, text: 'ההצעה כבר לא פעילה' };
  b.stage = 'failed';
  b.history.push({ week: s.week, text: 'המגיש/ה משך/ה את ההצעה.' });
  for (const n of Object.values(s.npcs)) {
    if (n.pledges.includes(b.id)) {
      n.pledges = n.pledges.filter((x) => x !== b.id);
      n.attitude = clamp(n.attitude - 2, -100, 100);
    }
  }
  log(s, `משכת את הצעת החוק "${b.title}".`, 'action');
  return { ok: true, text: `"${b.title}" ירדה מסדר היום.` };
}

export function cancelProject(s: GameState, projectId: string): Result {
  const pr = (s.projects ?? []).find((x) => x.id === projectId);
  if (!pr) return { ok: false, text: 'המיזם כבר הסתיים' };
  s.projects = s.projects.filter((x) => x.id !== projectId);
  log(s, `עצרת את המיזם: ${PROJECT_INFO[pr.kind].name}.`, 'action');
  return { ok: true, text: `${PROJECT_INFO[pr.kind].icon} ${PROJECT_INFO[pr.kind].name} נעצר.` };
}
