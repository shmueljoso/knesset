// 12 מחוזות בחירה (הערכה סכמטית – לא גבולות רשמיים): כמה מושבים, הרכב האוכלוסייה, ונטייה פוליטית.
// ההרכב מוכפל ב-`s.demo` (שינויי אוכלוסייה במשחק), והנטייה (`lean`) מושכת מפלגות לפי העמדות שלהן.
// המפה הסכמטית (gx/gy) היא קרטוגרמה של שלוש עמודות: הצפון למעלה, הנגב למטה.
import type { Ideology, Sector } from '../types';

export interface DistrictDef {
  id: string;
  name: string;
  short: string;
  /** כמה מושבים (מתוך 120) שייכים למחוז – גם מספר הבחירות האלקטורים */
  seats: number;
  comp: Record<Sector, number>;
  lean: Partial<Ideology>;
  blurb: string;
  /** מיקום בקרטוגרמה (CSS grid) */
  gx: string;
  gy: string;
}

const c = (secular: number, traditional: number, religious: number, haredi: number, arab: number, olim: number): Record<Sector, number> => ({ secular, traditional, religious, haredi, arab, olim });

export const DISTRICTS: DistrictDef[] = [
  { id: 'galilee', name: 'צפון והגליל', short: 'גליל', seats: 9, comp: c(0.2, 0.2, 0.1, 0.05, 0.3, 0.15), lean: { security: 15 }, blurb: 'ערים קטנות, יישובים ערביים ודרוזיים, וקו גבול אחד חם.', gx: '2 / 4', gy: '1' },
  { id: 'haifa', name: 'חיפה והקריות', short: 'חיפה', seats: 11, comp: c(0.35, 0.15, 0.05, 0.05, 0.15, 0.25), lean: { religion: -20, security: -10 }, blurb: 'עיר נמל חילונית עם קהילה גדולה של עולים.', gx: '1', gy: '2' },
  { id: 'emek', name: 'העמקים והגולן', short: 'עמקים', seats: 7, comp: c(0.25, 0.3, 0.15, 0.02, 0.18, 0.1), lean: {}, blurb: 'קיבוצים, מושבים ועיירות פיתוח.', gx: '2 / 4', gy: '2' },
  { id: 'sharon', name: 'השרון', short: 'שרון', seats: 12, comp: c(0.45, 0.2, 0.13, 0.05, 0.05, 0.12), lean: { religion: -20, econ: 25 }, blurb: 'פרברים מבוססים, הייטק ומעמד בינוני.', gx: '1', gy: '3' },
  { id: 'triangle', name: 'המשולש ואדי ערה', short: 'משולש', seats: 8, comp: c(0.1, 0.15, 0.05, 0.0, 0.65, 0.05), lean: { security: -40 }, blurb: 'רוב ערבי מובהק; מקום שבו הרשימות הערביות מנצחות בענק.', gx: '2', gy: '3' },
  { id: 'yesha', name: 'יהודה ושומרון', short: 'יו"ש', seats: 10, comp: c(0.1, 0.1, 0.55, 0.15, 0.0, 0.1), lean: { security: 80, religion: 40 }, blurb: 'התיישבות דתית-לאומית וערים חרדיות.', gx: '3', gy: '3 / 5' },
  { id: 'telaviv', name: 'תל אביב וגוש דן', short: 'ת"א', seats: 16, comp: c(0.55, 0.15, 0.05, 0.05, 0.05, 0.15), lean: { religion: -50, security: -20, econ: 20 }, blurb: 'המרכז הכלכלי והתרבותי; חילוני, ליברלי ושמאלה.', gx: '1', gy: '4' },
  { id: 'bnei_brak', name: 'בני ברק ואלעד', short: 'ב"ב', seats: 6, comp: c(0.1, 0.1, 0.1, 0.65, 0.0, 0.05), lean: { religion: 60 }, blurb: 'לב העולם החרדי: הצבעה אחידה מאוד.', gx: '2', gy: '4' },
  { id: 'south_coast', name: 'אשדוד, אשקלון ושדרות', short: 'חוף דרום', seats: 10, comp: c(0.15, 0.4, 0.1, 0.1, 0.05, 0.2), lean: { security: 40, econ: -25 }, blurb: 'עיר נמל גדולה וערי פיתוח תחת איום הרקטות.', gx: '1', gy: '5' },
  { id: 'shfela', name: 'השפלה, לוד ומודיעין', short: 'שפלה', seats: 11, comp: c(0.3, 0.3, 0.15, 0.05, 0.1, 0.1), lean: { econ: -10 }, blurb: 'מחוז מעורב וגדל, עם ערים מעורבות.', gx: '2', gy: '5' },
  { id: 'jerusalem', name: 'ירושלים', short: 'ירושלים', seats: 13, comp: c(0.2, 0.1, 0.22, 0.33, 0.08, 0.07), lean: { religion: 30, security: 30 }, blurb: 'בירה דתית וחרדית; מאבקי דת ומדינה בכל רחוב.', gx: '3', gy: '5' },
  { id: 'negev', name: 'באר שבע והנגב', short: 'נגב', seats: 7, comp: c(0.2, 0.3, 0.05, 0.05, 0.2, 0.2), lean: { security: 20, econ: -20 }, blurb: 'פריפריה גדולה: יישובים בדואים, עולים ועיר אוניברסיטאית.', gx: '1 / 4', gy: '6' },
];

export const districtById = (id: string) => DISTRICTS.find((d) => d.id === id);
export const DEFAULT_DISTRICT = 'telaviv';
