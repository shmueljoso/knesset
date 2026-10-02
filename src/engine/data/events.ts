// כרטיסי אירוע. כל אירוע: תנאי הופעה, הקשר (דמות/הצעת חוק), ובחירות עם אפקטים דקלרטיביים.
import { inSession } from '../calendar';
import type { Ctx, Op } from '../ops';
import { pick } from '../rng';
import { isCoalition } from '../systems/government';
import { debtsWith } from '../systems/relationships';
import { isHot } from '../systems/issues';
import type { GameState, Npc } from '../types';
import { BILL_TEMPLATES } from './bills';

export interface EventChoice {
  label: string;
  hint?: string;
  ops?: Op[];
  dyn?: (s: GameState, ctx: Ctx) => Op[];
  requires?: (s: GameState, ctx: Ctx) => string | null;
  chance?: { p: (s: GameState, ctx: Ctx) => number; fail: Op[]; failText: string };
  result?: string;
}

export interface GameEvent {
  id: string;
  title: string;
  body: string;
  icon: string;
  queued?: boolean; // מופיע רק כשמערכת אחרת מכניסה אותו לתור
  weight?: number;
  cooldown?: number;
  once?: boolean;
  when?: (s: GameState) => boolean;
  ctx?: (s: GameState) => Ctx | null;
  choices: EventChoice[];
}

const mks = (s: GameState, f: (n: Npc) => boolean = () => true) => Object.values(s.npcs).filter((n) => n.isMK && f(n));
const pickNpc = (s: GameState, list: Npc[]): Ctx | null => (list.length ? { npc: pick(s, list).id } : null);
const isMK = (s: GameState) => s.player.isMK;
const hasParty = (s: GameState) => !!s.player.partyId;

