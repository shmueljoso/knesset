// נשיאות: הכרזת מועמדות מוקדמת וקמפיין (לח"כ שרוצה להיבחר), ואחרי הניצחון – כהונה שנתפסת כמשחקון:
// לאחד את העם, להניע יוזמות נשיאותיות ולהשאיר את המדינה במצב טוב יותר.
import { registerSpecial } from '../ops';
import { chance, pick, rand, shuffle } from '../rng';
import { spawnCandidate } from '../newGame';
import type { GameState, Ideology, PresInitiative, Sector, WorldKey } from '../types';
import { SECTORS, SECTOR_NAMES, clamp, ideologyDistance } from '../util';
import { PRES_EVENTS } from '../data/presidency';
import { isCoalition } from './government';
import { removeParty } from './mergers';
import { addNews } from './news';
import { addWorldEffect, changeApproval } from './opinion';
import { pickCandidates, playerCanRunForPresident } from './president';
import { restoreNorwegian } from './regime';
import { changeAttitude } from './relationships';
import { log } from './report';
import { recountSeats } from './seats';
import { installLeader, successors } from './figures';
import { resignMinistry } from './ministry';
import { addStat } from '../stats';

/** כמה שבועות לפני ההצבעה אפשר להכריז על מועמדות */
export const CAMPAIGN_WINDOW = 110;

export interface PresResult {
  ok: boolean;
  text: string;
  lines?: string[];
}

export const weeksToVote = (s: GameState) => Math.max(0, (s.presidentNextWeek ?? Infinity) - s.week);
export const isPresident = (s: GameState) => s.president?.id === 'player' && !!s.presidency;

// ---------------- התנאים להתמודדות ----------------

/** מה חסר לשחקן כדי להתמודד (ריק = יכול/ה) */
export function runBlockers(s: GameState): string[] {
  const p = s.player;
  const out: string[] = [];
  if (!p.isMK) out.push('צריך להיות חבר/ת כנסת');
  if (p.fame < 55) out.push(`מוכרות 55+ (עכשיו ${Math.round(p.fame)})`);
  if (p.reputation < 60) out.push(`מוניטין 60+ (עכשיו ${Math.round(p.reputation)})`);
  if (s.coalition.pmId === 'player') out.push('ראש/ת ממשלה מכהן/ת לא יכול/ה להתמודד');
  if (s.scandal) out.push('אי אפשר להתמודד תחת חקירה');
  return out;
}

export function declareBlocked(s: GameState): string | null {
  if (isPresident(s)) return 'את/ה כבר נשיא/ה';
  if (s.presCampaign) return 'כבר הכרזת על מועמדות';
  if (s.presidentRace) return 'ההצבעה כבר מתקיימת';
  const b = runBlockers(s);
  if (b.length) return b[0];
  if (weeksToVote(s) > CAMPAIGN_WINDOW) return `מוקדם מדי – ההצבעה בעוד כ-${Math.round(weeksToVote(s) / 4) * 4} שבועות (אפשר להכריז ב-${CAMPAIGN_WINDOW} האחרונים)`;
  return null;
}

export function declareCandidacy(s: GameState): PresResult {
  const b = declareBlocked(s);
  if (b) return { ok: false, text: b };
  s.presCampaign = { sinceWeek: s.week, momentum: 14, pledges: [], cd: {}, theme: null, deals: [] };
  addStat(s, 'fame', 3);
  const mates = Object.values(s.npcs).filter((n) => n.isMK && n.partyId === s.player.partyId);
  for (const n of mates) changeAttitude(s, n.id, 2, { spread: false });
  addNews(s, `${s.player.name} מכריז/ה על מועמדות לנשיאות המדינה`, 'neutral', true, 'ההצבעה בכנסת חשאית. מי שרוצה להיבחר צריך לחזר אחרי ח"כים, להיראות בציבור ולהיזהר מעסקאות.', 'ערוץ המשכן');
  log(s, 'הכרזת על מועמדות לנשיאות.', 'career');
  return { ok: true, text: 'הכרזת על מועמדות. עכשיו מתחיל הקמפיין: חזר/י אחרי ח"כים, הופע/י בציבור וצבור/י תאוצה.' };
}

export function withdrawCandidacy(s: GameState): PresResult {
  if (!s.presCampaign) return { ok: false, text: 'לא הכרזת' };
  s.presCampaign = null;
  addStat(s, 'reputation', -1);
  addNews(s, `${s.player.name} פורש/ת מהמרוץ לנשיאות`, 'neutral', true);
  return { ok: true, text: 'פרשת מהמרוץ. המוניטין נפגע מעט.' };
}

// ---------------- הצבעה: ספירת ראשים ----------------

/** תוספת הציון של השחקן אצל ח"כ מסוים בזכות הקמפיין */
export function campaignScore(s: GameState, voterId: string): number {
  const c = s.presCampaign;
  if (!c) return 0;
  return c.momentum / 45 + (c.pledges.includes(voterId) ? 2.2 : 0);
}

/** שדה המועמדים הצפוי לשחקן שמתמודד: שני יריבים מהמחנות, ואת/ה */
export function previewField(s: GameState): string[] {
  return [...pickCandidates(s).slice(0, 2), 'player'];
}

/** הערכת קולות לסבב הראשון (תוחלת, בלי הגרלה – כך שלא משנה את המשחק) */
export function expectedVotes(s: GameState, field: string[] = previewField(s)): { id: string; votes: number }[] {
  const votes = field.map(() => 0);
  const pmParty = s.npcs[s.coalition.pmId]?.partyId ?? s.player.partyId;
  const pubPct = new Map((s.surveys?.[s.surveys.length - 1]?.presidentQ ?? []).map((x) => [x.id, x.pct]));
  for (const id of s.seating) {
    if (id === 'player') {
      const i = field.indexOf('player');
      if (i >= 0) votes[i] += 1;
      continue;
    }
    const v = s.npcs[id];
    if (!v) continue;
    const w = voterWeights(s, v.id, field, pmParty, pubPct);
    const tot = w.reduce((a, b) => a + b, 0) || 1;
    w.forEach((x, i) => (votes[i] += (x / tot) * 0.96));
  }
  return field.map((id, i) => ({ id, votes: Math.round(votes[i]) })).sort((a, b) => b.votes - a.votes);
}

