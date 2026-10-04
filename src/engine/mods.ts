// מצב "כנסת אמיתית": טעינת הרכב מפלגות וח"כים מקובץ JSON שהשחקן מספק.
import type { PartyDef } from './data/parties';
import type { GameState, Ideology, IssueId, Sector, WorldKey } from './types';
import { recomputeStability } from './systems/coalition';
import { ministryTitle } from './systems/government';
import { ISSUES } from './data/issues';
import { MINISTRIES } from './systems/government';
import { AXES, SECTORS } from './util';

export interface ModParty {
  id: string;
  name: string;
  short?: string;
  color: string;
  ideology: Ideology;
  seats: number;
  primaries?: boolean;
  sectors?: Partial<Record<Sector, number>>;
  members?: string[]; // שמות לפי סדר הרשימה
  blurb?: string;
  surplusPartner?: string;
  polls?: number; // אחוז בסקרים; אם חסר – מושבים/120
  satisfaction?: number; // שביעות רצון פותחת בקואליציה (0-100)
}

export interface ModFile {
  name: string;
  parties: ModParty[];
  coalition?: string[];
  description?: string;
  source?: string;
  asOf?: string;
  realPeople?: boolean;
  knesset?: number;
  startDate?: string; // YYYY-MM-DD
  electionInWeeks?: number;
  listsClosed?: boolean; // הרשימות כבר נסגרו – אי אפשר להגיש מועמדות
  world?: Partial<Record<WorldKey, number>>;
  issues?: Partial<Record<IssueId, number>>;
  ministers?: Record<string, string>; // משרד → שם הח"כ
}

export function validateMod(raw: unknown): { mod: ModFile | null; errors: string[] } {
  const errors: string[] = [];
  const m = raw as ModFile;
  if (!m || typeof m !== 'object') return { mod: null, errors: ['הקובץ אינו JSON תקין'] };
  if (typeof m.name !== 'string' || !m.name.trim()) errors.push('חסר שדה name');
  if (!Array.isArray(m.parties) || m.parties.length < 2 || m.parties.length > 20) errors.push('parties חייב להיות מערך של 2–20 מפלגות');
  else {
    const ids = new Set<string>();
    let seats = 0;
    m.parties.forEach((p, i) => {
      const where = `מפלגה ${i + 1}`;
      if (!p || typeof p.id !== 'string' || !/^[a-z0-9_-]+$/i.test(p.id)) errors.push(`${where}: id חייב להיות באותיות לטיניות/ספרות`);
      else if (ids.has(p.id)) errors.push(`${where}: id כפול (${p.id})`);
      else ids.add(p.id);
      if (typeof p.name !== 'string' || !p.name.trim()) errors.push(`${where}: חסר name`);
      if (typeof p.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(p.color)) errors.push(`${where}: color צריך להיות בפורמט #RRGGBB`);
      if (!Number.isInteger(p.seats) || p.seats < 0 || p.seats > 120) errors.push(`${where}: seats חייב להיות מספר שלם 0–120`);
      else seats += p.seats;
      if (!p.ideology || AXES.some((a) => typeof p.ideology[a] !== 'number' || Math.abs(p.ideology[a]) > 100)) errors.push(`${where}: ideology צריך econ/security/religion/judiciary בין -100 ל-100`);
      if (p.members !== undefined && (!Array.isArray(p.members) || p.members.some((x) => typeof x !== 'string'))) errors.push(`${where}: members חייב להיות רשימת שמות`);
      if (p.sectors && Object.keys(p.sectors).some((k) => !SECTORS.includes(k as Sector))) errors.push(`${where}: מגזר לא מוכר ב-sectors`);
    });
    if (seats !== 120) errors.push(`סך המושבים צריך להיות 120 (נמצא ${seats})`);
    m.parties.forEach((p, i) => {
      if (p.polls !== undefined && (typeof p.polls !== 'number' || p.polls < 0 || p.polls > 100)) errors.push(`מפלגה ${i + 1}: polls חייב להיות אחוז בין 0 ל-100`);
      if (p.satisfaction !== undefined && (typeof p.satisfaction !== 'number' || p.satisfaction < 0 || p.satisfaction > 100)) errors.push(`מפלגה ${i + 1}: satisfaction בין 0 ל-100`);
    });
    if (m.parties.every((p) => (p.polls ?? p.seats) <= 0)) errors.push('לפחות למפלגה אחת צריכה להיות תמיכה');
    if (m.coalition && (!Array.isArray(m.coalition) || m.coalition.some((c) => !ids.has(c)))) errors.push('coalition מכיל מזהה מפלגה לא קיים');
  }
  if (m.startDate !== undefined && (typeof m.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.startDate) || isNaN(Date.parse(m.startDate)))) errors.push('startDate בפורמט YYYY-MM-DD');
  if (m.knesset !== undefined && (!Number.isInteger(m.knesset) || m.knesset < 1)) errors.push('knesset – מספר שלם חיובי');
  if (m.electionInWeeks !== undefined && (!Number.isInteger(m.electionInWeeks) || m.electionInWeeks < 1 || m.electionInWeeks > 260)) errors.push('electionInWeeks – בין 1 ל-260');
  for (const [k, v] of Object.entries(m.world ?? {})) if (!WORLD_KEYS.includes(k as WorldKey) || typeof v !== 'number' || v < 0 || v > 100) errors.push(`world.${k} – מפתח לא מוכר או ערך מחוץ ל-0–100`);
  for (const [k, v] of Object.entries(m.issues ?? {})) if (!ISSUES.some((i) => i.id === k) || typeof v !== 'number' || v < 0 || v > 100) errors.push(`issues.${k} – סוגיה לא מוכרת או ערך מחוץ ל-0–100`);
  for (const k of Object.keys(m.ministers ?? {})) if (!MINISTRIES.some((x) => x.id === k)) errors.push(`ministers.${k} – משרד לא מוכר`);
  return { mod: errors.length ? null : m, errors };
}

