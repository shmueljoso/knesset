// "מה נכון עכשיו בעולם": עובדות שנגזרות ממצב המשחק – אילו חוקים בתוקף, מי בממשלה, מה מעמד בית המשפט.
// אירועים וכותרות בודקים כאן אם הם הגיוניים (למשל: בג"ץ לא יכול לפסול פטור שלא קיים, וחרדים
// לא מאיימים לפרק ממשלה שהם לא חברים בה). פונקציות טהורות – בלי שינוי מצב.
import type { GameState, Party } from '../types';

/** מעמד הגיוס של בני ישיבות */
export type DraftStatus =
  | 'statusQuo' // פטור בפועל בלי חוק (ההסדר הישן)
  | 'exemptionLaw' // חוק מעמד לומדי התורה – פטור מעוגן
  | 'draftLaw' // חוק השוויון בנטל – יעדים וסנקציות
  | 'fullDraft' // גיוס חובה מלא (חוק השוויון בהיקף 3)
  | 'volunteer'; // צבא מקצועי – אין גיוס חובה לאף אחד

export interface Facts {
  draft: DraftStatus;
  haredimInGov: boolean;
  religiousInGov: boolean;
  arabsInGov: boolean;
  /** לאן נוטה הממשלה: ימין / שמאל / מרכז */
  govLean: 'right' | 'left' | 'center';
  /** בית המשפט יכול לפסול חוקים */
  courtActive: boolean;
  /** פסקת התגברות או צמצום ביקורת – הכנסת יכולה לעקוף פסיקה */
  canOverride: boolean;
  shabbatTransit: boolean;
  coreStudies: boolean;
  civilMarriage: boolean;
}

/** חוק בתוקף (עבר ולא נפסל) – והרשומה האחרונה שלו */
export function lawInForce(s: GameState, templateId: string) {
  return [...s.lawsPassed].reverse().find((l) => l.templateId === templateId && !l.struck) ?? null;
}
export const hasLaw = (s: GameState, templateId: string) => !!lawInForce(s, templateId);

const tf = (s: GameState, id: string) => (s.transforms ?? []).find((t) => t.id === id)?.scope ?? 0;

export const isHarediParty = (p: Party | undefined) => !!p && ((p.sectors.haredi ?? 0) >= 0.6 || (p.ideology.religion >= 80 && (p.sectors.haredi ?? 0) > 0));
export const isReligiousParty = (p: Party | undefined) => !!p && ((p.sectors.religious ?? 0) >= 0.6 || p.ideology.religion >= 55);
export const isArabParty = (p: Party | undefined) => !!p && (p.sectors.arab ?? 0) >= 0.6;

const coalitionParties = (s: GameState) => s.coalition.parties.map((id) => s.parties[id]).filter((p): p is Party => !!p && p.seats > 0);

export function draftStatus(s: GameState): DraftStatus {
  if (tf(s, 'volunteer') >= 2) return 'volunteer';
  const draft = lawInForce(s, 'draft');
  const yeshiva = lawInForce(s, 'yeshiva');
  // החוק האחרון שעבר קובע
  if (draft && (!yeshiva || draft.week >= yeshiva.week)) return draft.scope >= 3 ? 'fullDraft' : 'draftLaw';
  if (yeshiva) return 'exemptionLaw';
  return 'statusQuo';
}

export function worldFacts(s: GameState): Facts {
  const coal = coalitionParties(s);
  const seats = coal.reduce((a, p) => a + p.seats, 0) || 1;
  const lean = coal.reduce((a, p) => a + (p.ideology.security + p.ideology.judiciary) * p.seats, 0) / seats / 2;
  return {
    draft: draftStatus(s),
    haredimInGov: coal.some(isHarediParty),
    religiousInGov: coal.some(isReligiousParty),
    arabsInGov: coal.some(isArabParty),
    govLean: lean > 20 ? 'right' : lean < -20 ? 'left' : 'center',
    courtActive: !s.rules.noReview,
    canOverride: !!s.rules.override || !!s.rules.noReview || hasLaw(s, 'override'),
    shabbatTransit: tf(s, 'halacha') === 0 && (tf(s, 'secular') > 0 || hasLaw(s, 'shabbat')),
    coreStudies: hasLaw(s, 'core'),
    civilMarriage: tf(s, 'halacha') === 0 && (tf(s, 'secular') > 0 || hasLaw(s, 'civil')),
  };
}

/** יש בכלל חובת גיוס שאפשר להתווכח עליה */
export const draftIsLive = (f: Facts) => f.draft !== 'volunteer';
/** החרדים לא מתגייסים בפועל (פטור בחוק או בהסדר) */
export const exemptionInPlace = (f: Facts) => f.draft === 'statusQuo' || f.draft === 'exemptionLaw';
/** יש חובה שנאכפת על בני ישיבות */
export const draftEnforced = (f: Facts) => f.draft === 'draftLaw' || f.draft === 'fullDraft';

/** שם המפלגה החרדית הגדולה (בקואליציה, אם יש) – לטקסטים */
export function harediParty(s: GameState, inGov?: boolean): Party | null {
  return (
    Object.values(s.parties)
      .filter((p) => isHarediParty(p) && p.seats > 0 && (inGov === undefined || s.coalition.parties.includes(p.id) === inGov))
      .sort((a, b) => b.seats - a.seats)[0] ?? null
  );
}

/** תיאור קצר למסך "מצב המדינה" */
export const DRAFT_LABEL: Record<DraftStatus, string> = {
  statusQuo: 'פטור בפועל, בלי חוק',
  exemptionLaw: 'פטור מעוגן בחוק',
  draftLaw: 'יעדי גיוס וסנקציות',
  fullDraft: 'גיוס חובה מלא',
  volunteer: 'צבא מקצועי',
};
