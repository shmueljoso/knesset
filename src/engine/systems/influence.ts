// השפעה שקופה: כמה השחקן שווה למפלגה, איפה הוא ברשימה, ומה כל דמות יכולה לתת לו.
import { BILL_TEMPLATES } from '../data/bills';
import { ISSUES } from '../data/issues';
import type { Caucus, GameState, Ideology, IssueId, Npc, Sector } from '../types';
import { SECTORS, SECTOR_WEIGHTS, avgApproval, clamp, ideologyDistance, leanAlignment, newId } from '../util';
import { addNews } from './news';
import { pollSeats } from './opinion';
import { addMemory, changeAttitude, debtsWith } from './relationships';
import { playerListScore } from './elections';

/** התדמית של השחקן בקרב קהל היעד של המפלגה שלו (0-100) */
export function partyAudienceApproval(s: GameState): number {
  const party = s.player.partyId ? s.parties[s.player.partyId] : null;
  const w = party?.sectors ?? {};
  const keys = Object.keys(w) as Sector[];
  if (!keys.length) return avgApproval(s);
  const total = keys.reduce((a, k) => a + (w[k] ?? 0) * SECTOR_WEIGHTS[k], 0) || 1;
  return keys.reduce((a, k) => a + s.player.approval[k] * (w[k] ?? 0) * SECTOR_WEIGHTS[k], 0) / total;
}

/** כמה אחוזים (ומנדטים) השחקן מוסיף או מוריד למפלגה שלו */
export function playerSeatContribution(s: GameState) {
  const p = s.player;
  const party = p.partyId ? s.parties[p.partyId] : null;
  if (!party || party.playerFounded) return null;
  const audience = partyAudienceApproval(s);
  const fame = p.fame / 100;
  const fromImage = fame * ((audience - 50) / 50) * 3.5;
  const fromConsistency = fame * ((p.consistency - 60) / 100) * 0.6;
  const fromLeader = party.leaderId === 'player' ? fame * 1.5 : 0;
  const pct = fromImage + fromConsistency + fromLeader;
  return { pct, seats: (pct / 100) * 120, audience, fromImage, fromConsistency, fromLeader };
}

/** תחזית מקום ברשימה (בלי מזל) */
export function listForecast(s: GameState) {
  const party = s.player.partyId ? s.parties[s.player.partyId] : null;
  if (!party) return null;
  const realistic = pollSeats(party.poll, s.rules.threshold);
  if (party.leaderId === 'player') return { position: 1, realistic };
  const mine = playerListScore(s);
  const rivals = party.list.filter((id) => id !== 'player' && id !== party.leaderId && s.npcs[id]);
  const ahead = rivals.filter((id) => s.npcs[id].primaryStrength + (s.npcs[id].isMK ? 10 : 0) > mine).length;
  return { position: ahead + 2, realistic };
}

/** מה הדמות יכולה לתת לשחקן – כדי שיהיה ברור למה כדאי להשקיע בקשר */
export function npcBenefits(s: GameState, n: Npc): { text: string; active: boolean }[] {
  const out: { text: string; active: boolean }[] = [];
  const friendly = n.attitude >= 30;
  if (n.isMK) out.push({ text: `קול במליאה בהצבעות על ההצעות שלך (יחס ${n.attitude > 0 ? '+' : ''}${n.attitude} משפיע ישירות)`, active: n.attitude > 0 });
  if (n.partyId && n.partyId === s.player.partyId && s.parties[n.partyId].leaderId === n.id)
    out.push({ text: 'יו"ר המפלגה: קובע/ת שריון ברשימה ומחלק/ת תיקים – היחס שלו/ה הוא חצי מהציון שלך ברשימה', active: friendly });
  else if (n.partyId && n.partyId === s.player.partyId && n.influence >= 50)
    out.push({ text: `בכיר/ה במפלגה: תמיכה פומבית ברשימה = +${Math.round(n.influence / 8)} לציון שלך`, active: n.attitude >= 35 });
  const chairOf = s.committees.find((c) => c.chairId === n.id);
  if (chairOf) out.push({ text: `יו"ר ${chairOf.name}: קובע/ת אם הצעות שלך יעלו לדיון`, active: friendly });
  if (n.ministry === 'justice') out.push({ text: 'יו"ר ועדת השרים לחקיקה: משפיע/ה על עמדת הממשלה בהצעות שלך', active: friendly });
  if (n.ministry === 'finance') out.push({ text: 'שר/ת האוצר: תוספות תקציב וכספים קואליציוניים', active: friendly });
  if (n.ministry === 'pm') out.push({ text: 'ראש הממשלה: מינויים, פיטורים והחלטות ממשלה', active: friendly });
  if (n.role === 'journalist') out.push({ text: 'עיתונאי/ת ידידותי/ת מגביר/ה כל פעולת תקשורת שלך (עוין/ת – מחליש/ה)', active: friendly });
  if (n.role === 'lobbyist') out.push({ text: 'כסף לקמפיינים – במחיר סיכון לחקירה', active: friendly });
  if (n.isMK && n.influence >= 55) out.push({ text: `הופעה משותפת: מעבירה לך תדמית בקהל של ${n.partyId ? s.parties[n.partyId].short : 'הדמות'}`, active: n.attitude >= 30 });
  if (debtsWith(s, n.id, 'owes_player').length) out.push({ text: 'חייב/ת לך טובה – אפשר לגבות (הון פוליטי)', active: true });
  if (n.attitude <= -45) out.push({ text: '⚠️ יריב/ה מר/ה: עלול/ה להדליף נגדך או לחבל בהצעות שלך', active: false });
  return out;
}

