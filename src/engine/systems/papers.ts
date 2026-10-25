// העיתונים: כל עיתון בוחר מה לפרסם, איך "לסובב" את הכותרת, ומוסיף כותרות משלו לפי מצב המדינה.
import type { GameState, Ideology, NewsItem } from '../types';
import { leanAlignment } from '../util';
import { latestSurvey, moodLines, surveyName } from './surveys';

export interface Paper {
  id: string;
  name: string;
  icon: string;
  lean: Partial<Ideology>;
  blurb: string;
  /** מה העיתון אוהב לפרסם (אם אין – הכול) */
  focus?: RegExp;
  /** מה העיתון לא מפרסם */
  skip?: RegExp;
  /** כותרות משל העיתון */
  own: (s: GameState) => string[];
}

const ECON = /כלכל|תקציב|בורס|מחיר|שכר|מס |מס\b|מע"מ|דיור|דירות|בנק|הייטק|גז|נמל|גירעון|אבטלה|צמיחה|יוקר|פנסי|קצב/;
const ARAB = /ערבי|פשיעה|ירי|קרקע|לאום|מואזין|דרוז|נגב|בדואי/;
const SECULAR = /שבת|פונדקאות|נישואים אזרחיים|קנאביס|ברית הזוגיות|להט"ב|גיור אזרחי|הפרדת הדת|כשרות|כותל/;

const pm = (s: GameState) => (s.coalition.pmId === 'player' ? s.player.name : s.npcs[s.coalition.pmId]?.name ?? 'ראש הממשלה');
/** השינוי השבועי האחרון במדד */
const trend = (s: GameState, key: keyof GameState['world']) => (s.report ? s.report.worldAfter[key] - s.report.worldBefore[key] : 0);

export const PAPERS: Paper[] = [
  {
    id: 'popular', name: 'ידיעות המשכן', icon: '📰', lean: {}, blurb: 'העיתון הנפוץ. כותרות גדולות, הרבה רכילות.',
    own: (s) => {
      const sv = latestSurvey(s);
      return sv?.surprise ? [`הסקר שכולם מדברים עליו: ${s.parties[sv.surprise.party]?.name} בזינוק`] : [];
    },
  },
  {
    id: 'liberal', name: 'הארץ שלנו', icon: '🗞️', lean: { judiciary: -60, religion: -60, security: -40 }, blurb: 'ליברלי, ביקורתי כלפי הימין.',
    own: (s) => (s.world.trust < 40 ? [`מאמר המערכת: "ממשלת ${pm(s)} מפרקת את המוסדות"`] : s.rules.immunity ? ['מאמר המערכת: "החוק הצרפתי הוא חוק מושחת"'] : []),
  },
  {
    id: 'right', name: 'ישראל בבוקר', icon: '📯', lean: { security: 60, judiciary: 50, religion: 30 }, blurb: 'ימני, ביקורתי כלפי השמאל ובג"ץ.',
    own: (s) => (s.world.security < 45 ? ['מאמר המערכת: "הגיע הזמן להכריע"'] : s.issues.judiciary > 60 ? ['מאמר המערכת: "השופטים לא נבחרו על ידי אף אחד"'] : []),
  },
  {
    id: 'haredi', name: 'המבשר הנאמן', icon: '📜', lean: { religion: 80, security: 20 }, blurb: 'יומון חרדי. מה שלא ראוי – פשוט לא מתפרסם.', skip: SECULAR,
    own: (s) => [
      s.issues.draft > 60 ? 'גדולי ישראל: "לא נוותר על עולם התורה – בשום מחיר"' : 'מעמד הסיום הגדול: רבבות בהיכל הספורט',
      ...((s.transforms ?? []).some((t) => t.id === 'secular') ? ['"גזירת ההפרדה" – כינוס חירום של מועצת הגדולים'] : []),
    ],
  },
  {
    id: 'arab', name: 'אל-מרכז', icon: '🕌', lean: { security: -60, religion: -10 }, blurb: 'עיתון בחברה הערבית: פשיעה, קרקעות ושוויון.', focus: ARAB,
    own: (s) => [
      s.issues.crime > 55 ? 'אמהות השכול מהגליל: "המשטרה יודעת מי – ולא עוצרת"' : 'ירידה במספר אירועי הירי – "התחלה, לא יותר"',
      ...(s.world.cohesion < 40 ? ['"אזרחים סוג ב׳": סקר חדש על תחושת השייכות'] : []),
    ],
  },
  {
    id: 'money', name: 'הכסף', icon: '💹', lean: { econ: 50 }, blurb: 'עיתון כלכלי: בורסה, מסים ותקציב.', focus: ECON,
    own: (s) => {
      const d = trend(s, 'economy');
      const a = trend(s, 'affordability');
      return [
        `מדד המשק: ${Math.round(s.world.economy)} ${d > 0.1 ? '▲' : d < -0.1 ? '▼' : '–'} · יוקר המחיה: ${Math.round(s.world.affordability)} ${a > 0.1 ? '▲' : a < -0.1 ? '▼' : '–'}`,
        s.world.economy < 40 ? 'אנליסטים: "הממשלה חייבת לקצץ – או להעלות מסים"' : 'משקיעים זרים: "ישראל עדיין סיפור הצלחה"',
      ];
    },
  },
  {
    id: 'social', name: '#טרנדינג', icon: '📱', lean: {}, blurb: 'מה שמסתובב ברשתות: קליפים, טוויטים, מימים.',
    focus: /"|סקנדל|ויראלי|קליפ|הפגנ|מחאה/,
    own: (s) => {
      const out: string[] = [];
      const enemy = Object.values(s.npcs).filter((n) => n.notable && n.attitude <= -40).sort((a, b) => a.attitude - b.attitude)[0];
      if (enemy) out.push(`הטוויט של ${enemy.name} על ${s.player.name} עבר 100 אלף צפיות`);
      const hype = Object.values(s.parties).find((x) => (x.momentum ?? 0) >= 3);
      if (hype) out.push(`#${hype.short.replace(/\s/g, '_')} בטרנדינג – ההייפ ממשיך`);
      if (s.player.fame > 60) out.push(`מם חדש עם ${s.player.name} – חצי מהרשת צוחקת, חצי מסכימה`);
      out.push(...moodLines(s).slice(0, 1).map((l) => `ברשת מרגישים את זה: ${l}`));
      const sv = latestSurvey(s);
      if (sv?.pmFit[0]) out.push(`סקר רשת: ${surveyName(s, sv.pmFit[0].id)} "הכי מתאים/ה" – והתגובות בהתאם`);
      return out.slice(0, 3);
    },
  },
];

