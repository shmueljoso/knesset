import type { Ideology, IssueId, Sector, TransformId, WorldKey } from '../types';
import { EXTRA_BILLS, RADICAL_BILLS } from './moreBills';
import { TOPIC_BILLS } from './topicBills';

export type RuleId = 'threshold' | 'thresholdDown' | 'norwegian' | 'termLimit' | 'override' | 'entrench' | 'equality' | 'immunity';

/** צד שני של המטבע: השפעה עם תזמון משלה (מחיר מיידי / תועלת מאוחרת), לפעמים רק מהיקף מסוים */
export interface LawEffect {
  key: WorldKey;
  /** סך ההשפעה בהיקף בינוני */
  d: number;
  weeks: number;
  delay?: number;
  /** קיים רק מההיקף הזה ומעלה */
  from?: 1 | 2 | 3;
  note: string;
}

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
  category: 'economy' | 'welfare' | 'religion' | 'society' | 'security' | 'governance' | 'basic' | 'radical';
  /** הצעה מרחיקת לכת: אם תעבור – המדינה משתנה מהיסוד */
  radical?: TransformId;
  /** נכנס לתוקף רק אחרי משאל עם */
  referendum?: boolean;
  /** לא מופיע בבונה ההצעות (למשל חוק התקציב) */
  hidden?: boolean;
  /** השפעות נוספות עם תזמון משלהן – "הצד השני של המטבע" */
  effects?: LawEffect[];
  /** תדמית במגזרים שמתווספת רק מהיקף מסוים (למשל: רק הגרסה המלאה מכעיסה) */
  scopeSectors?: { from: 2 | 3; sectors: Partial<Record<Sector, number>>; note: string }[];
  /** החוק מלבה את הסוגיה במקום להרגיע אותה (למשל: פסקת ההתגברות והמחאה) */
  inflames?: boolean;
  /** סוגיות נוספות שמתלקחות (+) או נרגעות (-) */
  stirs?: Partial<Record<IssueId, number>>;
  /** שינוי ישיר בשביעות הרצון של השותפות בקואליציה (חוץ ממפלגת ראש הממשלה) */
  partners?: number;
}

