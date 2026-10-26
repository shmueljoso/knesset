// סקרים שמתפרסמים כל שבועיים ("כמו בסקרים אמיתיים"), ורוח הציבור שמשתנה לפי מצב המדינה.
// הסקרים לא רק מוצגים: הם משפיעים על המומנטום, על השותפות בקואליציה ועל המרוצים לראשות הממשלה ולנשיאות.
import { ISSUES } from '../data/issues';
import { chance, pick, rand } from '../rng';
import type { GameState, Ideology, Survey } from '../types';
import { AXES, avgApproval, clamp, leanAlignment } from '../util';
import { allocateSeats } from './elections';
import { addNews } from './news';
import { addMomentum, govSatisfaction } from './opinion';
export { moodPull } from './opinion';
import { pickCandidates } from './president';
import { playerPresidentScore } from './presidency';
import { directElection, termLimited } from './regime';
import { publicSupport } from './transforms';
import { makeHypos, resignPressure } from './figures';

export const POLLSTERS: { name: string; lean: Partial<Ideology>; sample: number; outlet: string }[] = [
  { name: 'מכון מדגמים', lean: {}, sample: 700, outlet: 'חדשות 13+' },
  { name: 'פאנל העם', lean: { security: 40, judiciary: 30 }, sample: 600, outlet: 'ערוץ המשכן' },
  { name: 'קול-סקר', lean: { judiciary: -30, religion: -30 }, sample: 550, outlet: 'גלי הבירה' },
  { name: 'מכון הכיכר', lean: { econ: -20 }, sample: 800, outlet: 'ידיעות הערב' },
];

export const SURVEY_EVERY = 2;

export const latestSurvey = (s: GameState): Survey | null => s.surveys?.[s.surveys.length - 1] ?? null;

/** אחוז ההתאמה לראשות הממשלה בסקר האחרון (0 אם לא נשאל/ה) */
export const pmFitOf = (s: GameState, id: string) => latestSurvey(s)?.pmFit.find((x) => x.id === id)?.pct ?? 0;

// ---------------- רוח הציבור ----------------

/** לאן מושך מצב המדינה את הציבור: חוסר ביטחון → ניציות, יוקר מחיה → רווחה, משבר אמון → נגד הממסד */
export function moodTarget(s: GameState): Ideology {
  const w = s.world;
  return {
    security: clamp((50 - w.security) * 1.1, -40, 40),
    econ: clamp((w.affordability - 50) * 0.8 + (w.economy - 50) * 0.3, -40, 40),
    religion: clamp(-(s.issues.draft - 50) * 0.25 - (s.issues.religion - 50) * 0.15, -25, 25),
    judiciary: clamp((50 - w.trust) * 0.35, -25, 25),
  };
}

export function tickMood(s: GameState) {
  s.mood ??= { econ: 0, security: 0, religion: 0, judiciary: 0 };
  const t = moodTarget(s);
  for (const ax of AXES) s.mood[ax] = Math.round((s.mood[ax] + (t[ax] - s.mood[ax]) * 0.06) * 10) / 10;
}

const AXIS_MOOD: Record<keyof Ideology, [string, string]> = {
  security: ['הציבור נעשה ניצי יותר בביטחון', 'הציבור מחפש הסדרים ורגיעה'],
  econ: ['הציבור פתוח לשוק חופשי', 'הציבור דורש רווחה והתערבות'],
  religion: ['רוח מסורתית-דתית', 'רוח חילונית: "די לכפייה"'],
  judiciary: ['זעם על הממסד והמערכת המשפטית', 'תמיכה בשומרי הסף'],
};

/** תיאור מילולי של רוח הציבור (לסקר ולחדשות) */
export function moodLines(s: GameState): string[] {
  const m = s.mood;
  if (!m) return [];
  return AXES.filter((ax) => Math.abs(m[ax]) >= 6)
    .sort((a, b) => Math.abs(m[b]) - Math.abs(m[a]))
    .map((ax) => `${AXIS_MOOD[ax][m[ax] > 0 ? 0 : 1]} (${m[ax] > 0 ? '+' : ''}${Math.round(m[ax])})`);
}

// ---------------- הסקר ----------------