/** משקל כל מועמד/ת בעיני ח"כ אחד (לפני הגרלה) */
export function voterWeights(s: GameState, voterId: string, alive: string[], pmParty: string | null | undefined, pubPct: Map<string, number>): number[] {
  const v = s.npcs[voterId];
  return alive.map((c) => {
    const cand = c === 'player' ? { ideology: s.player.ideology, partyId: s.player.partyId } : s.npcs[c];
    let score = -ideologyDistance(v.ideology, cand.ideology) * 5 + (cand.partyId === v.partyId ? 1.2 : 0);
    if (c === 'player') score += v.attitude / 40 + campaignScore(s, voterId);
    else score += (s.npcs[c]?.influence ?? 50) / 80;
    // דעת הקהל: מי שמוביל/ה בסקרי הנשיאות נהנה/ית מלחץ ציבורי
    score += (pubPct.get(c) ?? 0) / 40;
    if (cand.partyId && v.partyId && isCoalition(s, cand.partyId) === isCoalition(s, v.partyId)) score += 0.5;
    if (cand.partyId === pmParty && v.partyId && isCoalition(s, v.partyId)) score += 0.3;
    return Math.exp(score);
  });
}

/** אחוז התמיכה של השחקן בסקר הנשיאות (לפי הקמפיין והמוכרות) */
export function playerPresidentScore(s: GameState): number {
  const c = s.presCampaign;
  return c ? 8 + s.player.fame * 0.25 + c.momentum * 0.35 : 0;
}

// ---------------- פעולות קמפיין ----------------

export interface CampaignActionInfo {
  id: string;
  icon: string;
  label: string;
  desc: string;
  ap: number;
  money: number;
  capital: number;
  blocked: string | null;
}

export const THEMES: Record<string, { name: string; desc: string }> = {
  unity: { name: 'איחוד העם', desc: 'נשיא/ה של כולם: שולחנות עגולים וגשרים בין מחנות' },
  law: { name: 'שלטון החוק והמוסדות', desc: 'שמירה על האמון במוסדות ובשירות הציבורי' },
  peace: { name: 'ביטחון ושלום', desc: 'דיפלומטיה, חוסן ושיתוף פעולה עם העולם' },
  youth: { name: 'עתיד ונוער', desc: 'חינוך, שירות ותעסוקה לדור הבא' },
};

const BLOCS: Record<string, string> = { own: 'הסיעה שלך', coalition: 'הקואליציה', opposition: 'האופוזיציה' };

/** ח"כים שאפשר לחזר אחריהם בגוש מסוים */
function blocPool(s: GameState, bloc: string) {
  const mine = s.player.partyId;
  return Object.values(s.npcs).filter((n) => {
    if (!n.isMK || !n.partyId) return false;
    if (bloc === 'own') return n.partyId === mine;
    if (bloc === 'coalition') return n.partyId !== mine && isCoalition(s, n.partyId);
    return n.partyId !== mine && !isCoalition(s, n.partyId);
  });
}

function defs(s: GameState): Omit<CampaignActionInfo, 'blocked'>[] {
  const out: Omit<CampaignActionInfo, 'blocked'>[] = [
    { id: 'rally', icon: '🎤', label: 'מסע הופעות בציבור', desc: 'כנסים, ביקורים ונאומים. תאוצה, מוכרות ותדמית.', ap: 1, money: 8, capital: 0 },
    { id: 'media', icon: '📺', label: 'ראיונות בתקשורת', desc: 'תלוי במיומנות תקשורת. תאוצה ומוכרות.', ap: 1, money: 0, capital: 0 },
    ...Object.keys(BLOCS).map((b) => ({ id: `court:${b}`, icon: '🤝', label: `חיזור אחרי ח"כי ${BLOCS[b]}`, desc: 'שיחות אישיות. חלקם יתחייבו להצביע לך.', ap: 1, money: 0, capital: 1 })),
    ...Object.keys(THEMES).map((t) => ({ id: `vision:${t}`, icon: '🌟', label: `חזון: ${THEMES[t].name}`, desc: `${THEMES[t].desc}. תאוצה ובונוס פתיחה בבית הנשיא.`, ap: 2, money: 0, capital: 0 })),
  ];
  const parties = Object.values(s.parties)
    .filter((p) => p.seats >= 4 && p.id !== s.player.partyId && !(s.presCampaign?.deals ?? []).includes(p.id))
    .sort((a, b) => b.seats - a.seats)
    .slice(0, 5);
  for (const p of parties) out.push({ id: `deal:${p.id}`, icon: '🕴️', label: `עסקה עם ${p.short}`, desc: `הבטחה למפלגה תמורת קולות הסיעה (${p.seats} ח"כים). עלול לדלוף.`, ap: 1, money: 0, capital: 6 });
  return out;
}

const CD: Record<string, number> = { rally: 2, media: 2, court: 3, vision: 8, deal: 99 };

function cdKey(id: string) {
  return id.startsWith('court') || id.startsWith('deal') ? id : id.split(':')[0];
}

