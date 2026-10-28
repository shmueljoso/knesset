// דמויות ציבוריות מחוץ לכנסת (mods/public-figures-israel.json): אנשי ביטחון, ראשי ערים, כלכלה, מחאה,
// רבנים ומפורסמים. הם מגיבים לאירועים, ממליצים על מפלגות, מאיימים בשביתות, נותנים חוות דעת –
// ולפעמים נכנסים לפוליטיקה: מצטרפים לרשימה או מקימים מפלגה. פעילים רק במצב "אמיתי".
import pack from '../../../mods/public-figures-israel.json' with { type: 'json' };
import { makeAvatar } from '../avatarGen';
import { chance, makeLocalRng, pick, pickWeighted } from '../rng';
import type { GameState, Ideology, Npc } from '../types';
import { clamp, ideologyDistance, leanAlignment } from '../util';
import { addNews } from './news';
import { addMomentum } from './opinion';
import { listsOpen } from './mergers';
import { foundByNpc } from './figures';
import { changeAttitude } from './relationships';
import { bumpIssue } from './issues';

export type OutsideKind = 'security' | 'politician' | 'mayor' | 'union' | 'official' | 'activist' | 'rabbi' | 'business' | 'celebrity';

export interface PublicFigure {
  id: string;
  name: string;
  gender: 'm' | 'f';
  kind: OutsideKind;
  title: string;
  fame: number;
  canRun: boolean;
  lean: Partial<Ideology>;
}

export const FIGURES_PACK = pack as unknown as { source: string; asOf: string; figures: PublicFigure[] };

export const KIND_LABEL: Record<OutsideKind, string> = {
  security: 'ביטחון',
  politician: 'פוליטיקה',
  mayor: 'שלטון מקומי',
  union: 'עבודה',
  official: 'שירות ציבורי',
  activist: 'מחאה ואקטיביזם',
  rabbi: 'הנהגה רוחנית',
  business: 'עסקים',
  celebrity: 'תרבות ובידור',
};

const hash = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};

function makeFigure(s: GameState, f: PublicFigure): Npc {
  const rnd = makeLocalRng(s.seed ^ hash(f.id));
  const ideology = { econ: 0, security: 0, religion: 0, judiciary: 0, ...f.lean };
  return {
    id: `rf_${f.id}`,
    name: f.name,
    gender: f.gender,
    partyId: null,
    role: 'candidate',
    isMK: false,
    title: f.title,
    avatar: { ...makeAvatar(rnd, f.gender, f.kind === 'rabbi' ? 'haredi' : 'jewish'), age: 45 + Math.floor(rnd() * 25) },
    ideology,
    traits: [(['principled', 'vain', 'pragmatic', 'opportunist'] as const)[Math.floor(rnd() * 4)]],
    knownTraits: [],
    influence: f.fame,
    attitude: Math.round(clamp(leanAlignment(s.player.ideology, ideology) * 20, -30, 30)),
    trust: 30,
    lastContact: -10,
    friends: [],
    haunts: ['plaza', 'studio'],
    notable: true,
    primaryStrength: f.fame,
    pledges: [],
    bio: `${f.title}.`,
    agenda: '',
    ambition: f.canRun ? 60 : 10,
    memory: [],
    media: 'real',
    realId: f.id,
    outside: f.kind,
  };
}

/** יוצר/מסתיר את הדמויות לפי המצב. דמות שכבר קיימת במשחק בשמה (למשל ברשימה של מפלגה) – לא נוצרת שוב */
export function ensureOutsiders(s: GameState, on: boolean) {
  if (on) {
    const names = new Set(Object.values(s.npcs).filter((n) => !n.outside).map((n) => n.name));
    if (s.player.name) names.add(s.player.name);
    for (const f of FIGURES_PACK.figures) if (!s.npcs[`rf_${f.id}`] && !names.has(f.name)) s.npcs[`rf_${f.id}`] = makeFigure(s, f);
  }
  for (const n of Object.values(s.npcs)) {
    if (!n.outside || n.partyId) continue;
    n.notable = on;
    n.haunts = on ? ['plaza', 'studio'] : [];
  }
}

/** דמויות פעילות מבחוץ (לא חברות במפלגה) */
export const activeOutsiders = (s: GameState) => (s.settings?.media === 'real' ? Object.values(s.npcs).filter((n) => n.outside && !n.partyId && n.notable) : []);