/** הכוח האישי של מועמד/ת לראשות הממשלה */
function pmScore(s: GameState, id: string): number {
  const partyId = id === 'player' ? s.player.partyId : s.npcs[id]?.partyId;
  const party = partyId ? s.parties[partyId] : null;
  let score = (party?.poll ?? 3) * 0.9 + (party?.momentum ?? 0) * 0.8;
  if (id === 'player') {
    const p = s.player;
    score += (p.fame - 50) / 2.5 + (p.reputation - 50) / 4 + (avgApproval(s) - 50) / 3 - (s.scandal ? 3 * s.scandal.stage : 0);
  } else score += ((s.npcs[id]?.influence ?? 50) - 50) / 2;
  if (s.coalition.pmId === id) score += 4 + govSatisfaction(s) * 12;
  return Math.max(1, score);
}

function pmCandidates(s: GameState): string[] {
  const out: string[] = [];
  const add = (id: string | undefined) => {
    if (!id || out.includes(id) || termLimited(s, id)) return;
    if (id !== 'player' && !s.npcs[id]) return;
    out.push(id);
  };
  add(s.coalition.pmId);
  for (const p of Object.values(s.parties).sort((a, b) => b.poll - a.poll).slice(0, 3)) add(p.leaderId);
  const mine = s.player.partyId ? s.parties[s.player.partyId] : null;
  if (mine?.leaderId === 'player' || (s.player.isMK && s.player.fame >= 55)) add('player');
  return out.slice(0, 5);
}

function surveyBill(s: GameState): { templateId: string; title: string } | null {
  const active = s.bills.filter((b) => b.stage !== 'passed' && b.stage !== 'failed' && !b.external && b.templateId !== 'budget_law' && b.templateId !== 'no_confidence');
  const mine = active.find((b) => b.sponsor === 'player');
  const b = mine ?? (active.length ? pick(s, active) : null);
  if (b) return { templateId: b.templateId, title: b.title };
  const last = [...s.lawsPassed].reverse().find((l) => !l.struck && s.week - l.week < 12);
  return last ? { templateId: last.templateId, title: last.title } : null;
}