export function campaignMenu(s: GameState): CampaignActionInfo[] {
  const c = s.presCampaign;
  return defs(s).map((d) => {
    let blocked: string | null = null;
    if (!c) blocked = 'לא הכרזת על מועמדות';
    else if (s.player.ap < d.ap) blocked = 'אין מספיק זמן השבוע';
    else if (s.player.money < d.money) blocked = `נדרשים ${d.money} אלף ₪`;
    else if (s.player.capital < d.capital) blocked = 'אין מספיק הון פוליטי';
    else {
      const last = c.cd[cdKey(d.id)];
      const need = CD[d.id.split(':')[0]] ?? 3;
      if (last !== undefined && s.week - last < need) blocked = `בקירור עוד ${need - (s.week - last)} שבועות`;
    }
    return { ...d, blocked };
  });
}

export function campaignAction(s: GameState, id: string): PresResult {
  const c = s.presCampaign;
  const d = campaignMenu(s).find((x) => x.id === id);
  if (!c || !d) return { ok: false, text: 'הפעולה לא זמינה' };
  if (d.blocked) return { ok: false, text: d.blocked };
  const p = s.player;
  p.ap -= d.ap;
  p.money -= d.money;
  p.capital -= d.capital;
  c.cd[cdKey(id)] = s.week;
  const [kind, arg] = id.split(':');
  const lines: string[] = [];
  let text = '';
  const gain = (m: number) => {
    const before = c.momentum;
    c.momentum = clamp(c.momentum + m, 0, 100);
    lines.push(`תאוצה ${Math.round(before)} ← ${Math.round(c.momentum)}`);
  };
  if (kind === 'rally') {
    gain(6 + p.skills.speech / 25);
    addStat(s, 'fame', 1.2);
    changeApproval(s, 'all', 0.6);
    text = 'מסע הופעות מוצלח: כותרות, תמונות ותשואות.';
  } else if (kind === 'media') {
    gain(3 + p.skills.media / 18);
    addStat(s, 'fame', 1.5);
    text = 'ריאיון חד ושקול. הציבור מתרשם.';
  } else if (kind === 'court') {
    const sample = shuffle(s, blocPool(s, arg).filter((n) => !c.pledges.includes(n.id))).slice(0, 14);
    let got = 0;
    for (const n of sample) {
      const dist = ideologyDistance(n.ideology, p.ideology);
      const pr = clamp(0.2 + n.attitude / 160 + (0.5 - dist) * 0.5 + p.fame / 400 + c.momentum / 400 - n.ambition / 500 + (arg === 'own' ? 0.15 : 0), 0.04, 0.85);
      changeAttitude(s, n.id, 3, { spread: false });
      if (chance(s, pr)) {
        c.pledges.push(n.id);
        got++;
      }
    }
    gain(Math.min(8, got * 1.5));
    text = got ? `${got} ח"כי ${BLOCS[arg]} התחייבו לתמוך בך.` : `שוחחת עם ${sample.length} ח"כים – אף אחד לא התחייב עדיין.`;
  } else if (kind === 'vision') {
    c.theme = arg;
    gain(10);
    addStat(s, 'reputation', 1.5);
    text = `הצגת חזון: ${THEMES[arg].name}. הוא ילווה אותך גם בבית הנשיא.`;
  } else if (kind === 'deal') {
    const party = s.parties[arg];
    c.deals.push(arg);
    addStat(s, 'reputation', -1.5);
    let got = 0;
    for (const n of Object.values(s.npcs).filter((x) => x.isMK && x.partyId === arg && !c.pledges.includes(x.id) && x.attitude > -40)) {
      if (chance(s, 0.75)) {
        c.pledges.push(n.id);
        got++;
      }
    }
    gain(3);
    text = `סגרת עם ${party.name}: ${got} ח"כים יצביעו בעדך.`;
    if (chance(s, 0.12)) {
      c.momentum = clamp(c.momentum - 12, 0, 100);
      addNews(s, `דליפה: ${p.name} סגר/ה עסקה עם ${party.name} לקראת הבחירות לנשיאות`, 'bad', true, 'התקשורת מדברת על "קנוניה בחדרי חדרים".', 'גלי הבירה');
      lines.push('העסקה דלפה לתקשורת – תאוצה -12');
    }
  }
  if (text) log(s, `קמפיין: ${text}`, 'action');
  return { ok: true, text, lines };
}

/** פעם בשבוע: הקמפיין דועך אם לא מטפחים אותו, והתחייבויות של מי שהתרחק מתפוגגות */
export function tickCampaign(s: GameState) {
  const c = s.presCampaign;
  if (!c || isPresident(s)) return;
  if (s.presidentRace) return;
  if (!playerCanRunForPresident(s)) {
    s.presCampaign = null;
    addNews(s, `${s.player.name} נאלץ/ה לפרוש מהמרוץ לנשיאות`, 'bad', true, runBlockers(s)[0]);
    log(s, 'המועמדות לנשיאות בוטלה.', 'career');
    return;
  }
  c.momentum = clamp(c.momentum - 0.9 - c.momentum * 0.01, 0, 100);
  c.pledges = c.pledges.filter((id) => s.npcs[id]?.isMK && s.npcs[id].attitude > -10);
  if (c.momentum >= 55 && s.week % 5 === 0 && chance(s, 0.4)) {
    addNews(s, `${s.player.name} צובר/ת תאוצה בדרך לנשיאות: ${c.pledges.length} ח"כים כבר התחייבו`, 'good', true, undefined, 'ערוץ המשכן');
  }
}

/** הסכם הפסד: מי שהכריז ולא נבחר/ה משלם/ת מחיר */
export function campaignLost(s: GameState, winnerName: string) {
  if (!s.presCampaign) return;
  s.presCampaign = null;
  addStat(s, 'reputation', -3);
  addStat(s, 'fame', -2);
  addNews(s, `${s.player.name} הפסיד/ה במרוץ לנשיאות ל${winnerName}`, 'bad', true);
  log(s, 'הפסדת בבחירות לנשיאות.', 'career');
}

// ---------------- הכניסה לבית הנשיא ----------------