// ---------- אינטראקציות חדשות ----------

export function jointBlocked(s: GameState, n: Npc): string | null {
  if (n.attitude < 30) return 'צריך יחס 30+';
  if (!n.isMK && n.role !== 'journalist') return 'רק עם ח"כים או עיתונאים';
  if (s.week - Number(s.flags[`joint_${n.id}`] ?? -99) < 8) return 'הופעתם יחד לאחרונה';
  return null;
}

export function jointAppearance(s: GameState, n: Npc): string {
  s.flags[`joint_${n.id}`] = s.week;
  const p = s.player;
  if (n.role === 'journalist') {
    p.fame = clamp(p.fame + 3, 0, 100);
    addMemory(s, n.id, 'ראיון בלעדי משותף', 3);
    return 'ראיון עומק בתכנית שלו/ה. מוכרות +3.';
  }
  const party = n.partyId ? s.parties[n.partyId] : null;
  const gain = n.influence / 30;
  const secs = (Object.keys(party?.sectors ?? {}) as Sector[]).slice(0, 3);
  for (const sec of secs.length ? secs : SECTORS) p.approval[sec] = clamp(p.approval[sec] + gain, 0, 100);
  p.fame = clamp(p.fame + n.influence / 40, 0, 100);
  const far = ideologyDistance(n.ideology, p.ideology) > 0.35;
  if (far) {
    p.consistency = clamp(p.consistency - 3, 0, 100);
    p.partyStanding = clamp(p.partyStanding - 2, 0, 100);
  }
  changeAttitude(s, n.id, 3, { public: true });
  addMemory(s, n.id, 'הופענו יחד בכנס', 3);
  return `הופעתם יחד. תדמית +${gain.toFixed(1)} בקהל של ${party?.short ?? 'הדמות'}${far ? '. הבסיס שלך הרים גבה (עקביות −3).' : '.'}`;
}

export function recruitBlocked(s: GameState, n: Npc): string | null {
  const party = s.player.partyId ? s.parties[s.player.partyId] : null;
  if (!party || party.leaderId !== 'player') return 'רק יו"ר מפלגה יכול לגייס לרשימה';
  if (n.partyId === party.id || s.flags[`recruitTo_${n.id}`]) return 'כבר אצלך';
  if (n.role === 'journalist' || n.role === 'lobbyist') return 'לא מתמודד/ת';
  if (n.partyId && s.parties[n.partyId].leaderId === n.id) return 'יו"ר מפלגה לא עוזב/ת';
  if (n.attitude < 70) return 'צריך יחס 70+';
  if (ideologyDistance(n.ideology, s.player.ideology) > 0.4) return 'רחוק/ה מדי אידיאולוגית';
  if (n.isMK && s.electionWeek - s.week > 30) return 'ח"כ מכהן/ת עובר/ת רק בעונת הבחירות (30 שבועות לפני)';
  return null;
}

/** גיוס דמות לרשימה של השחקן: הקולות שלה באים איתה */
export function recruitToList(s: GameState, n: Npc): string {
  const party = s.parties[s.player.partyId!];
  const old = n.partyId ? s.parties[n.partyId] : null;
  const votes = n.influence / 30;
  party.base += votes;
  party.poll += votes;
  if (old) {
    old.base = Math.max(0.3, old.base - votes * 0.7);
    if (s.npcs[old.leaderId]) changeAttitude(s, old.leaderId, -20);
  }
  if (n.isMK) s.flags[`recruitTo_${n.id}`] = party.id; // עובר/ת ברשימות לקראת הבחירות
  else {
    if (old) old.list = old.list.filter((id) => id !== n.id);
    n.partyId = party.id;
    party.list.push(n.id);
  }
  addMemory(s, n.id, `גייס/ה אותי לרשימת ${party.name}`, 10);
  addNews(s, `${n.name} מצטרף/ת ל${party.name} של ${s.player.name}`, 'good', true, undefined, undefined, n.id);
  return `${n.name} מצטרף/ת! המפלגה מקבלת כ-${votes.toFixed(1)}% מהקולות שלו/ה.`;
}

