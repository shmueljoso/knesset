// שרשראות סיבה ותוצאה: חוק או טלטלה גורמים לאירוע המשך, וההחלטה שלך קובעת מה יבוא אחריו.
import type { GameState } from '../types';
import { templateById } from './bills';
import type { GameEvent } from './events';

export interface ChainRule {
  id: string;
  kind: 'law' | 'shock' | 'struck';
  match: (id: string, s: GameState) => boolean;
  when?: (s: GameState, id: string) => boolean;
  p: number;
  delay: number;
  event: string;
  ctx?: (s: GameState, id: string) => Record<string, string>;
}

/** מפלגה בקואליציה שחשוב לה הנושא הדתי (חרדית/דתית) או החילוני */
export const religiousPartner = (s: GameState) =>
  s.coalition.parties.map((p) => s.parties[p]).filter((p) => p && p.leaderId !== s.coalition.pmId && p.ideology.religion >= 55).sort((a, b) => b.seats - a.seats)[0];
export const secularPartner = (s: GameState) =>
  s.coalition.parties.map((p) => s.parties[p]).filter((p) => p && p.leaderId !== s.coalition.pmId && p.ideology.religion <= -40).sort((a, b) => b.seats - a.seats)[0];

const JUDICIAL = ['ag_split', 'broadcast', 'immunity', 'override', 'ngo', 'outposts', 'soldier_shield'];

export const CHAINS: ChainRule[] = [
  // חוק נגד המפלגה הדתית בקואליציה, או חוק דתי נגד החילונית: אולטימטום
  { id: 'ult_religious', kind: 'law', match: () => true, p: 0.6, delay: 5, event: 'ch_ultimatum',
    when: (s, id) => !!religiousPartner(s) && lawReligion(id) <= -35,
    ctx: (s, id) => ({ party: religiousPartner(s)!.id, partyName: religiousPartner(s)!.name, law: id, title: lawTitle(id) }) },
  { id: 'ult_secular', kind: 'law', match: () => true, p: 0.6, delay: 5, event: 'ch_ultimatum',
    when: (s, id) => !!secularPartner(s) && lawReligion(id) >= 50,
    ctx: (s, id) => ({ party: secularPartner(s)!.id, partyName: secularPartner(s)!.name, law: id, title: lawTitle(id) }) },
  // מחאה משפטית שמסלימה
  { id: 'judicial', kind: 'law', match: (id) => JUDICIAL.includes(id), p: 0.75, delay: 2, event: 'ch_jc_protest', ctx: (_s, id) => ({ law: id, title: lawTitle(id) }) },
  { id: 'judicial_struck', kind: 'struck', match: () => true, p: 0.55, delay: 1, event: 'ch_court_clash', ctx: (_s, id) => ({ law: id, title: lawTitle(id) }) },
  // דיור: יזמים מקפיאים
  { id: 'housing', kind: 'law', match: (id) => id === 'housing' || id === 'rent' || id === 'third_home', p: 0.55, delay: 8, event: 'ch_developers', ctx: (_s, id) => ({ law: id, title: lawTitle(id) }) },
  // מלחמה: דרישות המילואימניקים
  { id: 'war', kind: 'shock', match: (id) => id === 'shock_war', p: 0.9, delay: 6, event: 'ch_reservists' },
  // משבר כלכלי: דילמת הצנע
  { id: 'crash', kind: 'shock', match: (id) => id === 'shock_crash', p: 0.9, delay: 5, event: 'ch_austerity' },
  // מחאת יוקר: מנהיגי המחאה
  { id: 'tents', kind: 'shock', match: (id) => id === 'shock_tents', p: 0.7, delay: 8, event: 'ch_tent_leaders' },
];

function lawReligion(id: string): number {
  return templateById(id)?.lean.religion ?? 0;
}
function lawTitle(id: string): string {
  return templateById(id)?.title ?? id;
}

const T = (id: string, icon: string, title: string, body: string, choices: GameEvent['choices']): GameEvent => ({ id, queued: true, icon, title, body, choices });

