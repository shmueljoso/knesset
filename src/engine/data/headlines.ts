// כותרות שנולדות ממצב המדינה: כלכלה, ביטחון, סוגיות בוערות, רוח הציבור, כללי המשחק והמהפכות שבתוקף.
import type { GameState, NewsItem, TransformId } from '../types';

export interface HeadlineDef {
  id: string;
  weight: number;
  when: (s: GameState) => boolean;
  /** [כותרת, טון, גוף?] – אפשר מערך של אפשרויות, נבחרת אחת */
  make: (s: GameState) => [string, NewsItem['tone'], string?][];
  outlet?: string;
}

const tf = (s: GameState, id: TransformId) => (s.transforms ?? []).find((t) => t.id === id)?.scope ?? 0;
const pmName = (s: GameState) => (s.coalition.pmId === 'player' ? s.player.name : s.npcs[s.coalition.pmId]?.name ?? 'ראש הממשלה');
const toElection = (s: GameState) => s.electionWeek - s.week;
const smallUnder = (s: GameState) => Object.values(s.parties).filter((p) => p.poll > 0.8 && p.poll < (s.rules.threshold ?? 3.25));

export const HEADLINES: HeadlineDef[] = [
  // ---- כלכלה ----
  { id: 'econ_boom', weight: 2, when: (s) => s.world.economy > 64, make: () => [['הצמיחה הפתיעה לטובה; הבורסה בשיא', 'good'], ['חברות הדירוג משדרגות: "המשק הישראלי חזק מהצפוי"', 'good'], ['האבטלה בשפל היסטורי; המעסיקים מחפשים עובדים', 'good']] },
  { id: 'econ_bust', weight: 3, when: (s) => s.world.economy < 38, make: () => [['המיתון מעמיק: גל פיטורים בהייטק ובתעשייה', 'bad'], ['הבורסה צנחה; משקיעים זרים בורחים', 'bad'], ['בנק ישראל מזהיר: "השנה הקשה ביותר מאז הקורונה"', 'bad']] },
  { id: 'prices', weight: 3, when: (s) => s.world.affordability < 38, make: () => [['מחירי המזון שוב עלו; "הסל הבסיסי כבר לא בסיסי"', 'bad'], ['חשבון החשמל מזנק – והחורף רק התחיל', 'bad'], ['סקר: רוב המשפחות לא גומרות את החודש', 'bad']] },
  { id: 'housing', weight: 2, when: (s) => s.world.housing < 30, make: () => [['מחירי הדירות שברו שיא חדש; זוגות צעירים מוותרים על החלום', 'bad'], ['שכר הדירה בתל אביב חצה את משכורת המינימום', 'bad']] },
  { id: 'housing_good', weight: 1, when: (s) => s.world.housing > 62, make: () => [['לראשונה מזה עשור: מחירי הדירות יורדים', 'good']] },
  // ---- ביטחון ----
  { id: 'sec_low', weight: 3, when: (s) => s.world.security < 36, make: () => [['גורמי ביטחון מזהירים מהסלמה בכמה גזרות', 'bad'], ['אזעקות בעוטף; תושבים: "שוב לבד"', 'bad'], ['הרמטכ"ל בישיבת הממשלה: "צריך להתכונן לימים קשים"', 'bad']] },
  { id: 'sec_high', weight: 1, when: (s) => s.world.security > 66, make: () => [['השקט הארוך ביותר בגבולות מזה שנים', 'good']] },
  { id: 'crime', weight: 2, when: (s) => s.issues.crime > 65, make: () => [['עוד לילה של ירי ביישובים הערביים; "המדינה הפקירה אותנו"', 'bad'], ['שיא עגום: מספר הנרצחים בחברה הערבית עבר את השנה שעברה', 'bad']] },
  // ---- אמון ולכידות ----
  { id: 'trust_low', weight: 2, when: (s) => s.world.trust < 33, make: () => [['מדד האמון במוסדות בשפל של כל הזמנים', 'bad'], ['"כולם מושחתים": רק אחד מחמישה סומך על הכנסת', 'bad']] },
  { id: 'cohesion_low', weight: 2, when: (s) => s.world.cohesion < 33, make: () => [['"שתי מדינות לשני עמים – בתוך ישראל": הקרע מעמיק', 'bad'], ['הפגנות ענק משני הצדדים באותו ערב; המשטרה מפרידה', 'bad']] },
  // ---- סוגיות ----
  { id: 'draft_hot', weight: 2, when: (s) => s.issues.draft > 70 && tf(s, 'volunteer') < 2, make: () => [['המילואימניקים חוסמים את איילון: "אנחנו לא פראיירים"', 'bad'], ['ישיבות מתכוננות למעצרים; ההנהגה החרדית: "נצא לרחובות"', 'bad']] },
  { id: 'wages_hot', weight: 2, when: (s) => s.issues.wages > 68, make: () => [['ההסתדרות מאיימת בשביתה כללית', 'bad'], ['רופאים, אחיות ומורים: גל שביתות במגזר הציבורי', 'bad']] },
  { id: 'judiciary_hot', weight: 2, when: (s) => s.issues.judiciary > 70, make: () => [['מוצאי שבת: מאות אלפים בקפלן', 'neutral'], ['טייסי מילואים מאיימים: "לא נתייצב"', 'bad']] },
  { id: 'religion_hot', weight: 1, when: (s) => s.issues.religion > 70, make: () => [['עימותים בשכונה מעורבת על רקע פתיחת עסקים בשבת', 'bad']] },
  // ---- רוח הציבור ----
  { id: 'mood_hawk', weight: 2, when: (s) => (s.mood?.security ?? 0) > 15, make: () => [['פרשנים: "הציבור זז ימינה – ומהר"', 'neutral', 'אחרי חודשים של חוסר ביטחון, המפלגות הניציות מתחזקות בסקרים.'], ['"כבר לא מאמינים בהסדרים": המחנה הניצי מתחזק', 'neutral']] },
  { id: 'mood_dove', weight: 1, when: (s) => (s.mood?.security ?? 0) < -12, make: () => [['השקט מחזיר את השמאל לתמונה: "זה הזמן להסדר"', 'neutral']] },
  { id: 'mood_welfare', weight: 2, when: (s) => (s.mood?.econ ?? 0) < -12, make: () => [['"מדינת רווחה עכשיו": מחאת היוקר מתחזקת – והמפלגות החברתיות עולות', 'neutral']] },
  { id: 'mood_market', weight: 1, when: (s) => (s.mood?.econ ?? 0) > 14, make: () => [['בשוק חוגגים, והציבור קונה את הסיפור: "תנו לשוק לעבוד"', 'neutral']] },
  { id: 'mood_anti', weight: 1, when: (s) => (s.mood?.judiciary ?? 0) > 10, make: () => [['"נגד כולם": הזעם על הממסד מחפש כתובת', 'neutral']] },
  // ---- קואליציה ובחירות ----
  { id: 'coal_shaky', weight: 3, when: (s) => s.coalition.stability < 38, make: (s) => [['גורם בכיר בקואליציה: "הממשלה לא תשרוד עד סוף המושב"', 'bad'], [`במסדרונות: מי ימוטט ראשון את ממשלת ${pmName(s)}?`, 'bad']] },
  { id: 'coal_strong', weight: 1, when: (s) => s.coalition.stability > 78, make: (s) => [[`ממשלת ${pmName(s)} נראית יציבה מתמיד; באופוזיציה מחפשים כיוון`, 'neutral']] },
  { id: 'campaign', weight: 3, when: (s) => toElection(s) > 0 && toElection(s) <= 10, make: (s) => [[`${toElection(s)} שבועות לבחירות: שלטי החוצות כבר בכל צומת`, 'neutral'], ['הקמפיינים עולים הילוך: "הבחירות הכי חשובות בתולדות המדינה" – שוב', 'neutral']] },
  { id: 'mergers', weight: 2, when: (s) => toElection(s) > 6 && toElection(s) <= 20 && smallUnder(s).length > 0, make: (s) => [[`${smallUnder(s)[0].name} מתחת לחסימה – ומחפשת עם מי להתאחד`, 'neutral'], ['שעון החול של האיחודים: מי יישאר מתחת לאחוז החסימה?', 'neutral']] },
  // ---- כללי המשחק ----
  { id: 'direct_race', weight: 3, when: (s) => !!(s.rules.directPM || s.rules.presidential) && toElection(s) <= 30, make: (s) => [['המרוץ לראשות הממשלה: הסקרים צמודים מתמיד', 'neutral', 'בבחירה ישירה, כל נקודה במדד ההתאמה שווה זהב.'], [`${pmName(s)} פותח/ת את הקמפיין האישי: "אתם בוחרים בי, לא במפלגה"`, 'neutral']] },
  { id: 'presidential_power', weight: 1, when: (s) => !!s.rules.presidential, make: (s) => [[`${pmName(s)} חתם/ה על צו נשיאותי – בלי לשאול את הכנסת`, 'neutral', 'בשיטה הנשיאותית, השותפות כבר לא יכולות לאיים בפירוק.']] },
  { id: 'districts', weight: 1, when: (s) => !!s.rules.districts, make: () => [['המאבק על המחוזות: המפלגות הקטנות מחפשות "מחוז בטוח"', 'neutral']] },
  { id: 'threshold_up', weight: 1, when: (s) => (s.rules.threshold ?? 3.25) > 3.25 && toElection(s) <= 40, make: (s) => [[`אחוז החסימה החדש (${s.rules.threshold}%) מכה: לפחות שתי מפלגות בסכנת היעלמות`, 'neutral']] },
  { id: 'threshold_down', weight: 1, when: (s) => (s.rules.threshold ?? 3.25) < 3.25 && toElection(s) <= 40, make: () => [['מבול של רשימות חדשות נרשם לבחירות; "כל אחד יכול להיכנס"', 'neutral']] },
  { id: 'norwegian', weight: 1, when: (s) => Object.keys(s.norwegianSwaps ?? {}).length > 0, make: (s) => [[`${Object.keys(s.norwegianSwaps).length} ח"כים "נורבגיים" בכנסת: "מה שהשר אומר – אני מצביע/ה"`, 'neutral']] },
  { id: 'term_end', weight: 2, when: (s) => !!s.rules.termLimit && (s.pmTerms?.[s.coalition.pmId]?.streak ?? 0) >= (s.rules.termLimitScope === 1 ? 2 : 1) && toElection(s) <= 52, make: (s) => [[`הקדנציה האחרונה של ${pmName(s)}: המאבק על הירושה כבר התחיל`, 'neutral']] },
  { id: 'immunity', weight: 2, when: (s) => !!s.rules.immunity, make: () => [['"חוק עוקף משפט": מחאה מול בית ראש הממשלה', 'bad'], ['היועמ"ש: "החסינות הופכת את החקירות לבדיחה"', 'neutral']] },
  { id: 'no_review', weight: 1, when: (s) => !!s.rules.noReview, make: () => [['בלי בג"ץ: עותרים מוותרים מראש. "אין לנו לאן לפנות"', 'bad']] },
  { id: 'packed', weight: 1, when: (s) => !!s.rules.packedCourt && !s.rules.noReview, make: () => [['השופטים החדשים בבג"ץ: הרוב השמרני כבר ניכר בפסקי הדין', 'neutral']] },
  // ---- מדינה אחרת ----
  { id: 't_peace', weight: 2, when: (s) => tf(s, 'peace') > 0, make: () => [['שגרירות חדשה נפתחה; טיסה ישירה ראשונה נחתה', 'good'], ['מתנחלים מפגינים מול הכנסת: "לא ננוע"', 'bad']] },
  { id: 't_annex', weight: 2, when: (s) => tf(s, 'annexation') > 0, make: () => [['עוד מדינה הודיעה על סנקציות; יצואנים בבהלה', 'bad'], ['בשטחים: גל עימותים אחרי החלת הריבונות', 'bad']] },
  { id: 't_halacha', weight: 2, when: (s) => tf(s, 'halacha') > 0, make: () => [['בית הדין הרבני פסק – ואלפים יצאו להפגין בתל אביב', 'bad'], ['שבת ממלכתית: הכבישים ריקים, בתי הקפה סגורים', 'neutral'], ['תור בשגרירויות: חילונים מבקשים דרכונים זרים', 'bad']] },
  { id: 't_secular', weight: 2, when: (s) => tf(s, 'secular') > 0, make: () => [['אוטובוסים בשבת בירושלים: מחאה חרדית בשכונות', 'neutral'], ['שיא בנישואים אזרחיים: "סוף סוף בלי רבנות"', 'good']] },
  { id: 't_ubi', weight: 2, when: (s) => tf(s, 'ubi') > 0, make: () => [['התשלום החודשי נכנס; הקניונים מלאים', 'good'], ['האוצר מזהיר: "הגירעון יוצא משליטה"', 'bad']] },
  { id: 't_lib', weight: 2, when: (s) => tf(s, 'libertarian') > 0, make: () => [['חברות זרות נוהרות; מגדלי משרדים חדשים בכל עיר', 'good'], ['דוח העוני: הפערים הגדולים בעולם המערבי', 'bad']] },
  { id: 't_volunteer', weight: 1, when: (s) => tf(s, 'volunteer') >= 2, make: () => [['צה"ל מגייס בתשלום: "יחידות העילית מלאות, השאר – פחות"', 'neutral']] },
  { id: 't_citizens', weight: 1, when: (s) => tf(s, 'citizens') > 0, make: () => [['הוויכוח על ההמנון החדש מפלג את המשפחות', 'neutral']] },
  { id: 't_emergency', weight: 2, when: (s) => tf(s, 'emergency') > 0, make: () => [['שעת חירום: האופוזיציה מכנה את הממשלה "חונטה"', 'bad'], ['התקנות החדשות: הפגנות מוגבלות, הכנסת מתכנסת פחות', 'bad']] },
  { id: 't_sovereign', weight: 1, when: (s) => tf(s, 'sovereignty') > 0, make: () => [['משקיעים זרים מקפיאים פרויקטים: "אין יותר בלמים"', 'bad']] },
  { id: 't_constitution', weight: 1, when: (s) => tf(s, 'constitution') > 0, make: () => [['בית המשפט לחוקה פסק לראשונה; שני המחנות מרוצים – בערך', 'good']] },
  // ---- נשיאות ----
  { id: 'president_soon', weight: 2, when: (s) => (s.presidentNextWeek ?? Infinity) - s.week <= 20 && (s.presidentNextWeek ?? 0) > s.week, make: () => [['הבחירות לנשיאות מתקרבות: המועמדים מתחילים להתקשר לח"כים', 'neutral']] },
];