/** בניית סקר חדש (טהור מלבד הגרלות דרך rand) */
export function makeSurvey(s: GameState): Survey {
  const pollster = POLLSTERS[(s.surveys?.length ?? 0) % POLLSTERS.length];
  const margin = Math.round((98 / Math.sqrt(pollster.sample)) * 10) / 10;
  const parties = Object.values(s.parties);
  const raw: Record<string, number> = {};
  for (const p of parties) raw[p.id] = Math.max(0.05, p.poll + leanAlignment(p.ideology, pollster.lean) * 0.6 + (rand(s) - 0.5) * margin * 0.5);
  const tot = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const pct = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.round((v / tot) * 1000) / 10]));
  const seats = allocateSeats(pct, {}, 120, (s.rules.threshold ?? 3.25) / 100);

  // מי מתאים יותר לראשות הממשלה
  const cands = pmCandidates(s);
  // חזקה מעל 1: המוביל/ה בולט/ת, כמו בסקרים אמיתיים
  const scores = cands.map((c) => Math.pow(pmScore(s, c) * (0.92 + rand(s) * 0.16), 1.5));
  const gov = govSatisfaction(s);
  const pmNone = Math.round(clamp(14 + (1 - gov) * 6 + rand(s) * 4, 8, 30));
  const sum = scores.reduce((a, b) => a + b, 0) || 1;
  const pmFit = cands.map((id, i) => ({ id, pct: Math.round((scores[i] / sum) * (100 - pmNone)) })).sort((a, b) => b.pct - a.pct);
  const [A, B] = pmFit;
  const und = 10;
  const h2h = A && B ? { a: A.id, b: B.id, pa: Math.round((A.pct / (A.pct + B.pct)) * (100 - und)), pb: 0 } : { a: A?.id ?? '', b: '', pa: 100 - und, pb: 0 };
  h2h.pb = 100 - und - h2h.pa;

  const issues = [...ISSUES].map((i) => ({ id: i.id, w: Math.pow(s.issues[i.id], 1.6) })).sort((a, b) => b.w - a.w).slice(0, 4);
  const iw = issues.reduce((a, x) => a + x.w, 0) || 1;
  const topIssues = issues.map((x) => ({ id: x.id, pct: Math.round((x.w / iw) * 85) }));

  // ההפתעה והמפסידה: מול הסקרים של לפני חודשיים
  const old = [...s.pollHistory].reverse().find((h) => s.week - h.week >= 8)?.polls;
  let surprise: Survey['surprise'];
  let loser: Survey['loser'];
  if (old) {
    const ds = parties.filter((p) => old[p.id] !== undefined).map((p) => ({ party: p.id, d: Math.round(((pct[p.id] - old[p.id]) / 100) * 120) }));
    const up = ds.sort((a, b) => b.d - a.d)[0];
    const down = [...ds].sort((a, b) => a.d - b.d)[0];
    if (up && up.d >= 2) surprise = up;
    if (down && down.d <= -2) loser = down;
  }
  const coalition = s.coalition.parties.reduce((a, id) => a + (seats[id] ?? 0), 0);

  let player: Survey['player'];
  if (s.player.fame >= 10) {
    const known = Math.round(clamp(s.player.fame, 0, 98));
    const lik = clamp(0.3 + ((avgApproval(s) - 30) / 50) * 0.5 + (s.player.reputation - 50) / 200, 0.1, 0.85);
    const favorable = Math.round(known * lik);
    player = { known, favorable, unfavorable: Math.round((known - favorable) * 0.8) };
  }
  const bill = surveyBill(s);
  let billQ: Survey['billQ'];
  if (bill) {
    const yes = Math.round(clamp(publicSupport(s, bill.templateId) - 10 + (rand(s) - 0.5) * 6, 4, 90));
    billQ = { ...bill, yes, no: Math.round((100 - yes) * 0.85) };
  }
  let presidentQ: Survey['presidentQ'];
  if ((s.presidentNextWeek ?? Infinity) - s.week <= 30 && !s.presidentRace) {
    const pc = pickCandidates(s).filter((id) => s.npcs[id]);
    if (s.presCampaign) pc.push('player');
    const ps = pc.map((id) => (id === 'player' ? Math.max(1, playerPresidentScore(s) + rand(s) * 8) : Math.max(1, s.npcs[id].influence + s.npcs[id].attitude * 0.05 + rand(s) * 15)));
    const pt = ps.reduce((a, b) => a + b, 0) || 1;
    presidentQ = pc.map((id, i) => ({ id, pct: Math.round((ps[i] / pt) * 80) })).sort((a, b) => b.pct - a.pct);
  }

  return {
    week: s.week,
    pollster: pollster.name,
    sample: pollster.sample,
    margin,
    pct,
    seats,
    pmFit,
    pmNone,
    h2h,
    rightTrack: Math.round(clamp(40 + gov * 30 + (rand(s) - 0.5) * 6, 8, 85)),
    resign: undefined,
    hypos: makeHypos(s),
    govApproval: Math.round(clamp(38 + gov * 30 + (s.coalition.stability - 50) * 0.12 + (rand(s) - 0.5) * 6, 8, 85)),
    topIssues,
    surprise,
    loser,
    blocs: { coalition, opposition: 120 - coalition },
    player,
    billQ,
    presidentQ,
  };
}

export const surveyName = (s: GameState, id: string) => (id === 'player' ? s.player.name : s.npcs[id]?.name ?? '?');

