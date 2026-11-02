// אירועים של חוקים בתוקף: מה קורה בשטח אחרי שחוק עבר – ומה קורה כשמבטלים אותו.
// כל אירוע מופיע רק כשהחוק באמת בתוקף (ולא נפסל או בוטל), ורק אחרי שעבר מספיק זמן מאז שנחקק.
import { registerSpecial, type Ctx, type Op } from '../ops';
import { pick } from '../rng';
import { lawInForce } from '../systems/facts';
import { fiercestOpponent, lawVerdict, lawsInForce, repealAndReact } from '../systems/lawlife';
import { changeSatisfaction, recomputeStability } from '../systems/coalition';
import { worldFacts } from '../systems/facts';
import type { GameState } from '../types';
import { templateById } from './bills';
import type { GameEvent } from './events';

/** החוק בתוקף לפחות minAge שבועות */
const law = (id: string, minAge = 12, maxAge = 400) => (s: GameState) => {
  const l = lawInForce(s, id);
  return !!l && s.week - l.week >= minAge && s.week - l.week <= maxAge;
};
const isPM = (s: GameState) => s.coalition.pmId === 'player';
const credit = (s: GameState, ctx: Ctx): Op[] => {
  const l = lawInForce(s, ctx.law);
  return l && (l.sponsor === 'player' || l.coSponsor) ? [{ op: 'fame', d: 2 }, { op: 'reputation', d: 1 }] : [{ op: 'fame', d: 1 }];
};