function vacatePlayerSeat(s: GameState) {
  const p = s.player;
  if (!s.seating.includes('player')) return;
  const party = p.partyId ? s.parties[p.partyId] : null;
  const home = party ?? Object.values(s.parties).sort((a, b) => b.seats - a.seats)[0];
  let next = home.list.find((x) => x !== 'player' && s.npcs[x] && !s.npcs[x].isMK && s.npcs[x].partyId === home.id && !s.norwegianSwaps?.[x]);
  if (!next) next = spawnCandidate(s, home.id).id;
  const nn = s.npcs[next];
  nn.partyId = home.id;
  nn.isMK = true;
  nn.role = 'mk';
  s.seating = s.seating.map((x) => (x === 'player' ? next! : x));
  for (const c of s.committees) {
    if (c.chairId === 'player') c.chairId = next;
    c.members = c.members.map((m) => (m === 'player' ? next! : m));
  }
}

/** השחקן נבחר: עוזב/ת מפלגה, ממשלה וכנסת, ונכנס/ת לכהונה של שבע שנים */
export function becomePresident(s: GameState, votes: number) {
  const p = s.player;
  restoreNorwegian(s);
  if (p.ministry) resignMinistry(s);
  const party = p.partyId ? s.parties[p.partyId] : null;
  if (party && party.leaderId === 'player') {
    const heir = successors(s, party.id, 'player')[0] ?? Object.values(s.npcs).find((n) => n.partyId === party.id && n.isMK);
    if (heir) installLeader(s, party.id, heir.id, 'נבחר/ה לנשיאות', { keepPM: true });
    else {
      for (const n of Object.values(s.npcs)) if (n.partyId === party.id) n.partyId = null;
      removeParty(s, party.id);
    }
  }
  vacatePlayerSeat(s);
  const old = p.partyId ? s.parties[p.partyId] : null;
  if (old) old.list = old.list.filter((x) => x !== 'player');
  p.isMK = false;
  p.partyId = null;
  p.rank = 'citizen';
  p.defector = false;
  p.employerId = null;
  p.listPosition = null;
  p.wantsList = false;
  p.committees = [];
  p.ministry = null;
  for (const c of s.caucuses) c.members = c.members.filter((m) => m !== 'player');
  for (const b of s.bills) {
    if (b.sponsor === 'player' && b.stage !== 'passed' && b.stage !== 'failed') {
      b.stage = 'failed';
      b.history.push({ week: s.week, text: 'ההצעה נפלה: המגיש נבחר לנשיאות.' });
    }
  }
  recountSeats(s);
  const camp = s.presCampaign;
  const theme = camp?.theme ?? null;
  s.presCampaign = null;
  s.presidency = {
    sinceWeek: s.week,
    unity: clamp(52 + (p.reputation - 60) / 6 + (theme === 'unity' ? 6 : 0), 35, 70),
    trust: clamp(50 + (votes - 61) * 0.4 + (theme === 'law' ? 4 : 0), 38, 72),
    weeks: 0,
    unitySum: 0,
    trustSum: 0,
    idle: 0,
    lowTrust: 0,
    actedWeek: -1,
    cd: {},
    initiatives: [],
    deeds: [`נבחר/ה לנשיאות בכנסת (${votes} קולות)`],
    theme,
    pardons: 0,
    refused: 0,
  };
  p.achievements.push('president');
  s.eventQueue.push({ eventId: 'pres_welcome', ctx: { votes: String(votes) } });
}

// ---------------- פעולות נשיאותיות ----------------

export interface Initiative {
  id: string;
  icon: string;
  name: string;
  desc: string;
  need: number;
  effects: [WorldKey, number][];
  unity: number;
  trust: number;
  sector?: Sector;
}

export const INITIATIVES: Initiative[] = [
  { id: 'service', icon: '🎽', name: 'שנת שירות לאומית לכולם', desc: 'צעירים מכל המגזרים משרתים יחד.', need: 8, effects: [['cohesion', 7]], unity: 8, trust: 3 },
  { id: 'periphery', icon: '🏗️', name: 'תוכנית נשיאותית לפריפריה', desc: 'השקעה בדיור ובתעסוקה בצפון ובדרום.', need: 7, effects: [['housing', 4], ['economy', 3]], unity: 5, trust: 3 },
  { id: 'bridges', icon: '🌉', name: 'גשרים בחינוך', desc: 'מפגשי תלמידים בין חילונים, דתיים, חרדים וערבים.', need: 6, effects: [['cohesion', 5], ['trust', 3]], unity: 7, trust: 2, sector: 'arab' },
  { id: 'heritage', icon: '📜', name: 'מורשת ותרבות משותפת', desc: 'פסטיבלים, מוזיאונים וטקסים שכולם שותפים להם.', need: 5, effects: [['trust', 4], ['cohesion', 2]], unity: 6, trust: 3 },
  { id: 'volunteer', icon: '🫶', name: 'מרכז התנדבות לאומי', desc: 'רשת של מתנדבים לעזרה בחירום ובשגרה.', need: 6, effects: [['cohesion', 4], ['affordability', 2]], unity: 5, trust: 4 },
  { id: 'science', icon: '🔬', name: 'נשיא/ה למען מדע וחדשנות', desc: 'קשרי אקדמיה, תעשייה ועולם.', need: 8, effects: [['economy', 6]], unity: 2, trust: 5 },
  { id: 'veterans', icon: '🎖️', name: 'פורום ביטחון וחברה', desc: 'מילואימניקים, משפחות שכולות וצעירים סביב שולחן אחד.', need: 6, effects: [['security', 4], ['cohesion', 3]], unity: 5, trust: 3, sector: 'traditional' },
  { id: 'health', icon: '🏥', name: 'יוזמה נשיאותית לבריאות הציבור', desc: 'תורים, רפואה בפריפריה ובריאות הנפש.', need: 7, effects: [['affordability', 4], ['trust', 3]], unity: 4, trust: 5 },
];

