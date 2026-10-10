// סוף הקריירה: ציון, תואר וסיכום מורשת.
import { templateById } from '../data/bills';
import { TRANSFORM_INFO } from '../data/transforms';
import type { GameState, LawRecord } from '../types';

export const ENDINGS: Record<string, { title: string; text: string; canContinue: boolean }> = {
  retired: { title: 'פרישה מהחיים הפוליטיים', text: 'החלטת שהגיע הזמן. מסיבת פרידה במזנון, נאום אחרון במליאה.', canContinue: true },
  convicted: { title: 'הרשעה', text: 'בית המשפט הרשיע אותך. הדלת לפוליטיקה נסגרה.', canContinue: false },
  outside: { title: 'מחוץ למשחק', text: 'פעמיים ברצף לא נבחרת לכנסת. הקהל עבר הלאה.', canContinue: true },
  pm_term: { title: 'קדנציה מלאה כראש ממשלה', text: 'השלמת קדנציה שלמה בראשות הממשלה. מעטים הגיעו לכאן.', canContinue: true },
  president: { title: 'נשיא/ת המדינה', text: 'הכנסת בחרה בך לנשיאות. שבע שנים בבית הנשיא – מעל הפוליטיקה, ולתמיד בספרי ההיסטוריה.', canContinue: false },
};

export interface Legacy {
  score: number;
  title: string;
  laws: LawRecord[];
  coLaws: LawRecord[];
  roles: string[];
  allies: number;
  enemies: number;
  worldDelta: number;
  tags: string[];
}

export function computeLegacy(s: GameState): Legacy {
  const p = s.player;
  const laws = s.lawsPassed.filter((l) => l.sponsor === 'player' && !l.struck);
  const coLaws = s.lawsPassed.filter((l) => l.coSponsor && !l.struck);
  const a = p.achievements;
  const roles: string[] = [];
  if (a.includes('elected') || s.career.mkTerms > 0 || p.isMK) roles.push(`חבר/ת כנסת (${Math.max(1, s.career.mkTerms)} קדנציות)`);
  if (a.includes('chair')) roles.push('יו"ר ועדה');
  if (a.includes('minister')) roles.push('שר/ה');
  if (a.includes('leader')) roles.push('יו"ר מפלגה');
  if (a.includes('pm')) roles.push(`ראש/ת ממשלה (${s.career.pmWeeks} שבועות)`);
  const allies = Object.values(s.npcs).filter((n) => n.attitude >= 40).length;
  const enemies = Object.values(s.npcs).filter((n) => n.attitude <= -40).length;
  const worldNow = Object.values(s.world).reduce((x, y) => x + y, 0) / 6;
  const worldDelta = worldNow - s.career.startWorld;
  let score =
    laws.reduce((acc, l) => acc + 12 + (templateById(l.templateId).basic ? 8 : 0), 0) +
    (s.transforms ?? []).filter((x) => x.sponsor === 'player').length * 40 +
    coLaws.length * 5 +
    (a.includes('elected') ? 15 : 0) +
    (a.includes('chair') ? 10 : 0) +
    (a.includes('minister') ? 20 : 0) +
    (a.includes('leader') ? 15 : 0) +
    (a.includes('pm') ? 40 : 0) +
    (s.president?.id === 'player' ? 60 : 0) +
    s.career.mkTerms * 8 +
    s.career.peakSeats * 0.5 +
    allies +
    p.fame / 2 +
    p.reputation / 2 +
    worldDelta * 2;
  if (s.gameOver === 'convicted') score -= 60;
  score = Math.round(score);
  const f = p.gender === 'f';
  const title =
    s.gameOver === 'convicted'
      ? f ? 'מורשעת' : 'מורשע'
      : score >= 250
        ? f ? 'מדינאית' : 'מדינאי'
        : score >= 170
          ? f ? 'מנהיגה' : 'מנהיג'
          : score >= 110
            ? f ? 'פוליטיקאית ותיקה' : 'פוליטיקאי ותיק'
            : score >= 60
              ? f ? 'ח"כ מן השורה' : 'ח"כ מן השורה'
              : f ? 'כוכבת שדעכה' : 'כוכב שדעך';
  const tags: string[] = [];
  if (p.partySwitches >= 3) tags.push(f ? 'פורשת סדרתית' : 'פורש סדרתי');
  if (laws.length >= 3) tags.push('מחוקק/ת פורה');
  if (enemies >= 8) tags.push('הרבה אויבים');
  if (allies >= 15) tags.push('אמן/ית הקשרים');
  if (worldDelta >= 5) tags.push('השאיר/ה את המדינה במצב טוב יותר');
  for (const x of s.transforms ?? []) if (x.sponsor === 'player') tags.push(`שינה/תה את פני המדינה: ${TRANSFORM_INFO[x.id].name}`);
  return { score, title, laws, coLaws, roles, allies, enemies, worldDelta, tags };
}

/** עדכון סטטיסטיקות קריירה שבועי */
export function tickCareer(s: GameState) {
  const p = s.player;
  if (p.partyId) s.career.peakSeats = Math.max(s.career.peakSeats, s.parties[p.partyId].seats);
  if (s.coalition.pmId === 'player') s.career.pmWeeks += 1;
}

export function retire(s: GameState) {
  s.gameOver = 'retired';
}
