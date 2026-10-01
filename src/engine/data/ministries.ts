import type { Ideology, Sector, WorldKey } from '../types';

export interface ProgramDef {
  id: string;
  name: string;
  desc: string;
  cost: number; // מיליארדי ₪
  ap: number;
  weeks: number;
  world: Partial<Record<WorldKey, number>>;
  sectors: Partial<Record<Sector, number>>;
  lean?: Partial<Ideology>;
  perf: number; // תוספת לביצועי המשרד
}

export interface MinistryDef {
  id: string;
  name: string;
  icon: string;
  budget: number; // תקציב שנתי לתכניות (מיליארדי ₪)
  focus: WorldKey[];
  programs: ProgramDef[];
}

export const MINISTRY_DEFS: MinistryDef[] = [
  {
    id: 'defense', name: 'משרד הביטחון', icon: '🛡️', budget: 6, focus: ['security'],
    programs: [
      { id: 'def_shield', name: 'הרחבת מערכות היירוט', desc: 'סוללות נוספות לצפון ולדרום.', cost: 2.5, ap: 2, weeks: 30, world: { security: 6 }, sectors: { traditional: 2, religious: 2, olim: 2 }, perf: 8 },
      { id: 'def_reserve', name: 'מענק למשרתי המילואים', desc: 'הטבות מס ומענקים למילואימניקים.', cost: 1.5, ap: 1, weeks: 12, world: { cohesion: 2 }, sectors: { secular: 3, traditional: 3, religious: 3, olim: 2 }, perf: 5 },
      { id: 'def_reform', name: 'רפורמת התייעלות בצה"ל', desc: 'קיצוץ במטות והעברת כסף ליחידות השדה.', cost: 0.3, ap: 2, weeks: 26, world: { economy: 1.5, security: 1 }, sectors: { secular: 1 }, lean: { econ: 30 }, perf: 6 },
    ],
  },
  {
    id: 'finance', name: 'משרד האוצר', icon: '💰', budget: 4, focus: ['economy', 'affordability'],
    programs: [
      { id: 'fin_tax', name: 'הורדת מס הכנסה למעמד הביניים', desc: 'הקלה במדרגות המס.', cost: 3, ap: 2, weeks: 20, world: { affordability: 4, economy: -1 }, sectors: { secular: 3, traditional: 3, olim: 2 }, lean: { econ: 40 }, perf: 6 },
      { id: 'fin_comp', name: 'רפורמת תחרות בבנקאות', desc: 'פתיחת השוק לבנקים דיגיטליים.', cost: 0.3, ap: 2, weeks: 30, world: { affordability: 3, economy: 2 }, sectors: { secular: 2, traditional: 1 }, lean: { econ: 50 }, perf: 7 },
      { id: 'fin_cut', name: 'קיצוץ רוחבי', desc: 'צמצום הגירעון על חשבון המשרדים.', cost: -1.5, ap: 1, weeks: 10, world: { economy: 3, cohesion: -2 }, sectors: { haredi: -2, arab: -2, traditional: -1 }, lean: { econ: 60 }, perf: 4 },
    ],
  },
  {
    id: 'justice', name: 'משרד המשפטים', icon: '⚖️', budget: 1.5, focus: ['trust'],
    programs: [
      { id: 'jus_courts', name: 'קיצור זמן ההמתנה בבתי המשפט', desc: 'מינוי שופטים ודיגיטציה.', cost: 0.6, ap: 2, weeks: 30, world: { trust: 4 }, sectors: { secular: 2, traditional: 1 }, perf: 7 },
      { id: 'jus_selection', name: 'שינוי הרכב הוועדה לבחירת שופטים', desc: 'יותר כוח לנבחרי הציבור.', cost: 0, ap: 2, weeks: 8, world: { trust: -3, cohesion: -4 }, sectors: { religious: 4, haredi: 2, traditional: 2, secular: -5, arab: -4 }, lean: { judiciary: 80 }, perf: 3 },
      { id: 'jus_aid', name: 'סיוע משפטי חינם', desc: 'הרחבת הסיוע המשפטי לשכבות חלשות.', cost: 0.4, ap: 1, weeks: 16, world: { trust: 2, cohesion: 1 }, sectors: { arab: 2, traditional: 2 }, lean: { econ: -30 }, perf: 5 },
    ],
  },
  {
    id: 'foreign', name: 'משרד החוץ', icon: '🌍', budget: 1, focus: ['security', 'economy'],
    programs: [
      { id: 'for_normal', name: 'הסכם נורמליזציה אזורי', desc: 'מגעים חשאיים עם מדינה במפרץ.', cost: 0.2, ap: 3, weeks: 20, world: { security: 4, economy: 2 }, sectors: { secular: 3, traditional: 2, olim: 2 }, perf: 10 },
      { id: 'for_pr', name: 'מערך הסברה בינלאומי', desc: 'משרד הסברה ושגרירים דיגיטליים.', cost: 0.3, ap: 1, weeks: 12, world: { security: 1 }, sectors: { religious: 2, traditional: 1 }, perf: 4 },
      { id: 'for_trade', name: 'הסכמי סחר חופשי', desc: 'פתיחת שווקים ליצוא.', cost: 0.1, ap: 2, weeks: 26, world: { economy: 3, affordability: 1 }, sectors: { secular: 1 }, lean: { econ: 40 }, perf: 6 },
    ],
  },
  {
    id: 'interior', name: 'משרד הפנים', icon: '🏛️', budget: 2.5, focus: ['cohesion', 'housing'],
    programs: [
      { id: 'int_arab', name: 'תכנון ובנייה ביישובים ערביים', desc: 'אישור תכניות מתאר והסדרת בנייה.', cost: 1, ap: 2, weeks: 30, world: { housing: 2, cohesion: 3 }, sectors: { arab: 6, secular: 0 }, perf: 6 },
      { id: 'int_periphery', name: 'מענקי איזון לרשויות בפריפריה', desc: 'תקציב לרשויות חלשות.', cost: 1.2, ap: 1, weeks: 16, world: { cohesion: 2, affordability: 1 }, sectors: { traditional: 3, arab: 2, olim: 2 }, perf: 5 },
      { id: 'int_shabbat', name: 'אכיפת חוק המרכולים', desc: 'סגירת עסקים בשבת.', cost: 0.1, ap: 1, weeks: 8, world: { cohesion: -2 }, sectors: { haredi: 4, religious: 2, secular: -4, olim: -3 }, lean: { religion: 70 }, perf: 2 },
    ],
  },
  {
    id: 'education', name: 'משרד החינוך', icon: '🎒', budget: 3, focus: ['economy', 'cohesion'],
    programs: [
      { id: 'edu_classes', name: 'הקטנת כיתות', desc: 'עד 32 תלמידים בכיתה.', cost: 2, ap: 2, weeks: 40, world: { economy: 2, affordability: 1 }, sectors: { secular: 3, traditional: 3, arab: 2 }, perf: 7 },
      { id: 'edu_core', name: 'לימודי ליבה בכל בתי הספר', desc: 'התניית תקציב בלימודי מתמטיקה ואנגלית.', cost: 0.3, ap: 2, weeks: 30, world: { economy: 3, cohesion: -2 }, sectors: { secular: 4, olim: 3, haredi: -7 }, lean: { religion: -50 }, perf: 6 },
      { id: 'edu_tech', name: 'תכנית "מחשב לכל ילד"', desc: 'מחשבים ואינטרנט בפריפריה.', cost: 0.8, ap: 1, weeks: 20, world: { economy: 1, cohesion: 1 }, sectors: { traditional: 2, arab: 3, olim: 1 }, perf: 5 },
    ],
  },
  {
    id: 'economy', name: 'משרד הכלכלה', icon: '🏭', budget: 2, focus: ['affordability', 'economy'],
    programs: [
      { id: 'eco_import', name: 'הסרת חסמי יבוא בצו', desc: 'הפחתת מכסים ללא חקיקה.', cost: 0.2, ap: 2, weeks: 20, world: { affordability: 4 }, sectors: { secular: 2, traditional: 2, olim: 2 }, lean: { econ: 50 }, perf: 7 },
      { id: 'eco_jobs', name: 'הכשרה מקצועית לעובדים', desc: 'הסבות להייטק ולתעשייה.', cost: 0.7, ap: 1, weeks: 30, world: { economy: 2 }, sectors: { arab: 2, haredi: 2, traditional: 1 }, perf: 5 },
      { id: 'eco_price', name: 'פיקוח מחירים על מוצרי יסוד', desc: 'הכנסת מוצרים לפיקוח.', cost: 0.1, ap: 1, weeks: 12, world: { affordability: 3, economy: -1 }, sectors: { traditional: 3, haredi: 2, arab: 2 }, lean: { econ: -50 }, perf: 4 },
    ],
  },
  {
    id: 'health', name: 'משרד הבריאות', icon: '🏥', budget: 3, focus: ['trust'],
    programs: [
      { id: 'hea_beds', name: 'תוספת מיטות אשפוז', desc: 'הקלה על העומס בבתי החולים.', cost: 1.5, ap: 2, weeks: 30, world: { trust: 3 }, sectors: { secular: 2, traditional: 2, arab: 2, olim: 2 }, perf: 8 },
      { id: 'hea_dental', name: 'טיפולי שיניים חינם לקשישים', desc: 'הרחבת סל הבריאות.', cost: 0.8, ap: 1, weeks: 16, world: { affordability: 1 }, sectors: { traditional: 2, olim: 3 }, lean: { econ: -40 }, perf: 5 },
      { id: 'hea_periph', name: 'בית חולים חדש בנגב', desc: 'פרויקט דגל רב-שנתי.', cost: 2.5, ap: 3, weeks: 52, world: { trust: 2, cohesion: 2 }, sectors: { traditional: 3, arab: 3 }, perf: 10 },
    ],
  },
  {
    id: 'housing', name: 'משרד הבינוי והשיכון', icon: '🏗️', budget: 3, focus: ['housing'],
    programs: [
      { id: 'hou_target', name: 'מחיר מטרה', desc: 'הגרלות דירות בהנחה לזוגות צעירים.', cost: 1.5, ap: 2, weeks: 30, world: { housing: 6 }, sectors: { secular: 3, traditional: 4, olim: 3 }, perf: 8 },
      { id: 'hou_rent', name: 'דיור להשכרה ארוכת טווח', desc: 'חברה ממשלתית לדיור להשכרה.', cost: 1, ap: 2, weeks: 40, world: { housing: 4 }, sectors: { secular: 3, arab: 2 }, lean: { econ: -40 }, perf: 6 },
      { id: 'hou_haredi', name: 'עיר חרדית חדשה', desc: 'תכנון עיר ייעודית לציבור החרדי.', cost: 1.2, ap: 2, weeks: 40, world: { housing: 3 }, sectors: { haredi: 7, secular: -2 }, perf: 5 },
    ],
  },
  {
    id: 'transport', name: 'משרד התחבורה', icon: '🚆', budget: 3, focus: ['economy'],
    programs: [
      { id: 'tra_metro', name: 'האצת המטרו', desc: 'מנהלת מיוחדת לפרויקט המטרו.', cost: 2, ap: 2, weeks: 52, world: { economy: 4 }, sectors: { secular: 3, traditional: 1 }, perf: 9 },
      { id: 'tra_lanes', name: 'נתיבי תחבורה ציבורית', desc: 'אכיפה ונתיבים ייעודיים.', cost: 0.4, ap: 1, weeks: 16, world: { economy: 1, affordability: 1 }, sectors: { secular: 2, arab: 1 }, perf: 5 },
      { id: 'tra_weekend', name: 'קווי סופ"ש בצו', desc: 'הפעלת קווים בשבת ללא חקיקה.', cost: 0.2, ap: 1, weeks: 8, world: { affordability: 1, cohesion: -2 }, sectors: { secular: 5, olim: 4, haredi: -6, religious: -3 }, lean: { religion: -70 }, perf: 3 },
    ],
  },
  {
    id: 'welfare', name: 'משרד הרווחה', icon: '🤲', budget: 2.5, focus: ['affordability', 'cohesion'],
    programs: [
      { id: 'wel_elderly', name: 'השלמת הכנסה לקשישים', desc: 'העלאת קצבאות זקנה.', cost: 1.5, ap: 1, weeks: 16, world: { affordability: 2, cohesion: 2 }, sectors: { traditional: 3, olim: 4, arab: 2 }, lean: { econ: -50 }, perf: 6 },
      { id: 'wel_youth', name: 'מרכזי נוער בסיכון', desc: 'מאה מרכזים חדשים.', cost: 0.5, ap: 1, weeks: 26, world: { cohesion: 2, security: 1 }, sectors: { traditional: 2, arab: 2 }, perf: 5 },
      { id: 'wel_negative', name: 'מס הכנסה שלילי', desc: 'מענק עבודה לעובדים בשכר נמוך.', cost: 1, ap: 2, weeks: 20, world: { affordability: 2, economy: 1 }, sectors: { arab: 3, haredi: 2, traditional: 2 }, perf: 6 },
    ],
  },
  {
    id: 'religion', name: 'המשרד לשירותי דת', icon: '🕍', budget: 1, focus: ['cohesion'],
    programs: [
      { id: 'rel_kashrut', name: 'רפורמת הכשרות', desc: 'פתיחת שוק הכשרות לתחרות.', cost: 0.1, ap: 2, weeks: 20, world: { affordability: 1, cohesion: -1 }, sectors: { secular: 3, traditional: 1, haredi: -5 }, lean: { religion: -40 }, perf: 5 },
      { id: 'rel_mikvaot', name: 'שדרוג מבני דת ומקוואות', desc: 'בנייה ושיפוץ בכל הארץ.', cost: 0.4, ap: 1, weeks: 26, world: {}, sectors: { haredi: 4, religious: 3, traditional: 2 }, lean: { religion: 50 }, perf: 4 },
      { id: 'rel_conversion', name: 'גיור ממלכתי מקל', desc: 'בתי דין לגיור של רבני ערים.', cost: 0.1, ap: 2, weeks: 20, world: { cohesion: 2 }, sectors: { olim: 6, secular: 2, haredi: -5 }, lean: { religion: -30 }, perf: 6 },
    ],
  },
];

export const ministryDef = (id: string) => MINISTRY_DEFS.find((m) => m.id === id);
export const programDef = (id: string) => MINISTRY_DEFS.flatMap((m) => m.programs).find((p) => p.id === id);