export const EVENTS: GameEvent[] = [
  // ---------- אירועים מערכתיים (תור) ----------
  {
    id: 'committee_session', queued: true, icon: '📋',
    title: 'דיון בוועדה: {bill}',
    body: 'יו"ר הוועדה קבע דיון על ההצעה. נציגי המשרדים, ארגונים ולוביסטים כבר יושבים סביב השולחן. איך תנהל את הדיון?',
    choices: [
      { label: 'להציג נתונים ומחקרים', hint: 'סיכוי לפי מיומנות משפט וחקיקה', ops: [{ op: 'special', id: 'cs_data', label: 'התקדמות אפשרית' }] },
      { label: 'להתפשר ולקבל הסתייגויות', hint: 'התקדמות בטוחה, השפעה קטנה יותר', ops: [{ op: 'special', id: 'cs_compromise', label: 'התקדמות +1, ריכוך ההצעה' }] },
      { label: 'להביא מפגינים ומצלמות', hint: 'סיכוי לפי תקשורת, היו"ר עלול להיעלב', ops: [{ op: 'special', id: 'cs_public', label: 'מוכרות +2, סיכון' }] },
      {
        label: 'לבקש מהיו"ר דיון מרתוני', hint: 'שני שלבים קדימה – תמורת חוב',
        requires: (s, ctx) => {
          const b = s.bills.find((x) => x.id === ctx.bill);
          const c = s.committees.find((x) => x.id === b?.committeeId);
          return c && (s.npcs[c.chairId]?.attitude ?? 0) >= 25 ? null : 'היו"ר לא מספיק מחבב אותך (נדרש יחס 25+)';
        },
        ops: [{ op: 'special', id: 'cs_fast', label: 'התקדמות +2, חוב ליו"ר' }],
      },
    ],
  },
  {
    id: 'debt_collect', queued: true, icon: '🧾',
    title: '{npc} גובה את החוב',
    body: '"זוכר שעזרתי לך? עכשיו אני צריך אותך. מחר יש לי הצבעה חשובה בסיעה ובמליאה, ואני מצפה שתתייצב לצדי – גם אם זה לא נוח לך."',
    choices: [
      {
        label: 'לעמוד במילה', hint: 'שומר על אמינות',
        dyn: (s, ctx) => [
          { op: 'clearDebt', who: '@ctx', dir: 'player_owes' },
          { op: 'att', who: '@ctx', d: 12 },
          { op: 'trust', who: '@ctx', d: 8 },
          { op: 'reputation', d: 2 },
          { op: 'stance', lean: s.npcs[ctx.npc]?.ideology ?? {}, d: 1.5 },
        ],
      },
      {
        label: 'להתחמק', hint: 'בפוליטיקה זוכרים',
        ops: [
          { op: 'att', who: '@ctx', d: -28 },
          { op: 'trust', who: '@ctx', d: -25 },
          { op: 'memory', who: '@ctx', text: 'לא החזיר/ה לי את החוב', d: -28 },
          { op: 'reputation', d: -5 },
          { op: 'clearDebt', who: '@ctx', dir: 'player_owes' },
        ],
      },
    ],
  },
  {
    id: 'primaries_open', queued: true, icon: '🗳️',
    title: 'נפתחה ההרשמה לרשימה של {party}',
    body: 'הבחירות מתקרבות. במפלגות עם פריימריז – מתפקדים קובעים את הרשימה; במפלגות אחרות – היו"ר או מוסדות המפלגה. האם להגיש מועמדות?',
    choices: [
      { label: 'להגיש מועמדות (10 אלף ₪ אגרה)', requires: (s) => (s.player.money >= 10 ? null : 'אין מספיק כסף'), ops: [{ op: 'money', d: -10 }, { op: 'special', id: 'wants_list', label: 'נכנס/ת למרוץ' }] },
      { label: 'לא הפעם', ops: [{ op: 'partyStanding', d: -2 }] },
    ],
  },
  {
    id: 'chair_offer', icon: '🪑', weight: 3, once: true,
    title: 'הצעה: ראשות ועדה',
    body: 'יו"ר הסיעה קורא/ת לך לשיחה: "יש רוטציה בוועדות. אני רוצה אותך בראש אחת הוועדות שאתה חבר בהן. אבל אני מצפה לנאמנות מלאה."',
    when: (s) => isMK(s) && isCoalition(s, s.player.partyId) && s.player.partyStanding >= 55 && s.player.reputation >= 50 && s.player.rank === 'mk' && s.player.committees.length > 0 && !s.player.defector,
    choices: [
      { label: 'לקבל בתודה', ops: [{ op: 'special', id: 'become_chair', label: 'יו"ר ועדה!' }, { op: 'att', who: '@leader', d: 10 }, { op: 'debt', who: '@leader', dir: 'player_owes', reason: 'מינוי לראשות ועדה' }] },
      { label: 'לסרב ולשמור על עצמאות', ops: [{ op: 'consistency', d: 4 }, { op: 'att', who: '@leader', d: -8 }] },
    ],
  },
  {
    id: 'freshman_speech', icon: '🎤', weight: 50, once: true,
    title: 'נאום הבכורה',
    body: 'ח"כים חדשים נושאים נאום בכורה. לפי המסורת לא מפריעים לך באמצע. על מה תדבר?',
    when: (s) => isMK(s) && s.week < 6,
    choices: [
      { label: 'יוקר המחיה והדיור', ops: [{ op: 'stance', lean: { econ: -30 }, d: 3 }, { op: 'fame', d: 3 }, { op: 'skill', skill: 'speech', d: 3 }] },
      { label: 'ביטחון ומשילות', ops: [{ op: 'stance', lean: { security: 60 }, d: 3 }, { op: 'fame', d: 3 }, { op: 'skill', skill: 'speech', d: 3 }] },
      { label: 'דת ומדינה', ops: [{ op: 'stance', lean: { religion: -50 }, d: 3 }, { op: 'fame', d: 3 }, { op: 'skill', skill: 'speech', d: 3 }] },
      { label: 'סיפור אישי ואחדות', ops: [{ op: 'approval', sector: 'all', d: 1.5 }, { op: 'fame', d: 2 }, { op: 'consistency', d: 3 }] },
    ],
  },
  // ---------- עוזר פרלמנטרי ----------
  {
    id: 'boss_speech', icon: '📝', weight: 6, cooldown: 8,
    title: '{employer} צריך נאום עד מחר',
    body: 'בשעה 23:00 מגיעה הודעה: "יש לי נאום במליאה מחר בבוקר. תכין משהו שיעשה רעש."',
    when: (s) => !!s.player.employerId,
    choices: [
      { label: 'לעבוד כל הלילה על נאום מבריק', ops: [{ op: 'att', who: '@employer', d: 12 }, { op: 'skill', skill: 'speech', d: 2 }, { op: 'ap', d: -1 }] },
      { label: 'לשלוף משהו מהמגירה', ops: [{ op: 'att', who: '@employer', d: 3 }] },
      { label: 'להכניס לנאום את העמדות שלך', ops: [{ op: 'att', who: '@employer', d: 5 }, { op: 'consistency', d: 3 }, { op: 'reputation', d: 1 }] },
    ],
  },
  {
    id: 'boss_scandal', icon: '🔥', weight: 3, cooldown: 30,
    title: 'תחקיר נגד {employer}',
    body: 'תחקיר טלוויזיוני טוען ש{employer} קידם/ה חוק שהיטיב עם מקורב. התקשורת מתקשרת אליך לתגובה.',
    when: (s) => !!s.player.employerId,
    choices: [
      { label: 'להגן על הבוס בכל הכוח', ops: [{ op: 'att', who: '@employer', d: 20 }, { op: 'fame', d: 2 }, { op: 'reputation', d: -3 }] },
      { label: '"אין לי תגובה"', ops: [{ op: 'att', who: '@employer', d: -3 }] },
      { label: 'להתרחק בשקט ולחפש עבודה אחרת', ops: [{ op: 'att', who: '@employer', d: -25 }, { op: 'reputation', d: 3 }] },
    ],
  },
  {
    id: 'aide_job_offer', icon: '💼', weight: 4, cooldown: 20,
    title: '{npc} מחפש/ת עוזר/ת פרלמנטרי/ת',
    body: 'ח"כ {npc} מ{npcParty} שמע/ה עליך ומציע/ה לך משרה בלשכה. משכורת צנועה, קשרים יקרי ערך.',
    when: (s) => !s.player.isMK && !s.player.employerId && hasParty(s),
    ctx: (s) => pickNpc(s, mks(s, (n) => n.partyId === s.player.partyId && n.attitude > -10)),
    choices: [
      { label: 'לקבל את המשרה', ops: [{ op: 'special', id: 'take_aide_job', label: 'הופך/ת לעוזר/ת פרלמנטרי/ת' }, { op: 'att', who: '@ctx', d: 15 }] },
      { label: 'לסרב בנימוס', ops: [{ op: 'att', who: '@ctx', d: -3 }] },
    ],
  },
  // ---------- פוליטיקה ותקשורת ----------
  {
    id: 'old_post', icon: '📱', weight: 3, cooldown: 25,
    title: 'פוסט ישן שלך צף ברשת',
    body: 'מישהו חפר ומצא פוסט שכתבת לפני 8 שנים. הוא מביך, ובעיקר סותר את מה שאתה אומר היום. הרשת רועשת.',
    when: (s) => s.player.fame >= 12,
    choices: [
      { label: 'להתנצל בכנות', ops: [{ op: 'approval', sector: 'all', d: -1 }, { op: 'reputation', d: 2 }, { op: 'consistency', d: 2 }] },
      { label: 'לטעון שהוצא מהקשר', chance: { p: (s) => 0.35 + s.player.skills.media / 150, fail: [{ op: 'approval', sector: 'all', d: -3 }, { op: 'fame', d: 2 }], failText: 'זה לא עבד – הסערה התעצמה.' }, ops: [{ op: 'fame', d: 1 }], result: 'הסיפור דעך.' },
      { label: 'להתעלם', chance: { p: () => 0.5, fail: [{ op: 'approval', sector: 'all', d: -2.5 }, { op: 'consistency', d: -3 }], failText: 'השתיקה נתפסה כהודאה.' }, result: 'הסערה עברה מעצמה.' },
    ],
  },
  {
    id: 'journalist_scoop', icon: '🕵️', weight: 4, cooldown: 12,
    title: 'הצעה מכתב/ת פוליטי/ת',
    body: '{npc} פונה אליך: "שמעתי שבסיעה שלכם יש מאבקי כוח. תן לי משהו – ואני אדאג לך לכותרות טובות."',
    when: (s) => hasParty(s),
    ctx: (s) => pickNpc(s, Object.values(s.npcs).filter((n) => n.role === 'journalist')),
    choices: [
      { label: 'להדליף', hint: 'בסיעה עלולים לגלות', ops: [{ op: 'fame', d: 3 }, { op: 'att', who: '@ctx', d: 15 }, { op: 'partyStanding', d: -7 }, { op: 'att', who: '@leader', d: -8 }] },
      { label: 'לתת מידע כללי בלבד', ops: [{ op: 'att', who: '@ctx', d: 5 }] },
      { label: 'לסרב', ops: [{ op: 'att', who: '@ctx', d: -6 }, { op: 'reputation', d: 2 }] },
    ],
  },
  {
    id: 'lobbyist_offer', icon: '💼', weight: 3, cooldown: 20,
    title: 'ארוחת ערב עם {npc}',
    body: '"נשמח לתרום לקמפיין הבא שלך. בתמורה – רק נבקש שתקשיב לנו כשהחקיקה תגיע לוועדה." זה חוקי. בערך.',
    when: (s) => hasParty(s),
    ctx: (s) => pickNpc(s, Object.values(s.npcs).filter((n) => n.role === 'lobbyist')),
    choices: [
      { label: 'לקבל תרומה (80 אלף ₪)', ops: [{ op: 'money', d: 80 }, { op: 'debt', who: '@ctx', dir: 'player_owes', reason: 'תרומה לקמפיין' }, { op: 'special', id: 'lobby_money' }] },
      { label: 'לסרב בנימוס', ops: [{ op: 'reputation', d: 2 }, { op: 'att', who: '@ctx', d: -5 }] },
    ],
  },
  {
    id: 'mk_insult', icon: '🐦', weight: 5, cooldown: 6,
    title: '{npc} תקף/ה אותך ברשת',
    body: 'ח"כ {npc} מ{npcParty} כתב/ה עליך ציוץ ארסי שצובר אלפי שיתופים. כולם מחכים לתגובה שלך.',
    when: (s) => s.player.fame >= 15,
    ctx: (s) => pickNpc(s, mks(s, (n) => n.partyId !== s.player.partyId && n.attitude < 15)),
    choices: [
      { label: 'להחזיר מכה', ops: [{ op: 'fame', d: 3 }, { op: 'att', who: '@ctx', d: -18 }, { op: 'att', who: '@friends:ctx', d: -4 }, { op: 'consistency', d: 1 }] },
      { label: 'להתעלות מעל', ops: [{ op: 'reputation', d: 2 }, { op: 'approval', sector: 'all', d: 0.5 }] },
      { label: 'להתקשר אליו/ה בשקט', requires: (s) => (s.player.ap >= 1 ? null : 'אין זמן'), ops: [{ op: 'ap', d: -1 }, { op: 'att', who: '@ctx', d: 14 }, { op: 'reveal', who: '@ctx' }] },
    ],
  },
  {
    id: 'friend_support', icon: '🙏', weight: 4, cooldown: 10,
    title: '{npc} מבקש/ת תמיכה',
    body: '{npc} מתמודד/ת על תפקיד בכיר בסיעה ומבקש/ת שתתמוך בפומבי. היריב/ה בתוך הסיעה לא ישכח/תשכח.',
    when: (s) => hasParty(s),
    ctx: (s) => pickNpc(s, mks(s, (n) => n.partyId === s.player.partyId && n.attitude > 0)),
    choices: [
      { label: 'לתמוך בפומבי', ops: [{ op: 'att', who: '@ctx', d: 15, public: true }, { op: 'debt', who: '@ctx', dir: 'owes_player', reason: 'תמיכה בהתמודדות פנימית' }, { op: 'partyStanding', d: -2 }] },
      { label: 'להישאר ניטרלי', ops: [{ op: 'att', who: '@ctx', d: -8 }] },
    ],
  },
  {
    id: 'party_line_vote', icon: '✋', weight: 5, cooldown: 5,
    title: 'משמעת סיעתית',
    body: 'הסיעה מחייבת את כל חבריה להצביע הערב בעד חוק שנוי במחלוקת שהוא חלק מהסכם קואליציוני. הוא סותר את מה שהבטחת לבוחרים.',
    when: (s) => isMK(s) && hasParty(s) && inSession(s),
    choices: [
      { label: 'להצביע עם הסיעה', ops: [{ op: 'partyStanding', d: 4 }, { op: 'consistency', d: -3 }, { op: 'att', who: '@leader', d: 4 }] },
      { label: 'למרוד ולהצביע נגד', ops: [{ op: 'partyStanding', d: -10 }, { op: 'att', who: '@leader', d: -15 }, { op: 'fame', d: 3 }, { op: 'consistency', d: 4 }, { op: 'approval', sector: 'all', d: 1 }, { op: 'stability', d: -3 }] },
      { label: 'להיעדר מההצבעה', ops: [{ op: 'partyStanding', d: -2 }] },
    ],
  },
  {
    id: 'tv_panel', icon: '📺', weight: 4, cooldown: 8,
    title: 'הזמנה לפאנל בפריים טיים',
    body: 'מגישה מוכרת מזמינה אותך לפאנל המרכזי מול יריב מוכשר. זו במה ענקית – וגם מלכודת.',
    when: (s) => s.player.fame >= 10,
    choices: [
      { label: 'לבוא מוכן ותוקף', chance: { p: (s) => 0.35 + s.player.skills.media / 120, fail: [{ op: 'approval', sector: 'all', d: -2.5 }, { op: 'fame', d: 2 }], failText: 'נכשלת במשפט אחד מביך שהפך למם.' }, ops: [{ op: 'fame', d: 5 }, { op: 'approval', sector: 'all', d: 1.5 }, { op: 'skill', skill: 'media', d: 2 }], result: 'הופעה חזקה! הקליפים רצים ברשת.' },
      { label: 'לסרב', ops: [] },
    ],
  },
  {
    id: 'viral_clip', icon: '🔁', weight: 2, cooldown: 20,
    title: 'רגע ויראלי',
    body: 'קטע של 30 שניות שלך הפך ויראלי – מיליון צפיות ביממה. השאלה מה תעשה עם תשומת הלב.',
    when: (s) => s.player.fame >= 18,
    choices: [
      { label: 'לרכוב על הגל בראיונות', ops: [{ op: 'fame', d: 6 }, { op: 'reputation', d: -1 }] },
      { label: 'לנצל לגיוס כספים', ops: [{ op: 'fame', d: 3 }, { op: 'money', d: 40 }] },
    ],
  },
  {
    id: 'family', icon: '🏡', weight: 3, cooldown: 15,
    title: 'יום הולדת במשפחה',
    body: 'יום הולדת לילד/ה הערב – ובכנסת יש ישיבת לילה עם הצבעות. הקואליציה צריכה כל אצבע.',
    when: (s) => isMK(s) && inSession(s),
    choices: [
      { label: 'להישאר בכנסת', ops: [{ op: 'partyStanding', d: 2 }, { op: 'stability', d: 1 }] },
      { label: 'ללכת הביתה', ops: [{ op: 'partyStanding', d: -2 }, { op: 'special', id: 'rested', label: 'זמן +1 בשבוע הבא' }] },
    ],
  },
  {
    id: 'staff_leak', icon: '🤐', weight: 4, cooldown: 20,
    title: 'הדלפה מהלשכה',
    body: 'מסמך פנימי מהלשכה שלך הגיע לעיתונות. הכל מצביע על אחד מאנשי הצוות.',
    when: (s) => s.player.staff.some((x) => x.loyalty < 45),
    choices: [
      { label: 'לפטר את החשוד/ה', ops: [{ op: 'special', id: 'fire_disloyal' }, { op: 'reputation', d: 1 }] },
      { label: 'שיחה אישית ומחילה', ops: [{ op: 'special', id: 'forgive_staff' }, { op: 'fame', d: -1 }] },
    ],
  },
  {
    id: 'coalition_entice', icon: '🎁', weight: 3, cooldown: 30,
    title: 'פיתוי מהקואליציה',
    body: 'שליח של ראש הממשלה מציע: "תצביע איתנו בהצבעה הקרובה, ונדאג לתקציב לנושא שלך ולתפקיד בעתיד."',
    when: (s) => isMK(s) && !isCoalition(s, s.player.partyId) && s.player.fame >= 15,
    choices: [
      { label: 'לקבל', ops: [{ op: 'capital', d: 8 }, { op: 'partyStanding', d: -12 }, { op: 'consistency', d: -8 }, { op: 'att', who: '@leader', d: -20 }, { op: 'att', who: '@pm', d: 15 }, { op: 'stability', d: 4 }] },
      { label: 'לדחות ולספר לתקשורת', ops: [{ op: 'partyStanding', d: 5 }, { op: 'fame', d: 2 }, { op: 'att', who: '@pm', d: -12 }] },
      { label: 'לדחות בשקט', ops: [{ op: 'reputation', d: 1 }] },
    ],
  },
  {
    id: 'investigation', icon: '🚨', weight: 5, cooldown: 40,
    title: 'פתיחת בדיקה',
    body: 'מבקר המדינה ויחידה חוקרת בודקים את התרומות שקיבלת מגורמים עסקיים. הכותרות לא מחמיאות.',
    when: () => false, // הוחלף בשרשרת החקירה (systems/scandals)
    choices: [
      { label: 'לשתף פעולה ולהחזיר את הכסף', ops: [{ op: 'money', d: -80 }, { op: 'reputation', d: -4 }, { op: 'approval', sector: 'all', d: -1 }, { op: 'flag', key: 'lobbyMoney', v: false }] },
      { label: 'לתקוף את "רדיפת הנבחרים"', chance: { p: () => 0.45, fail: [{ op: 'approval', sector: 'all', d: -5 }, { op: 'reputation', d: -10 }], failText: 'התיק התפוצץ בתקשורת.' }, ops: [{ op: 'fame', d: 3 }, { op: 'flag', key: 'lobbyMoney', v: false }], result: 'הבדיקה נסגרה מחוסר ראיות.' },
    ],
  },
  // ---------- אירועי מדינה ----------
  {
    id: 'security_escalation', icon: '🚀', weight: 4, cooldown: 12,
    title: 'הסלמה ביטחונית בגבול',
    body: 'ירי רקטות על יישובי הגבול. הממשלה מתלבטת בין מבצע לבין הכלה. האולפנים מחכים לך.',
    when: (s) => s.issues.security >= 50,
    choices: [
      { label: 'לדרוש תגובה צבאית חריפה', ops: [{ op: 'stance', lean: { security: 85 }, d: 3 }, { op: 'fame', d: 2 }, { op: 'world', key: 'security', d: -2, weeks: 2 }] },
      { label: 'להתייצב מאחורי הממשלה', ops: [{ op: 'stance', lean: { security: 40 }, d: 1.5 }, { op: 'att', who: '@pm', d: 6 }, { op: 'stability', d: 3 }] },
      { label: 'לקרוא לריסון ולמדיניות', ops: [{ op: 'stance', lean: { security: -60 }, d: 3 }, { op: 'fame', d: 2 }] },
    ],
  },
  {
    id: 'housing_protest', icon: '⛺', weight: 4, cooldown: 20,
    title: 'מחאת הדיור חוזרת',
    body: 'מאות אוהלים בשדרה בתל אביב. "העם דורש צדק חברתי" חוזר לכותרות. המוחים מזמינים פוליטיקאים לנאום – אבל לא את כולם מקבלים בברכה.',
    when: (s) => isHot(s, 'housing', 55) || isHot(s, 'cost', 65),
    choices: [
      { label: 'לנאום בהפגנה', ops: [{ op: 'stance', lean: { econ: -50 }, d: 3.5 }, { op: 'fame', d: 4 }, { op: 'att', who: '@pm', d: -6 }, { op: 'stability', d: -2 }] },
      { label: 'להציע פתרונות שוק', ops: [{ op: 'stance', lean: { econ: 50 }, d: 2.5 }, { op: 'fame', d: 2 }] },
      { label: 'להתרחק', ops: [] },
    ],
  },
  {
    id: 'general_strike', icon: '🪧', weight: 3, cooldown: 25,
    title: 'ההסתדרות מכריזה על שביתה כללית',
    body: 'נמלי הים, נתב"ג והרשויות המקומיות מושבתים. הצדדים מחפשים מתווכים – ומחפשים אשמים.',
    when: (s) => isHot(s, 'wages', 45),
    choices: [
      { label: 'לתמוך בעובדים', ops: [{ op: 'stance', lean: { econ: -60 }, d: 3 }, { op: 'fame', d: 2 }] },
      { label: 'לתקוף את ההסתדרות', ops: [{ op: 'stance', lean: { econ: 60 }, d: 3 }, { op: 'fame', d: 2 }] },
      {
        label: 'להציע תיווך', hint: 'דורש משא ומתן 45+',
        requires: (s) => (s.player.skills.negotiation >= 45 ? null : 'משא ומתן נמוך מדי'),
        chance: { p: (s) => 0.3 + s.player.skills.negotiation / 150, fail: [{ op: 'reputation', d: -2 }], failText: 'התיווך קרס והצדדים האשימו גם אותך.' },
        ops: [{ op: 'reputation', d: 6 }, { op: 'fame', d: 4 }, { op: 'world', key: 'economy', d: 1.5, weeks: 4 }, { op: 'skill', skill: 'negotiation', d: 2 }],
        result: 'הגעתם להסכם! "המתווך/ת" בכל מהדורה.',
      },
    ],
  },
  {
    id: 'court_ruling', icon: '⚖️', weight: 3, cooldown: 20,
    when: (s) => s.issues.judiciary >= 40,
    title: 'בג"ץ פסל חוק של הכנסת',
    body: 'בית המשפט העליון פסל סעיף בחוק שהכנסת חוקקה בשנה שעברה. הקואליציה זועמת, האופוזיציה חוגגת.',
    choices: [
      { label: 'לתקוף את "האקטיביזם השיפוטי"', ops: [{ op: 'stance', lean: { judiciary: 80 }, d: 3 }, { op: 'fame', d: 2 }, { op: 'world', key: 'trust', d: -1 }] },
      { label: 'להגן על בית המשפט', ops: [{ op: 'stance', lean: { judiciary: -80 }, d: 3 }, { op: 'fame', d: 2 }] },
      { label: 'לקרוא להסדרה בהסכמה רחבה', ops: [{ op: 'reputation', d: 2 }, { op: 'consistency', d: 1 }] },
    ],
  },
  {
    id: 'draft_protest', icon: '🪖', weight: 3, cooldown: 25,
    when: (s) => isHot(s, 'draft', 45),
    title: 'הפגנת ענק נגד גיוס',
    body: 'מאות אלפים חוסמים את כניסת העיר. הקואליציה תלויה במפלגות החרדיות, והמילואימניקים זועמים.',
    choices: [
      { label: '"שוויון בנטל – עכשיו"', ops: [{ op: 'stance', lean: { religion: -60, security: 30 }, d: 3 }, { op: 'fame', d: 2 }] },
      { label: '"לימוד תורה הוא שליחות"', ops: [{ op: 'stance', lean: { religion: 80 }, d: 3 }, { op: 'fame', d: 2 }] },
      { label: 'לקרוא להידברות', ops: [{ op: 'world', key: 'cohesion', d: 0.5 }, { op: 'reputation', d: 1 }] },
    ],
  },
  {
    id: 'inflation', icon: '📈', weight: 3, cooldown: 16,
    title: 'הלמ"ס: מדד המחירים זינק',
    body: 'האינפלציה קפצה, המשכנתאות מתייקרות, והרשתות מעלות מחירים. כולם מחפשים אשם.',
    when: (s) => isHot(s, 'cost', 50),
    choices: [
      { label: 'להאשים את הממשלה', requires: (s) => (isCoalition(s, s.player.partyId) ? 'אתה בקואליציה' : null), ops: [{ op: 'fame', d: 2 }, { op: 'approval', sector: 'all', d: 1 }, { op: 'att', who: '@pm', d: -5 }] },
      { label: 'לתקוף את הטייקונים והרשתות', ops: [{ op: 'stance', lean: { econ: -40 }, d: 2 }, { op: 'fame', d: 2 }] },
      { label: 'להציע פתיחת היבוא', ops: [{ op: 'stance', lean: { econ: 60 }, d: 2 }, { op: 'fame', d: 1 }] },
    ],
  },
  {
    id: 'coalition_crisis', icon: '💥', weight: 6, cooldown: 8,
    title: 'משבר קואליציוני',
    body: 'אחת ממפלגות הקואליציה מאיימת לפרוש בגלל הפרת הסכם. ראש הממשלה מחפש פתרון, והאופוזיציה מריחה דם.',
    when: (s) => s.coalition.stability < 40,
    choices: [
      {
        label: 'לנסות לגשר', requires: (s) => (isCoalition(s, s.player.partyId) && s.player.isMK ? null : 'רק ח"כ קואליציה'),
        chance: { p: (s) => 0.25 + s.player.skills.negotiation / 140 + s.player.reputation / 300, fail: [{ op: 'stability', d: -3 }], failText: 'הגישור נכשל.' },
        ops: [{ op: 'stability', d: 14 }, { op: 'reputation', d: 5 }, { op: 'att', who: '@pm', d: 12 }, { op: 'capital', d: 4 }],
        result: 'המשבר נפתר. ראש הממשלה לא ישכח.',
      },
      { label: 'ללבות ולקרוא לבחירות', requires: (s) => (isCoalition(s, s.player.partyId) ? 'אתה בקואליציה' : null), ops: [{ op: 'stability', d: -6 }, { op: 'fame', d: 3 }, { op: 'att', who: '@pm', d: -10 }] },
      { label: 'להמתין מהצד', ops: [] },
    ],
  },
  {
    id: 'ethics_complaint', icon: '📜', weight: 2, cooldown: 30,
    title: 'תלונה לוועדת האתיקה',
    body: 'ח"כ מהצד השני הגיש נגדך תלונה לוועדת האתיקה על התבטאות במליאה.',
    when: (s) => isMK(s) && s.player.fame > 25,
    choices: [
      { label: 'להתנצל', ops: [{ op: 'reputation', d: 1 }, { op: 'fame', d: -1 }] },
      { label: 'להפוך את זה לקמפיין "סותמים פיות"', ops: [{ op: 'fame', d: 3 }, { op: 'reputation', d: -3 }, { op: 'approval', sector: 'all', d: 0.5 }] },
    ],
  },
  {
    id: 'faction_rebellion', icon: '🗡️', weight: 2, cooldown: 30,
    title: 'מרד בסיעה',
    body: 'כמה ח"כים מהסיעה מתלוננים שהיו"ר מזניח אותם. הם בודקים בשקט אם אתה מוכן להוביל קבוצה עצמאית.',
    when: (s) => isMK(s) && hasParty(s) && !s.parties[s.player.partyId!].playerFounded && s.player.fame > 20,
    choices: [
      { label: 'לטפח את הקבוצה בשקט', ops: [{ op: 'special', id: 'rebels', label: 'ח"כים בסיעה מתקרבים אליך' }, { op: 'att', who: '@leader', d: -5 }] },
      { label: 'לדווח ליו"ר', ops: [{ op: 'att', who: '@leader', d: 15 }, { op: 'partyStanding', d: 6 }, { op: 'reputation', d: -2 }] },
    ],
  },
];


