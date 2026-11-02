// מחוזות בחירה ושיטות בחירה: ארצית יחסית (ישראל), מחוזית (בריטניה), מעורבת (גרמניה/יפן), ואלקטורים לראשות הממשלה (ארה"ב).
// `rules.districtShare` קובע כמה מהמושבים נקבעים במחוזות (0 = ארצית, 1 = כולם). המושבים שנשארו מוקצים ארצית (עם אחוז חסימה).
// כל התוצאות נגזרות מהסקרים הארציים: מפלגה חזקה במגזרים שמרוכזים במחוז מנצחת שם, גם כשהיא קטנה ארצית.
import { DEFAULT_DISTRICT, DISTRICTS, districtById, type DistrictDef } from '../data/districts';
import { makeLocalRng } from '../rng';
import type { DistrictResult, GameState, Npc, Party, Sector } from '../types';
import { SECTORS, clamp, leanAlignment } from '../util';
import { allocateSeats } from './elections';
import { addNews } from './news';
import { log } from './report';
import { spawnCandidate } from '../newGame';

export type Rng = () => number;

// ---------------- איזה שיטה בתוקף ----------------

export const districtShare = (s: GameState): number => clamp(s.rules.districtShare ?? (s.rules.districts ? 1 : 0), 0, 1);
export const usesDistricts = (s: GameState) => districtShare(s) > 0;
export type SystemKind = 'pr' | 'mixed' | 'fptp';
export const systemKind = (s: GameState): SystemKind => (districtShare(s) <= 0 ? 'pr' : districtShare(s) >= 1 ? 'fptp' : 'mixed');
export const constituencyTotal = (s: GameState) => Math.round(120 * districtShare(s));

export function systemLabel(s: GameState): string {
  const k = systemKind(s);
  if (k === 'pr') return 'ארצית יחסית (כמו ישראל)';
  if (k === 'fptp') return 'מחוזית – המנצח לוקח הכול (כמו בריטניה)';
  const c = constituencyTotal(s);
  return `מעורבת: ${c} מושבים במחוזות, ${120 - c} ארציים`;
}

export const SHARE_PRESETS: { share: number; label: string }[] = [
  { share: 0, label: '🇮🇱 ארצית יחסית' },
  { share: 0.3, label: '🗺️ מעורבת 30% מחוזות' },
  { share: 0.5, label: '🇩🇪 מעורבת 50/50' },
  { share: 0.7, label: '🗺️ מעורבת 70% מחוזות' },
  { share: 1, label: '🇬🇧 מחוזית מלאה' },
];

/** בכמה מושבים בודדים מנצח מי שמוביל בכל מחוז (הקצאה לפי שארית גדולה) */
export function constituencyCounts(share: number): Record<string, number> {
  const total = Math.round(120 * clamp(share, 0, 1));
  const raw = DISTRICTS.map((d) => ({ id: d.id, x: (d.seats / 120) * total }));
  const out: Record<string, number> = Object.fromEntries(raw.map((r) => [r.id, Math.floor(r.x)]));
  let left = total - Object.values(out).reduce((a, b) => a + b, 0);
  for (const r of [...raw].sort((a, b) => b.x - Math.floor(b.x) - (a.x - Math.floor(a.x)))) {
    if (left <= 0) break;
    out[r.id] += 1;
    left -= 1;
  }
  return out;
}

// ---------------- הרכב האוכלוסייה והזיקה של מפלגות ----------------

/** הרכב המחוז אחרי שינויי האוכלוסייה במשחק */
export function composition(s: GameState, d: DistrictDef): Record<Sector, number> {
  const raw = Object.fromEntries(SECTORS.map((k) => [k, d.comp[k] * (s.demo?.[k] ?? 1)])) as Record<Sector, number>;
  return normalizeComp(raw);
}

function normalizeComp(raw: Record<Sector, number>): Record<Sector, number> {
  const sum = SECTORS.reduce((a, k) => a + raw[k], 0) || 1;
  return Object.fromEntries(SECTORS.map((k) => [k, raw[k] / sum])) as Record<Sector, number>;
}

/** כמה מפלגה מתאימה לאוכלוסייה מסוימת: הרכב מגזרי + נטייה פוליטית של האזור */
export function affinity(p: Party, comp: Record<Sector, number>, d: DistrictDef): number {
  const has = SECTORS.some((k) => (p.sectors[k] ?? 0) > 0);
  let a = 0.06;
  for (const k of SECTORS) a += comp[k] * (p.sectors[k] ?? (has ? 0 : 0.5));
  if (!has) a += 0.2;
  // חזקה: מפלגה מגזרית מרוכזת מנצחת בחזקתה, ומפלגת "כולם" לא נראית חזקה בכל מקום
  return Math.pow(a, 1.5) * Math.exp(0.7 * leanAlignment(p.ideology, d.lean));
}