export const initiativeById = (id: string) => INITIATIVES.find((i) => i.id === id)!;
export const MAX_ACTIVE_INITIATIVES = 2;

export const DIVIDES: Record<string, { name: string; axis?: keyof Ideology; sector?: Sector }> = {
  security: { name: 'ימין ושמאל', axis: 'security' },
  religion: { name: 'דתיים וחילונים', axis: 'religion' },
  econ: { name: 'עשירים ועניים', axis: 'econ' },
  judiciary: { name: 'בית המשפט והכנסת', axis: 'judiciary' },
  arab: { name: 'יהודים וערבים', sector: 'arab' },
};

export interface PresActionInfo {
  id: string;
  icon: string;
  label: string;
  desc: string;
  ap: number;
  blocked: string | null;
}

const PRES_CD: Record<string, number> = { speech: 3, diplomacy: 10, mediate: 8, visit: 3, table: 6 };

function presBlocked(s: GameState, id: string, ap: number): string | null {
  const pr = s.presidency;
  if (!pr || !isPresident(s)) return 'רק לנשיא/ה';
  if (s.player.ap < ap) return 'אין מספיק זמן השבוע';
  const last = pr.cd[id];
  const need = PRES_CD[id.split(':')[0]] ?? 0;
  if (last !== undefined && s.week - last < need) return `בקירור עוד ${need - (s.week - last)} שבועות`;
  return null;
}

/** התפריט הקבוע של הנשיא/ה (בלי יוזמות) */
export function presMenu(s: GameState): { visit: PresActionInfo[]; tables: PresActionInfo[]; general: PresActionInfo[] } {
  const mk = (id: string, icon: string, label: string, desc: string, ap: number): PresActionInfo => ({ id, icon, label, desc, ap, blocked: presBlocked(s, id, ap) });
  return {
    visit: SECTORS.map((sec) => mk(`visit:${sec}`, '🚌', `ביקור בקהילה: ${SECTOR_NAMES[sec]}`, 'תדמית במגזר ואחדות', 1)),
    tables: Object.entries(DIVIDES).map(([k, d]) => mk(`table:${k}`, '🪑', `שולחן עגול: ${d.name}`, 'מקרב קצוות. ההצלחה תלויה באמון בך ובעומק המחלוקת', 2)),
    general: [
      mk('speech', '🎙️', 'נאום לאומי', 'מעודד ומאחד. עוזר במיוחד כשהאחדות נמוכה', 1),
      mk('diplomacy', '🌐', 'אירוח מנהיגים וביקור מדינה', 'ביטחון וכלכלה לאורך זמן. עלול להסתיים בגפה', 2),
      mk('mediate', '⚖️', 'תיווך בין הקואליציה לאופוזיציה', 'מייצב את הממשלה, אבל אפשר להיתפס כמתערב/ת', 2),
    ],
  };
}

function shiftMood(s: GameState, axis: keyof Ideology, f: number) {
  s.mood[axis] = clamp(s.mood[axis] * f, -50, 50);
}

function acted(s: GameState) {
  const pr = s.presidency!;
  pr.actedWeek = s.week;
  pr.idle = 0;
}

export function addUnity(s: GameState, d: number) {
  if (s.presidency) s.presidency.unity = clamp(s.presidency.unity + d, 0, 100);
}
export function addPresTrust(s: GameState, d: number) {
  if (s.presidency) s.presidency.trust = clamp(s.presidency.trust + d, 0, 100);
}

function deed(s: GameState, text: string) {
  const pr = s.presidency!;
  pr.deeds.push(text);
  if (pr.deeds.length > 40) pr.deeds.shift();
}