const kindOf = (n: Npc) => n.outside as OutsideKind;
const canRun = (n: Npc) => FIGURES_PACK.figures.find((f) => `rf_${f.id}` === n.id)?.canRun ?? false;
const pmParty = (s: GameState) => (s.coalition.pmId === 'player' ? s.player.partyId : s.npcs[s.coalition.pmId]?.partyId) ?? null;
const pmName = (s: GameState) => (s.coalition.pmId === 'player' ? s.player.name : s.npcs[s.coalition.pmId]?.name ?? 'ראש הממשלה');

/** המפלגה הקרובה ביותר אידיאולוגית שעוברת את אחוז החסימה בסקרים */
function closestParty(s: GameState, n: Npc) {
  return Object.values(s.parties)
    .filter((p) => p.poll >= s.rules.threshold)
    .sort((a, b) => ideologyDistance(a.ideology, n.ideology) - ideologyDistance(b.ideology, n.ideology))[0];
}

/** הדמות מצטרפת לרשימה (מקום 2–4) – בלי מושב עד הבחירות */
export function joinList(s: GameState, n: Npc, partyId: string, slot = 2) {
  const p = s.parties[partyId];
  if (!p) return;
  n.partyId = partyId;
  n.role = 'candidate';
  p.list = p.list.filter((x) => x !== n.id);
  p.list.splice(Math.min(slot, p.list.length), 0, n.id);
  addMomentum(s, partyId, 0.5 + n.influence / 40);
}

/** תגובה/מהלך שבועי של דמות אחת */
function act(s: GameState, n: Npc) {
  const k = kindOf(n);
  const gov = pmParty(s);
  const govIdeo = gov ? s.parties[gov]?.ideology : null;
  const critical = govIdeo ? ideologyDistance(govIdeo, n.ideology) > 0.45 : false;
  const toElection = s.electionWeek - s.week;

  // כניסה לפוליטיקה: לפני סגירת הרשימות, כשהבחירות מתקרבות
  if (canRun(n) && listsOpen(s) && toElection < 45 && toElection > 10 && chance(s, 0.12 + n.influence / 1000)) {
    if (n.influence >= 70 && chance(s, 0.35)) {
      const party = foundByNpc(s, n.id);
      if (party) return;
    }
    const target = closestParty(s, n);
    if (target) {
      joinList(s, n, target.id, 2 + Math.floor(Math.min(2, (100 - n.influence) / 25)));
      addNews(s, `${n.name} נכנס/ת לפוליטיקה: מצטרף/ת ל${target.name}`, 'neutral', false, `${n.title} יקבל/תקבל מקום גבוה ברשימה.`, 'ערוץ המשכן', n.id);
      return;
    }
  }

  // המלצה לפני בחירות
  if (toElection > 0 && toElection < 20 && (k === 'rabbi' || k === 'celebrity' || k === 'mayor') && chance(s, 0.5)) {
    const party = k === 'rabbi' ? Object.values(s.parties).sort((a, b) => (b.sectors.haredi ?? 0) - (a.sectors.haredi ?? 0))[0] : closestParty(s, n);
    if (party) {
      addMomentum(s, party.id, k === 'rabbi' ? 1.2 : 0.6);
      addNews(s, k === 'rabbi' ? `${n.name} הורה לציבור: "להצביע ל${party.name}"` : `${n.name} מודיע/ה: "אני מצביע/ה ${party.short}"`, 'neutral', party.id === s.player.partyId, undefined, undefined, n.id);
      return;
    }
  }

  // תגובות לפי התחום
  const lines: { h: string; fx?: () => void }[] = [];
  if (k === 'security') lines.push(s.world.security < 45 ? { h: `${n.name}: "הדרג המדיני מפקיר את הביטחון"`, fx: () => gov && addMomentum(s, gov, -0.4) } : { h: `${n.name} בכנס ביטחוני: "האיום הבא כבר כאן"` });
  if (k === 'politician') lines.push(critical ? { h: `${n.name} תוקף/ת את ${pmName(s)}: "הממשלה הזו איבדה את הדרך"`, fx: () => gov && addMomentum(s, gov, -0.3) } : { h: `${n.name}: "צריך ממשלה רחבה ויציבה"` });
  if (k === 'mayor') lines.push({ h: s.world.housing < 40 ? `${n.name}: "הממשלה תקעה לנו את הבנייה"` : `${n.name} חונך/ת שכונה חדשה – ומבקר/ת את הממשלה` });
  if (k === 'union')
    lines.push(
      s.issues.wages > 50 || s.issues.cost > 55
        ? { h: `${n.name} מאיים בשביתה כללית: "העובדים לא ישלמו את המחיר"`, fx: () => { bumpIssue(s, 'wages', 5); s.coalition.stability = clamp(s.coalition.stability - 2, 0, 100); } }
        : { h: `${n.name} חותם על הסכם קיבוצי חדש` },
    );
  if (k === 'official')
    lines.push(
      n.ideology.judiciary < -40
        ? s.issues.judiciary > 50 ? { h: `${n.name}: "ההחלטה של הממשלה אינה חוקית"`, fx: () => { s.coalition.stability = clamp(s.coalition.stability - 2, 0, 100); } } : { h: `${n.name} מזהירה מפני "פגיעה בשומרי הסף"` }
        : { h: s.world.economy < 45 ? `${n.name} מזהיר: "בלי צעדים – המשק בסכנה"` : `${n.name}: "הריבית תישאר ללא שינוי"` },
    );
  if (k === 'activist') lines.push(critical ? { h: `${n.name} ${n.gender === 'f' ? 'מובילה' : 'מוביל'} הפגנה מול הכנסת: "לא נשתוק"`, fx: () => { s.coalition.stability = clamp(s.coalition.stability - 1, 0, 100); bumpIssue(s, 'judiciary', 2); } } : { h: `${n.name} מארגן/ת עצרת תמיכה בממשלה` });
  if (k === 'rabbi') lines.push(s.issues.draft > 55 ? { h: `${n.name}: "לא נוותר על עולם התורה"`, fx: () => bumpIssue(s, 'draft', 2) } : { h: `${n.name} מכנס את גדולי התורה לדיון על הבחירות` });
  if (k === 'business') lines.push({ h: s.world.economy < 45 ? `${n.name}: "ההייטק בורח – והממשלה ישנה"` : `${n.name} מזהיר: "אל תהרגו את תרנגולת הזהב"` });
  if (k === 'celebrity') lines.push(critical ? { h: `הסרטון של ${n.name} נגד הממשלה – מיליון צפיות`, fx: () => gov && addMomentum(s, gov, -0.2) } : { h: `${n.name} ברשת: "תפסיקו לריב, תתחילו לעבוד"` });
  const l = pick(s, lines);
  l.fx?.();
  addNews(s, l.h, 'neutral', false, undefined, undefined, n.id);
}