// ---------------- אחוזי קולות לפי מחוז ----------------

const pollsOf = (s: GameState): Record<string, number> => Object.fromEntries(Object.values(s.parties).map((p) => [p.id, p.poll]));

/** השפעות מקומיות: עבודה בשטח (דועכת) ושרטוט גבולות (קבוע) – בנקודות אחוז */
const localBias = (s: GameState, d: string, p: string) => (s.districtBias?.[d]?.[p] ?? 0) + (s.gerryBias?.[d]?.[p] ?? 0);

/**
 * אחוז הקולות של כל מפלגה בכל מחוז. הסקרים הארציים נשמרים (התאמה איטרטיבית), ואז באה העבודה המקומית.
 * votes = קולות או אחוזים ארציים; ברירת מחדל: הסקרים של היום.
 */
export function districtShares(s: GameState, votes: Record<string, number> = pollsOf(s)): Record<string, Record<string, number>> {
  const parties = Object.values(s.parties).filter((p) => (votes[p.id] ?? 0) > 0);
  const tot = parties.reduce((a, p) => a + votes[p.id], 0) || 1;
  const target = Object.fromEntries(parties.map((p) => [p.id, (votes[p.id] / tot) * 100]));
  const aff: Record<string, Record<string, number>> = {};
  for (const d of DISTRICTS) {
    const comp = composition(s, d);
    aff[d.id] = Object.fromEntries(parties.map((p) => [p.id, affinity(p, comp, d)]));
  }
  const f = Object.fromEntries(parties.map((p) => [p.id, 1]));
  const calc = () => {
    const out: Record<string, Record<string, number>> = {};
    for (const d of DISTRICTS) {
      const w = parties.map((p) => target[p.id] * aff[d.id][p.id] * f[p.id]);
      const sum = w.reduce((a, b) => a + b, 0) || 1;
      out[d.id] = Object.fromEntries(parties.map((p, i) => [p.id, (w[i] / sum) * 100]));
    }
    return out;
  };
  let res = calc();
  for (let it = 0; it < 8; it++) {
    for (const p of parties) {
      const nat = DISTRICTS.reduce((a, d) => a + (d.seats / 120) * res[d.id][p.id], 0) || 0.01;
      f[p.id] *= Math.pow(target[p.id] / nat, 0.85);
    }
    res = calc();
  }
  // עבודה מקומית וגבולות
  for (const d of DISTRICTS) {
    const w = parties.map((p) => res[d.id][p.id] * Math.exp(localBias(s, d.id, p.id) / 18));
    const sum = w.reduce((a, b) => a + b, 0) || 1;
    res[d.id] = Object.fromEntries(parties.map((p, i) => [p.id, Math.round((w[i] / sum) * 1000) / 10]));
  }
  return res;
}

/** מי מוביל במחוז ובכמה נקודות */
export function localLeader(shares: Record<string, number>): { id: string; margin: number; second: string } {
  const sorted = Object.entries(shares).sort((a, b) => b[1] - a[1]);
  return { id: sorted[0]?.[0] ?? '', margin: Math.round(((sorted[0]?.[1] ?? 0) - (sorted[1]?.[1] ?? 0)) * 10) / 10, second: sorted[1]?.[0] ?? '' };
}

// ---------------- מושבים לפי שיטה ----------------

export interface SystemResult {
  seats: Record<string, number>;
  districts: DistrictResult[];
  /** מושבים שנקבעו במחוז: מפלגה → מחוז → כמה */
  wins: Record<string, Record<string, number>>;
  /** מושבים ארציים (רשימה) לכל מפלגה */
  listSeats: Record<string, number>;
  districtMode: boolean;
}

const gauss = (r: Rng) => r() + r() + r() - 1.5; // בערך ‎N(0, 0.5)