export function presAction(s: GameState, id: string): PresResult {
  const pr = s.presidency;
  const [kind, arg] = id.split(':');
  const ap = kind === 'table' || kind === 'diplomacy' || kind === 'mediate' ? 2 : 1;
  const b = presBlocked(s, id, ap);
  if (!pr || b) return { ok: false, text: b ?? 'לא זמין' };
  const p = s.player;
  p.ap -= ap;
  pr.cd[id] = s.week;
  acted(s);
  const lines: string[] = [];
  let text = '';
  if (kind === 'visit') {
    const sec = arg as Sector;
    const low = p.approval[sec] < 45;
    changeApproval(s, sec, low ? 5 : 3);
    addUnity(s, low ? 2.2 : 1.4);
    addPresTrust(s, 0.8);
    addStat(s, 'fame', 0.6);
    addWorldEffect(s, 'cohesion', 0.6, 6, 'נשיאות');
    text = `ביקרת בקהילת ה${SECTOR_NAMES[sec]}. קיבלו אותך בחום${low ? ' – יותר ממה שציפית' : ''}.`;
    lines.push(`תדמית ב${SECTOR_NAMES[sec]} +${low ? 5 : 3}`, `אחדות +${low ? 2.2 : 1.4}`);
  } else if (kind === 'table') {
    const d = DIVIDES[arg];
    const tension = d.axis ? Math.abs(s.mood[d.axis]) / 150 : (100 - p.approval.arab) / 400;
    const pSucc = clamp(0.42 + pr.trust / 250 + (pr.unity - 40) / 400 - tension, 0.25, 0.85);
    if (chance(s, pSucc)) {
      addUnity(s, 6);
      addPresTrust(s, 2);
      if (d.axis) shiftMood(s, d.axis, 0.75);
      if (d.sector) changeApproval(s, d.sector, 5);
      addWorldEffect(s, 'cohesion', 1.2, 8, 'נשיאות');
      text = `השולחן העגול בין ${d.name} הצליח. נוסחה הצהרה משותפת.`;
      lines.push('אחדות +6', 'אמון בך +2', d.axis ? 'הקיטוב בציבור ירד' : 'תדמית אצל הערבים +5');
      deed(s, `שולחן עגול מוצלח: ${d.name}`);
    } else {
      addUnity(s, -1);
      addPresTrust(s, -2);
      text = `השולחן העגול בין ${d.name} התפוצץ באמצע. הצדדים יצאו בטענות.`;
      lines.push('אחדות -1', 'אמון בך -2');
    }
  } else if (kind === 'speech') {
    const low = pr.unity < 50;
    addUnity(s, low ? 3 : 2);
    addPresTrust(s, 1.2);
    addStat(s, 'fame', 1);
    text = low ? 'נאום מאחד בתקופה קשה. הציבור הקשיב.' : 'נאום לאומי מרומם.';
    lines.push(`אחדות +${low ? 3 : 2}`, 'אמון בך +1.2');
  } else if (kind === 'diplomacy') {
    addWorldEffect(s, 'security', 1.4, 10, 'נשיאות');
    addWorldEffect(s, 'economy', 1, 10, 'נשיאות');
    if (pr.trust < 45 && chance(s, 0.18)) {
      addPresTrust(s, -3);
      addUnity(s, -1);
      addNews(s, `פליטת פה של ${p.name} באירוח הנשיאותי מעוררת סערה`, 'bad', true, undefined, 'ידיעות הערב');
      text = 'האירוח הצליח מדיני, אבל פליטת פה הבישה אותך.';
      lines.push('אמון בך -3');
    } else {
      addPresTrust(s, 1.2);
      text = 'ביקורי גומלין חיזקו קשרים עם בעלות ברית.';
      lines.push('ביטחון וכלכלה משתפרים לאורך זמן', 'אמון בך +1.2');
    }
  } else if (kind === 'mediate') {
    const pm = s.npcs[s.coalition.pmId];
    const partisan = pm ? ideologyDistance(pm.ideology, p.ideology) > 0.55 : false;
    s.coalition.stability = clamp(s.coalition.stability + 5, 0, 100);
    for (const pid of s.coalition.parties) if (s.coalition.satisfaction[pid] !== undefined) s.coalition.satisfaction[pid] = clamp(s.coalition.satisfaction[pid] + 3, 0, 100);
    addUnity(s, 1.5);
    lines.push('יציבות הקואליציה +5', 'אחדות +1.5');
    text = 'שוחחת עם ראש הממשלה ועם יו"ר האופוזיציה. המתח ירד.';
    if (partisan && chance(s, 0.4)) {
      addPresTrust(s, -2);
      lines.push('נתפסת כמתערב/ת מפלגתי/ת – אמון בך -2');
    }
  }
  if (text) log(s, `נשיאות: ${text}`, 'action');
  return { ok: true, text, lines };
}

// ---------------- יוזמות נשיאותיות ----------------

export function initiativeBlocked(s: GameState, id: string): string | null {
  const pr = s.presidency;
  if (!pr || !isPresident(s)) return 'רק לנשיא/ה';
  if (s.player.ap < 1) return 'אין מספיק זמן השבוע';
  const cur = pr.initiatives.find((i) => i.id === id);
  if (cur?.done) return 'היוזמה הושלמה';
  if (cur && cur.lastWeek === s.week) return 'כבר השקעת בה השבוע';
  if (!cur && pr.initiatives.filter((i) => !i.done).length >= MAX_ACTIVE_INITIATIVES) return `אפשר לנהל ${MAX_ACTIVE_INITIATIVES} יוזמות במקביל`;
  return null;
}

export function investInitiative(s: GameState, id: string): PresResult {
  const blocked = initiativeBlocked(s, id);
  if (blocked) return { ok: false, text: blocked };
  const pr = s.presidency!;
  const def = initiativeById(id);
  let cur: PresInitiative | undefined = pr.initiatives.find((i) => i.id === id);
  if (!cur) {
    cur = { id, progress: 0, startWeek: s.week, lastWeek: -1, done: false };
    pr.initiatives.push(cur);
  }
  s.player.ap -= 1;
  acted(s);
  cur.progress += 1;
  cur.lastWeek = s.week;
  addStat(s, 'fame', 0.4);
  if (cur.progress < def.need) return { ok: true, text: `${def.name}: התקדמות ${cur.progress}/${def.need}.`, lines: [`עוד ${def.need - cur.progress} שבועות של השקעה`] };
  cur.done = true;
  for (const [k, total] of def.effects) addWorldEffect(s, k, total, 60, 'נשיאות');
  addUnity(s, def.unity);
  addPresTrust(s, def.trust);
  if (def.sector) changeApproval(s, def.sector, 4);
  addStat(s, 'reputation', 2);
  const effTxt = def.effects.map(([k, v]) => `${WORLD_LABEL[k]} +${v}`).join(', ');
  deed(s, `יוזמה שהושלמה: ${def.name}`);
  addNews(s, `${s.player.name} השלים/ה את היוזמה הנשיאותית "${def.name}"`, 'good', true, `השפעה לאורך שנה: ${effTxt}.`, 'ערוץ המשכן');
  log(s, `יוזמה נשיאותית הושלמה: ${def.name}.`, 'career');
  return { ok: true, text: `היוזמה "${def.name}" הושלמה!`, lines: [`אחדות +${def.unity}`, `אמון בך +${def.trust}`, effTxt] };
}

export const WORLD_LABEL: Record<WorldKey, string> = { economy: 'כלכלה', affordability: 'יוקר מחיה', housing: 'דיור', security: 'ביטחון', trust: 'אמון במוסדות', cohesion: 'לכידות' };

// ---------------- מדיניות מנדט ----------------