export function modToPartyDefs(mod: ModFile): PartyDef[] {
  return mod.parties.map((p) => ({
    id: p.id,
    name: p.name,
    short: p.short ?? p.name.split(' ')[0],
    color: p.color,
    ideology: p.ideology,
    seats: p.seats,
    primaries: !!p.primaries,
    sectors: p.sectors ?? {},
    namePool: { jewish: 1 },
    blurb: p.blurb ?? 'נטען מקובץ הכנסת.',
  }));
}

export function modSurplusPairs(mod: ModFile): [string, string][] {
  const out: [string, string][] = [];
  for (const p of mod.parties) if (p.surplusPartner && mod.parties.some((q) => q.id === p.surplusPartner) && !out.some(([a, b]) => b === p.id && a === p.surplusPartner)) out.push([p.id, p.surplusPartner]);
  return out;
}

export const WORLD_KEYS: WorldKey[] = ['economy', 'affordability', 'housing', 'security', 'trust', 'cohesion'];

/** תבנית התחלתית לעורך */
export function emptyMod(): ModFile {
  return {
    name: 'הכנסת שלי',
    knesset: 26,
    startDate: '2026-11-01',
    electionInWeeks: 52,
    coalition: ['party_a'],
    parties: [
      { id: 'party_a', name: 'מפלגה א׳', color: '#2563eb', ideology: { econ: 30, security: 50, religion: 20, judiciary: 40 }, seats: 62, primaries: true, members: [] },
      { id: 'party_b', name: 'מפלגה ב׳', color: '#dc2626', ideology: { econ: -30, security: -20, religion: -40, judiciary: -40 }, seats: 58, members: [] },
    ],
  };
}

