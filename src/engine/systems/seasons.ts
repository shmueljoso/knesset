// עונות: כל שנה (52 שבועות) – 3 יעדים לפי התפקיד, תגמול על כל יעד, וסיכום עונה עם ציון.
// העונה הראשונה היא "עונת הכרות" עם יעדים קלים. הבחירה בין יעדים משתמשת במקור אקראיות מקומי קבוע
// (לא ב-rand(s)), כדי שהוספת העונות לא תשנה את מהלך המשחק עצמו.
import type { GameState, SeasonGoal, SeasonGoalKind, SeasonReview } from '../types';
import { makeLocalRng } from '../rng';
import { avgApproval } from '../util';
import { addStat } from '../stats';
import { log } from './report';
import { pollSeats } from './opinion';

export const SEASON_WEEKS = 52;

const isPres = (s: GameState) => !!s.presidency && s.president?.id === 'player';

/** הערך הנוכחי של כל סוג יעד */
export function goalMetric(s: GameState, k: SeasonGoalKind, start: number): number {
  const p = s.player;
  switch (k) {
    case 'fame':
      return p.fame;
    case 'approval':
      return avgApproval(s);
    case 'reputation':
      return p.reputation;
    case 'standing':
      return p.partyStanding;
    case 'capital':
      return p.capital;
    case 'laws':
      return s.lawsPassed.filter((l) => (l.sponsor === 'player' || l.coSponsor) && l.week >= start).length;
    case 'bills':
      return s.bills.filter((b) => b.sponsor === 'player' && (b.history?.[0]?.week ?? -1) >= start).length;
    case 'seats':
      return p.partyId ? pollSeats(s.parties[p.partyId]?.poll ?? 0, s.rules.threshold) : 0;
    case 'stability':
      return s.coalition.stability;
    case 'ministry':
      return s.ministryState?.performance ?? 0;
    case 'onList':
      return p.isMK || p.wantsList ? 1 : 0;
    case 'allies':
      return Object.values(s.npcs).filter((n) => n.attitude >= 40).length;
    case 'unity':
      return s.presidency?.unity ?? 0;
  }
}

const NAMES: Record<SeasonGoalKind, (t: number) => string> = {
  fame: (t) => `להגיע למוכרות ${t}`,
  approval: (t) => `להגיע לתדמית ${t}`,
  reputation: (t) => `להגיע למוניטין ${t}`,
  standing: (t) => `להגיע למעמד ${t} במפלגה`,
  capital: (t) => `לצבור ${t} הון פוליטי`,
  laws: (t) => (t === 1 ? 'להעביר חוק בשלוש קריאות' : `להעביר ${t} חוקים`),
  bills: (t) => `להגיש ${t} הצעות חוק`,
  seats: (t) => `להביא את המפלגה ל-${t} מנדטים בסקרים`,
  stability: (t) => `להחזיק את הקואליציה ביציבות ${t}+`,
  ministry: (t) => `להביא את המשרד לביצועים ${t}`,
  onList: () => 'להיכנס למרוץ לרשימה (או לכנסת)',
  allies: (t) => `${t} בעלי ברית (יחס 40+)`,
  unity: (t) => `להביא את אחדות העם ל-${t}`,
};

const ICON: Record<SeasonGoalKind, string> = {
  fame: '📣', approval: '🪞', reputation: '🎖️', standing: '🏛️', capital: '💎', laws: '📜', bills: '✍️',
  seats: '📈', stability: '🤝', ministry: '🏢', onList: '🗳️', allies: '🫂', unity: '🕊️',
};

/** כמה להוסיף מעל הערך הנוכחי (עונת היכרות – פחות) */
function targetFor(s: GameState, k: SeasonGoalKind, easy: boolean): number {
  const cur = goalMetric(s, k, s.week);
  const f = easy ? 0.6 : 1;
  const cap = (v: number) => Math.min(95, Math.round(v));
  switch (k) {
    case 'fame':
      return cap(cur + 14 * f);
    case 'approval':
      return cap(cur + 5 * f);
    case 'reputation':
      return cap(cur + 12 * f);
    case 'standing':
      return cap(cur + 14 * f);
    case 'capital':
      return Math.round(cur + 15 * f);
    case 'laws':
      return 1;
    case 'bills':
      return easy ? 1 : 2;
    case 'seats':
      return Math.max(5, Math.round(cur + (easy ? 1 : 2)));
    case 'stability':
      return Math.max(50, Math.min(75, Math.round(cur + 5)));
    case 'ministry':
      return cap(Math.max(60, cur + 10));
    case 'onList':
      return 1;
    case 'allies':
      return Math.round(cur + (easy ? 2 : 3));
    case 'unity':
      return cap(cur + 8);
  }
}