export const MANDATE_DOCTRINES: Record<string, { name: string; desc: string }> = {
  largest: { name: 'הגדולה ביותר', desc: 'המנדט לראש הרשימה הגדולה. צפוי ומקובל.' },
  broad: { name: 'ממשלה רחבה', desc: 'דוחף/ת לממשלת אחדות רחבה, יציבה יותר ומאחדת יותר.' },
  bloc: { name: 'הגוש עם סיכוי', desc: 'מי שבאמת יכול להרכיב 61, גם אם אינו הגדול. מעורר מחלוקת.' },
};

/** תוכנית הקואליציה לפי מדיניות הנשיא/ה (אם יש) */
export function mandatePlan(s: GameState, lead: string, bySeats: string[]): { plan: string[]; lead: string; note: string } | null {
  if (!isPresident(s)) return null;
  const doctrine = String(s.flags.mandateDoctrine ?? 'largest');
  if (doctrine === 'broad') {
    const first = bySeats[0];
    const second = bySeats.find((id) => id !== first && !s.parties[first].incompatible?.includes(id) && !s.parties[id].incompatible?.includes(first));
    if (!second) return null;
    const members = [first, second];
    let seats = s.parties[first].seats + s.parties[second].seats;
    for (const id of bySeats) {
      if (members.includes(id) || seats >= 85) continue;
      if (members.some((m) => s.parties[m].incompatible?.includes(id) || s.parties[id].incompatible?.includes(m))) continue;
      members.push(id);
      seats += s.parties[id].seats;
    }
    return { plan: members, lead: first, note: 'הנשיא/ה הטיל/ה את המנדט על ממשלת אחדות רחבה' };
  }
  if (doctrine === 'bloc') {
    const second = bySeats[1];
    if (second && second !== lead && s.parties[second]) {
      const members = [second];
      let seats = s.parties[second].seats;
      for (const id of bySeats) {
        if (members.includes(id) || id === bySeats[0] || seats >= 61) continue;
        if (members.some((m) => s.parties[m].incompatible?.includes(id) || s.parties[id].incompatible?.includes(m))) continue;
        if (ideologyDistance(s.parties[id].ideology, s.parties[second].ideology) >= 0.5) continue;
        members.push(id);
        seats += s.parties[id].seats;
      }
      if (seats >= 61) return { plan: members, lead: second, note: 'הנשיא/ה העדיף/ה את הגוש שמסוגל להרכיב רוב, למרות שהרשימה הגדולה ביותר היא אחרת' };
    }
  }
  return null;
}

/** הערת בחירות על החלטת הנשיא/ה (אחרי שהממשלה הוקמה) */
export function afterMandate(s: GameState, note: string, doctrine: string) {
  addNews(s, note, 'neutral', true, doctrine === 'bloc' ? 'מתנגדים טוענים שהנשיא/ה הכריע/ה את המערכה בעצמו/ה.' : undefined, 'ערוץ המשכן');
  if (doctrine === 'broad') {
    addUnity(s, 3);
    s.coalition.stability = clamp(s.coalition.stability + 8, 0, 100);
    deed(s, 'דחף/ה להקמת ממשלת אחדות רחבה');
  } else if (doctrine === 'bloc') {
    addUnity(s, -4);
    addPresTrust(s, -3);
    deed(s, 'הטיל/ה את המנדט על גוש שאינו הגדול');
  }
}

// ---------------- שבועי ----------------

export function presidencyScore(s: GameState): number {
  const pr = s.presidency;
  if (!pr || !pr.weeks) return 0;
  const worldNow = Object.values(s.world).reduce((a, b) => a + b, 0) / 6;
  const delta = worldNow - s.career.startWorld;
  return Math.round((pr.unitySum / pr.weeks) * 0.5 + (pr.trustSum / pr.weeks) * 0.3 + delta * 2 + pr.initiatives.filter((i) => i.done).length * 6 + Math.min(20, pr.deeds.length));
}

function unityTarget(s: GameState): number {
  const w = s.world;
  const polar = (Math.abs(s.mood.security) + Math.abs(s.mood.religion) + Math.abs(s.mood.econ) + Math.abs(s.mood.judiciary)) / 4;
  const done = s.presidency!.initiatives.filter((i) => i.done).length;
  return clamp(50 + (w.cohesion - 50) * 0.55 + (w.trust - 50) * 0.2 + (s.coalition.stability - 50) * 0.08 - polar * 0.5 - (s.scandal ? 6 : 0) + done * 1.2, 5, 95);
}

/** מה מזיז את האחדות עכשיו (להצגה בלשונית הנשיאות) */
export function unityDrivers(s: GameState): { label: string; d: number }[] {
  const w = s.world;
  const polar = (Math.abs(s.mood.security) + Math.abs(s.mood.religion) + Math.abs(s.mood.econ) + Math.abs(s.mood.judiciary)) / 4;
  const done = s.presidency?.initiatives.filter((i) => i.done).length ?? 0;
  return [
    { label: 'לכידות חברתית', d: (w.cohesion - 50) * 0.55 },
    { label: 'אמון במוסדות', d: (w.trust - 50) * 0.2 },
    { label: 'יציבות הממשלה', d: (s.coalition.stability - 50) * 0.08 },
    { label: 'קיטוב בציבור', d: -polar * 0.5 },
    { label: 'יוזמות שהושלמו', d: done * 1.2 },
    ...(s.scandal ? [{ label: 'פרשה פעילה', d: -6 }] : []),
  ];
}

