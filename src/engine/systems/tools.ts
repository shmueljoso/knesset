// כלי משחק מתקדמים (⚠️): דילוג על שבועות עם החלטות אוטומטיות, ועריכת מספרים. מסמנים בשמירה שהם שימשו.
import { endWeek } from '../turn';
import type { GameState, IssueId, Sector, WorldKey } from '../types';
import { SECTORS, clamp } from '../util';
import { currentEvent, choiceBlocked, resolveEvent } from './events';
import { finishVote } from './legislation';
import { normalizePolls } from './opinion';
import { SECTOR_LABEL } from './society';
import { ISSUES } from '../data/issues';

export const SKIP_OPTIONS = [1, 4, 13, 26, 52];

/** מחליט אוטומטית על אירוע: הבחירה הראשונה שזמינה ולא מסתמכת על מזל; אחרת הראשונה שזמינה */
function autoChoice(s: GameState): number {
  const cur = currentEvent(s);
  if (!cur) return 0;
  const free = cur.ev.choices.findIndex((c) => !choiceBlocked(s, c, cur.ctx) && !c.chance);
  if (free >= 0) return free;
  const any = cur.ev.choices.findIndex((c) => !choiceBlocked(s, c, cur.ctx));
  return Math.max(0, any);
}

export interface SkipResult {
  weeks: number;
  events: number;
  stopped: string | null;
}

/** מדלג על עד n שבועות. נעצר לפני בחירות, משא ומתן קואליציוני וסוף משחק */
export function skipWeeks(s: GameState, n: number): SkipResult {
  let weeks = 0;
  let events = 0;
  let stopped: string | null = null;
  for (let i = 0; i < n; i++) {
    if (s.gameOver) {
      stopped = 'המשחק הסתיים';
      break;
    }
    let guard = 0;
    while ((s.liveVote || s.eventQueue.length) && guard++ < 40) {
      if (s.liveVote) {
        finishVote(s);
        continue;
      }
      if (!currentEvent(s)) break;
      resolveEvent(s, autoChoice(s));
      events++;
    }
    s.eventQueue = [];
    delete s.flags.showPrimaries;
    delete s.flags.showPresident;
    if (s.negotiation) {
      stopped = 'משא ומתן קואליציוני – החלטה שלך';
      break;
    }
    endWeek(s);
    weeks++;
    if (s.flags.showElection) {
      stopped = 'ליל בחירות';
      break;
    }
  }
  if (weeks) {
    s.flags.skippedWeeks = Number(s.flags.skippedWeeks ?? 0) + weeks;
    s.flags.usedTools = true;
  }
  return { weeks, events, stopped };
}

export interface EditField {
  id: string;
  group: string;
  label: string;
  min: number;
  max: number;
  get: (s: GameState) => number;
}

const round = (v: number) => Math.round(v * 10) / 10;

export function editFields(s: GameState): EditField[] {
  const out: EditField[] = [];
  const P: [string, string, number, number][] = [
    ['money', 'כסף (אלפי ₪)', -500, 20000],
    ['fame', 'מוכרות', 0, 100],
    ['reputation', 'מוניטין', 0, 100],
    ['capital', 'הון פוליטי', 0, 2000],
    ['partyStanding', 'מעמד במפלגה', 0, 100],
    ['consistency', 'עקביות', 0, 100],
  ];
  for (const [k, label, min, max] of P) out.push({ id: `player.${k}`, group: 'את/ה', label, min, max, get: (g) => round(g.player[k as 'money']) });
  for (const sec of SECTORS) out.push({ id: `approval.${sec}`, group: 'תדמית במגזרים', label: SECTOR_LABEL[sec], min: 0, max: 100, get: (g) => round(g.player.approval[sec]) });
  const W: [WorldKey, string][] = [['economy', 'כלכלה'], ['affordability', 'יוקר המחיה'], ['housing', 'דיור'], ['security', 'ביטחון'], ['trust', 'אמון במוסדות'], ['cohesion', 'לכידות']];
  for (const [k, label] of W) out.push({ id: `world.${k}`, group: 'מצב המדינה', label, min: 0, max: 100, get: (g) => round(g.world[k]) });
  for (const i of ISSUES) out.push({ id: `issue.${i.id}`, group: 'סוגיות בוערות', label: `${i.icon} ${i.name}`, min: 0, max: 100, get: (g) => round(g.issues[i.id]) });
  const M: [string, string][] = [['security', 'רוח הציבור: ביטחון (+ ניצי)'], ['econ', 'רוח הציבור: כלכלה (+ שוק)'], ['religion', 'רוח הציבור: דת (+ דתי)'], ['judiciary', 'רוח הציבור: מערכת המשפט (+ זעם)']];
  for (const [k, label] of M) out.push({ id: `mood.${k}`, group: 'רוח הציבור', label, min: -50, max: 50, get: (g) => round(g.mood[k as 'econ']) });
  out.push({ id: 'stability', group: 'קואליציה', label: 'יציבות הקואליציה', min: 0, max: 100, get: (g) => round(g.coalition.stability) });
  for (const sec of SECTORS) out.push({ id: `demo.${sec}`, group: 'הרכב האוכלוסייה (1 = כמו בהתחלה)', label: SECTOR_LABEL[sec], min: 0.4, max: 2.5, get: (g) => Math.round(g.demo[sec] * 100) / 100 });
  for (const p of Object.values(s.parties)) out.push({ id: `party.${p.id}`, group: 'סקרים: אחוז תמיכה במפלגה', label: p.name, min: 0, max: 60, get: (g) => round(g.parties[p.id]?.poll ?? 0) });
  return out;
}

/** עריכת מספר בודד. מחזיר false אם השדה לא קיים */
export function setEdit(s: GameState, id: string, raw: number): boolean {
  const f = editFields(s).find((x) => x.id === id);
  if (!f || !Number.isFinite(raw)) return false;
  const v = clamp(raw, f.min, f.max);
  const [kind, key] = id.split('.');
  if (kind === 'player') (s.player as unknown as Record<string, number>)[key] = v;
  else if (kind === 'approval') s.player.approval[key as Sector] = v;
  else if (kind === 'world') s.world[key as WorldKey] = v;
  else if (kind === 'issue') s.issues[key as IssueId] = v;
  else if (kind === 'mood') s.mood[key as 'econ'] = v;
  else if (kind === 'demo') s.demo[key as Sector] = v;
  else if (id === 'stability') s.coalition.stability = v;
  else if (kind === 'party' && s.parties[key]) {
    s.parties[key].base = v;
    s.parties[key].poll = v;
    s.parties[key].momentum = 0;
    normalizePolls(s);
  } else return false;
  s.flags.usedTools = true;
  s.flags.editCount = Number(s.flags.editCount ?? 0) + 1;
  return true;
}