export const LAW_LIFE_EVENTS: GameEvent[] = [
  // ---------- כללי: כל חוק בתוקף ----------
  {
    id: 'law_review', icon: '📋', weight: 2.5, cooldown: 10,
    title: 'דוח מבקר המדינה: "{title}"',
    body: '{verdict} {extra}',
    when: (s) => lawsInForce(s).some((l) => s.week - l.week >= 26 && s.flags[`rev_${l.templateId}`] === undefined),
    ctx: (s) => {
      const list = lawsInForce(s).filter((l) => s.week - l.week >= 26 && s.flags[`rev_${l.templateId}`] === undefined);
      if (!list.length) return null;
      const l = pick(s, list);
      const v = lawVerdict(s, l.templateId);
      return { law: l.templateId, title: l.title, verdict: v.text, good: v.good ? '1' : '', extra: l.sponsor === 'player' ? 'זה החוק שלך – כל האולפנים מחכים לתגובה.' : '' };
    },
    choices: [
      {
        label: 'לקחת קרדיט / להגן על החוק',
        dyn: (s, ctx) => [{ op: 'special', id: 'll_reviewed' }, ...(ctx.good ? credit(s, ctx) : [{ op: 'reputation', d: -2 } as Op, { op: 'fame', d: 1 } as Op])],
      },
      { label: 'לדרוש להרחיב ולתקצב', ops: [{ op: 'special', id: 'll_reviewed' }, { op: 'reputation', d: 1 }, { op: 'skill', skill: 'law', d: 0.5 }] },
      {
        label: 'לקרוא לבטל את החוק', hint: 'ראש הממשלה מבטל מיד',
        dyn: (s, ctx) => [{ op: 'special', id: 'll_reviewed' }, ...(isPM(s) ? [{ op: 'special', id: 'll_repeal', label: 'החוק מבוטל' } as Op] : []), { op: 'stance', lean: invert(templateById(ctx.law).lean), d: 1.5 }],
      },
    ],
  },
  {
    id: 'law_repeal_push', icon: '✂️', weight: 2, cooldown: 26,
    title: '{party} דורשת לבטל את "{title}"',
    body: 'בישיבת ראשי הקואליציה {party} מניחה דרישה על השולחן: לבטל את "{title}", שלדבריה "פוגע בבוחרים שלנו". {who}',
    when: (s) => lawsInForce(s).some((l) => s.week - l.week >= 20 && !!fiercestOpponent(s, l.templateId)),
    ctx: (s) => {
      const list = lawsInForce(s).filter((l) => s.week - l.week >= 20 && !!fiercestOpponent(s, l.templateId));
      if (!list.length) return null;
      const l = pick(s, list);
      const p = fiercestOpponent(s, l.templateId)!;
      return { law: l.templateId, title: l.title, party: p.id, who: isPM(s) ? 'ההחלטה שלך.' : 'ראש הממשלה מתלבט/ת, והתקשורת שואלת מה דעתך.' };
    },
    choices: [
      {
        label: 'לבטל את החוק', hint: 'השותפה מרוצה; תומכי החוק זועמים',
        requires: (s) => (isPM(s) ? null : 'רק ראש הממשלה'),
        ops: [{ op: 'special', id: 'll_repeal', label: 'החוק מבוטל' }, { op: 'special', id: 'll_partner_up' }],
      },
      { label: 'לסרב: "החוק נשאר"', dyn: (s) => (isPM(s) ? [{ op: 'special', id: 'll_partner_down' }, { op: 'consistency', d: 2 }] : [{ op: 'consistency', d: 2 }, { op: 'fame', d: 1 }]) },
      { label: 'להציע תיקון במקום ביטול', ops: [{ op: 'reputation', d: 1 }, { op: 'skill', skill: 'negotiation', d: 1 }] },
    ],
  },
  {
    id: 'law_repealed', queued: true, icon: '✂️', title: '"{title}" בוטל',
    body: 'הכנסת ביטלה את "{title}" (היוזמה: {who}). מה שהחוק שינה מתחיל לחזור לקדמותו – ומי שנלחם עליו כבר מתכנן איך להחזיר אותו.',
    choices: [
      { label: '"נחזיר אותו בכנסת הבאה"', ops: [{ op: 'fame', d: 1.5 }, { op: 'consistency', d: 1 }] },
      { label: '"טוב שבוטל"', dyn: (_s, ctx) => [{ op: 'stance', lean: invert(templateById(ctx.law).lean), d: 1 }, { op: 'fame', d: 1 }] },
      { label: 'לא להגיב', ops: [] },
    ],
  },

  // ---------- דיור ----------
  {
    id: 'rent_landlords', icon: '🔑', weight: 2, cooldown: 60, issue: 'housing',
    title: 'בעלי הדירות מגיבים לחוק השכירות',
    body: 'אחרי "חוק השכירות ההוגנת", משקיעים מוציאים דירות מהשוק ומוכרים. השוכרים מרוויחים חוזים ארוכים, אבל ההיצע מצטמק.',
    when: law('rent', 20),
    ctx: () => ({ law: 'rent' }),
    choices: [
      { label: 'להגן: "הביטחון של השוכרים קודם"', ops: [{ op: 'stance', lean: { econ: -60 }, d: 1.5 }, { op: 'approval', sector: 'secular', d: 1 }] },
      { label: 'להציע הטבות מס למשכירים', ops: [{ op: 'stance', lean: { econ: 40 }, d: 1 }, { op: 'world', key: 'housing', d: 1, weeks: 10 }] },
    ],
  },
  {
    id: 'fast_build_cranes', icon: '🏗️', weight: 1.5, cooldown: 70,
    title: 'עגורנים בכל עיר – ועתירה ירוקה',
    body: 'חוק התכנון המהיר עובד: היתרי הבנייה הוכפלו. ארגוני הסביבה עותרים נגד "בטון על שטחים פתוחים", והרשויות מתלוננות על תשתיות שלא מדביקות את הקצב.',
    when: law('fast_build', 30),
    ctx: () => ({ law: 'fast_build' }),
    choices: [
      { label: 'לטקס חנוכת שכונה', dyn: credit },
      { label: 'לדרוש תקציב לתשתיות ולתחבורה', ops: [{ op: 'reputation', d: 1.5 }, { op: 'world', key: 'cohesion', d: 0.5, weeks: 6 }] },
    ],
  },
  {
    id: 'third_home_sales', icon: '🏘️', weight: 1.5, cooldown: 70, issue: 'housing',
    title: 'המס על דירה שלישית: המשקיעים מוכרים',
    body: 'מאות דירות הוצעו למכירה בחודש האחרון. המחירים בשכונות הפופולריות נעצרו, והקבלנים מזהירים מהאטה בבנייה.',
    when: law('third_home', 16),
    ctx: () => ({ law: 'third_home' }),
    choices: [
      { label: '"המהלך עובד – הדירות חוזרות לזוגות צעירים"', dyn: credit },
      { label: 'לדרוש פטור לדירות להשכרה ארוכה', ops: [{ op: 'stance', lean: { econ: 40 }, d: 1 }, { op: 'reputation', d: 1 }] },
    ],
  },
  // ---------- כלכלה ורווחה ----------
  {
    id: 'vat_prices', icon: '🛒', weight: 2, cooldown: 60, issue: 'cost',
    title: 'ביטול המע"מ על מוצרי יסוד: לאן נעלמה ההוזלה?',
    body: 'בדיקה של רשות התחרות: הרשתות הוזילו רק חצי מהמע"מ שבוטל, והאוצר מאבד מיליארדים בשנה.',
    when: law('vat_food', 14),
    ctx: () => ({ law: 'vat_food' }),
    choices: [
      { label: 'לתקוף את הרשתות: "להחזיר לציבור"', ops: [{ op: 'fame', d: 2 }, { op: 'approval', sector: 'all', d: 1 }] },
      { label: 'להציע לפקח על המחירים', ops: [{ op: 'stance', lean: { econ: -50 }, d: 1.5 }, { op: 'world', key: 'affordability', d: 1, weeks: 10 }] },
    ],
  },
  {
    id: 'pension_protest', icon: '👵', weight: 2, cooldown: 70, issue: 'wages',
    title: 'העלאת גיל הפרישה נכנסה לתוקף',
    body: 'אלפי עובדות ועובדים שתכננו לפרוש השנה גילו שעליהם לעבוד עוד שנתיים. ההסתדרות מאיימת, והאוצר מצביע על החיסכון.',
    when: law('pension', 10),
    ctx: () => ({ law: 'pension' }),
    choices: [
      { label: 'להציע הסדר למקצועות שוחקים', ops: [{ op: 'reputation', d: 2 }, { op: 'approval', sector: 'traditional', d: 1 }] },
      { label: '"זה מה שמציל את הפנסיה"', ops: [{ op: 'stance', lean: { econ: 50 }, d: 1.5 }, { op: 'approval', sector: 'all', d: -0.5 }] },
    ],
  },
  {
    id: 'daycare_queues', icon: '🧸', weight: 1.5, cooldown: 70,
    title: 'מעונות מסובסדים: תורים של חודשים',
    body: 'הביקוש למעונות המסובסדים התפוצץ, ואין מספיק מטפלות. הורים צעירים מחכים חצי שנה למקום.',
    when: law('daycare', 20),
    ctx: () => ({ law: 'daycare' }),
    choices: [
      { label: 'לדרוש תקציב להכשרת מטפלות', ops: [{ op: 'reputation', d: 1.5 }, { op: 'approval', sector: 'all', d: 0.5 }] },
      { label: 'לבקר את היישום', ops: [{ op: 'fame', d: 1.5 }] },
    ],
  },
  // ---------- ביטחון ----------
  {
    id: 'death_sentence', icon: '⚖️', weight: 2, cooldown: 80, issue: 'security',
    title: 'לראשונה: התביעה מבקשת עונש מוות',
    body: 'בעקבות החוק החדש, התביעה ביקשה עונש מוות למחבל שרצח משפחה. מדינות אירופה מזהירות, ומשפחות שכולות חלוקות.',
    when: law('deathpenalty', 16),
    ctx: () => ({ law: 'deathpenalty' }),
    choices: [
      { label: '"הצדק ייעשה"', ops: [{ op: 'stance', lean: { security: 80 }, d: 2 }, { op: 'fame', d: 2 }] },
      { label: 'לקרוא לבית המשפט להפעיל שיקול דעת', ops: [{ op: 'stance', lean: { security: -40, judiciary: -40 }, d: 1.5 }, { op: 'reputation', d: 1 }] },
    ],
  },
  {
    id: 'icc_warning', icon: '🌐', weight: 1.5, cooldown: 80,
    title: 'האג מזהירה: "ההגנה המשפטית ללוחמים – חסינות"',
    body: 'התובעת בבית הדין הבינלאומי מודיעה שהחוק החדש "מונע חקירה עצמאית", ושוקלת לפתוח בבדיקה נגד קצינים.',
    when: law('soldier_shield', 20),
    ctx: () => ({ law: 'soldier_shield' }),
    choices: [
      { label: '"לא נפקיר את הלוחמים"', ops: [{ op: 'stance', lean: { security: 70 }, d: 1.5 }, { op: 'fame', d: 1.5 }] },
      { label: 'להציע מנגנון בדיקה ישראלי עצמאי', ops: [{ op: 'reputation', d: 2 }, { op: 'stance', lean: { judiciary: -40 }, d: 1 }] },
    ],
  },
  {
    id: 'outposts_reaction', icon: '🗺️', weight: 1.5, cooldown: 70,
    title: 'אחרי חוק ההסדרה: גינוי בינלאומי',
    body: 'עשרות מאחזים קיבלו מעמד חוקי. ממשל ארה"ב "מודאג מאוד", ותושבים פלסטינים עותרים על אדמות פרטיות.',
    when: law('outposts', 12),
    ctx: () => ({ law: 'outposts' }),
    choices: [
      { label: '"זו הארץ שלנו"', ops: [{ op: 'stance', lean: { security: 80 }, d: 1.5 }, { op: 'approval', sector: 'religious', d: 2 }] },
      { label: 'לקרוא להקפאה בשטחים פרטיים', ops: [{ op: 'stance', lean: { security: -50 }, d: 1.5 }, { op: 'reputation', d: 1 }] },
    ],
  },
  {
    id: 'guns_incident', icon: '🔫', weight: 1.5, cooldown: 70,
    title: 'ירי באקדח מורשה',
    body: 'מאז הרחבת רישוי הנשק יש בישראל עשרות אלפי אקדחים חדשים. השבוע: ויכוח חניה שהסתיים בירי. המשטרה מבקשת להחמיר את הפיקוח.',
    when: law('guns', 20),
    ctx: () => ({ law: 'guns' }),
    choices: [
      { label: '"אזרחים חמושים מצילים חיים"', ops: [{ op: 'stance', lean: { security: 60 }, d: 1.5 }] },
      { label: 'לדרוש להחמיר את הפיקוח', ops: [{ op: 'reputation', d: 1.5 }, { op: 'world', key: 'security', d: 0.5, weeks: 6 }] },
    ],
  },
  {
    id: 'gun_crime_results', icon: '🚔', weight: 1.5, cooldown: 70, issue: 'crime',
    title: 'שנה לעונשי המינימום על עבירות נשק',
    body: '{result}',
    when: law('gun_crime', 40),
    ctx: (s) => ({ law: 'gun_crime', result: s.issues.crime < 55 ? 'מספר הנרצחים בחברה הערבית ירד לראשונה מזה שנים. ראשי הרשויות זהירים: "זו רק התחלה".' : 'למרות העונשים החמורים, הירי לא נעצר. ראשי הרשויות הערביות: "בלי שוטרים ואכיפה, החוק הוא נייר".' }),
    choices: [
      { label: 'לבקר ביישוב ערבי ולשמוע', ops: [{ op: 'approval', sector: 'arab', d: 2 }, { op: 'reputation', d: 1 }] },
      { label: 'לדרוש עוד תקנים למשטרה', ops: [{ op: 'stance', lean: { security: 40 }, d: 1 }, { op: 'world', key: 'security', d: 0.5, weeks: 8 }] },
    ],
  },
  {
    id: 'asylum_deport', icon: '✈️', weight: 1.5, cooldown: 70,
    title: 'חוק מבקשי המקלט: טיסות הגירוש',
    body: 'הטיסה הראשונה המריאה. בדרום תל אביב חלוקים: תושבים ותיקים מברכים, ארגוני זכויות האדם עותרים.',
    when: law('asylum', 14),
    ctx: () => ({ law: 'asylum' }),
    choices: [
      { label: '"מחזירים את דרום תל אביב לתושבים"', ops: [{ op: 'stance', lean: { security: 50 }, d: 1.5 }, { op: 'approval', sector: 'traditional', d: 1.5 }] },
      { label: 'לדרוש בדיקת בקשות מקלט פרטנית', ops: [{ op: 'stance', lean: { security: -40 }, d: 1.5 }, { op: 'reputation', d: 1 }] },
    ],
  },
  // ---------- דת ומדינה ----------
  {
    id: 'core_refusal', icon: '📐', weight: 2, cooldown: 70, issue: 'education',
    title: 'תלמודי תורה מסרבים ללמד ליבה',
    body: 'לפי חוק לימודי הליבה, משרד החינוך הקפיא תקציב ל-200 מוסדות שלא לימדו מתמטיקה ואנגלית. הרבנים: "לא נוותר על לימוד תורה".',
    when: law('core', 20),
    ctx: () => ({ law: 'core' }),
    choices: [
      { label: '"החוק חל על כולם"', ops: [{ op: 'stance', lean: { religion: -60 }, d: 1.5 }, { op: 'approval', sector: 'haredi', d: -2 }] },
      { label: 'להציע מסלול הדרגתי עם מורים מהקהילה', ops: [{ op: 'reputation', d: 2 }, { op: 'approval', sector: 'haredi', d: 1 }] },
    ],
  },
  {
    id: 'conversion_rabbinate', icon: '✡️', weight: 1.5, cooldown: 70,
    title: 'הרבנות לא מכירה בגיור הממלכתי',
    body: 'אלפי מתגיירים במסלול החדש מגלים שהרבנות לא תחתן אותם. עולים מברית המועצות לשעבר מפגינים מול היכל שלמה.',
    when: (s) => law('conversion', 20)(s) && !worldFacts(s).civilMarriage,
    ctx: () => ({ law: 'conversion' }),
    choices: [
      { label: 'לעמוד לצד המתגיירים', ops: [{ op: 'stance', lean: { religion: -40 }, d: 1.5 }, { op: 'approval', sector: 'olim', d: 2.5 }] },
      { label: 'לקרוא לפשרה עם הרבנות', ops: [{ op: 'reputation', d: 1 }, { op: 'approval', sector: 'religious', d: 1 }] },
    ],
  },
  {
    id: 'kashrut_market', icon: '🍽️', weight: 1.2, cooldown: 80,
    title: 'רפורמת הכשרות: גופי כשרות פרטיים',
    body: 'מסעדות עוברות לגופי כשרות פרטיים וזולים יותר. הרבנות הראשית מזהירה: "אין לסמוך על הכשרים החדשים".',
    when: law('kashrut', 16),
    ctx: () => ({ law: 'kashrut' }),
    choices: [
      { label: '"תחרות מורידה מחירים"', ops: [{ op: 'stance', lean: { religion: -40, econ: 30 }, d: 1 }, { op: 'world', key: 'affordability', d: 0.5, weeks: 6 }] },
      { label: 'לדרוש פיקוח של הרבנות', ops: [{ op: 'stance', lean: { religion: 50 }, d: 1 }] },
    ],
  },
  {
    id: 'muezzin_enforcement', icon: '🕌', weight: 1.2, cooldown: 80,
    title: 'חוק המואזין: קנסות ראשונים',
    body: 'הפקחים חילקו קנסות למסגדים ביפו ובלוד. ראשי הציבור הערבי: "פגיעה בחופש הדת". בשכונות היהודיות הסמוכות – שקט סוף סוף.',
    when: law('muezzin', 16),
    ctx: () => ({ law: 'muezzin' }),
    choices: [
      { label: '"החוק שומר על השקט של כולם"', ops: [{ op: 'stance', lean: { security: 40 }, d: 1 }, { op: 'approval', sector: 'arab', d: -2 }] },
      { label: 'לקרוא להסדר בהידברות', ops: [{ op: 'reputation', d: 1.5 }, { op: 'approval', sector: 'arab', d: 1.5 }] },
    ],
  },
  // ---------- ממשל ומשפט ----------
  {
    id: 'override_used', icon: '⚖️', weight: 1.5, cooldown: 60, issue: 'judiciary',
    title: 'הכנסת התגברה על פסק דין',
    body: 'לראשונה הופעלה פסקת ההתגברות: חוק שבג"ץ פסל חוקק מחדש ב-61 קולות. המחאה חוזרת לקפלן.',
    when: (s) => law('override', 12)(s) && s.lawsPassed.some((l) => l.struck && !l.repealed),
    ctx: () => ({ law: 'override' }),
    choices: [
      { label: '"העם הוא הריבון"', ops: [{ op: 'stance', lean: { judiciary: 80 }, d: 2 }, { op: 'fame', d: 1.5 }] },
      { label: 'להפגין בקפלן', ops: [{ op: 'stance', lean: { judiciary: -80 }, d: 2 }, { op: 'fame', d: 1.5 }] },
    ],
  },
  {
    id: 'ag_split_first', icon: '🧑‍⚖️', weight: 1.2, cooldown: 80, issue: 'judiciary',
    title: 'היועמ"ש החדש/ה של הממשלה',
    body: 'אחרי פיצול התפקיד, היועץ/ת המשפטי/ת לממשלה כבר לא חותם/ת על כתבי אישום. התובע/ת הכללי/ת החדש/ה פתח/ה תיק – והממשלה טוענת ל"רדיפה".',
    when: law('ag_split', 16),
    ctx: () => ({ law: 'ag_split' }),
    choices: [
      { label: '"סוף סוף הפרדת רשויות אמיתית"', ops: [{ op: 'stance', lean: { judiciary: 60 }, d: 1.5 }] },
      { label: '"הפיצול נועד להגן על הממשלה"', ops: [{ op: 'stance', lean: { judiciary: -60 }, d: 1.5 }, { op: 'fame', d: 1 }] },
    ],
  },
  {
    id: 'broadcast_closed', icon: '📺', weight: 1.5, cooldown: 80,
    title: 'התאגיד נסגר: אלף עובדים בחוץ',
    body: 'המשדר האחרון של תאגיד השידור הציבורי עלה הערב. העיתונאים בוכים באולפן, והממשלה מבטיחה "תקשורת חופשית בשוק פתוח".',
    when: law('broadcast', 6, 60),
    ctx: () => ({ law: 'broadcast' }),
    choices: [
      { label: 'להגיע להפגנת העובדים', ops: [{ op: 'stance', lean: { judiciary: -50 }, d: 1 }, { op: 'fame', d: 2 }] },
      { label: '"זה כסף של משלמי המסים"', ops: [{ op: 'stance', lean: { econ: 50 }, d: 1 }] },
    ],
  },
  // ---------- חברה ----------
  {
    id: 'cannabis_shops', icon: '🌿', weight: 1.2, cooldown: 80,
    title: 'אחרי אי-ההפללה: "דוכני" קנאביס בתל אביב',
    body: 'עסקים אפורים צצים ליד כל חוף. המשטרה טוענת שאין לה כלים, וההורים מודאגים מבני נוער.',
    when: law('cannabis', 20),
    ctx: () => ({ law: 'cannabis' }),
    choices: [
      { label: 'להציע הסדרה ומיסוי', ops: [{ op: 'reputation', d: 1.5 }, { op: 'world', key: 'economy', d: 0.5, weeks: 8 }] },
      { label: 'לדרוש אכיפה ליד בתי ספר', ops: [{ op: 'stance', lean: { religion: 30 }, d: 1 }, { op: 'approval', sector: 'traditional', d: 1 }] },
    ],
  },
  {
    id: 'metro_digging', icon: '🚇', weight: 1.2, cooldown: 80,
    title: 'המטרו: גוש דן חפור',
    body: 'עבודות המטרו סגרו צירים מרכזיים. הפקקים נוראיים, הסוחרים קורסים – והתחנה הראשונה רק בעוד שש שנים.',
    when: law('metro', 30),
    ctx: () => ({ law: 'metro' }),
    choices: [
      { label: 'לסייר בשטח ולהבטיח פיצויים לסוחרים', ops: [{ op: 'fame', d: 1.5 }, { op: 'approval', sector: 'secular', d: 1 }] },
      { label: '"זה העתיד – צריך סבלנות"', dyn: credit },
    ],
  },
];

/** הפוך מגמה של חוק: מי שמתנגד/ת לו */
function invert(lean: Record<string, number | undefined>) {
  return Object.fromEntries(Object.entries(lean).map(([k, v]) => [k, -(v ?? 0)]));
}

registerSpecial('ll_reviewed', (s, ctx) => {
  if (ctx.law) s.flags[`rev_${ctx.law}`] = s.week;
});
registerSpecial('ll_repeal', (s, ctx) => {
  if (!ctx.law) return;
  repealAndReact(s, ctx.law, s.player.name);
  return `"${templateById(ctx.law).title}" בוטל`;
});
registerSpecial('ll_partner_up', (s, ctx) => {
  if (ctx.party && s.coalition.parties.includes(ctx.party)) changeSatisfaction(s, ctx.party, 10);
  recomputeStability(s);
});
registerSpecial('ll_partner_down', (s, ctx) => {
  if (ctx.party && s.coalition.parties.includes(ctx.party)) changeSatisfaction(s, ctx.party, -10);
  recomputeStability(s);
});