export function tickOutsiders(s: GameState) {
  const pool = activeOutsiders(s);
  if (!pool.length || !chance(s, 0.35)) return;
  const n = pickWeighted(s, pool, (x) => x.influence);
  if (n) act(s, n);
}

// ---------------- השחקן מגייס/ת כוכב/ת לרשימה ----------------

export function recruitBlocked(s: GameState, id: string): string | null {
  const n = s.npcs[id];
  const p = s.player;
  const party = p.partyId ? s.parties[p.partyId] : null;
  if (!n?.outside || n.partyId) return 'לא זמין/ה';
  if (!canRun(n)) return `${n.title} – לא נכנס/ת לפוליטיקה`;
  if (!party || party.leaderId !== 'player') return 'רק יו"ר מפלגה יכול/ה להציע מקום ברשימה';
  if (!listsOpen(s)) return 'הרשימות כבר נסגרו';
  if (p.ap < 1) return 'אין מספיק זמן השבוע';
  const last = Number(s.flags[`recruit_${id}`] ?? -99);
  if (s.week - last < 8) return `כבר דיברתם – עוד ${8 - (s.week - last)} שבועות`;
  return null;
}

export function recruitChance(s: GameState, id: string): number {
  const n = s.npcs[id];
  const party = s.parties[s.player.partyId ?? ''];
  if (!n || !party) return 0;
  return clamp(0.2 + n.attitude / 150 + (1 - ideologyDistance(n.ideology, party.ideology)) * 0.35 + party.poll / 70 - (n.influence > 70 ? 0.1 : 0), 0.05, 0.9);
}

export function recruitFigure(s: GameState, id: string): { ok: boolean; text: string } {
  const b = recruitBlocked(s, id);
  if (b) return { ok: false, text: b };
  const n = s.npcs[id];
  const party = s.parties[s.player.partyId!];
  s.player.ap -= 1;
  s.flags[`recruit_${id}`] = s.week;
  if (!chance(s, recruitChance(s, id))) {
    changeAttitude(s, id, -4, { spread: false });
    return { ok: false, text: `${n.name}: "תודה על ההצעה. זה לא הזמן בשבילי."` };
  }
  joinList(s, n, party.id, 1);
  changeAttitude(s, id, 15, { spread: false });
  addNews(s, `המהלך של ${s.player.name}: ${n.name} מצטרף/ת ל${party.name}`, 'good', true, `${n.title} יקבל/תקבל את המקום השני ברשימה.`, 'ערוץ המשכן', n.id);
  return { ok: true, text: `${n.name} הצטרף/ה! מקום 2 ברשימה, והמפלגה בתנופה.` };
}