export function tickPresidency(s: GameState) {
  const pr = s.presidency;
  if (!pr || !isPresident(s)) return;
  pr.weeks += 1;
  const target = unityTarget(s);
  pr.unity = clamp(pr.unity + (target - pr.unity) * 0.035 + (rand(s) - 0.5) * 0.8, 0, 100);
  if (pr.actedWeek !== s.week) pr.idle += 1;
  const ttarget = 46 + (pr.unity - 50) * 0.45 + (s.player.reputation - 50) * 0.15 - (pr.idle > 5 ? Math.min(14, (pr.idle - 5) * 1.5) : 0);
  pr.trust = clamp(pr.trust + (ttarget - pr.trust) * 0.03 + (rand(s) - 0.5) * 0.5, 0, 100);
  pr.unitySum += pr.unity;
  pr.trustSum += pr.trust;
  // הנשיא/ה משפיע/ה על המדינה בחזרה, לאט
  s.world.cohesion = clamp(s.world.cohesion + (pr.unity - 50) * 0.003, 0, 100);
  s.world.trust = clamp(s.world.trust + (pr.trust - 50) * 0.002, 0, 100);
  s.coalition.stability = clamp(s.coalition.stability + (pr.unity - 50) * 0.002, 0, 100);
  if (pr.idle === 8) addNews(s, `${s.player.name} נעדר/ת מהזירה הציבורית: "איפה הנשיא/ה?"`, 'bad', true, undefined, 'גלי הבירה');
  // הדחה: אמון נמוך מאוד לאורך זמן
  pr.lowTrust = pr.trust < 12 ? pr.lowTrust + 1 : 0;
  if (pr.lowTrust === 10) addNews(s, `קריאות להדחת ${s.player.name} מהנשיאות: האמון הציבורי בשפל`, 'bad', true, undefined, 'ערוץ המשכן');
  if (pr.lowTrust >= 26 && !s.gameOver) {
    s.gameOver = 'president_removed';
    addNews(s, `הכנסת הדיחה את ${s.player.name} מהנשיאות`, 'bad', true);
    return;
  }
  const t = s.week - pr.sinceWeek;
  if (t > 0 && t % 52 === 0) {
    addNews(s, `שנה לנשיאות: אחדות ${Math.round(pr.unity)}, אמון ${Math.round(pr.trust)}`, 'neutral', true, `${pr.initiatives.filter((i) => i.done).length} יוזמות הושלמו עד כה.`, 'ערוץ המשכן');
    log(s, `שנה בבית הנשיא: אחדות ${Math.round(pr.unity)}, אמון ${Math.round(pr.trust)}.`, 'career');
  }
  if (t % 52 === 14 && t > 0) s.eventQueue.push({ eventId: 'pres_independence', ctx: {} });
  else if (t % 52 === 38) s.eventQueue.push({ eventId: 'pres_newyear', ctx: {} });
  else if (!s.eventQueue.length && chance(s, 0.085)) {
    const pool = PRES_EVENTS.filter((e) => {
      if (e.queued) return false;
      const last = s.eventsFired[e.id];
      if (last !== undefined && s.week - last < (e.cooldown ?? 20)) return false;
      return e.when ? e.when(s) : true;
    });
    const ev = pool.length ? pick(s, pool) : null;
    if (ev) {
      s.eventQueue.push({ eventId: ev.id, ctx: ev.ctx ? ev.ctx(s) ?? {} : {} });
      s.eventsFired[ev.id] = s.week;
    }
  }
}

/** סיום הכהונה (7 שנים) */
export function endPresidency(s: GameState) {
  if (!s.presidency || s.gameOver) return;
  s.gameOver = 'president_term';
  const sc = presidencyScore(s);
  addNews(s, `${s.player.name} מסיים/ת שבע שנים כנשיא/ת המדינה`, 'neutral', true, `ציון הכהונה: ${sc}.`, 'ערוץ המשכן');
  log(s, `סיימת את כהונתך כנשיא/ה. ציון הכהונה: ${sc}.`, 'career');
}

export const termWeeksLeft = (s: GameState) => Math.max(0, (s.presidentNextWeek ?? 0) - s.week);

// ---------------- פעולות מיוחדות לאירועים ----------------

const FOCUS: Record<string, { name: string; unity: number; trust: number; world?: [WorldKey, number] }> = {
  unity: { name: 'איחוד העם', unity: 5, trust: 1 },
  law: { name: 'שלטון החוק והמוסדות', unity: 1, trust: 5, world: ['trust', 3] },
  peace: { name: 'ביטחון ושלום', unity: 2, trust: 2, world: ['security', 3] },
  youth: { name: 'עתיד ונוער', unity: 3, trust: 2, world: ['economy', 2] },
};
for (const k of Object.keys(FOCUS)) {
  registerSpecial(`pres_focus_${k}`, (s) => {
    const f = FOCUS[k];
    if (!s.presidency) return;
    s.presidency.theme = k;
    addUnity(s, f.unity);
    addPresTrust(s, f.trust);
    if (f.world) addWorldEffect(s, f.world[0], f.world[1], 26, 'נשיאות');
    deed(s, `הציב/ה כמטרה עליונה: ${f.name}`);
    return `מטרת הכהונה: ${f.name}`;
  });
}
registerSpecial('pres_pardon_yes', (s) => {
  if (!s.presidency) return;
  s.presidency.pardons += 1;
  deed(s, 'חנן/ה אסיר');
});
registerSpecial('pres_pardon_no', (s) => {
  if (!s.presidency) return;
  s.presidency.refused += 1;
});
registerSpecial('pres_deed_comfort', (s) => {
  deed(s, 'ניחם/ה משפחות שכולות בשעת משבר');
});
registerSpecial('pres_deed_mediate', (s) => {
  deed(s, 'תיווך/ה במשבר פוליטי');
});
registerSpecial('pres_deed_stand', (s) => {
  deed(s, 'עמד/ה על עקרונותיו/ה בשעת מבחן');
});
registerSpecial('pres_calm_mood', (s) => {
  for (const k of ['econ', 'security', 'religion', 'judiciary'] as const) s.mood[k] = clamp(s.mood[k] * 0.85, -50, 50);
  return 'הקיטוב בציבור ירד מעט';
});