/** ההטיה של עיתון כלפי מי שהידיעה עליו */
function slant(s: GameState, n: NewsItem, paper: Paper): number {
  if (!Object.keys(paper.lean).length) return 0;
  const pmId = s.coalition.pmId;
  const govNews = /ממשל|קואליצי|ראש הממשלה|השר|שרה|שרים/.test(n.headline);
  const subject: Ideology | null = n.aboutPlayer ? s.player.ideology : n.npcId && s.npcs[n.npcId] ? s.npcs[n.npcId].ideology : govNews ? (pmId === 'player' ? s.player.ideology : s.npcs[pmId]?.ideology ?? null) : null;
  return subject ? leanAlignment(subject, paper.lean) : 0;
}

const hash = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};
const pickBy = <T,>(arr: T[], key: string) => arr[hash(key) % arr.length];

type Tone = NewsItem['tone'];
/** הקול של כל עיתון: ניסוח אחר לאותה ידיעה. sl>0 = העיתון אוהד את מי שהידיעה עליו, sl<0 = עוין */
const VOICE: Record<string, (h: string, tone: Tone, sl: number, key: string) => string> = {
  popular: (h, tone, _sl, key) =>
    tone === 'bad' ? pickBy([`זעזוע: ${h}`, `${h} – והציבור בהלם`, `מכה: ${h}`], key)
    : tone === 'good' ? pickBy([`סוף סוף: ${h}`, `וואו: ${h}`, `חדשות טובות: ${h}`], key)
    : pickBy([`${h}. כל הפרטים`, `ככה זה נראה מבפנים: ${h}`, h], key),
  liberal: (h, tone, sl, key) =>
    sl > 0.35 ? (tone === 'bad' ? `${h}. אבל צריך לראות את התמונה המלאה` : `${h} – מהלך מבורך`)
    : sl < -0.2 ? (tone === 'good' ? `${h}. כדאי לבדוק מה מסתתר מאחורי הספין` : pickBy([`${h}: עוד סימן לשחיקה בדמוקרטיה`, `מי אחראי? ${h}`, `${h}. התגובה: שתיקה רועמת`], key))
    : pickBy([`ניתוח: ${h}`, `${h}. מה זה אומר על המשילות?`, `${h} – ושאלות קשות נשארות`], key),
  right: (h, tone, sl, key) =>
    sl > 0.35 ? (tone === 'bad' ? `${h} – "מסע השיסוי נגדנו נמשך"` : `${h}: ניצחון לשפיות`)
    : sl < -0.2 ? (tone === 'good' ? `${h}? תלוי את מי שואלים` : pickBy([`${h} – ועוד סקנדל של השמאל`, `שוב אותם אנשים: ${h}`, `${h}. הגיע הזמן להכריע`], key))
    : pickBy([`בשטח: ${h}`, `${h}. מה אומרים הנבחרים?`, `${h} – והציבור כבר יודע מי אשם`], key),
  haredi: (h, tone, _sl, key) =>
    tone === 'bad' ? pickBy([`בכאב: ${h}`, `${h} – "זו גזירה"`, `${h}. גדולי ישראל מתכנסים`], key)
    : tone === 'good' ? pickBy([`בעזרת ה': ${h}`, `${h} – זכות גדולה`, `ברוך ה': ${h}`], key)
    : pickBy([`${h}. בבית המדרש מגיבים`, `${h}, וגם: הלכה למעשה`, h], key),
  arab: (h, tone, _sl, key) =>
    tone === 'bad' ? pickBy([`${h}. ושוב – אצלנו זה נראה אחרת`, `${h} – על חשבוננו`, `${h}: ובישובים הערביים כבר לא מופתעים`], key)
    : tone === 'good' ? pickBy([`${h} – האם זה יגיע גם אלינו?`, `${h}. נבדוק מה זה אומר לנו בפועל`], key)
    : pickBy([`מהשטח: ${h}`, `${h}. מי מייצג אותנו כאן?`], key),
  money: (h, tone, _sl, key) =>
    tone === 'bad' ? pickBy([`${h} – ומה זה עושה לכיס שלך`, `${h}: האנליסטים מזהירים`, `${h}. המחיר: מיליארדים`], key)
    : tone === 'good' ? pickBy([`${h} – הבורסה מגיבה`, `${h}: הזדמנות להשקעה`, `${h}. התוצאה בשורה התחתונה`], key)
    : pickBy([`${h}: הנתונים מאחורי הכותרת`, `${h} – מה זה אומר לשוק?`], key),
  social: (h, tone, _sl, key) =>
    tone === 'bad' ? pickBy([`🔥 ${h} 😬`, `😱 ${h}. הרשת רותחת`, `💀 ${h}`], key)
    : tone === 'good' ? pickBy([`👏 ${h}`, `🙌 ${h} – ויראלי`], key)
    : pickBy([`👀 ${h}`, `${h} – תגיבו!`, `🤔 ${h}`], key),
};