/** ניצחון בכל מושב בודד במחוז: הרכב מקומי "מתנדנד" סביב הממוצע של המחוז, ועוד מזל של מועמד */
function runConstituencies(s: GameState, shares: Record<string, Record<string, number>>, counts: Record<string, number>, r: Rng) {
  const wins: Record<string, Record<string, number>> = {};
  const parties = Object.values(s.parties);
  for (const d of DISTRICTS) {
    const n = counts[d.id] ?? 0;
    if (!n) continue;
    const base = composition(s, d);
    for (let k = 0; k < n; k++) {
      const jittered = normalizeComp(Object.fromEntries(SECTORS.map((sec) => [sec, base[sec] * Math.exp(1.1 * (2 * r() - 1))])) as Record<Sector, number>);
      let best = '';
      let bestScore = -Infinity;
      for (const p of parties) {
        const sh = shares[d.id]?.[p.id] ?? 0;
        if (sh <= 0) continue;
        const local = Math.pow(affinity(p, jittered, d) / affinity(p, base, d), 1.6);
        const score = sh * local * Math.exp(0.35 * gauss(r));
        if (score > bestScore) {
          bestScore = score;
          best = p.id;
        }
      }
      if (best) ((wins[best] ??= {})[d.id] = (wins[best][d.id] ?? 0) + 1);
    }
  }
  return wins;
}

/**
 * המרת קולות למושבים לפי שיטת הבחירות בתוקף.
 * r = מקור אקראיות: בבחירות עצמן rand(s), ובתחזיות מקור מקומי קבוע (כדי שהמסך יציב).
 */
export function allocateBySystem(s: GameState, votes: Record<string, number>, surplus: Record<string, string | undefined>, r: Rng): SystemResult {
  const shares = districtShares(s, votes);
  const share = districtShare(s);
  const counts = constituencyCounts(share);
  const C = Object.values(counts).reduce((a, b) => a + b, 0);
  const L = 120 - C;
  const thr = (s.rules?.threshold ?? 3.25) / 100;
  const wins = C > 0 ? runConstituencies(s, shares, counts, r) : {};
  const list = L > 0 ? allocateSeats(votes, surplus, L, thr) : {};
  const seats: Record<string, number> = {};
  const listSeats: Record<string, number> = {};
  for (const p of Object.values(s.parties)) {
    const w = Object.values(wins[p.id] ?? {}).reduce((a, b) => a + b, 0);
    listSeats[p.id] = list[p.id] ?? 0;
    seats[p.id] = w + listSeats[p.id];
  }
  const districts: DistrictResult[] = DISTRICTS.map((d) => ({
    id: d.id,
    shares: shares[d.id] ?? {},
    seats: Object.fromEntries(Object.entries(wins).filter(([, m]) => m[d.id]).map(([p, m]) => [p, m[d.id]])),
  }));
  return { seats, districts, wins, listSeats, districtMode: C > 0 };
}

let memo: { key: string; res: SystemResult } | null = null;

/** תחזית מושבים לפי הסקרים של היום (יציבה: אותה תחזית כל עוד הסקרים לא זזו) */
export function projectElection(s: GameState): SystemResult {
  const parts = Object.values(s.parties).map((p) => `${p.id}:${Math.round(p.poll * 10)}`).join(',');
  const key = `${s.week}|${s.knesset}|${districtShare(s)}|${s.rules.threshold}|${parts}|${JSON.stringify(s.districtBias)}|${JSON.stringify(s.gerryBias)}`;
  if (memo?.key === key) return memo.res;
  const surplus = Object.fromEntries(Object.values(s.parties).map((p) => [p.id, p.surplusPartner]));
  const res = allocateBySystem(s, pollsOf(s), surplus, makeLocalRng((s.seed ^ (s.week * 977) ^ (s.knesset * 31)) | 0));
  memo = { key, res };
  return res;
}

/** כמה מנדטים מצפים למפלגה: בשיטה ארצית – כמו תמיד; בשיטות מחוזיות – התחזית לפי מחוזות */
export function seatsEstimate(s: GameState, partyId: string, pollSeatsFn: (poll: number, thr: number) => number): number {
  const p = s.parties[partyId];
  if (!p) return 0;
  if (!usesDistricts(s)) return pollSeatsFn(p.poll, s.rules.threshold ?? 3.25);
  return projectElection(s).seats[partyId] ?? 0;
}

// ---------------- מחוז הבית ----------------

const hash = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 2 ** 32;
};

/** מחוז בית לדמות: לפי הזיקה של המפלגה שלה לכל מחוז (דטרמיניסטי) */
export function computeHome(s: GameState, n: Npc): string {
  const party = n.partyId ? s.parties[n.partyId] : null;
  const w = DISTRICTS.map((d) => d.seats * (party ? affinity(party, composition(s, d), d) : 1));
  const sum = w.reduce((a, b) => a + b, 0);
  let u = hash(n.id) * sum;
  for (let i = 0; i < w.length; i++) {
    u -= w[i];
    if (u <= 0) return DISTRICTS[i].id;
  }
  return DISTRICTS[DISTRICTS.length - 1].id;
}

