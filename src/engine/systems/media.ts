// התקשורת: שמות כלי תקשורת ועיתונאים (בדיוניים או אמיתיים – mods/media-israel.json),
// טורים ופרשנויות בשם העיתונאים, ומי מהם "פעיל/ה" במשחק.
import pack from '../../../mods/media-israel.json' with { type: 'json' };
import { makeAvatar } from '../avatarGen';
import { chance, pick, pickWeighted } from '../rng';
import { makeLocalRng } from '../rng';
import type { GameState, Ideology, Npc, NewsItem } from '../types';
import { clamp, ideologyDistance, leanAlignment } from '../util';
import { addNews } from './news';
import { addMomentum } from './opinion';
import { latestSurvey } from './surveys';

export interface RealJournalist {
  id: string;
  name: string;
  gender: 'm' | 'f';
  outlet: string;
  title: string;
  beat: string;
  lean: Partial<Ideology>;
  star?: boolean;
}

export const MEDIA_PACK = pack as unknown as {
  name: string;
  source: string;
  asOf: string;
  outlets: Record<string, string>;
  papers: Record<string, string>;
  pollsters: Record<string, { name: string; outlet: string }>;
  journalists: RealJournalist[];
};

export const realMedia = (s: GameState) => s.settings?.media === 'real';

/** שם כלי תקשורת לתצוגה (השמות הפנימיים בדיוניים; במצב "אמיתי" מוחלפים) */
export const outletName = (s: GameState, outlet: string) => (realMedia(s) ? MEDIA_PACK.outlets[outlet] ?? outlet : outlet);
export const pollsterName = (s: GameState, name: string) => (realMedia(s) ? MEDIA_PACK.pollsters[name]?.name ?? name : name);
export const pollsterOutlet = (s: GameState, name: string, fallback: string) => (realMedia(s) ? MEDIA_PACK.pollsters[name]?.outlet ?? outletName(s, fallback) : fallback);
export const paperName = (s: GameState, id: string, fallback: string) => (realMedia(s) ? MEDIA_PACK.papers[id] ?? fallback : fallback);

/** עיתונאי/ת שפעיל/ה במצב התקשורת הנוכחי */
export const isActiveJournalist = (s: GameState, n: Npc) => n.role === 'journalist' && (n.media ?? 'fictional') === (s.settings?.media ?? 'fictional');
export const activeJournalists = (s: GameState) => Object.values(s.npcs).filter((n) => isActiveJournalist(s, n));

const hash = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};

function makeJournalist(s: GameState, j: RealJournalist): Npc {
  const rnd = makeLocalRng(s.seed ^ hash(j.id));
  const ideology = { econ: 0, security: 0, religion: 0, judiciary: 0, ...j.lean };
  return {
    id: `rj_${j.id}`,
    name: j.name,
    gender: j.gender,
    partyId: null,
    role: 'journalist',
    isMK: false,
    title: `${j.title}, ${j.outlet}`,
    avatar: makeAvatar(rnd, j.gender, 'jewish'),
    ideology,
    traits: [(['leaker', 'principled', 'vain', 'pragmatic'] as const)[Math.floor(rnd() * 4)]],
    knownTraits: [],
    influence: j.star ? 85 : 65,
    attitude: Math.round(clamp(leanAlignment(s.player.ideology, ideology) * 20 + (s.player.background === 'journalist' ? 25 : 0), -40, 60)),
    trust: 35,
    lastContact: -10,
    friends: [],
    haunts: ['studio', 'plaza', 'cafeteria'],
    notable: true,
    primaryStrength: 0,
    pledges: [],
    bio: `${j.title} ב${j.outlet}.`,
    agenda: '',
    ambition: 30,
    memory: [],
    media: 'real',
    realId: j.id,
    outlet: j.outlet,
    beat: j.beat,
  };
}

/** מצב התקשורת: יוצר/מסתיר את העיתונאים המתאימים. בטוח לקרוא שוב ושוב */
export function setMediaMode(s: GameState, mode: 'fictional' | 'real') {
  s.settings = { ...s.settings, media: mode };
  if (mode === 'real') {
    const taken = String(s.flags.playsJournalist ?? '');
    for (const j of MEDIA_PACK.journalists) {
      if (j.id === taken) continue;
      if (!s.npcs[`rj_${j.id}`]) s.npcs[`rj_${j.id}`] = makeJournalist(s, j);
    }
  }
  for (const n of Object.values(s.npcs)) {
    if (n.role !== 'journalist') continue;
    const on = isActiveJournalist(s, n);
    n.notable = on;
    n.haunts = on ? ['studio', 'plaza', 'cafeteria'] : [];
  }
}

// ---------------- טורים ופרשנויות ----------------

const pmName = (s: GameState) => (s.coalition.pmId === 'player' ? s.player.name : s.npcs[s.coalition.pmId]?.name ?? 'ראש הממשלה');