/** כמה העיתון מתעניין בידיעה (לסדר ההצגה) */
function interest(s: GameState, paper: Paper, n: NewsItem): number {
  let sc = 0;
  if (paper.focus?.test(n.headline)) sc += 3;
  if (paper.skip?.test(n.headline)) sc -= 9;
  sc += Math.abs(slant(s, n, paper)) * 2; // עיתון אוהב לדבר על מי שהוא אוהב או שונא
  if (n.aboutPlayer) sc += paper.id === 'popular' || paper.id === 'social' ? 2 : 0.5;
  if (n.tone === 'bad' && (paper.id === 'popular' || paper.id === 'social')) sc += 1.5;
  if (n.tone !== 'neutral' && paper.id === 'money') sc -= 0.5;
  // רעש קבוע לכל עיתון וידיעה, כדי שלא כולם יתחילו באותה כותרת
  return sc + (hash(paper.id + n.id) % 100) / 60;
}

/** מה מופיע בעיתון השבוע: כותרות משלו, ואחריהן חדשות שהוא בוחר ומנסח בקול משלו */
export function paperFront(s: GameState, paper: Paper, max = 5): { text: string; mine: boolean; own?: boolean }[] {
  const own = paper.own(s).map((text) => ({ text, mine: false, own: true }));
  const recent = s.news.filter((n) => s.week - n.week <= 4 && !(paper.skip && paper.skip.test(n.headline)));
  const base = paper.id === 'social' ? recent.filter((n) => n.aboutPlayer || !!n.npcId || paper.focus?.test(n.headline)) : recent;
  const ranked = [...base].sort((a, b) => interest(s, paper, b) - interest(s, paper, a)).slice(0, Math.max(0, max - own.length));
  const voice = VOICE[paper.id] ?? ((h: string) => h);
  const items = ranked.map((n) => ({ text: voice(n.headline, n.tone, slant(s, n, paper), paper.id + n.id), mine: n.aboutPlayer }));
  return [...own, ...items].slice(0, max);
}
