import type { Ideology, IssueId, Sector, TransformId, WorldKey } from '../types';
import { EXTRA_BILLS, RADICAL_BILLS } from './moreBills';

export type RuleId = 'threshold' | 'norwegian' | 'termLimit' | 'override' | 'entrench' | 'equality';

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
  issue?: IssueId;
  /** אירועי המשך אחרי שהחוק עובר: [מזהה אירוע, שבועות עד שיופיע] */
  aftermath?: [string, number][];
  /** חוק יסוד: רוב מוחלט שנדרש בקריאה השלישית */
  basic?: { majority: 61 | 80 };
  /** חוק שמשנה את כללי המשחק */
  rule?: RuleId;
  /** הסיכוי שבג"ץ יפסול את החוק אם תוגש עתירה (0-1) */
  petitionRisk?: number;
  category: 'economy' | 'society' | 'security' | 'governance' | 'basic' | 'radical';
  /** הצעה מרחיקת לכת: אם תעבור – המדינה משתנה מהיסוד */
  radical?: TransformId;
  /** נכנס לתוקף רק אחרי משאל עם */
  referendum?: boolean;
}

export const BILL_TEMPLATES: BillTemplate[] = [
  {
    id: 'housing', issue: 'housing', aftermath: [['housing_delivered', 30]], category: 'economy', title: 'חוק הדיור בהישג יד', icon: '🏠', committee: 'interior',
    summary: 'חובת הקצאת דירות להשכרה ארוכת טווח במחיר מפוקח בכל פרויקט מגורים גדול.',
    lean: { econ: -35 },
    sectors: { secular: 3, traditional: 4, olim: 4, arab: 3, religious: 1, haredi: 2 },
    world: { housing: 7, economy: -1.5 }, weeks: 30, delay: 8, cost: 2.5,
    scopes: ['פיילוט ב-5 ערים', '10% מכל פרויקט', '25% מכל פרויקט + קרן ממשלתית'],
  },
  {
    id: 'shabbat', issue: 'religion', aftermath: [['shabbat_buses', 8]], petitionRisk: 0.1, category: 'society', title: 'חוק תחבורה ציבורית בסופי שבוע', icon: '🚌', committee: 'economy',
    summary: 'הפעלת קווי תחבורה ציבורית בשבת בערים שמבקשות זאת.',
    lean: { religion: -70 },
    sectors: { secular: 7, olim: 6, traditional: -3, religious: -5, haredi: -9, arab: 2 },
    world: { affordability: 2, cohesion: -3 }, weeks: 16, delay: 4, cost: 0.4,
    scopes: ['קווים בין-עירוניים בלבד', 'ערים שמבקשות', 'פריסה ארצית'],
  },
  {
    id: 'draft', issue: 'draft', aftermath: [['draft_backlash', 3]], petitionRisk: 0.35, category: 'security', title: 'חוק השוויון בנטל', icon: '🪖', committee: 'security',
    summary: 'יעדי גיוס מחייבים לציבור החרדי וסנקציות כלכליות על אי-עמידה ביעדים.',
    lean: { religion: -55, security: 25 },
    sectors: { secular: 6, olim: 6, traditional: 3, religious: 3, haredi: -12, arab: 0 },
    world: { security: 3, economy: 2, cohesion: -4 }, weeks: 40, delay: 10, cost: 0.8,
    scopes: ['יעדים הדרגתיים', 'יעדים + סנקציות', 'גיוס חובה מלא'],
  },
  {
    id: 'override', issue: 'judiciary', aftermath: [['override_protest', 1]], basic: { majority: 61 }, rule: 'override', category: 'basic', title: 'פסקת ההתגברות', icon: '⚖️', committee: 'constitution',
    summary: 'הסמכת הכנסת לחוקק מחדש חוק שבית המשפט העליון פסל.',
    lean: { judiciary: 90 },
    sectors: { religious: 6, haredi: 4, traditional: 3, secular: -7, arab: -6, olim: 0 },
    world: { trust: -6, cohesion: -7 }, weeks: 12, delay: 2, cost: 0,
    scopes: ['רוב של 70 ח"כים', 'רוב של 65 ח"כים', 'רוב של 61 ח"כים'],
  },
  {
    id: 'imports', issue: 'cost', aftermath: [['prices_drop', 16]], category: 'economy', title: 'חוק פתיחת היבוא', icon: '🛒', committee: 'economy',
    summary: 'הסרת חסמי יבוא ומכסים על מזון ומוצרי צריכה.',
    lean: { econ: 55 },
    sectors: { secular: 3, traditional: 3, olim: 3, arab: 2, haredi: 2, religious: 1 },
    world: { affordability: 6, economy: 1 }, weeks: 26, delay: 6, cost: 0.6,
    scopes: ['מוצרי חלב', 'מזון ומוצרי צריכה', 'רפורמת "מה שטוב לאירופה" מלאה'],
  },
  {
    id: 'civil', issue: 'religion', aftermath: [['civil_first', 6]], petitionRisk: 0.05, category: 'society', title: 'חוק ברית הזוגיות', icon: '💍', committee: 'constitution',
    summary: 'מסלול נישואים אזרחיים למי שאינו יכול או אינו רוצה להינשא ברבנות.',
    lean: { religion: -80 },
    sectors: { secular: 6, olim: 9, traditional: -2, religious: -6, haredi: -10, arab: 1 },
    world: { cohesion: -2 }, weeks: 10, delay: 4, cost: 0.1,
    scopes: ['לפסולי חיתון בלבד', 'לכל זוג שבוחר', 'כולל ביטול מונופול הרבנות'],
  },
  {
    id: 'border', issue: 'security', aftermath: [['border_thanks', 12]], category: 'security', title: 'חוק חיזוק יישובי הגבולות', icon: '🛡️', committee: 'finance',
    summary: 'הטבות מס, מיגון ותמריצים ליישובי הגבול בצפון ובדרום.',
    lean: { security: 45, econ: -20 },
    sectors: { traditional: 4, religious: 4, secular: 2, olim: 3, haredi: 1, arab: 0 },
    world: { security: 4, economy: -1 }, weeks: 30, delay: 6, cost: 3,
    scopes: ['מיגון בלבד', 'מיגון + הטבות מס', 'תכנית לאומית רב-שנתית'],
  },
  {
    id: 'crime', issue: 'crime', aftermath: [['crime_drop', 20]], category: 'security', title: 'התכנית הלאומית למיגור הפשיעה בחברה הערבית', icon: '🚔', committee: 'interior',
    summary: 'תקציב ייעודי לשיטור, אכיפה כלכלית ופיתוח בישובים ערביים.',
    lean: { econ: -30, security: 15 },
    sectors: { arab: 10, secular: 1, traditional: 1, olim: 0, religious: -1, haredi: 0 },
    world: { security: 3, trust: 3, cohesion: 3 }, weeks: 36, delay: 8, cost: 2,
    scopes: ['תגבור שיטור', 'שיטור + אכיפה כלכלית', 'תכנית חומש מלאה'],
  },
  {
    id: 'wage', issue: 'wages', aftermath: [['employers_protest', 4]], category: 'economy', title: 'העלאת שכר המינימום', icon: '💵', committee: 'labor',
    summary: 'העלאה הדרגתית של שכר המינימום והצמדתו לשכר הממוצע.',
    lean: { econ: -60 },
    sectors: { traditional: 4, arab: 5, haredi: 3, olim: 3, secular: 1, religious: 0 },
    world: { affordability: 3, economy: -1.5 }, weeks: 20, delay: 4, cost: 1.2,
    scopes: ['עדכון לפי מדד', 'העלאה ל-6,500 ₪', 'הצמדה ל-50% מהשכר הממוצע'],
  },
  {
    id: 'school', issue: 'education', aftermath: [['teachers_strike', 10]], category: 'society', title: 'חוק יום הלימודים הארוך', icon: '🎒', committee: 'education',
    summary: 'הארכת יום הלימודים עד 16:00 בגני ילדים ובבתי ספר יסודיים.',
    lean: { econ: -30 },
    sectors: { secular: 4, traditional: 4, arab: 4, olim: 3, religious: 2, haredi: -1 },
    world: { affordability: 2, economy: 2 }, weeks: 40, delay: 12, cost: 2.8,
    scopes: ['פריפריה בלבד', 'גני ילדים ויסודי', 'כל מערכת החינוך'],
  },
  // ---------- חוקים נוספים ----------
  {
    id: 'cannabis', title: 'חוק אי-הפללת הקנאביס', icon: '🌿', committee: 'constitution', category: 'society', issue: 'religion',
    summary: 'שימוש עצמי בקנאביס יהפוך מעבירה פלילית לעבירה מנהלית.',
    lean: { religion: -45, judiciary: -20 },
    sectors: { secular: 5, olim: 3, arab: 0, traditional: -1, religious: -4, haredi: -5 },
    world: { trust: 1, economy: 0.5 }, weeks: 12, delay: 4, cost: -0.2,
    scopes: ['קנס במקום תיק פלילי', 'אי-הפללה מלאה', 'לגליזציה ומיסוי'],
  },
  {
    id: 'climate', title: 'חוק האקלים', icon: '🌍', committee: 'interior', category: 'economy',
    summary: 'יעדי הפחתת פליטות מחייבים ומס פחמן הדרגתי.',
    lean: { econ: -35 },
    sectors: { secular: 4, arab: 1, olim: 0, traditional: 0, religious: -1, haredi: -1 },
    world: { economy: -1, cohesion: 1 }, weeks: 52, delay: 10, cost: 1,
    scopes: ['יעדים וולונטריים', 'יעדים מחייבים', 'מס פחמן מלא'],
  },
  {
    id: 'broadcast', title: 'חוק סגירת תאגיד השידור', icon: '📡', committee: 'economy', category: 'governance', issue: 'judiciary',
    summary: 'הפרטת השידור הציבורי והעברת התקציב לשוק.',
    lean: { judiciary: 55, econ: 45 },
    sectors: { religious: 4, traditional: 3, haredi: 1, secular: -5, arab: -2, olim: 0 },
    world: { trust: -3 }, weeks: 10, delay: 2, cost: -0.6, petitionRisk: 0.45,
    scopes: ['קיצוץ תקציב', 'הפרטה חלקית', 'סגירה מלאה'],
  },
  {
    id: 'core', title: 'חוק לימודי הליבה', icon: '📐', committee: 'education', category: 'society', issue: 'education',
    summary: 'התניית תקציב למוסדות חינוך בלימודי מתמטיקה, אנגלית ומדעים.',
    lean: { religion: -60 },
    sectors: { secular: 5, olim: 4, traditional: 1, religious: 0, arab: 1, haredi: -10 },
    world: { economy: 3, cohesion: -2 }, weeks: 52, delay: 12, cost: 0.4, aftermath: [['draft_backlash', 4]],
    scopes: ['תמריצים בלבד', 'התניית תקציב', 'חובה בכל בתי הספר'],
  },
  {
    id: 'lobbying', title: 'חוק הסדרת הלובינג', icon: '💼', committee: 'constitution', category: 'governance', issue: 'judiciary',
    summary: 'רישום פומבי של כל פגישה בין נבחרים ללוביסטים, והגבלת תרומות.',
    lean: { judiciary: -15, econ: -10 },
    sectors: { secular: 2, traditional: 2, arab: 1, olim: 2, religious: 1, haredi: 0 },
    world: { trust: 5 }, weeks: 20, delay: 4, cost: 0.05, aftermath: [['lobby_backlash', 2]],
    scopes: ['רישום פגישות', 'רישום + הגבלת תרומות', 'איסור מתנות מוחלט'],
  },
  {
    id: 'daycare', title: 'חוק המעונות המסובסדים', icon: '🧸', committee: 'labor', category: 'economy', issue: 'cost',
    summary: 'סבסוד מעונות יום לגילאי 0–3 לכל המשפחות העובדות.',
    lean: { econ: -45 },
    sectors: { secular: 3, traditional: 4, arab: 3, haredi: 3, olim: 3, religious: 3 },
    world: { affordability: 4, economy: -1.5 }, weeks: 30, delay: 8, cost: 2.5,
    scopes: ['לעשירונים התחתונים', 'לכל העובדים', 'חינם לכולם'],
  },
  {
    id: 'pension', title: 'העלאת גיל הפרישה', icon: '👵', committee: 'finance', category: 'economy', issue: 'wages',
    summary: 'העלאה הדרגתית של גיל הפרישה לנשים והצמדה לתוחלת החיים.',
    lean: { econ: 55 },
    sectors: { secular: -1, traditional: -3, arab: -2, haredi: -1, olim: -3, religious: -1 },
    world: { economy: 4 }, weeks: 40, delay: 8, cost: -2,
    scopes: ['העלאה ל-64', 'העלאה ל-65', 'הצמדה לתוחלת החיים'],
  },
  {
    id: 'deathpenalty', title: 'חוק עונש מוות למחבלים', icon: '⛓️', committee: 'constitution', category: 'security', issue: 'security',
    summary: 'הסמכת בתי המשפט להטיל עונש מוות על מחבלים שרצחו.',
    lean: { security: 90, judiciary: 40 },
    sectors: { religious: 6, traditional: 4, olim: 3, haredi: 1, secular: -2, arab: -8 },
    world: { security: 1, cohesion: -3 }, weeks: 8, delay: 2, cost: 0, petitionRisk: 0.5,
    scopes: ['שיקול דעת לשופטים', 'בהמלצת התביעה', 'חובה'],
  },
  {
    id: 'metro', title: 'חוק המטרו', icon: '🚇', committee: 'economy', category: 'economy', issue: 'cost',
    summary: 'מסלול ירוק לתכנון ולבניית המטרו בגוש דן.',
    lean: { econ: -10 },
    sectors: { secular: 3, traditional: 2, arab: 1, olim: 1, religious: 1, haredi: 0 },
    world: { economy: 4, affordability: 1 }, weeks: 60, delay: 20, cost: 4,
    scopes: ['קו אחד', 'שלושה קווים', 'תכנית לאומית מלאה'],
  },
  {
    id: 'arabland', title: 'חוק הקצאת הקרקעות לחברה הערבית', icon: '🏘️', committee: 'interior', category: 'society', issue: 'crime',
    summary: 'הרחבת תחומי שיפוט ותכניות מתאר ביישובים ערביים.',
    lean: { security: -30, econ: -20 },
    sectors: { arab: 8, secular: 1, traditional: 0, olim: -1, religious: -3, haredi: 0 },
    world: { housing: 2, cohesion: 3, trust: 1 }, weeks: 40, delay: 10, cost: 1,
    scopes: ['הסדרת בנייה קיימת', 'הרחבת שטחים', 'עיר ערבית חדשה'],
  },
  // ---------- חוקים שמשנים את כללי המשחק ----------
  {
    id: 'threshold', title: 'העלאת אחוז החסימה ל-4%', icon: '🚧', committee: 'constitution', category: 'governance', rule: 'threshold',
    summary: 'תיקון חוק הבחירות: רשימה צריכה 4% מהקולות כדי להיכנס לכנסת.',
    lean: {},
    sectors: { secular: 0, traditional: 0, arab: -6, olim: -1, religious: 0, haredi: 0 },
    world: { cohesion: -2 }, weeks: 2, delay: 0, cost: 0, basic: { majority: 61 },
    scopes: ['3.5%', '4%', '5%'],
  },
  {
    id: 'norwegian', title: 'החוק הנורבגי', icon: '🔄', committee: 'constitution', category: 'governance', rule: 'norwegian',
    summary: 'שר יכול להתפטר זמנית מהכנסת והבא ברשימה נכנס במקומו.',
    lean: {},
    sectors: { secular: -1, traditional: -1, arab: -1, olim: -1, religious: -1, haredi: -1 },
    world: { economy: -0.5 }, weeks: 2, delay: 0, cost: 0.2, basic: { majority: 61 },
    scopes: ['שר אחד לסיעה', 'עד חמישה לסיעה', 'ללא הגבלה'],
  },
  {
    id: 'termlimit', title: 'הגבלת כהונת ראש הממשלה', icon: '⏳', committee: 'constitution', category: 'governance', rule: 'termLimit',
    summary: 'ראש ממשלה יכהן לכל היותר שתי קדנציות רצופות.',
    lean: { judiciary: -30 },
    sectors: { secular: 3, traditional: 0, arab: 2, olim: 1, religious: 0, haredi: -1 },
    world: { trust: 2 }, weeks: 2, delay: 0, cost: 0, basic: { majority: 61 },
    scopes: ['שלוש קדנציות', 'שתי קדנציות', 'שתי קדנציות לכל החיים'],
  },
  // ---------- חוקי יסוד ----------
  {
    id: 'basic_dignity', title: 'חוק יסוד: כבוד האדם (תיקון – שוויון)', icon: '📜', committee: 'constitution', category: 'basic', issue: 'judiciary', rule: 'equality',
    summary: 'עיגון זכות השוויון בחוק יסוד. מחזק את הביקורת השיפוטית.',
    lean: { judiciary: -60, religion: -30 },
    sectors: { secular: 4, arab: 6, olim: 2, traditional: 0, religious: -3, haredi: -4 },
    world: { cohesion: 2, trust: 2 }, weeks: 10, delay: 2, cost: 0, basic: { majority: 61 },
    scopes: ['שוויון בפני החוק', 'שוויון מלא', 'שוויון + איסור אפליה'],
  },
  {
    id: 'basic_entrench', title: 'שריון חוקי היסוד ברוב של 80', icon: '🔒', committee: 'constitution', category: 'basic', issue: 'judiciary', rule: 'entrench',
    summary: 'כל שינוי בחוקי היסוד יחייב רוב של 80 ח"כים. חוקה כמעט נוקשה.',
    lean: { judiciary: -70 },
    sectors: { secular: 3, arab: 3, olim: 1, traditional: -1, religious: -3, haredi: -3 },
    world: { trust: 3 }, weeks: 6, delay: 1, cost: 0, basic: { majority: 80 },
    scopes: ['חוקי היסוד על זכויות', 'כל חוקי היסוד', 'כולל חוק הבחירות'],
  },
  ...EXTRA_BILLS,
  ...RADICAL_BILLS,
];

export const templateById = (id: string) => BILL_TEMPLATES.find((t) => t.id === id)!;

export const SCOPE_FACTOR: Record<1 | 2 | 3, number> = { 1: 0.6, 2: 1, 3: 1.6 };
