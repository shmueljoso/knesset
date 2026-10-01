import { isCoalition } from '../systems/government';
import type { GameState, LocationId } from '../types';

export interface LocationDef {
  id: LocationId;
  name: string;
  desc: string;
  icon: string;
  locked?: string; // סיבת נעילה
  offCampus?: boolean;
}

export const LOCATIONS: Record<LocationId, LocationDef> = {
  plenum: { id: 'plenum', name: 'אולם המליאה', icon: '🏛️', desc: 'כאן מתקיימות ההצבעות, הנאומים והשאילתות. ימי ב׳–ד׳ בזמן מושב.' },
  committees: { id: 'committees', name: 'חדרי הוועדות', icon: '📋', desc: 'עיקר העבודה הפרלמנטרית: דיונים, הסתייגויות ונוסחי חוק.' },
  offices: { id: 'offices', name: 'אגף הלשכות', icon: '🗂️', desc: 'לשכות חברי הכנסת. כאן מנסחים, מנהלים צוות וקובעים פגישות.' },
  cafeteria: { id: 'cafeteria', name: 'המזנון', icon: '☕', desc: 'המקום שבו נסגרים הדילים האמיתיים. רכילות, טובות והחלפת קולות.' },
  factions: { id: 'factions', name: 'חדרי הסיעות', icon: '🚪', desc: 'ישיבות סיעה של יום שני, משמעת סיעתית ומאבקי כוח פנימיים.' },
  plaza: { id: 'plaza', name: 'רחבת הכניסה', icon: '📣', desc: 'מפגינים, לוביסטים ומצלמות. כל מה שקורה כאן מגיע לחדשות.' },
  studio: { id: 'studio', name: 'אולפני התקשורת', icon: '🎙️', desc: 'ראיונות, פאנלים ומאמרי דעה. במה גדולה וסיכון גדול.', offCampus: true },
  partyhq: { id: 'partyhq', name: 'מטה המפלגה', icon: '🏢', desc: 'מתפקדים, גיוס כספים, פריימריז ומעבר מפלגות.', offCampus: true },
  field: { id: 'field', name: 'השטח', icon: '🏘️', desc: 'חוגי בית, סיורים בפריפריה ופגישות עם ציבור הבוחרים.', offCampus: true },
  pmo: { id: 'pmo', name: 'משרד ראש הממשלה', icon: '🏢', desc: 'ישיבות ממשלה, קבינט ופגישות עם ראשי הקואליציה.' },
  finance: { id: 'finance', name: 'משרד האוצר', icon: '💰', desc: 'אגף התקציבים – הכסף של כולם. כאן נסגרים "הכספים הקואליציוניים".' },
  ministry: { id: 'ministry', name: 'המשרד שלך', icon: '🏛️', desc: 'לשכת השר/ה: תכניות דגל, מנכ"ל ותקציב.' },
  court: { id: 'court', name: 'בית המשפט העליון', icon: '⚖️', desc: 'בג״ץ – הביקורת השיפוטית.', locked: 'ייפתח עם חוקי היסוד (שלב 3)' },
};

/** סיבת נעילה של מקום במפה, או null אם פתוח. */
export function locationLock(s: GameState, id: LocationId): string | null {
  const p = s.player;
  const leadsCoalitionParty = !!p.partyId && s.parties[p.partyId].leaderId === 'player' && isCoalition(s, p.partyId);
  switch (id) {
    case 'pmo':
      return p.ministry || s.coalition.pmId === 'player' || leadsCoalitionParty ? null : 'נפתח לשרים ולראשי מפלגות בקואליציה';
    case 'finance':
      return p.ministry || (p.isMK && isCoalition(s, p.partyId)) ? null : 'נפתח לח"כים בקואליציה ולשרים';
    case 'ministry':
      return p.ministry ? null : 'נפתח כשתמונה לשר/ה';
    default:
      return LOCATIONS[id].locked ?? null;
  }
}

export const ACTIVE_LOCATIONS: LocationId[] = ['plenum', 'committees', 'offices', 'cafeteria', 'factions', 'plaza', 'studio', 'partyhq', 'field'];