export const homeOf = (s: GameState, id: string): string => (id === 'player' ? s.player.district ?? DEFAULT_DISTRICT : s.npcs[id]?.district ?? (s.npcs[id] ? computeHome(s, s.npcs[id]) : DEFAULT_DISTRICT));
export const playerDistrict = (s: GameState) => s.player.district ?? DEFAULT_DISTRICT;

/** קיבוע מחוז הבית לכולם (בתחילת המשחק ובכל בחירות) */
export function ensureHomes(s: GameState) {
  for (const n of Object.values(s.npcs)) if (!n.district && (n.partyId || n.isMK)) n.district = computeHome(s, n);
  s.player.district ??= null;
}

// ---------------- עבודה מקומית ----------------

export function boostDistrict(s: GameState, districtId: string, partyId: string | null | undefined, d: number) {
  if (!partyId || !districtById(districtId)) return;
  const m = ((s.districtBias ??= {})[districtId] ??= {});
  m[partyId] = clamp((m[partyId] ?? 0) + d, -25, 25);
}

/** מקום קבוע של פעולות שדה: מחזק את מפלגת השחקן במחוז הבית (בשיטה מחוזית – משפיע ממש; בארצית – קצת תדמית) */
export function boostHome(s: GameState, amount: number) {
  if (!s.player.partyId) return;
  boostDistrict(s, playerDistrict(s), s.player.partyId, amount);
}

export function tickDistricts(s: GameState) {
  for (const m of Object.values(s.districtBias ?? {})) for (const p of Object.keys(m)) {
    m[p] *= 0.985;
    if (Math.abs(m[p]) < 0.1) delete m[p];
  }
}

export function visitDistrict(s: GameState, districtId: string): { ok: boolean; text: string } {
  const d = districtById(districtId);
  if (!d) return { ok: false, text: 'מחוז לא קיים' };
  if (!s.player.partyId) return { ok: false, text: 'צריך מפלגה' };
  if (s.player.ap < 1) return { ok: false, text: 'אין מספיק זמן השבוע' };
  const cool = Number(s.flags[`visit_${districtId}`] ?? -99);
  if (s.week - cool < 3) return { ok: false, text: 'ביקרת כאן לא מזמן' };
  s.player.ap -= 1;
  s.flags[`visit_${districtId}`] = s.week;
  const home = playerDistrict(s) === districtId;
  boostDistrict(s, districtId, s.player.partyId, home ? 4 : 2.5);
  s.player.fame = Math.min(100, s.player.fame + 0.4);
  return { ok: true, text: `ביקרת ב${d.name}. ${home ? 'בבית – התמיכה מתחזקת.' : 'פנים חדשות במחוז זר: התמיכה עולה מעט.'}` };
}

export function moveHomeBlocked(s: GameState, districtId: string): string | null {
  if (playerDistrict(s) === districtId) return 'זה כבר מחוז הבית שלך';
  if (s.player.money < 30) return 'צריך 30 אלף ₪ למעבר';
  if (s.week - Number(s.flags.movedHome ?? -999) < 52) return 'עברת דירה לאחרונה';
  return null;
}

export function moveHome(s: GameState, districtId: string): { ok: boolean; text: string } {
  const b = moveHomeBlocked(s, districtId);
  if (b) return { ok: false, text: b };
  const d = districtById(districtId)!;
  s.player.money -= 30;
  s.player.district = districtId;
  s.flags.movedHome = s.week;
  s.player.reputation = Math.max(0, s.player.reputation - 2);
  log(s, `עברת להתגורר ב${d.name}. מעכשיו תתמודד/י שם.`, 'career');
  addNews(s, `${s.player.name} עובר/ת להתמודד ב${d.name}`, 'neutral', true, 'יריבים מכנים את המהלך "צנחן". אנשי המחוז מחכים לראות.');
  return { ok: true, text: `מחוז הבית: ${d.name}. "צנחן" – המוניטין נפגע מעט.` };
}

/** משיכה של ח"כ מקומי: אם החוק מיטיב עם המגזרים שחיים במחוז שלו – הוא נוטה לתמוך (חזק יותר בשיטה מחוזית) */
export function districtPull(s: GameState, n: Npc, sectors: Partial<Record<Sector, number>>): number {
  const share = districtShare(s);
  if (share <= 0) return 0;
  const d = districtById(homeOf(s, n.id));
  if (!d) return 0;
  const comp = composition(s, d);
  const x = SECTORS.reduce((a, k) => a + (sectors[k] ?? 0) * comp[k], 0);
  return clamp(x / 6, -0.8, 0.8) * (0.4 + share);
}