/** פרסום סקר: כותרות, ו"אפקט הסקר" על המשחק עצמו */
export function publishSurvey(s: GameState) {
  const prev = latestSurvey(s);
  const sv = makeSurvey(s);
  sv.resign = resignPressure(s, sv.govApproval);
  s.surveys = [...(s.surveys ?? []), sv].slice(-12);
  const P = POLLSTERS.find((p) => p.name === sv.pollster)!;
  const top = Object.entries(sv.seats).sort((a, b) => b[1] - a[1])[0];
  const name = (id: string) => s.parties[id]?.name ?? '?';
  const lines: string[] = [];
  if (top) lines.push(`${name(top[0])} הגדולה עם ${top[1]} מנדטים`);
  lines.push(`הקואליציה: ${sv.blocs.coalition}`);
  const fit = sv.pmFit[0];
  addNews(s, `סקר ${sv.pollster}: ${lines.join(' · ')}`, 'neutral', false, `מתאים/ה לראשות הממשלה: ${sv.pmFit.slice(0, 3).map((x) => `${surveyName(s, x.id)} ${x.pct}%`).join(', ')}. ${sv.rightTrack}% חושבים שהמדינה בכיוון הנכון. טעות דגימה ${sv.margin}%.`, P.outlet);

  // ההפתעה של הסקר: אפקט העגלה – מי שעולה מושך עוד קולות
  if (sv.surprise && chance(s, 0.7)) {
    addNews(s, `ההפתעה של הסקר: ${name(sv.surprise.party)} מזנקת ב-${sv.surprise.d} מנדטים`, sv.surprise.party === s.player.partyId ? 'good' : 'neutral', sv.surprise.party === s.player.partyId, undefined, P.outlet);
    addMomentum(s, sv.surprise.party, 0.4);
  }
  if (sv.loser && chance(s, 0.5)) {
    addNews(s, `${name(sv.loser.party)} ממשיכה לדמם: ${sv.loser.d} מנדטים בחודשיים`, sv.loser.party === s.player.partyId ? 'bad' : 'neutral', sv.loser.party === s.player.partyId, undefined, P.outlet);
    addMomentum(s, sv.loser.party, -0.3);
  }
  // החלפת מוביל/ה במדד ההתאמה
  if (prev?.pmFit[0] && fit && prev.pmFit[0].id !== fit.id) addNews(s, `לראשונה: ${surveyName(s, fit.id)} עוקף/ת את ${surveyName(s, prev.pmFit[0].id)} במדד ההתאמה לראשות הממשלה`, fit.id === 'player' ? 'good' : 'neutral', fit.id === 'player' || prev.pmFit[0].id === 'player');

  // אפקט המנהיג/ה: מועמד/ת שחזק/ה מהמפלגה מושך/ת אותה למעלה (יותר מזה בבחירה ישירה)
  const k = directElection(s) ? 2 : 1;
  for (const x of sv.pmFit) {
    const pid = x.id === 'player' ? s.player.partyId : s.npcs[x.id]?.partyId;
    const share = pid ? sv.pct[pid] ?? 0 : 0;
    if (pid && share >= 4 && x.pct > share * 1.5) addMomentum(s, pid, 0.15 * k);
    if (pid && share >= 8 && x.pct < share * 0.6) addMomentum(s, pid, -0.1 * k);
  }
  // שביעות הרצון מהממשלה: שותפות לחוצות כשהציבור כועס, רגועות כשהוא מרוצה
  for (const pid of s.coalition.parties) {
    if (s.coalition.satisfaction[pid] === undefined || s.parties[pid]?.leaderId === s.coalition.pmId) continue;
    if (sv.govApproval < 30) s.coalition.satisfaction[pid] = clamp(s.coalition.satisfaction[pid] - 1, 0, 100);
    else if (sv.govApproval > 58) s.coalition.satisfaction[pid] = clamp(s.coalition.satisfaction[pid] + 0.5, 0, 100);
  }
  if (sv.govApproval < 25 && chance(s, 0.5)) addNews(s, `שפל חדש: רק ${sv.govApproval}% מרוצים מתפקוד הממשלה`, 'bad', s.coalition.pmId === 'player', 'בקואליציה מתחילים לחשב מסלול מחדש.');

  // המפלגה שלך מתחת לחסימה – רגע לפני הבחירות זה כבר אומר משהו
  const mine = s.player.partyId;
  if (mine && sv.seats[mine] === 0 && s.parties[mine]?.leaderId === 'player' && s.electionWeek - s.week <= 20)
    addNews(s, `סקר ${sv.pollster}: ${name(mine)} מתחת לאחוז החסימה`, 'bad', true, 'הבוחרים מתחילים לחשוב על "קול אבוד". אולי הגיע הזמן לאיחוד?');
  // סקר "מה אם": אחד מהם מגיע לכותרות
  const hy = sv.hypos?.[Math.floor(rand(s) * (sv.hypos?.length ?? 0))];
  if (hy && chance(s, 0.6)) addNews(s, `סקר ${sv.pollster}: ${hy.text} – ${hy.seats ? `${hy.seats} מנדטים` : 'מתחת לאחוז החסימה'}`, 'neutral', hy.who === 'player', hy.detail, P.outlet);
  if (sv.resign && sv.resign >= 55 && s.coalition.pmId && chance(s, 0.5)) addNews(s, `${sv.resign}% סבורים שראש הממשלה צריך/ה לפרוש`, 'bad', s.coalition.pmId === 'player', undefined, P.outlet);
  if (sv.billQ && chance(s, 0.35)) addNews(s, `${sv.billQ.yes}% תומכים ב"${sv.billQ.title}", ${sv.billQ.no}% מתנגדים`, 'neutral', s.bills.some((b) => b.templateId === sv.billQ!.templateId && b.sponsor === 'player'), undefined, P.outlet);
}

export function tickSurveys(s: GameState) {
  tickMood(s);
  if (s.week % SURVEY_EVERY === 0) publishSurvey(s);
}