export const BILL_TEMPLATES: BillTemplate[] = [
  {
    id: 'housing', issue: 'housing', aftermath: [['housing_delivered', 30]], category: 'economy', title: 'חוק הדיור בהישג יד', icon: '🏠', committee: 'interior',
    summary: 'חובת הקצאת דירות להשכרה ארוכת טווח במחיר מפוקח בכל פרויקט מגורים גדול.',
    lean: { econ: -35 },
    sectors: { secular: 3, traditional: 4, olim: 4, arab: 3, religious: 1, haredi: 2 },
    world: { housing: 7, economy: -1.5 }, weeks: 30, delay: 8, cost: 2.5,
    scopes: ['פיילוט ב-5 ערים', '10% מכל פרויקט', '25% מכל פרויקט + קרן ממשלתית'],
    effects: [{ key: 'housing', d: -1.5, weeks: 8, note: 'בהתחלה יזמים מקפיאים פרויקטים' }],
  },
  {
    id: 'shabbat', issue: 'religion', aftermath: [['shabbat_buses', 8]], petitionRisk: 0.1, category: 'religion', title: 'חוק תחבורה ציבורית בסופי שבוע', icon: '🚌', committee: 'economy',
    summary: 'הפעלת קווי תחבורה ציבורית בשבת בערים שמבקשות זאת.',
    lean: { religion: -70 },
    sectors: { secular: 7, olim: 6, traditional: -3, religious: -5, haredi: -9, arab: 2 },
    world: { affordability: 2, cohesion: -3 }, weeks: 16, delay: 4, cost: 0.4,
    scopes: ['קווים בין-עירוניים בלבד', 'ערים שמבקשות', 'פריסה ארצית'],
    effects: [{ key: 'economy', d: 1.5, weeks: 30, delay: 6, note: 'עסקים, פנאי ותיירות בסופ"ש' }], scopeSectors: [{ from: 3, sectors: { traditional: -3, haredi: -4 }, note: 'פריסה ארצית נתפסת כקץ השבת הציבורית' }],
  },
  {
    id: 'draft', issue: 'draft', aftermath: [['draft_backlash', 3]], petitionRisk: 0.35, category: 'security', title: 'חוק השוויון בנטל', icon: '🪖', committee: 'security',
    summary: 'יעדי גיוס מחייבים לציבור החרדי וסנקציות כלכליות על אי-עמידה ביעדים.',
    lean: { religion: -55, security: 25 },
    sectors: { secular: 6, olim: 6, traditional: 3, religious: 3, haredi: -12, arab: 0 },
    world: { security: 3, economy: 2, cohesion: -4 }, weeks: 40, delay: 10, cost: 0.8,
    scopes: ['יעדים הדרגתיים', 'יעדים + סנקציות', 'גיוס חובה מלא'],
    effects: [{ key: 'cohesion', d: -2, weeks: 6, note: 'מעצרי עריקים והפגנות בשנה הראשונה' }], scopeSectors: [{ from: 3, sectors: { haredi: -6, religious: -2 }, note: 'גיוס חובה מלא = מלחמת תרבות' }], stirs: { religion: 10 },
  },
  {
    id: 'override', issue: 'judiciary', aftermath: [['override_protest', 1]], basic: { majority: 61 }, rule: 'override', category: 'basic', title: 'פסקת ההתגברות', icon: '⚖️', committee: 'constitution',
    summary: 'הסמכת הכנסת לחוקק מחדש חוק שבית המשפט העליון פסל.',
    lean: { judiciary: 90 },
    sectors: { religious: 6, haredi: 4, traditional: 3, secular: -7, arab: -6, olim: 0 },
    world: { trust: -6, cohesion: -7 }, weeks: 12, delay: 2, cost: 0,
    scopes: ['רוב של 70 ח"כים', 'רוב של 65 ח"כים', 'רוב של 61 ח"כים'],
    inflames: true, effects: [{ key: 'economy', d: -2, weeks: 20, delay: 4, from: 2, note: 'חברות הדירוג מזהירות' }], scopeSectors: [{ from: 3, sectors: { traditional: -2, olim: -1 }, note: 'רוב של 61 נתפס כדריסה' }],
  },
  {
    id: 'imports', issue: 'cost', aftermath: [['prices_drop', 16]], category: 'economy', title: 'חוק פתיחת היבוא', icon: '🛒', committee: 'economy',
    summary: 'הסרת חסמי יבוא ומכסים על מזון ומוצרי צריכה.',
    lean: { econ: 55 },
    sectors: { secular: 3, traditional: 3, olim: 3, arab: 2, haredi: 2, religious: 1 },
    world: { affordability: 6, economy: 1 }, weeks: 26, delay: 6, cost: 0.6,
    scopes: ['מוצרי חלב', 'מזון ומוצרי צריכה', 'רפורמת "מה שטוב לאירופה" מלאה'],
    effects: [{ key: 'economy', d: -1, weeks: 12, delay: 2, note: 'חקלאים ויצרנים מקומיים נפגעים' }], scopeSectors: [{ from: 3, sectors: { traditional: -2, arab: -1 }, note: 'החקלאים במושבים ובכפרים נגד היבוא החופשי' }],
  },
  {
    id: 'civil', issue: 'religion', aftermath: [['civil_first', 6]], petitionRisk: 0.05, category: 'religion', title: 'חוק ברית הזוגיות', icon: '💍', committee: 'constitution',
    summary: 'מסלול נישואים אזרחיים למי שאינו יכול או אינו רוצה להינשא ברבנות.',
    lean: { religion: -80 },
    sectors: { secular: 6, olim: 9, traditional: -2, religious: -6, haredi: -10, arab: 1 },
    world: { cohesion: -2 }, weeks: 10, delay: 4, cost: 0.1,
    scopes: ['לפסולי חיתון בלבד', 'לכל זוג שבוחר', 'כולל ביטול מונופול הרבנות'],
    effects: [{ key: 'cohesion', d: 2, weeks: 40, delay: 20, note: 'לאורך זמן – פחות זוגות "תקועים"' }], scopeSectors: [{ from: 3, sectors: { traditional: -3, religious: -3 }, note: 'ביטול מונופול הרבנות' }],
  },
  {
    id: 'border', issue: 'security', aftermath: [['border_thanks', 12]], category: 'security', title: 'חוק חיזוק יישובי הגבולות', icon: '🛡️', committee: 'finance',
    summary: 'הטבות מס, מיגון ותמריצים ליישובי הגבול בצפון ובדרום.',
    lean: { security: 45, econ: -20 },
    sectors: { traditional: 4, religious: 4, secular: 2, olim: 3, haredi: 1, arab: 0 },
    world: { security: 4, economy: -1 }, weeks: 30, delay: 6, cost: 3,
    scopes: ['מיגון בלבד', 'מיגון + הטבות מס', 'תכנית לאומית רב-שנתית'],
    effects: [{ key: 'affordability', d: -1, weeks: 20, note: 'הכסף בא על חשבון תקציבים אחרים' }],
  },
  {
    id: 'crime', issue: 'crime', aftermath: [['crime_drop', 20]], category: 'security', title: 'התכנית הלאומית למיגור הפשיעה בחברה הערבית', icon: '🚔', committee: 'interior',
    summary: 'תקציב ייעודי לשיטור, אכיפה כלכלית ופיתוח בישובים ערביים.',
    lean: { econ: -30, security: 15 },
    sectors: { arab: 10, secular: 1, traditional: 1, olim: 0, religious: -1, haredi: 0 },
    world: { security: 3, trust: 3, cohesion: 3 }, weeks: 36, delay: 8, cost: 2,
    scopes: ['תגבור שיטור', 'שיטור + אכיפה כלכלית', 'תכנית חומש מלאה'],
    effects: [{ key: 'trust', d: -1, weeks: 8, from: 3, note: '"שוב כסף לחברה הערבית" – תרעומת בימין' }], scopeSectors: [{ from: 3, sectors: { religious: -2 }, note: 'תכנית חומש מלאה' }],
  },
  {
    id: 'wage', issue: 'wages', aftermath: [['employers_protest', 4]], category: 'economy', title: 'העלאת שכר המינימום', icon: '💵', committee: 'labor',
    summary: 'העלאה הדרגתית של שכר המינימום והצמדתו לשכר הממוצע.',
    lean: { econ: -60 },
    sectors: { traditional: 4, arab: 5, haredi: 3, olim: 3, secular: 1, religious: 0 },
    world: { affordability: 3, economy: -1.5 }, weeks: 20, delay: 4, cost: 1.2,
    scopes: ['עדכון לפי מדד', 'העלאה ל-6,500 ₪', 'הצמדה ל-50% מהשכר הממוצע'],
    effects: [{ key: 'economy', d: -1.5, weeks: 30, delay: 20, from: 3, note: 'עסקים קטנים מפטרים עובדים' }, { key: 'affordability', d: -1, weeks: 20, delay: 20, from: 3, note: 'עובדים בשכר נמוך מאבדים משרות' }],
  },
  {
    id: 'school', issue: 'education', aftermath: [['teachers_strike', 10]], category: 'society', title: 'חוק יום הלימודים הארוך', icon: '🎒', committee: 'education',
    summary: 'הארכת יום הלימודים עד 16:00 בגני ילדים ובבתי ספר יסודיים.',
    lean: { econ: -30 },
    sectors: { secular: 4, traditional: 4, arab: 4, olim: 3, religious: 2, haredi: -1 },
    world: { affordability: 2, economy: 2 }, weeks: 40, delay: 12, cost: 2.8,
    scopes: ['פריפריה בלבד', 'גני ילדים ויסודי', 'כל מערכת החינוך'],
    effects: [{ key: 'cohesion', d: -1, weeks: 8, note: 'עימות עם ארגוני המורים' }, { key: 'economy', d: 2, weeks: 52, delay: 30, note: 'הורים (בעיקר אמהות) עובדים יותר' }],
  },
  // ---------- חוקים נוספים ----------
  {
    id: 'cannabis', title: 'חוק אי-הפללת הקנאביס', icon: '🌿', committee: 'constitution', category: 'society',
    summary: 'שימוש עצמי בקנאביס יהפוך מעבירה פלילית לעבירה מנהלית.',
    lean: { religion: -45, judiciary: -20 },
    sectors: { secular: 5, olim: 3, arab: 0, traditional: -1, religious: -4, haredi: -5 },
    world: { trust: 1, economy: 0.5 }, weeks: 12, delay: 4, cost: -0.2,
    scopes: ['קנס במקום תיק פלילי', 'אי-הפללה מלאה', 'לגליזציה ומיסוי'],
    effects: [{ key: 'economy', d: 1, weeks: 30, delay: 10, from: 3, note: 'מיסוי הלגליזציה' }, { key: 'security', d: -1, weeks: 20, delay: 4, from: 3, note: 'חשש מנהיגה תחת השפעה' }], stirs: { crime: -5 },
  },
  {
    id: 'climate', title: 'חוק האקלים', icon: '🌍', committee: 'interior', category: 'economy',
    summary: 'יעדי הפחתת פליטות מחייבים ומס פחמן הדרגתי.',
    lean: { econ: -35 },
    sectors: { secular: 4, arab: 1, olim: 0, traditional: 0, religious: -1, haredi: -1 },
    world: { economy: -2, cohesion: 1 }, weeks: 52, delay: 10, cost: 1,
    scopes: ['יעדים וולונטריים', 'יעדים מחייבים', 'מס פחמן מלא'],
    effects: [{ key: 'affordability', d: -2, weeks: 26, delay: 4, from: 3, note: 'מס פחמן מייקר חשמל ודלק' }, { key: 'economy', d: 3, weeks: 60, delay: 40, note: 'טכנולוגיה ירוקה וייצוא' }],
  },
  {
    id: 'broadcast', title: 'חוק סגירת תאגיד השידור', icon: '📡', committee: 'economy', category: 'governance', issue: 'judiciary',
    summary: 'הפרטת השידור הציבורי והעברת התקציב לשוק.',
    lean: { judiciary: 55, econ: 45 },
    sectors: { religious: 4, traditional: 3, haredi: 1, secular: -5, arab: -2, olim: 0 },
    world: { trust: -3 }, weeks: 10, delay: 2, cost: -0.6, petitionRisk: 0.45,
    scopes: ['קיצוץ תקציב', 'הפרטה חלקית', 'סגירה מלאה'],
    inflames: true, effects: [{ key: 'cohesion', d: -2, weeks: 8, note: '"השתקת התקשורת"' }], scopeSectors: [{ from: 3, sectors: { secular: -3, olim: -1 }, note: 'סגירה מלאה' }],
  },
  {
    id: 'core', title: 'חוק לימודי הליבה', icon: '📐', committee: 'education', category: 'society', issue: 'education',
    summary: 'התניית תקציב למוסדות חינוך בלימודי מתמטיקה, אנגלית ומדעים.',
    lean: { religion: -60 },
    sectors: { secular: 5, olim: 4, traditional: 1, religious: 0, arab: 1, haredi: -10 },
    world: { economy: 1, cohesion: -2 }, weeks: 52, delay: 12, cost: 0.4, aftermath: [['draft_backlash', 4]],
    scopes: ['תמריצים בלבד', 'התניית תקציב', 'חובה בכל בתי הספר'],
    effects: [{ key: 'economy', d: 4, weeks: 80, delay: 52, note: 'דור חרדי שנכנס לשוק העבודה' }],
  },
  {
    id: 'lobbying', title: 'חוק הסדרת הלובינג', icon: '💼', committee: 'constitution', category: 'governance',
    summary: 'רישום פומבי של כל פגישה בין נבחרים ללוביסטים, והגבלת תרומות.',
    lean: { judiciary: -15, econ: -10 },
    sectors: { secular: 2, traditional: 2, arab: 1, olim: 2, religious: 1, haredi: 0 },
    world: { trust: 5 }, weeks: 20, delay: 4, cost: 0.05, aftermath: [['lobby_backlash', 2]],
    scopes: ['רישום פגישות', 'רישום + הגבלת תרומות', 'איסור מתנות מוחלט'],
    effects: [{ key: 'economy', d: -0.5, weeks: 10, note: 'בעלי עניין מאיימים להעביר השקעות' }],
  },
  {
    id: 'daycare', title: 'חוק המעונות המסובסדים', icon: '🧸', committee: 'labor', category: 'welfare', issue: 'cost',
    summary: 'סבסוד מעונות יום לגילאי 0–3 לכל המשפחות העובדות.',
    lean: { econ: -45 },
    sectors: { secular: 3, traditional: 4, arab: 3, haredi: 3, olim: 3, religious: 3 },
    world: { affordability: 4, economy: -1 }, weeks: 30, delay: 8, cost: 2.5,
    scopes: ['לעשירונים התחתונים', 'לכל העובדים', 'חינם לכולם'],
    effects: [{ key: 'economy', d: 3, weeks: 60, delay: 30, note: 'יותר אמהות חוזרות לעבודה' }],
  },
  {
    id: 'pension', title: 'העלאת גיל הפרישה', icon: '👵', committee: 'finance', category: 'economy', issue: 'wages',
    summary: 'העלאה הדרגתית של גיל הפרישה לנשים והצמדה לתוחלת החיים.',
    lean: { econ: 55 },
    sectors: { secular: -1, traditional: -3, arab: -2, haredi: -1, olim: -3, religious: -1 },
    world: { economy: 4 }, weeks: 40, delay: 8, cost: -2,
    scopes: ['העלאה ל-64', 'העלאה ל-65', 'הצמדה לתוחלת החיים'],
    inflames: true, effects: [{ key: 'affordability', d: -1.5, weeks: 26, delay: 2, note: 'נשים מבוגרות בלי עבודה ובלי קצבה' }],
  },
  {
    id: 'deathpenalty', title: 'חוק עונש מוות למחבלים', icon: '⛓️', committee: 'constitution', category: 'security', issue: 'security',
    summary: 'הסמכת בתי המשפט להטיל עונש מוות על מחבלים שרצחו.',
    lean: { security: 90, judiciary: 40 },
    sectors: { religious: 6, traditional: 4, olim: 3, haredi: 1, secular: -2, arab: -8 },
    world: { security: 1, cohesion: -3 }, weeks: 8, delay: 2, cost: 0, petitionRisk: 0.5,
    scopes: ['שיקול דעת לשופטים', 'בהמלצת התביעה', 'חובה'],
    effects: [{ key: 'security', d: -2, weeks: 8, delay: 1, note: 'חשש לחטיפות "קלפי מיקוח"' }], scopeSectors: [{ from: 3, sectors: { secular: -3, olim: -1 }, note: 'עונש חובה – אפילו תומכים נרתעים' }],
  },
  {
    id: 'metro', title: 'חוק המטרו', icon: '🚇', committee: 'economy', category: 'economy',
    summary: 'מסלול ירוק לתכנון ולבניית המטרו בגוש דן.',
    lean: { econ: -10 },
    sectors: { secular: 3, traditional: 2, arab: 1, olim: 1, religious: 1, haredi: 0 },
    world: { economy: 4, affordability: 1 }, weeks: 60, delay: 20, cost: 4,
    scopes: ['קו אחד', 'שלושה קווים', 'תכנית לאומית מלאה'],
    effects: [{ key: 'economy', d: -1, weeks: 30, note: 'שנים של עבודות וחסימות' }, { key: 'cohesion', d: -1, weeks: 20, note: 'פקקים ועצבים בגוש דן' }],
  },
  {
    id: 'arabland', title: 'חוק הקצאת הקרקעות לחברה הערבית', icon: '🏘️', committee: 'interior', category: 'society', issue: 'crime',
    summary: 'הרחבת תחומי שיפוט ותכניות מתאר ביישובים ערביים.',
    lean: { security: -30, econ: -20 },
    sectors: { arab: 8, secular: 1, traditional: 0, olim: -1, religious: -3, haredi: 0 },
    world: { housing: 2, cohesion: 3, trust: 1 }, weeks: 40, delay: 10, cost: 1,
    scopes: ['הסדרת בנייה קיימת', 'הרחבת שטחים', 'עיר ערבית חדשה'],
    effects: [{ key: 'cohesion', d: -2, weeks: 8, note: 'בימין: "פרס לבנייה הבלתי חוקית"' }], scopeSectors: [{ from: 3, sectors: { religious: -2, traditional: -2 }, note: 'עיר ערבית חדשה' }],
  },
  // ---------- חוקים שמשנים את כללי המשחק ----------
  {
    id: 'threshold', title: 'העלאת אחוז החסימה', icon: '🚧', committee: 'constitution', category: 'governance', rule: 'threshold',
    summary: 'רשימה תצטרך יותר קולות כדי להיכנס לכנסת. המפלגות הגדולות מרוויחות; הקטנות – והמפלגות הערביות – בסכנה ונאלצות להתאחד.',
    lean: {},
    sectors: { secular: 0, traditional: 0, arab: -6, olim: -1, religious: 0, haredi: 0 },
    world: { cohesion: -2 }, weeks: 2, delay: 0, cost: 0, basic: { majority: 61 },
    scopes: ['3.5% (העלאה קלה)', '4%', '5%'],
    effects: [{ key: 'trust', d: -1, weeks: 6, note: '"חוק להעיף את המפלגות הקטנות והערביות"' }],
  },
  {
    id: 'norwegian', title: 'החוק הנורבגי', icon: '🔄', committee: 'constitution', category: 'governance', rule: 'norwegian',
    summary: 'שרים מתפטרים מהכנסת והבאים ברשימה נכנסים במקומם (גם את/ה, אם את/ה הבא/ה בתור). כשהשר/ה עוזב/ת את הממשלה – המושב חוזר.',
    lean: {},
    sectors: { secular: -1, traditional: -1, arab: -1, olim: -1, religious: -1, haredi: -1 },
    world: { economy: -0.5 }, weeks: 2, delay: 0, cost: 0.2, basic: { majority: 61 },
    scopes: ['שר אחד לסיעה', 'עד חמישה לסיעה', 'ללא הגבלה'],
    effects: [{ key: 'trust', d: -1, weeks: 10, note: '"עוד ח"כים על חשבון הציבור"' }],
  },
  {
    id: 'termlimit', title: 'הגבלת כהונת ראש הממשלה', icon: '⏳', committee: 'constitution', category: 'governance', rule: 'termLimit',
    summary: 'מי שהגיע/ה למכסה לא יכול/ה לכהן שוב כראש ממשלה: המפלגה שלו/ה בוחרת מנהיג/ה אחר/ת. חל גם עלייך.',
    lean: { judiciary: -30 },
    sectors: { secular: 3, traditional: 0, arab: 2, olim: 1, religious: 0, haredi: -1 },
    world: { trust: 2 }, weeks: 2, delay: 0, cost: 0, basic: { majority: 61 },
    scopes: ['שלוש קדנציות', 'שתי קדנציות', 'שתי קדנציות לכל החיים'],
    effects: [{ key: 'economy', d: -0.5, weeks: 10, from: 3, note: 'חוסר ודאות לקראת חילופי שלטון' }],
  },
  // ---------- חוקי יסוד ----------
  {
    id: 'basic_dignity', title: 'חוק יסוד: כבוד האדם (תיקון – שוויון)', icon: '📜', committee: 'constitution', category: 'basic', issue: 'judiciary', rule: 'equality',
    summary: 'עיגון זכות השוויון בחוק יסוד. מחזק את הביקורת השיפוטית.',
    lean: { judiciary: -60, religion: -30 },
    sectors: { secular: 4, arab: 6, olim: 2, traditional: 0, religious: -3, haredi: -4 },
    world: { cohesion: 2, trust: 2 }, weeks: 10, delay: 2, cost: 0, basic: { majority: 61 },
    scopes: ['שוויון בפני החוק', 'שוויון מלא', 'שוויון + איסור אפליה'],
    effects: [{ key: 'cohesion', d: -1, weeks: 6, note: 'בימין: "עוד כוח לבג"ץ"' }],
  },
  {
    id: 'basic_entrench', title: 'שריון חוקי היסוד ברוב של 80', icon: '🔒', committee: 'constitution', category: 'basic', issue: 'judiciary', rule: 'entrench',
    summary: 'כל שינוי בחוקי היסוד יחייב רוב של 80 ח"כים. חוקה כמעט נוקשה.',
    lean: { judiciary: -70 },
    sectors: { secular: 3, arab: 3, olim: 1, traditional: -1, religious: -3, haredi: -3 },
    world: { trust: 3 }, weeks: 6, delay: 1, cost: 0, basic: { majority: 80 },
    scopes: ['חוקי היסוד על זכויות', 'כל חוקי היסוד', 'כולל חוק הבחירות'],
    effects: [{ key: 'trust', d: -1, weeks: 6, from: 3, note: '"הרוב של היום כובל את הרוב של מחר"' }],
  },
  {
    id: 'budget_law', hidden: true, title: 'חוק התקציב', icon: '💰', committee: 'finance', category: 'governance',
    summary: 'תקציב המדינה לשנה הקרובה. אם לא יעבור עד סוף מרץ – הכנסת מתפזרת.',
    lean: {}, sectors: {}, world: {}, weeks: 2, delay: 0, cost: 0,
    scopes: ['תקציב', 'תקציב', 'תקציב'],
  },
  {
    id: 'no_confidence', hidden: true, title: 'הצעת אי-אמון בממשלה', icon: '🗳️', committee: 'constitution', category: 'governance',
    summary: 'אי-אמון קונסטרוקטיבי: אם 61 ח"כים תומכים – הממשלה נופלת וממשלה חלופית מושבעת.',
    lean: {}, sectors: {}, world: {}, weeks: 2, delay: 0, cost: 0,
    scopes: ['אי-אמון', 'אי-אמון', 'אי-אמון'],
  },
  ...EXTRA_BILLS,
  ...TOPIC_BILLS,
  ...RADICAL_BILLS,
];

export const templateById = (id: string) => BILL_TEMPLATES.find((t) => t.id === id)!;

export const SCOPE_FACTOR: Record<1 | 2 | 3, number> = { 1: 0.6, 2: 1, 3: 1.6 };
