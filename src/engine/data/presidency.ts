// אירועי בית הנשיא. נכנסים לתור רק כשהשחקן/ית הוא/היא נשיא/ה (tickPresidency ב-systems/presidency.ts).
// אפקטים: punity = אחדות העם, ptrust = אמון הציבור בנשיא/ה.
import type { GameEvent } from './events';

export const PRES_EVENTS: GameEvent[] = [
  {
    id: 'pres_welcome', queued: true, icon: '🏛️',
    title: 'בית הנשיא: היום הראשון',
    body: 'עברת לבית הנשיא. שבע שנים לפניך, בלי מפלגה ובלי קואליציה. כוחך הוא הסמכות המוסרית: לאחד, לגשר, ולהשאיר את המדינה במצב טוב יותר. בכל שבוע תבחר/י איך להשקיע את הזמן. מה תהיה המטרה העליונה של הכהונה?',
    choices: [
      { label: 'איחוד העם', hint: 'אחדות +5', ops: [{ op: 'special', id: 'pres_focus_unity', label: 'מטרת הכהונה' }] },
      { label: 'שלטון החוק והמוסדות', hint: 'אמון בך +5, אמון במוסדות', ops: [{ op: 'special', id: 'pres_focus_law', label: 'מטרת הכהונה' }] },
      { label: 'ביטחון ושלום', hint: 'ביטחון משתפר לאורך זמן', ops: [{ op: 'special', id: 'pres_focus_peace', label: 'מטרת הכהונה' }] },
      { label: 'עתיד ונוער', hint: 'כלכלה לאורך זמן', ops: [{ op: 'special', id: 'pres_focus_youth', label: 'מטרת הכהונה' }] },
    ],
  },
  {
    id: 'pres_independence', queued: true, icon: '🇮🇱',
    title: 'נאום יום העצמאות',
    body: 'מול המצלמות, בטקס הדלקת המשואות, אתה/את נושא/ת את נאום הנשיא/ה. על מה תדבר/י?',
    choices: [
      { label: 'כולנו יחד: נאום מאחד', hint: 'אחדות +4', ops: [{ op: 'punity', d: 4 }, { op: 'ptrust', d: 1 }, { op: 'fame', d: 2 }, { op: 'world', key: 'cohesion', d: 1.5, weeks: 8 }] },
      { label: 'חוסן וביטחון', hint: 'אהוד בקרב מסורתיים ודתיים, פחות אצל ערבים', ops: [{ op: 'punity', d: 1.5 }, { op: 'approval', sector: 'traditional', d: 3 }, { op: 'approval', sector: 'religious', d: 3 }, { op: 'approval', sector: 'arab', d: -2 }, { op: 'world', key: 'security', d: 1, weeks: 10 }] },
      { label: 'אזהרה על מצב הדמוקרטיה', hint: 'מקטב: מוערך בחילוניים, מרגיז בחרדים', ops: [{ op: 'punity', d: -2 }, { op: 'ptrust', d: 2 }, { op: 'approval', sector: 'secular', d: 3 }, { op: 'approval', sector: 'haredi', d: -3 }, { op: 'special', id: 'pres_deed_stand', label: 'עמדה עקרונית' }] },
    ],
  },
  {
    id: 'pres_newyear', queued: true, icon: '🍎',
    title: 'ערב ראש השנה בבית הנשיא',
    body: 'המסורת: הנשיא/ה מארח/ת נציגי מחנות לברכה לשנה החדשה. אפשר להפוך אותה לשולחן אחד גדול או לקיים ברכה מינימלית.',
    choices: [
      { label: 'לארח את כל המחנות לשולחן אחד', hint: '10 אלף ₪, אחדות +4', ops: [{ op: 'money', d: -10 }, { op: 'punity', d: 4 }, { op: 'ptrust', d: 1.5 }, { op: 'special', id: 'pres_calm_mood', label: 'קיטוב יורד' }] },
      { label: 'ברכה מתוקשרת בווידאו', ops: [{ op: 'punity', d: 1.5 }, { op: 'fame', d: 1 }] },
      { label: 'להסתפק בחגיגה משפחתית', ops: [{ op: 'ptrust', d: -0.5 }] },
    ],
  },
  {
    id: 'pres_pardon_officer', icon: '🕊️', weight: 2, cooldown: 60,
    title: 'בקשת חנינה: קצין שהורשע',
    body: 'קצין צבא הורשע בהריגה אחרי אירוע מבצעי. הימין דורש חנינה, השמאל מזהיר מ"הפקרת הנורמות". הרשעה, ערעורים וחרטה – הכול בתיק שעל השולחן.',
    when: (s) => !!s.presidency,
    choices: [
      { label: 'לחנון', ops: [{ op: 'special', id: 'pres_pardon_yes', label: 'חנינה' }, { op: 'punity', d: -2 }, { op: 'approval', sector: 'traditional', d: 3 }, { op: 'approval', sector: 'religious', d: 3 }, { op: 'approval', sector: 'secular', d: -2 }, { op: 'ptrust', d: -0.5 }] },
      { label: 'לדחות', ops: [{ op: 'special', id: 'pres_pardon_no', label: 'דחייה' }, { op: 'punity', d: 1 }, { op: 'ptrust', d: 1 }, { op: 'approval', sector: 'secular', d: 2 }, { op: 'approval', sector: 'religious', d: -2 }] },
      { label: 'להפחית עונש בלבד', hint: 'פשרה', ops: [{ op: 'special', id: 'pres_pardon_yes', label: 'הקלה' }, { op: 'punity', d: 1.5 }, { op: 'ptrust', d: 0.5 }] },
    ],
  },
  {
    id: 'pres_pardon_activist', icon: '🕊️', weight: 2, cooldown: 60,
    title: 'בקשת חנינה: פעיל מחאה',
    body: 'פעיל חברתי נידון למאסר אחרי הפגנה שהידרדרה. תומכיו מדברים על "עונש מחפיר"; המשטרה מזהירה מאנרכיה.',
    when: (s) => !!s.presidency,
    choices: [
      { label: 'לחנון', ops: [{ op: 'special', id: 'pres_pardon_yes', label: 'חנינה' }, { op: 'punity', d: -1.5 }, { op: 'approval', sector: 'secular', d: 3 }, { op: 'approval', sector: 'traditional', d: -2 }] },
      { label: 'לדחות', ops: [{ op: 'special', id: 'pres_pardon_no', label: 'דחייה' }, { op: 'punity', d: 1 }, { op: 'ptrust', d: 0.5 }, { op: 'approval', sector: 'traditional', d: 2 }, { op: 'approval', sector: 'secular', d: -2 }] },
      { label: 'לשוחח איתו ולהחליט אחר כך', hint: 'מרוויח זמן', ops: [{ op: 'punity', d: 1 }, { op: 'ptrust', d: 0.5 }] },
    ],
  },
  {
    id: 'pres_pardon_tycoon', icon: '🕊️', weight: 1.5, cooldown: 80,
    title: 'בקשת חנינה: איש עסקים מורשע',
    body: 'איש עסקים מפורסם הורשע בעבירות מס ושוחד. עורכי דינו מדברים על "מחיר כבד מדי", והציבור מדבר על "חוק אחד לכולם".',
    when: (s) => !!s.presidency,
    choices: [
      { label: 'לחנון', hint: 'פגיעה קשה באמון', ops: [{ op: 'special', id: 'pres_pardon_yes', label: 'חנינה' }, { op: 'ptrust', d: -5 }, { op: 'punity', d: -3 }, { op: 'world', key: 'trust', d: -2, weeks: 10 }] },
      { label: 'לדחות', ops: [{ op: 'special', id: 'pres_pardon_no', label: 'דחייה' }, { op: 'ptrust', d: 2 }, { op: 'punity', d: 1 }, { op: 'world', key: 'trust', d: 1, weeks: 8 }] },
    ],
  },
  {
    id: 'pres_terror', icon: '🕯️', weight: 2.5, cooldown: 40,
    title: 'פיגוע קשה: המדינה בהלם',
    body: 'פיגוע רב נפגעים הרעיד את המדינה. הציבור מחכה לשמוע ממך. אחדות או כעס?',
    when: (s) => s.world.security < 70,
    choices: [
      { label: 'לבקר את המשפחות ולהשתתף בלוויות', hint: 'אחדות +3, אמון בך +3', ops: [{ op: 'special', id: 'pres_deed_comfort', label: 'ניחום' }, { op: 'punity', d: 3 }, { op: 'ptrust', d: 3 }, { op: 'fame', d: 1.5 }] },
      { label: 'לקרוא ליום אבל לאומי ולהימנע מפוליטיקה', hint: 'אחדות +4', ops: [{ op: 'punity', d: 4 }, { op: 'ptrust', d: 1.5 }, { op: 'world', key: 'cohesion', d: 1.5, weeks: 6 }] },
      { label: 'לדרוש מהממשלה תגובה קשה', hint: 'מסית: הימין אוהד, אחדות יורדת', ops: [{ op: 'punity', d: -2 }, { op: 'approval', sector: 'traditional', d: 3 }, { op: 'approval', sector: 'religious', d: 2 }, { op: 'approval', sector: 'arab', d: -3 }, { op: 'world', key: 'security', d: 1, weeks: 8 }] },
    ],
  },
  {
    id: 'pres_riot', icon: '🔥', weight: 2, cooldown: 50,
    title: 'מהומות בעיר מעורבת',
    body: 'עימותים בין קבוצות פרצו בעיר מעורבת. שרפו רכבים, נפצעו שוטרים, וברשתות קוראים לנקמה.',
    choices: [
      {
        label: 'לנסוע לשטח ולקרוא לשקט', hint: 'הצלחה תלויה באמון בך',
        chance: { p: (s) => 0.35 + (s.presidency?.trust ?? 50) / 160, failText: 'הקריאה נבלעה בצעקות. התקשורת מדווחת על ביקור "בלי תוצאות".', fail: [{ op: 'ptrust', d: -2 }, { op: 'punity', d: -1 }] },
        ops: [{ op: 'punity', d: 4.5 }, { op: 'ptrust', d: 3 }, { op: 'world', key: 'cohesion', d: 2, weeks: 8 }, { op: 'special', id: 'pres_deed_comfort', label: 'הרגעת הרוחות' }],
      },
      { label: 'להזמין את מנהיגי הקהילות לבית הנשיא', ops: [{ op: 'punity', d: 3 }, { op: 'ptrust', d: 1.5 }, { op: 'special', id: 'pres_calm_mood', label: 'קיטוב יורד' }] },
      { label: 'הצהרה בכתב', ops: [{ op: 'punity', d: 0.5 }] },
    ],
  },
  {
    id: 'pres_coalition_crisis', icon: '⚖️', weight: 2, cooldown: 40,
    title: 'המשבר בקואליציה',
    body: 'הקואליציה על סף פירוק וראש הממשלה פונה אליך בהצעה "לנסות לגשר". האופוזיציה מזהירה מהתערבות פוליטית.',
    when: (s) => s.coalition.stability < 58,
    choices: [
      { label: 'לתווך בין הצדדים', hint: 'יציבות +6, אבל תיתפס כמתערב/ת', ops: [{ op: 'stability', d: 6 }, { op: 'punity', d: 2 }, { op: 'ptrust', d: -1 }, { op: 'special', id: 'pres_deed_mediate', label: 'תיווך' }] },
      { label: 'להישאר מחוץ לזה', hint: 'שומר על המעמד', ops: [{ op: 'ptrust', d: 1.5 }, { op: 'stability', d: -2 }] },
      { label: 'לקרוא לממשלת אחדות', hint: 'מרגיז את המחנות, מאחד את הציבור', ops: [{ op: 'punity', d: 3 }, { op: 'ptrust', d: -1.5 }, { op: 'stability', d: 3 }] },
    ],
  },
  {
    id: 'pres_pm_call', icon: '📞', weight: 1.5, cooldown: 50,
    title: 'ראש הממשלה מבקש תמיכה',
    body: 'ראש הממשלה מבקש שתצא/י בהצהרה פומבית לטובת תוכנית שנויה במחלוקת "למען האומה".',
    choices: [
      { label: 'לתמוך בפומבי', hint: 'יציבות +5, אחדות -3', ops: [{ op: 'stability', d: 5 }, { op: 'punity', d: -3 }, { op: 'ptrust', d: -2 }, { op: 'att', who: '@pm', d: 8 }] },
      { label: 'לסרב בנימוס', hint: 'האמון עולה, ראש הממשלה נעלב', ops: [{ op: 'ptrust', d: 2 }, { op: 'att', who: '@pm', d: -6 }] },
      { label: 'לייעץ בשיחה פרטית', ops: [{ op: 'att', who: '@pm', d: 5 }, { op: 'punity', d: 0.5 }] },
    ],
  },
  {
    id: 'pres_incitement', icon: '📱', weight: 2.5, cooldown: 35,
    title: 'גל הסתה ברשתות',
    body: 'שיח ברשתות הפך אלים: איומים על ח"כים, דמוניזציה של עיתונאים וקריאות לנקמה. האם להיכנס לעובי הקורה?',
    when: (s) => Object.values(s.mood).reduce((a, b) => a + Math.abs(b), 0) / 4 > 6,
    choices: [
      { label: 'לגנות את כל הצדדים', hint: 'אחדות +3', ops: [{ op: 'punity', d: 3 }, { op: 'ptrust', d: 1.5 }, { op: 'special', id: 'pres_calm_mood', label: 'קיטוב יורד' }] },
      { label: 'לקרוא ל"שבוע של שיחה"', hint: '8 אלף ₪', ops: [{ op: 'money', d: -8 }, { op: 'punity', d: 2.5 }, { op: 'world', key: 'cohesion', d: 2, weeks: 8 }] },
      { label: 'להתעלם', ops: [{ op: 'punity', d: -1 }] },
    ],
  },
  {
    id: 'pres_disaster', icon: '🌊', weight: 1.5, cooldown: 60,
    title: 'אסון טבע: שריפות ושיטפונות',
    body: 'שריפות ענק פרצו בצפון ושיטפונות בדרום. אלפים פונו מבתיהם. הציבור מתגייס, והשאלה איפה אתה/את.',
    choices: [
      { label: 'לעבור בין המפונים וההתנדבות', hint: 'אחדות +4, אמון בך +3', ops: [{ op: 'punity', d: 4 }, { op: 'ptrust', d: 3 }, { op: 'fame', d: 2 }, { op: 'world', key: 'cohesion', d: 2, weeks: 8 }] },
      { label: 'לארגן קרן חירום עם המגזר העסקי', hint: '12 אלף ₪', ops: [{ op: 'money', d: -12 }, { op: 'punity', d: 2.5 }, { op: 'world', key: 'economy', d: 1.5, weeks: 10 }, { op: 'ptrust', d: 2 }] },
      { label: 'לעקוב מרחוק', ops: [{ op: 'ptrust', d: -1.5 }] },
    ],
  },
  {
    id: 'pres_youth', icon: '🧑‍🎓', weight: 1.5, cooldown: 40,
    title: 'תנועות הנוער מבקשות לפגוש אותך',
    body: 'נציגי תנועות נוער מכל המגזרים הגיעו לפגישה ומבקשים שתשמיע קול של "הדור הבא".',
    choices: [
      { label: 'לארח אותם במושב הנשיא', ops: [{ op: 'punity', d: 3 }, { op: 'ptrust', d: 1.5 }, { op: 'fame', d: 1 }] },
      { label: 'לצאת איתם לטיול משותף', hint: '5 אלף ₪', ops: [{ op: 'money', d: -5 }, { op: 'punity', d: 3.5 }, { op: 'world', key: 'cohesion', d: 1.2, weeks: 8 }] },
      { label: 'להחליף כמה מילים בקצרה', ops: [{ op: 'punity', d: 0.7 }] },
    ],
  },
  {
    id: 'pres_foreign', icon: '🤝', weight: 1.5, cooldown: 45,
    title: 'מנהיג זר מבקש לבקר',
    body: 'מנהיג של מעצמה מבקש להגיע לביקור מדיני. הממשלה מעוניינת שתארח/י אותו בכבוד, והאופוזיציה חוששת שזה "שירות לראש הממשלה".',
    choices: [
      { label: 'ארוחת ממלכתית מלאה', hint: '10 אלף ₪', ops: [{ op: 'money', d: -10 }, { op: 'world', key: 'security', d: 1.8, weeks: 10 }, { op: 'world', key: 'economy', d: 1.2, weeks: 10 }, { op: 'ptrust', d: 2 }] },
      { label: 'פגישה מצומצמת', ops: [{ op: 'world', key: 'security', d: 0.8, weeks: 8 }, { op: 'ptrust', d: 0.5 }] },
      { label: 'להעביר את האירוח לממשלה', ops: [{ op: 'punity', d: 0.5 }, { op: 'att', who: '@pm', d: 3 }] },
    ],
  },
  {
    id: 'pres_expenses', icon: '🧾', weight: 1, cooldown: 80,
    title: 'דיווח על הוצאות לשכת הנשיא',
    body: 'כתבה חושפת הוצאות גבוהות במשק הבית של הנשיא/ה. הלשכה מכחישה, והציבור רוצה תשובות.',
    choices: [
      { label: 'לפתוח את הספרים ולהחזיר כסף', hint: '15 אלף ₪', ops: [{ op: 'money', d: -15 }, { op: 'ptrust', d: 2 }, { op: 'special', id: 'pres_deed_stand', label: 'שקיפות' }] },
      { label: 'להכחיש בנחרצות', hint: 'מסוכן', chance: { p: (s) => 0.4 + (s.presidency?.trust ?? 50) / 250, failText: 'התברר שהכחשה לא החזיקה. הכותרות חדות.', fail: [{ op: 'ptrust', d: -6 }, { op: 'punity', d: -2 }] }, ops: [{ op: 'ptrust', d: 1 }] },
      { label: 'להאשים את התקשורת', ops: [{ op: 'ptrust', d: -2 }, { op: 'punity', d: -1.5 }] },
    ],
  },
  {
    id: 'pres_law_sign', icon: '✍️', weight: 1.5, cooldown: 45,
    title: 'חוק שנוי במחלוקת מונח לפניך',
    body: 'הכנסת העבירה חוק שדוחק את אחד המחנות. חותמים עליו רק אחרי בדיקה. האם להביע דעה?',
    choices: [
      { label: 'לחתום בשקט', ops: [{ op: 'ptrust', d: 0.5 }] },
      { label: 'לחתום ולהוסיף מכתב דאגה למחנה שנפגע', hint: 'אחדות +2', ops: [{ op: 'punity', d: 2 }, { op: 'ptrust', d: 1 }] },
      { label: 'להתייעץ עם יועצים משפטיים ולהתעכב', hint: 'אמון במוסדות', ops: [{ op: 'ptrust', d: 1.5 }, { op: 'punity', d: 0.5 }, { op: 'world', key: 'trust', d: 1, weeks: 6 }] },
    ],
  },
  {
    id: 'pres_protest', icon: '📢', weight: 1.5, cooldown: 40,
    title: 'מחאה גדולה בכיכר',
    body: 'עשרות אלפים מפגינים נגד הממשלה ובעד הממשלה, בכיכרות סמוכות. נציגי שני הצדדים מבקשים שתתערב.',
    when: (s) => s.coalition.stability < 75,
    choices: [
      { label: 'להזמין את מארגני שתי המחאות לשולחן אחד', hint: 'אחדות +3', ops: [{ op: 'punity', d: 3 }, { op: 'ptrust', d: 1.5 }, { op: 'special', id: 'pres_deed_mediate', label: 'תיווך' }] },
      { label: 'לשמור על שתיקה', ops: [{ op: 'ptrust', d: 0.5 }, { op: 'punity', d: -0.5 }] },
      { label: 'לקרוא לשקט ולמשמעת', ops: [{ op: 'punity', d: 1.5 }, { op: 'stability', d: 2 }] },
    ],
  },
];