/** טור אחד: מי כותב/ת, על מה ובאיזה טון – לפי התחום, ההטיה והיחס לשחקן */
export function makeColumn(s: GameState, j: Npc): { headline: string; tone: NewsItem['tone']; about: boolean; body?: string } | null {
  const p = s.player;
  const pm = pmName(s);
  const beat = j.beat ?? 'politics';
  const opts: { w: number; c: () => { headline: string; tone: NewsItem['tone']; about: boolean; body?: string } }[] = [];
  // על השחקן: רק אם הוא/היא מוכר/ת מספיק
  if (p.fame > 28) {
    const warm = j.attitude + leanAlignment(p.ideology, j.ideology) * 25;
    opts.push({
      w: 1 + p.fame / 40,
      c: () =>
        warm > 15
          ? { headline: pick(s, [`${j.name}: "${p.name} – ההפתעה הגדולה של הכנסת הזו"`, `${j.name} על ${p.name}: "יש פה מנהיגות אמיתית"`, `${j.name}: "שימו לב ל${p.name}. זה רק ההתחלה"`]), tone: 'good', about: true }
          : warm < -15
            ? { headline: pick(s, [`${j.name}: "${p.name} – הרבה רעש, מעט תוכן"`, `${j.name} נגד ${p.name}: "פופוליזם בהתגלמותו"`, `${j.name}: "${p.name} עוד ישלם על זה"`]), tone: 'bad', about: true }
            : { headline: pick(s, [`${j.name} מנתח/ת את המהלך של ${p.name}`, `${j.name}: "${p.name} מהמר/ת – ואולי זה ישתלם"`]), tone: 'neutral', about: true },
    });
  }
  // הממשלה
  opts.push({
    w: beat === 'politics' || beat === 'anchor' ? 3 : 1,
    c: () =>
      s.coalition.stability < 45
        ? { headline: pick(s, [`${j.name}: "הקואליציה של ${pm} לא תשרוד את המושב"`, `${j.name} חושף/ת: שיחות סודיות על ממשלה חלופית`, `${j.name}: "בלשכת ${pm} כבר מדברים על בחירות"`]), tone: 'neutral', about: false }
        : s.coalition.stability > 70
          ? { headline: pick(s, [`${j.name}: "${pm} חזק/ה מתמיד – והאופוזיציה מבולבלת"`, `${j.name}: "אין כרגע שום איום על הממשלה"`]), tone: 'neutral', about: false }
          : { headline: pick(s, [`${j.name}: "השבוע שבו ${pm} איבד/ה את השליטה על סדר היום"`, `${j.name} מסכם/ת את השבוע בכנסת`]), tone: 'neutral', about: false },
  });
  // סקרים
  const sv = latestSurvey(s);
  if (sv?.surprise) {
    const party = s.parties[sv.surprise.party];
    if (party) opts.push({ w: 2, c: () => ({ headline: pick(s, [`${j.name} על הסקר: "${party.name} בגל – אבל גלים נשברים"`, `${j.name}: "הזינוק של ${party.short} אמיתי. תתרגלו"`]), tone: 'neutral', about: party.id === p.partyId }) });
  }
  // משפט וחקירות
  if (beat === 'legal' || beat === 'investigative') {
    if (s.scandal) opts.push({ w: 5, c: () => ({ headline: `${j.name} חושף/ת: פרטים חדשים בחקירה נגד ${p.name}`, tone: 'bad', about: true }) });
    const pool = Object.values(s.npcs).filter((n) => n.isMK && n.notable && n.partyId);
    const target = pool.length ? pick(s, pool) : null;
    if (target)
      opts.push({
        w: beat === 'investigative' ? 3 : 1,
        c: () => {
          if (target.partyId && chance(s, 0.6)) addMomentum(s, target.partyId, -0.6);
          return { headline: `תחקיר ${j.name}: ${pick(s, ['המינויים של', 'הנסיעות של', 'הקשרים העסקיים של', 'התקציבים הקואליציוניים של'])} ${target.name}`, tone: 'neutral', about: false };
        },
      });
  }
  // ביטחון ומדיני
  if (beat === 'security') opts.push({ w: s.world.security < 45 ? 4 : 1.5, c: () => ({ headline: s.world.security < 45 ? `${j.name}: "מערכת הביטחון מזהירה – והדרג המדיני משותק"` : `${j.name} חושף/ת: מגעים חשאיים בערוץ המדיני`, tone: s.world.security < 45 ? 'bad' : 'neutral', about: false }) });
  // דת ומדינה
  if (beat === 'religion') opts.push({ w: s.issues.draft > 55 || s.issues.religion > 55 ? 4 : 1.5, c: () => ({ headline: s.issues.draft > 55 ? `${j.name}: "משבר הגיוס הוא פצצה מתקתקת – לכל הצדדים"` : `${j.name} על דת ומדינה: "השבוע נחצה עוד קו"`, tone: 'neutral', about: false }) });
  // מגיש/ה: ראיונות
  const guest = Object.values(s.npcs).filter((n) => n.isMK && n.notable);
  if (beat === 'anchor' && guest.length) opts.push({ w: 1.5, c: () => ({ headline: `הערב אצל ${j.name}: ${pick(s, ['העימות הגדול עם', 'ראיון בלעדי עם', 'השאלות הקשות ל'])} ${pick(s, guest).name}`, tone: 'neutral', about: false }) });
  const ch = pickWeighted(s, opts, (o) => o.w);
  return ch ? ch.c() : null;
}

/** כל שבוע: עיתונאי/ת אחד/ת (לפעמים שניים) כותב/ת טור או מגיש/ה פרשנות */
export function tickMedia(s: GameState) {
  const js = activeJournalists(s);
  if (!js.length) return;
  const count = (chance(s, 0.6) ? 1 : 0) + (chance(s, 0.2) ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const j = pickWeighted(s, js, (n) => n.influence);
    if (!j) continue;
    const col = makeColumn(s, j);
    if (!col) continue;
    addNews(s, col.headline, col.tone, col.about, col.body, j.outlet ?? j.title?.split(', ')[1]);
    s.news[0].byline = j.name;
    // מי שנכתב/ה עליו/ה – גם הציבור מגיב
    if (col.about && col.tone !== 'neutral') {
      const d = col.tone === 'good' ? 0.8 : -0.8;
      for (const k of Object.keys(s.player.approval) as (keyof typeof s.player.approval)[]) s.player.approval[k] = clamp(s.player.approval[k] + d * (1 - ideologyDistance(s.player.ideology, j.ideology)), 0, 100);
    }
  }
}