export const CHAIN_EVENTS: GameEvent[] = [
  // ---- אולטימטום קואליציוני ----
  T('ch_ultimatum', '⏳', '{partyName}: "או שהחוק יוקפא – או שאנחנו יוצאים"', '"{title}" עבר – ו{partyName} לא מוכנה לשתוק. נציגיה מודיעים בשעה טובה: אם החוק לא יוקפא, הם פורשים מהקואליציה.', [
    { label: 'להקפיא את החוק', hint: 'השותפה נרגעת – אבל מי שרצה את החוק יזכור', ops: [{ op: 'special', id: 'ch_freeze_law', label: 'החוק מוקפא' }] },
    { label: 'לעמוד על שלך', hint: 'סיכון: הקואליציה עלולה להתפרק', ops: [{ op: 'special', id: 'ch_hold_law', label: 'מחכים לראות אם יפרשו' }] },
    { label: 'להציע פשרה', hint: 'סיכוי לפי משא ומתן', chance: { p: (s) => 0.4 + s.player.skills.negotiation / 180, fail: [{ op: 'special', id: 'ch_hold_law', label: 'הפשרה נדחתה' }], failText: 'הפשרה נדחתה. עכשיו זה רק עניין של זמן.' }, ops: [{ op: 'special', id: 'ch_compromise_law', label: 'פשרה מתקבלת' }] },
  ]),
  // ---- הסלמה משפטית ----
  T('ch_jc_protest', '📢', 'מחאה ציבורית נגד "{title}"', 'אלפים בכיכר, עצומות של פרופסורים ושורת עתירות לבג"ץ. הקואליציה נחושה, והרחוב גם.', [
    { label: 'להמשיך בלי להתרשם', hint: 'המחאה עלולה להסלים', ops: [{ op: 'special', id: 'ch_jc_hold', label: 'ההסלמה בדרך' }] },
    { label: 'לפתוח בהידברות', hint: 'מרגיע, אבל נראה כנסיגה', ops: [{ op: 'world', key: 'cohesion', d: 2, weeks: 8 }, { op: 'reputation', d: 1.5 }, { op: 'special', id: 'ch_jc_talk', label: 'השיחות נפתחו' }] },
    { label: 'להקפיא את החוק', hint: 'המחאה דועכת; הבסיס זועם', ops: [{ op: 'special', id: 'ch_freeze_law', label: 'החוק מוקפא' }, { op: 'approval', sector: 'religious', d: -1.5 }, { op: 'approval', sector: 'haredi', d: -1.5 }] },
  ]),
  T('ch_jc_pilots', '✈️', 'טייסי המילואים: "לא נתייצב"', 'מאות טייסים וקצינים בכירים מודיעים שיחדלו להתייצב למילואים. הרמטכ"ל מזהיר מפגיעה בכשירות.', [
    { label: 'לדחות את המכתב כ"הפרת משמעת"', hint: 'מחזק את הבסיס, מעמיק את הקרע', ops: [{ op: 'world', key: 'security', d: -3, weeks: 8 }, { op: 'special', id: 'ch_jc_strike_next', label: 'המשבר מחמיר' }] },
    { label: 'לקיים פגישה דחופה עם הטייסים', ops: [{ op: 'world', key: 'trust', d: 1.5, weeks: 6 }, { op: 'reputation', d: 1.5 }] },
    { label: 'להקפיא את החוק', ops: [{ op: 'special', id: 'ch_freeze_law', label: 'החוק מוקפא' }] },
  ]),
  T('ch_jc_strike', '🛑', 'שביתה כללית', 'ההסתדרות, התאחדות התעשיינים והבנקים מודיעים: המשק עומד. נמל התעופה ננעל, הבורסה מושבתת.', [
    { label: 'להקפיא את החוק ולסיים את המשבר', ops: [{ op: 'special', id: 'ch_freeze_law', label: 'החוק מוקפא' }, { op: 'world', key: 'economy', d: -2, weeks: 3 }] },
    { label: 'להחזיק מעמד', hint: 'יקר מאוד', ops: [{ op: 'world', key: 'economy', d: -8, weeks: 4 }, { op: 'stability', d: -12 }, { op: 'reputation', d: -2 }] },
  ]),
  T('ch_court_clash', '⚖️', 'בג"ץ פסל את "{title}" – ומה הממשלה עושה?', 'הרכב מורחב פסק פה אחד. בקואליציה כבר מדברים על "דרך אחרת".', [
    { label: 'לכבד את פסק הדין', ops: [{ op: 'reputation', d: 2.5 }, { op: 'world', key: 'trust', d: 2, weeks: 6 }] },
    { label: 'לחוקק מחדש (אם יש פסקת התגברות)', hint: 'רק עם פסקת התגברות', requires: (s) => (s.rules.override ? null : 'אין פסקת התגברות'), ops: [{ op: 'special', id: 'ch_override_law', label: 'מחוקקים מחדש' }] },
    { label: 'להסית נגד השופטים', hint: 'כותרות והרבה אויבים', ops: [{ op: 'fame', d: 3 }, { op: 'world', key: 'trust', d: -4, weeks: 8 }, { op: 'world', key: 'cohesion', d: -3, weeks: 8 }, { op: 'special', id: 'ch_judiciary_heat', label: 'המתח המשפטי גובר' }] },
  ]),
  // ---- דיור ----
  T('ch_developers', '🏗️', 'יזמים מקפיאים פרויקטים', 'אחרי "{title}", התאחדות הבנאים מודיעה על הקפאת מכרזים: "אי אפשר לבנות בהפסד".', [
    { label: 'להיכנס למשא ומתן עם היזמים', hint: 'סיכוי לפי משא ומתן · בטווח הארוך משתלם', chance: { p: (s) => 0.45 + s.player.skills.negotiation / 170, fail: [{ op: 'world', key: 'housing', d: -2, weeks: 12 }], failText: 'המשא ומתן נכשל. הבנייה נעצרת לחצי שנה.' }, ops: [{ op: 'special', id: 'ch_housing_deal', label: 'הסכם עם היזמים' }] },
    { label: 'לאיים בהפקעת קרקעות', hint: 'מכה ביזמים, אבל הבנייה מתעכבת', ops: [{ op: 'world', key: 'housing', d: -2, weeks: 10 }, { op: 'world', key: 'trust', d: 1, weeks: 8 }, { op: 'approval', sector: 'secular', d: 1 }] },
    { label: 'לוותר על חלק מהחוק', ops: [{ op: 'world', key: 'housing', d: 1, weeks: 12 }, { op: 'reputation', d: -1.5 }] },
  ]),
  T('ch_housing_boom', '🏠', 'פריצת הדרך בדיור', 'ההסכם עם היזמים נושא פרי: אלפי יחידות דיור בבנייה, ולראשונה מזה שנים המחירים מתייצבים.', [
    { label: 'לצאת לאירוע חגיגי', ops: [{ op: 'world', key: 'housing', d: 4, weeks: 20 }, { op: 'fame', d: 2 }, { op: 'approval', sector: 'all', d: 1 }] },
  ]),
  // ---- מלחמה ----
  T('ch_reservists', '🎖️', 'המילואימניקים דורשים פיצוי', 'אחרי חודשי לחימה, אלפי משרתי מילואים חסרי הכנסה ועסקים קטנים בפשיטת רגל. ארגוני המילואימניקים מאיימים בהפגנה.', [
    { label: 'לאשר חבילת פיצוי מלאה', hint: 'עולה מיליארדים – אבל מחזקת את הלכידות', ops: [{ op: 'world', key: 'economy', d: -2, weeks: 12 }, { op: 'world', key: 'cohesion', d: 3, weeks: 12 }, { op: 'reputation', d: 2.5 }] },
    { label: 'חבילה חלקית', ops: [{ op: 'world', key: 'cohesion', d: 1, weeks: 8 }, { op: 'reputation', d: 0.5 }] },
    { label: 'להתעלם: "אין תקציב"', hint: 'הפגנות בדרך', ops: [{ op: 'special', id: 'ch_reservists_protest', label: 'המילואימניקים בדרך לרחוב' }] },
  ]),
  T('ch_reservists_protest', '📣', 'המילואימניקים חוסמים את איילון', 'המשטרה מפרידה בין המפגינים לנהגים. כל הערוצים משדרים מהמקום.', [
    { label: 'להיפגש איתם', ops: [{ op: 'reputation', d: 1.5 }, { op: 'world', key: 'cohesion', d: 1, weeks: 6 }, { op: 'world', key: 'economy', d: -0.8, weeks: 8 }] },
    { label: 'לגנות את החסימה', ops: [{ op: 'reputation', d: -2 }, { op: 'world', key: 'cohesion', d: -2, weeks: 8 }] },
  ]),
  // ---- משבר כלכלי ----
  T('ch_austerity', '✂️', 'הדילמה הגדולה: צנע או גירעון?', 'האוצר מניח על השולחן תוכנית: קיצוץ רוחבי של 4% או הרחבת הגירעון. בשני המקרים מישהו ישלם.', [
    { label: 'צנע: קיצוץ רוחבי', hint: 'כלכלה מתאוששת מהר יותר – ויוקר המחיה מכאיב', ops: [{ op: 'world', key: 'economy', d: 4, weeks: 20 }, { op: 'world', key: 'affordability', d: -3, weeks: 20 }, { op: 'special', id: 'ch_unions', label: 'האיגודים מתכוננים' }] },
    { label: 'לגדול: הרחבת גירעון', hint: 'מרגיע עכשיו – חשבון בהמשך', ops: [{ op: 'world', key: 'affordability', d: 3, weeks: 16 }, { op: 'world', key: 'economy', d: 1, weeks: 12 }, { op: 'special', id: 'ch_inflation', label: 'האינפלציה מאיימת' }] },
  ]),
  T('ch_unions_strike', '🏭', 'שביתת האיגודים', 'אחרי הקיצוצים, ההסתדרות מכריזה על שביתה בשירות הציבורי.', [
    { label: 'להיכנס למו"מ', ops: [{ op: 'world', key: 'cohesion', d: 1.5, weeks: 8 }, { op: 'world', key: 'economy', d: -1, weeks: 6 }] },
    { label: 'לעמוד איתן', ops: [{ op: 'world', key: 'economy', d: -3, weeks: 6 }, { op: 'world', key: 'cohesion', d: -2, weeks: 8 }, { op: 'reputation', d: 1 }] },
  ]),
  T('ch_inflation_bite', '📈', 'האינפלציה נושכת', 'הגירעון שהורחב מזין עליות מחירים. בנק ישראל מעלה ריבית, וההלוואות מתייקרות.', [
    { label: 'לתמוך בהעלאת הריבית', ops: [{ op: 'world', key: 'affordability', d: -3, weeks: 12 }, { op: 'world', key: 'economy', d: 1, weeks: 16 }] },
    { label: 'ללחוץ על הבנק', hint: 'פוגע באמון', ops: [{ op: 'world', key: 'trust', d: -3, weeks: 10 }, { op: 'world', key: 'affordability', d: -1, weeks: 8 }] },
  ]),
  // ---- מחאת יוקר ----
  T('ch_tent_leaders', '⛺', 'מנהיגי המחאה שוקלים לרוץ', 'אחרי חודשים באוהלים, מנהיגי המחאה אומרים שלא יסתפקו ברחוב. המפלגות החברתיות כבר מתקשרות.', [
    { label: 'לפגוש אותם ולתמוך', hint: 'מוכרות וקרדיט – אבל גם חיכוך עם הקואליציה', ops: [{ op: 'fame', d: 2.5 }, { op: 'stance', lean: { econ: -50 }, d: 1.5 }, { op: 'special', id: 'ch_tents_boost', label: 'המחאה מתחזקת בסקרים' }] },
    { label: 'לגנות כ"פוליטיזציה"', ops: [{ op: 'reputation', d: -1.5 }, { op: 'special', id: 'ch_tents_boost', label: 'המחאה מתחזקת בסקרים' }] },
    { label: 'להישאר מהצד', ops: [] },
  ]),
];