/** החלת הגדרות התרחיש על משחק חדש (אחרי הקמת הממשלה) */
export function applyModSettings(s: GameState, mod: ModFile) {
  if (mod.startDate) s.startDate = mod.startDate;
  if (mod.knesset) s.knesset = mod.knesset;
  if (mod.electionInWeeks) {
    s.electionWeek = mod.electionInWeeks;
    s.primariesWeek = mod.listsClosed ? -1 : Math.max(1, mod.electionInWeeks - 12);
  }
  for (const [k, v] of Object.entries(mod.world ?? {})) s.world[k as WorldKey] = v!;
  for (const [k, v] of Object.entries(mod.issues ?? {})) s.issues[k as IssueId] = v!;
  s.career.startWorld = Object.values(s.world).reduce((a, b) => a + b, 0) / 6;
  // סקרים פותחים
  const raw = mod.parties.map((p) => ({ id: p.id, v: p.polls ?? (p.seats / 120) * 100 }));
  const total = raw.reduce((a, x) => a + x.v, 0) || 1;
  for (const x of raw) {
    const party = s.parties[x.id];
    if (party) party.poll = party.base = (x.v / total) * 100;
  }
  // שרים לפי הקובץ
  for (const [mid, name] of Object.entries(mod.ministers ?? {})) {
    const npc = Object.values(s.npcs).find((n) => n.name === name && n.isMK && n.partyId && s.coalition.parties.includes(n.partyId));
    if (!npc || npc.ministry === 'pm') continue;
    const prevId = s.ministers[mid];
    const prev = prevId && prevId !== npc.id ? s.npcs[prevId] : undefined;
    const npcOld = npc.ministry;
    if (prev) {
      prev.ministry = undefined;
      prev.title = undefined;
      if (npcOld && npcOld !== 'speaker') {
        prev.ministry = npcOld;
        prev.title = ministryTitle(npcOld, prev.gender);
        s.ministers[npcOld] = prev.id;
      }
    } else if (npcOld && npcOld !== 'speaker') delete s.ministers[npcOld];
    npc.ministry = mid;
    npc.title = ministryTitle(mid, npc.gender);
    s.ministers[mid] = npc.id;
  }
  // שביעות רצון פותחת
  for (const p of mod.parties) if (p.satisfaction !== undefined && s.coalition.satisfaction[p.id] !== undefined) s.coalition.satisfaction[p.id] = p.satisfaction;
  recomputeStability(s);
}

/** ייצוא מצב הכנסת במשחק לקובץ מוד (לעריכה ולשיתוף) */
export function modFromGame(s: GameState): ModFile {
  const parties = Object.values(s.parties).filter((p) => p.seats > 0 || p.poll >= 1);
  return {
    name: `${s.mod ?? 'המשכן'} – שבוע ${s.week + 1}`,
    description: 'יוצא מתוך משחק.',
    knesset: s.knesset,
    startDate: new Date(new Date(s.startDate + 'T12:00:00Z').getTime() + s.week * 7 * 86400000).toISOString().slice(0, 10),
    electionInWeeks: Math.max(1, Math.min(260, s.electionWeek - s.week)),
    coalition: s.coalition.parties.filter((p) => parties.some((x) => x.id === p)),
    world: Object.fromEntries(Object.entries(s.world).map(([k, v]) => [k, Math.round(v)])),
    issues: Object.fromEntries(Object.entries(s.issues).map(([k, v]) => [k, Math.round(v)])),
    parties: parties.map((p) => ({
      id: /^[a-z0-9_-]+$/i.test(p.id) ? p.id : `p_${p.id.replace(/[^a-z0-9]/gi, '')}`,
      name: p.name,
      short: p.short,
      color: p.color,
      ideology: { ...p.ideology },
      seats: p.seats,
      polls: Math.round(p.poll * 10) / 10,
      primaries: p.primaries,
      sectors: p.sectors,
      members: p.list.map((id) => (id === 'player' ? s.player.name : s.npcs[id]?.name)).filter((x): x is string => !!x),
    })),
  };
}

/** "מה אם": להתחיל את אותו תרחיש כ-4 חודשים קודם, כשהרשימות עוד פתוחות (אפשר איחודים ופריימריז) */
export function earlyStart(mod: ModFile, weeks = 17): ModFile {
  const d = mod.startDate ? new Date(mod.startDate + 'T12:00:00Z') : null;
  if (d) d.setUTCDate(d.getUTCDate() - weeks * 7);
  return {
    ...mod,
    name: `${mod.name} – ${Math.round(weeks / 4.33)} חודשים קודם`,
    startDate: d ? d.toISOString().slice(0, 10) : mod.startDate,
    electionInWeeks: (mod.electionInWeeks ?? 52) + weeks,
    listsClosed: false,
    description: `${mod.description ?? ''} מה-אם: אותם נתונים, אבל הרשימות עוד פתוחות – אפשר איחודים, פילוגים ומפלגות חדשות.`.trim(),
  };
}