/** לפני בניית הרשימות: מי שגויס עובר */
export function applyRecruits(s: GameState) {
  for (const [k, v] of Object.entries(s.flags)) {
    if (!k.startsWith('recruitTo_')) continue;
    const id = k.slice('recruitTo_'.length);
    const n = s.npcs[id];
    const party = s.parties[String(v)];
    if (n && party) {
      for (const p of Object.values(s.parties)) p.list = p.list.filter((x) => x !== id);
      party.list.push(id);
    }
    delete s.flags[k];
  }
}

// ---------- שדולות ----------

export function issueLean(issue: IssueId): Partial<Ideology> {
  const ts = BILL_TEMPLATES.filter((t) => t.issue === issue && Object.keys(t.lean).length);
  const out: Partial<Ideology> = {};
  for (const t of ts) for (const [k, v] of Object.entries(t.lean)) out[k as keyof Ideology] = (out[k as keyof Ideology] ?? 0) + v! / ts.length;
  return out;
}

export function caucusBlocked(s: GameState, issue: IssueId): string | null {
  if (!s.player.isMK) return 'רק ח"כים מקימים שדולות';
  if (s.caucuses.length >= 2) return 'אפשר להוביל עד שתי שדולות';
  if (s.caucuses.some((c) => c.issue === issue)) return 'כבר יש לך שדולה בנושא';
  if (s.player.ap < 2) return 'צריך 2 זמן';
  return null;
}

export function foundCaucus(s: GameState, issue: IssueId): Caucus {
  s.player.ap -= 2;
  const lean = issueLean(issue);
  // שדולה = גם תומכים מהנושא וגם מי שכבר מחבב אותך, מכמה מפלגות
  const members = Object.values(s.npcs)
    .filter((n) => n.isMK && n.attitude > -15)
    .map((n) => ({ n, a: leanAlignment(n.ideology, lean) + n.attitude / 200 }))
    .filter((x) => x.a > 0.35)
    .sort((a, b) => b.a - a.a)
    .slice(0, 8)
    .map((x) => x.n.id);
  const def = ISSUES.find((i) => i.id === issue)!;
  const c: Caucus = { id: newId(s, 'cau'), issue, name: `השדולה למען ${def.name}`, members, founded: s.week };
  s.caucuses.push(c);
  for (const id of members) {
    changeAttitude(s, id, 6, { spread: false });
    addMemory(s, id, `צירף/ה אותי ל${c.name}`, 6);
  }
  s.player.fame = clamp(s.player.fame + 1.5, 0, 100);
  addNews(s, `${s.player.name} הקים/ה את ${c.name} עם ${members.length} ח"כים מכמה סיעות`, 'good', true);
  return c;
}

export function caucusMeeting(s: GameState, id: string): string {
  const c = s.caucuses.find((x) => x.id === id);
  if (!c) return '';
  s.player.ap -= 1;
  s.issues[c.issue] = clamp(s.issues[c.issue] + 4, 0, 100);
  s.player.fame = clamp(s.player.fame + 1, 0, 100);
  for (const m of c.members) changeAttitude(s, m, 2, { spread: false });
  s.flags[`cauMeet_${c.id}`] = s.week;
  return `כנס ${c.name}: הנושא עלה לסדר היום, והחברים מרוצים.`;
}

/** בונוס הצבעה לחברי שדולה על חוקים בנושא שלה */
export function caucusBonus(s: GameState, npcId: string, templateId: string): number {
  const issue = BILL_TEMPLATES.find((t) => t.id === templateId)?.issue;
  if (!issue) return 0;
  return s.caucuses.some((c) => c.issue === issue && c.members.includes(npcId)) ? 0.6 : 0;
}

/** כוח התקשורת: עיתונאים ידידותיים מגבירים, עוינים מחלישים */
export function pressFactor(s: GameState): number {
  const js = Object.values(s.npcs).filter((n) => n.role === 'journalist');
  const friendly = js.filter((n) => n.attitude >= 40).length;
  const hostile = js.filter((n) => n.attitude <= -30).length;
  return 1 + friendly * 0.08 - hostile * 0.06;
}

