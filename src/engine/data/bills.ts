import type { Ideology, Sector, WorldKey } from '../types';

export interface BillTemplate {
  id: string;
  title: string;
  icon: string;
  committee: string;
  summary: string;
  lean: Partial<Ideology>;
  /** שינוי בתדמית השחקן במגזרים כאשר החוק עובר (בהיקף בינוני) */
  sectors: Partial<Record<Sector, number>>;
  /** השפעה מצטברת על משתני העולם (בהיקף בינוני), מתפרסת לאורך weeks */
  world: Partial<Record<WorldKey, number>>;
  weeks: number;
  delay: number;
  cost: number; // עלות תקציבית במיליארדי ₪ (בהיקף בינוני)
  scopes: [string, string, string];
}

export const BILL_TEMPLATES: BillTemplate[] = [
  {
    id: 'housing', title: 'חוק הדיור בהישג יד', icon: '🏠', committee: 'interior',
    summary: 'חובת הקצאת דירות להשכרה ארוכת טווח במחיר מפוקח בכל פרויקט מגורים גדול.',
    lean: { econ: -35 },
    sectors: { secular: 3, traditional: 4, olim: 4, arab: 3, religious: 1, haredi: 2 },
    world: { housing: 7, economy: -1.5 }, weeks: 30, delay: 8, cost: 2.5,
    scopes: ['פיילוט ב-5 ערים', '10% מכל פרויקט', '25% מכל פרויקט + קרן ממשלתית'],
  },
  {
    id: 'shabbat', title: 'חוק תחבורה ציבורית בסופי שבוע', icon: '🚌', committee: 'economy',
    summary: 'הפעלת קווי תחבורה ציבורית בשבת בערים שמבקשות זאת.',
    lean: { religion: -70 },
    sectors: { secular: 7, olim: 6, traditional: -3, religious: -5, haredi: -9, arab: 2 },
    world: { affordability: 2, cohesion: -3 }, weeks: 16, delay: 4, cost: 0.4,
    scopes: ['קווים בין-עירוניים בלבד', 'ערים שמבקשות', 'פריסה ארצית'],
  },
  {
    id: 'draft', title: 'חוק השוויון בנטל', icon: '🪖', committee: 'security',
    summary: 'יעדי גיוס מחייבים לציבור החרדי וסנקציות כלכליות על אי-עמידה ביעדים.',
    lean: { religion: -55, security: 25 },
    sectors: { secular: 6, olim: 6, traditional: 3, religious: 3, haredi: -12, arab: 0 },
    world: { security: 3, economy: 2, cohesion: -4 }, weeks: 40, delay: 10, cost: 0.8,
    scopes: ['יעדים הדרגתיים', 'יעדים + סנקציות', 'גיוס חובה מלא'],
  },
  {
    id: 'override', title: 'פסקת ההתגברות', icon: '⚖️', committee: 'constitution',
    summary: 'הסמכת הכנסת לחוקק מחדש חוק שבית המשפט העליון פסל.',
    lean: { judiciary: 90 },
    sectors: { religious: 6, haredi: 4, traditional: 3, secular: -7, arab: -6, olim: 0 },
    world: { trust: -6, cohesion: -7 }, weeks: 12, delay: 2, cost: 0,
    scopes: ['רוב של 70 ח"כים', 'רוב של 65 ח"כים', 'רוב של 61 ח"כים'],
  },
  {
    id: 'imports', title: 'חוק פתיחת היבוא', icon: '🛒', committee: 'economy',
    summary: 'הסרת חסמי יבוא ומכסים על מזון ומוצרי צריכה.',
    lean: { econ: 55 },
    sectors: { secular: 3, traditional: 3, olim: 3, arab: 2, haredi: 2, religious: 1 },
    world: { affordability: 6, economy: 1 }, weeks: 26, delay: 6, cost: 0.6,
    scopes: ['מוצרי חלב', 'מזון ומוצרי צריכה', 'רפורמת "מה שטוב לאירופה" מלאה'],
  },
  {
    id: 'civil', title: 'חוק ברית הזוגיות', icon: '💍', committee: 'constitution',
    summary: 'מסלול נישואים אזרחיים למי שאינו יכול או אינו רוצה להינשא ברבנות.',
    lean: { religion: -80 },
    sectors: { secular: 6, olim: 9, traditional: -2, religious: -6, haredi: -10, arab: 1 },
    world: { cohesion: -2 }, weeks: 10, delay: 4, cost: 0.1,
    scopes: ['לפסולי חיתון בלבד', 'לכל זוג שבוחר', 'כולל ביטול מונופול הרבנות'],
  },
  {
    id: 'border', title: 'חוק חיזוק יישובי הגבולות', icon: '🛡️', committee: 'finance',
    summary: 'הטבות מס, מיגון ותמריצים ליישובי הגבול בצפון ובדרום.',
    lean: { security: 45, econ: -20 },
    sectors: { traditional: 4, religious: 4, secular: 2, olim: 3, haredi: 1, arab: 0 },
    world: { security: 4, economy: -1 }, weeks: 30, delay: 6, cost: 3,
    scopes: ['מיגון בלבד', 'מיגון + הטבות מס', 'תכנית לאומית רב-שנתית'],
  },
  {
    id: 'crime', title: 'התכנית הלאומית למיגור הפשיעה בחברה הערבית', icon: '🚔', committee: 'interior',
    summary: 'תקציב ייעודי לשיטור, אכיפה כלכלית ופיתוח בישובים ערביים.',
    lean: { econ: -30, security: 15 },
    sectors: { arab: 10, secular: 1, traditional: 1, olim: 0, religious: -1, haredi: 0 },
    world: { security: 3, trust: 3, cohesion: 3 }, weeks: 36, delay: 8, cost: 2,
    scopes: ['תגבור שיטור', 'שיטור + אכיפה כלכלית', 'תכנית חומש מלאה'],
  },
  {
    id: 'wage', title: 'העלאת שכר המינימום', icon: '💵', committee: 'labor',
    summary: 'העלאה הדרגתית של שכר המינימום והצמדתו לשכר הממוצע.',
    lean: { econ: -60 },
    sectors: { traditional: 4, arab: 5, haredi: 3, olim: 3, secular: 1, religious: 0 },
    world: { affordability: 3, economy: -1.5 }, weeks: 20, delay: 4, cost: 1.2,
    scopes: ['עדכון לפי מדד', 'העלאה ל-6,500 ₪', 'הצמדה ל-50% מהשכר הממוצע'],
  },
  {
    id: 'school', title: 'חוק יום הלימודים הארוך', icon: '🎒', committee: 'education',
    summary: 'הארכת יום הלימודים עד 16:00 בגני ילדים ובבתי ספר יסודיים.',
    lean: { econ: -30 },
    sectors: { secular: 4, traditional: 4, arab: 4, olim: 3, religious: 2, haredi: -1 },
    world: { affordability: 2, economy: 2 }, weeks: 40, delay: 12, cost: 2.8,
    scopes: ['פריפריה בלבד', 'גני ילדים ויסודי', 'כל מערכת החינוך'],
  },
];

export const templateById = (id: string) => BILL_TEMPLATES.find((t) => t.id === id)!;

export const SCOPE_FACTOR: Record<1 | 2 | 3, number> = { 1: 0.6, 2: 1, 3: 1.6 };