// ---------- שלב 2: ממשלה וקואליציה ----------
const pmIsNpc = (s: GameState) => s.coalition.pmId !== 'player' && !!s.npcs[s.coalition.pmId];
const supportPM = (d: number): Op[] => [{ op: 'att', who: '@pm', d }, { op: 'stability', d: 2 }];
const opposePM = (d: number): Op[] => [{ op: 'att', who: '@pm', d: -d }, { op: 'stability', d: -3 }, { op: 'consistency', d: 2 }];

const GOV_EVENTS: GameEvent[] = [
  {
    id: 'cab_wages', queued: true, icon: '🏛️', title: 'ישיבת ממשלה: הקפאת שכר במגזר הציבורי',
    body: 'האוצר מבקש להקפיא את שכר עובדי המדינה לשנתיים כדי לצמצם את הגירעון. ההסתדרות מאיימת בשביתה.',
    choices: [
      { label: 'להצביע בעד', ops: [...supportPM(5), { op: 'stance', lean: { econ: 50 }, d: 1.5 }, { op: 'world', key: 'economy', d: 2, weeks: 10 }] },
      { label: 'להצביע נגד', ops: [...opposePM(8), { op: 'stance', lean: { econ: -50 }, d: 1.5 }] },
    ],
  },
  {
    id: 'cab_emergency', queued: true, icon: '🚨', title: 'ישיבת ממשלה: הארכת תקנות שעת חירום',
    body: 'מערכת הביטחון מבקשת להאריך תקנות חירום שמרחיבות את סמכויות המעקב. ארגוני זכויות האדם זועקים.',
    choices: [
      { label: 'לתמוך בהארכה', ops: [...supportPM(5), { op: 'stance', lean: { security: 70, judiciary: 30 }, d: 1.5 }, { op: 'world', key: 'security', d: 1.5, weeks: 6 }] },
      { label: 'להתנגד', ops: [...opposePM(8), { op: 'stance', lean: { security: -40, judiciary: -50 }, d: 1.5 }, { op: 'world', key: 'trust', d: 1, weeks: 4 }] },
    ],
  },
  {
    id: 'cab_appoint', queued: true, icon: '📇', title: 'ישיבת ממשלה: מינוי שנוי במחלוקת',
    body: 'ראש הממשלה מבקש לאשר מינוי של מקורב לראשות חברה ממשלתית. נציבות שירות המדינה מסתייגת.',
    choices: [
      { label: 'לאשר', ops: [...supportPM(7), { op: 'reputation', d: -2 }, { op: 'world', key: 'trust', d: -1.5, weeks: 4 }] },
      { label: 'להתנגד בתוקף', ops: [...opposePM(10), { op: 'reputation', d: 3 }, { op: 'fame', d: 1.5 }] },
    ],
  },
  {
    id: 'cab_settle', queued: true, icon: '🗺️', title: 'ישיבת ממשלה: הקמת שכונה מעבר לקו הירוק',
    body: 'שרי הימין דוחפים לאשר בנייה, ובוושינגטון מזהירים מפגיעה ביחסים.',
    choices: [
      { label: 'לאשר', ops: [...supportPM(3), { op: 'stance', lean: { security: 80 }, d: 2 }, { op: 'world', key: 'cohesion', d: -1.5, weeks: 4 }] },
      { label: 'להתנגד', ops: [...opposePM(5), { op: 'stance', lean: { security: -60 }, d: 2 }] },
    ],
  },
  {
    id: 'cab_haredi', queued: true, icon: '📚', title: 'ישיבת ממשלה: תקציב לישיבות',
    body: 'השותפות החרדיות מתנות את המשך הקואליציה בתוספת תקציב למוסדות תורניים.',
    choices: [
      { label: 'לאשר את התוספת', ops: [...supportPM(4), { op: 'stability', d: 6 }, { op: 'stance', lean: { religion: 70 }, d: 1.5 }, { op: 'world', key: 'economy', d: -1, weeks: 8 }] },
      { label: 'להתנגד', ops: [...opposePM(6), { op: 'stability', d: -5 }, { op: 'stance', lean: { religion: -60 }, d: 1.5 }] },
    ],
  },
  {
    id: 'reshuffle_offer', icon: '🎖️', weight: 3, cooldown: 40,
    title: 'הצעה להיכנס לממשלה',
    body: '{leader} מזמין/ה אותך ללשכה: "אחד השרים שלנו לא מתפקד. אני רוצה אותך במקומו. זה תיק – לא מתנה."',
    when: (s) => s.player.isMK && !s.player.ministry && !s.player.defector && isCoalition(s, s.player.partyId) && s.player.partyStanding >= 60 && s.player.reputation >= 50 && pmIsNpc(s) && s.parties[s.player.partyId!].leaderId !== 'player' && Object.entries(s.ministers).some(([m, id]) => m !== 'pm' && s.npcs[id]?.partyId === s.player.partyId),
    choices: [
      { label: 'לקבל את התיק', ops: [{ op: 'special', id: 'take_ministry', label: 'מתמנה לשר/ה!' }, { op: 'debt', who: '@leader', dir: 'player_owes', reason: 'מינוי לשר' }] },
      { label: 'לסרב – עוד לא הזמן', ops: [{ op: 'att', who: '@leader', d: -5 }, { op: 'consistency', d: 2 }] },
    ],
  },
  {
    id: 'pm_fires', icon: '✂️', weight: 10, cooldown: 10,
    title: 'ראש הממשלה מאבד/ת סבלנות',
    body: 'אחרי שוב ושוב שיצאת נגדו/ה, {pm} שוקל/ת לפטר אותך מהממשלה. השמועה כבר בכותרות.',
    when: (s) => !!s.player.ministry && pmIsNpc(s) && s.npcs[s.coalition.pmId].attitude <= -35,
    choices: [
      { label: 'ללכת לפייס', requires: (s) => (s.player.ap >= 2 ? null : 'צריך 2 זמן'), chance: { p: (s) => 0.3 + s.player.skills.negotiation / 150, fail: [{ op: 'special', id: 'fired' }], failText: 'זה לא עזר. פוטרת.' }, ops: [{ op: 'ap', d: -2 }, { op: 'att', who: '@pm', d: 25 }], result: 'הצלחת לשקם את היחסים. בינתיים.' },
      { label: 'להתפטר בהצהרה חריפה', ops: [{ op: 'special', id: 'resign' }, { op: 'fame', d: 4 }, { op: 'att', who: '@pm', d: -15 }] },
      { label: 'לחכות לגזר הדין', chance: { p: () => 0.3, fail: [{ op: 'special', id: 'fired' }], failText: 'פוטרת מהממשלה.' }, ops: [], result: 'הסערה חלפה בלי פיטורים.' },
    ],
  },
  {
    id: 'partner_demand', icon: '📣', weight: 7, cooldown: 4,
    title: '{party} דורשת',
    body: '{npc}, יו"ר {party}, מודיע/ה: "בלי תקציב לבוחרים שלנו עד סוף החודש – אנחנו לא מצביעים עם הקואליציה."',
    when: (s) => s.coalition.pmId === 'player' && s.coalition.parties.length > 1,
    ctx: (s) => {
      const partners = s.coalition.parties.filter((p) => s.parties[p].leaderId !== 'player');
      if (!partners.length) return null;
      const party = pick(s, partners);
      return { party, npc: s.parties[party].leaderId };
    },
    choices: [
      { label: 'לתת את הכסף', ops: [{ op: 'special', id: 'partner_give', label: 'שביעות רצון +15' }, { op: 'world', key: 'economy', d: -1, weeks: 8 }, { op: 'capital', d: -2 }] },
      { label: 'להציע תפקיד לאחד מהח"כים שלהם', ops: [{ op: 'special', id: 'partner_job', label: 'שביעות רצון +8' }, { op: 'partyStanding', d: -3 }] },
      { label: 'לסרב', ops: [{ op: 'special', id: 'partner_refuse', label: 'שביעות רצון -15' }, { op: 'consistency', d: 2 }] },
    ],
  },
  {
    id: 'ministry_crisis', icon: '🔥', weight: 4, cooldown: 12,
    title: 'משבר במשרד',
    body: 'תקלה חמורה במערכות המשרד שלך משביתה שירות לציבור. התקשורת מחפשת אשמים.',
    when: (s) => !!s.player.ministry,
    choices: [
      { label: 'לנהל את המשבר אישית', requires: (s) => (s.player.ap >= 1 ? null : 'אין זמן'), ops: [{ op: 'ap', d: -1 }, { op: 'special', id: 'ministry_perf', label: 'ביצועי המשרד +6' }, { op: 'fame', d: 1 }] },
      { label: 'להאשים את הקודם בתפקיד', ops: [{ op: 'fame', d: 1 }, { op: 'reputation', d: -2 }] },
      { label: 'לפטר את הממונה', ops: [{ op: 'special', id: 'ministry_perf', label: 'ביצועי המשרד +3' }, { op: 'reputation', d: 1 }] },
    ],
  },
];
EVENTS.push(...GOV_EVENTS);
export const CABINET_EVENTS = GOV_EVENTS.filter((e) => e.id.startsWith('cab_')).map((e) => e.id);