// ---------------- בחירת הנבחרים בתוך מפלגה ----------------

/**
 * מי נבחר מרשימת המפלגה: היו"ר תמיד (מושב בטוח), אחריו מועמדים שמחוז הבית שלהם נכבש, ואז לפי סדר הרשימה (מושבים ארציים).
 * מחוז שנכבש בלי מועמד מקומי מקבל מועמד/ת חדש/ה.
 */
export function pickElected(s: GameState, p: Party, wins: Record<string, number>, listSeats: number, taken: Set<string>): string[] {
  const total = p.seats;
  if (total <= 0) return [];
  const list = p.list.filter((id) => id === 'player' || (s.npcs[id] && !taken.has(id)));
  const out: string[] = [];
  const left: Record<string, number> = { ...wins };
  let listLeft = listSeats;
  const best = () => Object.entries(left).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (list.includes(p.leaderId)) {
    if (listLeft > 0) listLeft -= 1;
    else {
      const d = best();
      if (d) {
        left[d] -= 1;
        if (p.leaderId !== 'player' && s.npcs[p.leaderId]) s.npcs[p.leaderId].district = d;
      }
    }
    out.push(p.leaderId);
  }
  for (const [d, need] of Object.entries(left).sort((a, b) => b[1] - a[1])) {
    if (need <= 0) continue;
    const locals = list.filter((id) => !out.includes(id) && homeOf(s, id) === d).slice(0, need);
    out.push(...locals);
    for (let i = locals.length; i < need; i++) {
      const fresh = spawnCandidate(s, p.id);
      fresh.district = d;
      out.push(fresh.id);
    }
  }
  for (const id of list) {
    if (listLeft <= 0) break;
    if (!out.includes(id)) {
      out.push(id);
      listLeft -= 1;
    }
  }
  // אם הרשימה קצרה מהנדרש (נדיר): ממלאים במועמדים חדשים
  while (out.length < total) {
    const fresh = spawnCandidate(s, p.id);
    fresh.district = best() ?? fresh.district;
    out.push(fresh.id);
  }
  return out.slice(0, total);
}

// ---------------- נוסחאות הצבעה: חובה והורדת גיל ----------------

/** מכפיל לקולות מפלגה בגלל חוקי ההצבעה (חובת הצבעה, גיל 16) */
export function voterModifier(s: GameState, p: Party): number {
  let m = 1;
  if (s.rules.compulsory) {
    const tot = SECTORS.reduce((a, k) => a + (p.sectors[k] ?? 0), 0) || 1;
    m *= 1 + 0.14 * ((p.sectors.arab ?? 0) / tot) + 0.05 * ((p.sectors.traditional ?? 0) / tot);
  }
  if (s.rules.age16) m *= Math.exp(0.1 * leanAlignment(p.ideology, { econ: -30, religion: -40, security: -25, judiciary: -20 }));
  return m;
}

// ---------------- שרטוט גבולות ----------------

/** חוק הגבולות: מרכז את מצביעי האופוזיציה במחוזות מעטים ומפזר אותם בשאר – לטובת הקואליציה בשיטה מחוזית */
export function applyGerrymander(s: GameState, strength: 1 | 2 | 3) {
  const sh = districtShares(s);
  const coal = new Set(s.coalition.parties);
  const k = strength * 3;
  const bias: Record<string, Record<string, number>> = {};
  for (const d of DISTRICTS) {
    const lead = localLeader(sh[d.id]);
    const oppLeads = !coal.has(lead.id);
    const row: Record<string, number> = {};
    for (const p of Object.values(s.parties)) {
      if (p.seats <= 0 && p.poll < 1) continue;
      const mine = coal.has(p.id);
      // מחוזות שהאופוזיציה מובילה בהם: מכניסים עוד מצביעי אופוזיציה ("ארוזים"); בשאר – מפזרים אותם
      row[p.id] = oppLeads ? (mine ? -k * 0.4 : k) : mine ? k * 0.7 : -k * 0.7;
    }
    bias[d.id] = row;
  }
  for (const [d, row] of Object.entries(bias)) for (const [p, v] of Object.entries(row)) {
    const m = ((s.gerryBias ??= {})[d] ??= {});
    m[p] = clamp((m[p] ?? 0) + v, -30, 30);
  }
}
export const clearGerrymander = (s: GameState) => {
  s.gerryBias = {};
};

