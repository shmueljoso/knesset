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
const SECULAR = /שבת|פונדקאות|נישואים אזרחיים|קנאביס|ברית הזוגיות|להט"ב|גיור אזרחי/;

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
  const subject: Ideology | null = n.aboutPlayer ? s.player.ideology : n.npcId && s.npcs[n.npcId] ? s.npcs[n.npcId].ideology : null;
  return subject ? leanAlignment(subject, paper.lean) : 0;
}

function spin(paper: Paper, headline: string, tone: NewsItem['tone'], sl: number): string {
  if (paper.id === 'social') return tone === 'bad' ? `🔥 ${headline} 😬` : tone === 'good' ? `👏 ${headline}` : `${headline} 👀`;
  if (sl > 0.35) return tone === 'bad' ? `${headline} – אבל התמונה מורכבת יותר` : tone === 'good' ? `הישג: ${headline}` : headline;
  if (sl < -0.2) return tone === 'good' ? `למרות הספין: ${headline}` : tone === 'bad' ? `סקנדל: ${headline}` : `${headline}. שאלות קשות נשארות`;
  return headline;
}

/** מה מופיע בעיתון השבוע: כותרות משלו, ואחריהן חדשות שמתאימות לו – "מסובבות" לפי הקו שלו */
export function paperFront(s: GameState, paper: Paper, max = 5): { text: string; mine: boolean; own?: boolean }[] {
  const own = paper.own(s).map((text) => ({ text, mine: false, own: true }));
  const recent = s.news.filter((n) => s.week - n.week <= 3 && !(paper.skip && paper.skip.test(n.headline)));
  const focused = paper.focus ? recent.filter((n) => paper.focus!.test(n.headline) || (paper.id === 'social' && (n.aboutPlayer || !!n.npcId))) : recent;
  // עיתון ממוקד מעדיף את התחום שלו; הרשתות לא "ממחזרות" את החדשות הכלליות
  const pool = (focused.length >= 2 || paper.id === 'social' ? focused : recent).slice(0, max);
  return [...own, ...pool.map((n) => ({ text: spin(paper, n.headline, n.tone, slant(s, n, paper)), mine: n.aboutPlayer }))].slice(0, max);
}