/** אילו יעדים מתאימים לתפקיד עכשיו (לפי סדר עדיפות) */
function candidates(s: GameState): SeasonGoalKind[] {
  const p = s.player;
  if (isPres(s)) return ['unity', 'approval', 'reputation'];
  const leader = !!p.partyId && s.parties[p.partyId]?.leaderId === 'player';
  if (s.coalition.pmId === 'player') return ['stability', 'seats', 'laws', 'approval'];
  if (p.ministry) return ['ministry', 'approval', 'laws', 'standing'];
  if (leader) return ['seats', 'approval', 'laws', 'allies'];
  if (p.isMK) return ['laws', 'fame', 'reputation', 'standing', 'bills', 'allies'];
  if (!p.partyId) return ['fame', 'approval', 'allies'];
  return ['onList', 'fame', 'standing', 'approval', 'allies'];
}

function makeGoals(s: GameState, n: number): SeasonGoal[] {
  const easy = n === 1;
  const cand = candidates(s).filter((k) => goalMetric(s, k, s.week) < targetFor(s, k, easy));
  const r = makeLocalRng(s.seed * 31 + n * 977);
  // הראשון תמיד היעד המרכזי של התפקיד; השניים האחרים – הגרלה מהשאר
  const first = cand[0];
  const rest = cand.slice(1).sort(() => r() - 0.5);
  return [first, ...rest]
    .filter(Boolean)
    .slice(0, 3)
    .map((k) => {
      const target = targetFor(s, k, easy);
      return { kind: k, target, from: Math.round(goalMetric(s, k, s.week) * 10) / 10, text: `${ICON[k]} ${NAMES[k](target)}`, done: false };
    });
}

export function startSeason(s: GameState, n: number) {
  s.season = { n, start: s.week, goals: makeGoals(s, n) };
}

export function seasonProgress(s: GameState, g: SeasonGoal): number {
  if (g.done) return 1;
  const cur = goalMetric(s, g.kind, s.season.start);
  const span = g.target - g.from;
  if (span <= 0) return cur >= g.target ? 1 : 0;
  return Math.max(0, Math.min(1, (cur - g.from) / span));
}

const GRADE = (done: number, total: number) => {
  const r = total ? done / total : 0;
  return r >= 1 ? 'A' : r >= 0.66 ? 'B' : r >= 0.33 ? 'C' : 'D';
};
export const GRADE_TEXT: Record<string, string> = {
  A: 'עונה מצוינת – כל היעדים הושגו',
  B: 'עונה טובה',
  C: 'עונה בינונית',
  D: 'עונה חלשה – צריך תכנית חדשה',
};

/** שבועי: יעד שהושג – תגמול מיד; סוף עונה – סיכום ועונה חדשה */
export function tickSeason(s: GameState) {
  if (!s.season) startSeason(s, 1);
  const se = s.season;
  for (const g of se.goals) {
    if (g.done || goalMetric(s, g.kind, se.start) < g.target) continue;
    g.done = true;
    g.week = s.week;
    s.player.capital += 4;
    addStat(s, 'reputation', 1.5);
    log(s, `🏁 יעד העונה הושג: ${g.text} (+4 הון פוליטי)`, 'career');
  }
  if (s.week - se.start < SEASON_WEEKS) return;
  const done = se.goals.filter((g) => g.done).length;
  const grade = GRADE(done, se.goals.length);
  const startFame = s.playerHistory.find((h) => h.week >= se.start)?.fame ?? s.player.fame;
  const review: SeasonReview = {
    n: se.n,
    start: se.start,
    end: s.week,
    grade,
    done,
    total: se.goals.length,
    goals: se.goals.map((g) => ({ text: g.text, done: g.done })),
    laws: s.lawsPassed.filter((l) => (l.sponsor === 'player' || l.coSponsor) && l.week >= se.start).length,
    fameDelta: Math.round(s.player.fame - startFame),
  };
  if (grade === 'A') s.player.capital += 6;
  s.seasonLog.push(review);
  if (s.seasonLog.length > 40) s.seasonLog.shift();
  startSeason(s, se.n + 1);
  s.flags.showSeason = true;
  log(s, `📅 סוף עונה ${se.n}: ציון ${grade} (${done}/${se.goals.length} יעדים)`, 'career');
}