// ---------- אירועי המשך לחקיקה ובג"ץ ----------
/** האם השחקן "שותף" לחוק (הגיש או הצטרף כמגיש) */
const ownsLaw = (s: GameState, ctx: Ctx) =>
  s.lawsPassed.some((l) => l.templateId === ctx.law && (l.sponsor === 'player' || l.coSponsor || l.sponsor === s.player.employerId));
const credit = (base: Op[], extra: Op[]) => (s: GameState, ctx: Ctx) => (ownsLaw(s, ctx) ? [...base, ...extra] : base);

const LAW_EVENTS: GameEvent[] = [
  {
    id: 'housing_delivered', queued: true, icon: '🔑', title: 'נמסרו הדירות הראשונות',
    body: 'בזכות "{title}" זוגות צעירים מקבלים מפתחות לדירות בהישג יד. המצלמות שם, וכולם רוצים להיות בתמונה.',
    choices: [
      { label: 'להגיע לטקס ולקחת קרדיט', dyn: credit([{ op: 'fame', d: 1 }], [{ op: 'fame', d: 3 }, { op: 'approval', sector: 'secular', d: 2 }, { op: 'approval', sector: 'traditional', d: 2 }]) },
      { label: 'לתת לאחרים לחגוג', ops: [{ op: 'reputation', d: 1 }] },
    ],
  },
  {
    id: 'shabbat_buses', queued: true, icon: '🚌', title: 'האוטובוסים יצאו לדרך בשבת',
    body: 'לראשונה קווי תחבורה ציבורית פועלים בסופ"ש. הקווים מלאים – ובשכונות החרדיות זועמים.',
    choices: [
      { label: 'לעלות על הקו הראשון מול המצלמות', dyn: credit([{ op: 'stance', lean: { religion: -60 }, d: 1.5 }], [{ op: 'fame', d: 3 }]) },
      { label: 'להיפגש עם רבנים להרגעת הרוחות', ops: [{ op: 'world', key: 'cohesion', d: 1, weeks: 4 }, { op: 'reputation', d: 2 }] },
    ],
  },
  {
    id: 'draft_backlash', queued: true, icon: '🪧', title: 'הפגנות ענק נגד החוק',
    body: 'אחרי שעבר "{title}", עשרות אלפי חרדים חוסמים כבישים. הרבנים מכריזים על "מלחמת דת", והשותפות החרדיות מאיימות.',
    choices: [
      { label: '"החוק יאכף – אין הנחות"', ops: [{ op: 'stance', lean: { religion: -60 }, d: 2 }, { op: 'world', key: 'cohesion', d: -2, weeks: 4 }, { op: 'stability', d: -5 }] },
      { label: 'להציע תקופת מעבר', ops: [{ op: 'world', key: 'cohesion', d: 2, weeks: 4 }, { op: 'consistency', d: -2 }, { op: 'stability', d: 3 }] },
      { label: 'לשתוק', ops: [] },
    ],
  },
  {
    id: 'override_protest', queued: true, icon: '📣', title: 'מאות אלפים ברחובות',
    body: 'מיד אחרי ש"{title}" עבר, מחאה ענקית פורצת. טייסי מילואים, הייטקיסטים ומשפטנים קוראים לסירוב. מנגד – הפגנת תמיכה גדולה.',
    choices: [
      { label: 'לנאום בהפגנת התמיכה', ops: [{ op: 'stance', lean: { judiciary: 80 }, d: 2.5 }, { op: 'fame', d: 2 }] },
      { label: 'לנאום בהפגנת המחאה', ops: [{ op: 'stance', lean: { judiciary: -80 }, d: 2.5 }, { op: 'fame', d: 2 }] },
      { label: 'לקרוא להידברות', ops: [{ op: 'world', key: 'cohesion', d: 1, weeks: 4 }, { op: 'reputation', d: 2 }] },
    ],
  },
  {
    id: 'prices_drop', queued: true, icon: '🏷️', title: 'המחירים בסופר ירדו',
    body: 'מדד המחירים מראה ירידה ראשונה מזה שנים, אחרי "{title}". החקלאים והיבואנים המקומיים זועמים.',
    choices: [
      { label: 'לחגוג בסיור בסופר', dyn: credit([{ op: 'fame', d: 1 }], [{ op: 'fame', d: 2 }, { op: 'approval', sector: 'all', d: 1 }]) },
      { label: 'להיפגש עם החקלאים', ops: [{ op: 'approval', sector: 'traditional', d: 1 }, { op: 'reputation', d: 1 }] },
    ],
  },
  {
    id: 'civil_first', queued: true, icon: '💍', title: 'הזוג הראשון נישא בברית זוגיות',
    body: 'זוג עולים מברית המועצות לשעבר נישא לראשונה בישראל בברית זוגיות אזרחית. הרבנות הראשית מגנה.',
    choices: [
      { label: 'להגיע לחתונה', dyn: credit([{ op: 'stance', lean: { religion: -60 }, d: 1.5 }], [{ op: 'approval', sector: 'olim', d: 3 }, { op: 'fame', d: 2 }]) },
      { label: 'לשלוח ברכה בשקט', ops: [{ op: 'approval', sector: 'olim', d: 1 }] },
    ],
  },
  {
    id: 'border_thanks', queued: true, icon: '🏡', title: 'תושבי הגבול אומרים תודה',
    body: 'ממ"דים חדשים והטבות מס: תושבי הצפון והדרום מזמינים את מי שקידם את "{title}" לכנס הוקרה.',
    choices: [
      { label: 'לנסוע לכנס', dyn: credit([{ op: 'fame', d: 1 }], [{ op: 'approval', sector: 'traditional', d: 3 }, { op: 'approval', sector: 'religious', d: 2 }, { op: 'fame', d: 2 }]) },
      { label: 'לשלוח נציג', ops: [] },
    ],
  },
  {
    id: 'crime_drop', queued: true, icon: '📉', title: 'ירידה ברציחות בחברה הערבית',
    body: 'לראשונה מזה עשור מספר קורבנות הירי יורד. ראשי הרשויות הערביות מייחסים זאת ל"{title}".',
    choices: [
      { label: 'לבקר ביישוב ערבי ולשמוע', dyn: credit([{ op: 'approval', sector: 'arab', d: 2 }], [{ op: 'approval', sector: 'arab', d: 4 }, { op: 'fame', d: 2 }]) },
      { label: '"זו רק ההתחלה"', ops: [{ op: 'reputation', d: 1 }] },
    ],
  },
  {
    id: 'employers_protest', queued: true, icon: '🏭', title: 'המעסיקים מתריעים: נפטר עובדים',
    body: 'התאחדות התעשיינים טוענת ש"{title}" יוביל לפיטורים בפריפריה.',
    choices: [
      { label: 'לעמוד מאחורי החוק', ops: [{ op: 'stance', lean: { econ: -50 }, d: 1.5 }] },
      { label: 'להציע הטבות מס למעסיקים קטנים', ops: [{ op: 'world', key: 'economy', d: 1, weeks: 8 }, { op: 'consistency', d: -1 }] },
    ],
  },
  {
    id: 'teachers_strike', queued: true, icon: '🍎', title: 'המורים שובתים',
    body: 'הסתדרות המורים דורשת תוספת שכר על השעות הנוספות של "{title}". ההורים בלחץ.',
    choices: [
      { label: 'לתמוך במורים', ops: [{ op: 'stance', lean: { econ: -40 }, d: 1.5 }, { op: 'world', key: 'economy', d: -0.5, weeks: 4 }] },
      { label: 'לדרוש לחזור לעבודה', ops: [{ op: 'stance', lean: { econ: 40 }, d: 1.5 }] },
    ],
  },
  {
    id: 'lobby_backlash', queued: true, icon: '💼', title: 'הלוביסטים נגדך',
    body: 'אחרי "{title}", משרדי הלובי מפיצים בשקט שיש להם "מה לספר" על מי שקידם את החוק.',
    choices: [
      { label: 'לחשוף את האיומים בתקשורת', ops: [{ op: 'fame', d: 3 }, { op: 'reputation', d: 2 }] },
      { label: 'להתעלם', ops: [] },
    ],
  },
  {
    id: 'petition', queued: true, icon: '⚖️', title: 'עתירה לבג"ץ נגד "{title}"',
    body: 'ארגונים הגישו עתירה, ובית המשפט העליון כינס הרכב מורחב. ההחלטה צפויה בקרוב, והתקשורת שואלת לעמדתך.',
    choices: [
      { label: 'להגן על החוק', ops: [{ op: 'stance', lean: { judiciary: 60 }, d: 1.5 }, { op: 'special', id: 'court_rule', label: 'בג"ץ יכריע' }] },
      { label: 'לתמוך בעתירה', ops: [{ op: 'stance', lean: { judiciary: -60 }, d: 1.5 }, { op: 'special', id: 'court_rule', label: 'בג"ץ יכריע' }] },
      { label: '"נכבד כל החלטה"', ops: [{ op: 'reputation', d: 1 }, { op: 'special', id: 'court_rule', label: 'בג"ץ יכריע' }] },
    ],
  },
  {
    id: 'override_reenact', queued: true, icon: '🔁', title: 'פסקת ההתגברות: לחוקק מחדש?',
    body: 'בג"ץ פסל את "{title}". בזכות חוק יסוד: החקיקה, הקואליציה יכולה לחוקק אותו מחדש – במחיר סערה ציבורית.',
    choices: [
      { label: 'לתמוך בחקיקה מחדש', ops: [{ op: 'stance', lean: { judiciary: 80 }, d: 2 }, { op: 'special', id: 'override_vote', label: 'הכנסת תצביע' }] },
      { label: 'להתנגד – לכבד את הפסיקה', ops: [{ op: 'stance', lean: { judiciary: -70 }, d: 2 }, { op: 'special', id: 'override_vote', label: 'הכנסת תצביע' }] },
    ],
  },
];
EVENTS.push(...LAW_EVENTS);


// ---------- יוזמות של דמויות ----------
const NPC_EVENTS: GameEvent[] = [
  {
    id: 'npc_alliance', icon: '🤝', weight: 4, cooldown: 14,
    title: '{npc} מציע/ה ברית',
    body: '{npc} ({npcParty}) מושך/ת אותך הצידה במזנון: "אני רואה לאן את/ה הולך/ת. בוא/י נעבוד ביחד – אני תומך/ת בהצעות שלך, את/ה מגבה אותי כשצריך."',
    when: (s) => s.player.fame >= 25 || s.player.isMK,
    ctx: (s) => pickNpc(s, Object.values(s.npcs).filter((n) => n.isMK && n.notable && (n.traits.includes('opportunist') || n.traits.includes('pragmatic')) && n.attitude >= 10 && n.attitude < 60)),
    choices: [
      { label: 'לכרות ברית', ops: [{ op: 'att', who: '@ctx', d: 15 }, { op: 'trust', who: '@ctx', d: 10 }, { op: 'special', id: 'alliance', label: 'יתחייב לתמוך בהצעות שלך' }, { op: 'debt', who: '@ctx', dir: 'player_owes', reason: 'ברית פוליטית' }, { op: 'memory', who: '@ctx', text: 'כרתנו ברית', d: 15 }] },
      { label: 'לשמור מרחק', ops: [{ op: 'att', who: '@ctx', d: -5 }] },
    ],
  },
  {
    id: 'npc_cosponsor', icon: '✍️', weight: 5, cooldown: 10,
    title: '{npc} מבקש/ת שתצטרף/י כמגיש/ה',
    body: '{npc} עובד/ת כבר שנים על "{agendaTitle}". "תחתום/י איתי על ההצעה – ביחד יש לנו סיכוי להעביר אותה. וכשתעבור, גם את/ה תקבל/י קרדיט."',
    when: (s) => s.player.isMK,
    ctx: (s) => {
      const cands = Object.values(s.npcs).filter((n) => n.isMK && n.notable && n.attitude >= 0 && !s.flags[`cosp_${n.id}`] && !s.lawsPassed.some((l) => l.templateId === n.agenda));
      if (!cands.length) return null;
      const n = pick(s, cands);
      return { npc: n.id, agenda: n.agenda, agendaTitle: BILL_TEMPLATES.find((t) => t.id === n.agenda)!.title };
    },
    choices: [
      { label: 'לחתום כמגיש/ה נוסף/ת', dyn: (_s, ctx) => [{ op: 'att', who: '@ctx', d: 12 }, { op: 'special', id: 'cosponsor', label: 'קרדיט אם יעבור' }, { op: 'stance', lean: BILL_TEMPLATES.find((t) => t.id === ctx.agenda)!.lean, d: 1.2 }, { op: 'memory', who: '@ctx', text: 'חתם/ה איתי על ההצעה', d: 12 }] },
      { label: 'לסרב בנימוס', ops: [{ op: 'att', who: '@ctx', d: -4 }] },
    ],
  },
  {
    id: 'plot_warning', queued: true, icon: '🕵️', title: '{npc2} מזהיר/ה אותך',
    body: '{npc2} לוחש/ת לך: "תיזהר/י. {npc} אוסף/ת חומרים נגדך ומתכנן/ת להדליף אותם לתקשורת בשבוע הבא. חשבתי שאת/ה צריך/ה לדעת."',
    choices: [
      {
        label: 'לעמת את {npc} בארבע עיניים', hint: 'סיכוי לפי משא ומתן',
        chance: { p: (s) => 0.3 + s.player.skills.negotiation / 150, fail: [{ op: 'special', id: 'plot_go' }, { op: 'att', who: '@ctx', d: -5 }], failText: 'העימות רק הרגיז/ה אותו/ה. ההדלפה בדרך.' },
        ops: [{ op: 'att', who: '@ctx', d: 20 }, { op: 'memory', who: '@ctx', text: 'עימת/ה אותי – והגענו להבנות', d: 20 }],
        result: 'הגעתם להבנה. המזימה בוטלה.',
      },
      { label: 'להקדים תרופה למכה בתקשורת', ops: [{ op: 'fame', d: 2 }, { op: 'att', who: '@ctx', d: -10 }, { op: 'reputation', d: -1 }] },
      { label: 'להתעלם', ops: [{ op: 'special', id: 'plot_go' }] },
    ],
  },
  {
    id: 'plot_strike', queued: true, icon: '💣', title: '{npc} הדליף/ה נגדך',
    body: 'בכותרת הראשית: "מקורבים ל{player}: מאחורי הקלעים – סחר בטובות ודילים". המקור? אף אחד לא מופתע שזה {npc}.',
    choices: [
      { label: 'להכחיש בתוקף', chance: { p: (s) => 0.35 + s.player.skills.media / 150, fail: [{ op: 'approval', sector: 'all', d: -3 }, { op: 'reputation', d: -3 }], failText: 'ההכחשה לא שכנעה איש.' }, ops: [{ op: 'fame', d: 1 }], result: 'הסיפור נחלש.' },
      { label: 'להודות ולהתנצל', ops: [{ op: 'approval', sector: 'all', d: -1.5 }, { op: 'reputation', d: 1 }, { op: 'partyStanding', d: -3 }] },
      { label: 'להחזיר מכה', ops: [{ op: 'fame', d: 3 }, { op: 'approval', sector: 'all', d: -1 }, { op: 'att', who: '@ctx', d: -15 }, { op: 'memory', who: '@ctx', text: 'החזיר/ה לי מכה בתקשורת', d: -15 }] },
    ],
  },
];
EVENTS.push(...NPC_EVENTS);

export const eventById = (id: string) => EVENTS.find((e) => e.id === id);

export function debtCollectCandidate(s: GameState): Ctx | null {
  const due = s.player.debts.filter((d) => d.dir === 'player_owes' && s.week - d.week >= 4);
  if (!due.length) return null;
  const d = due[0];
  return debtsWith(s, d.npcId, 'player_owes').length ? { npc: d.npcId } : null;
}
