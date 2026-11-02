// מצב פשוט (settings.simple): אירועים אקראיים "קטנים" מוכרעים אוטומטית לפי מה שהכי טוב לשחקן
// ועקבי עם העמדות שלו. השחקן רואה רק אירועים מתוזמנים, שרשראות ומשברים. ההחלטות נרשמות בדוח השבועי.
import type { GameState } from '../types';
import type { Ctx, Op } from '../ops';
import type { EventChoice } from '../data/events';
import { choiceBlocked, choiceOps, currentEvent, resolveEvent } from './events';
import { fill } from '../ops';
import { leanAlignment } from '../util';

export const isSimple = (s: GameState) => !!s.settings?.simple;

/** כמה בחירה "שווה" לשחקן: מדדים, תדמית, ועקביות עם האידיאולוגיה */
function opsValue(s: GameState, ops: Op[]): number {
  let v = 0;
  for (const o of ops) {
    switch (o.op) {
      case 'fame':
      case 'reputation':
      case 'partyStanding':
        v += o.d;
        break;
      case 'capital':
        v += o.d * 0.8;
        break;
      case 'consistency':
        v += o.d * 0.5;
        break;
      case 'money':
        v += o.d / 12;
        break;
      case 'approval':
        v += o.d * (o.sector === 'all' ? 1.5 : 0.4);
        break;
      case 'stance':
        // עמדה שתואמת את השחקן – טוב; סותרת – מחיר בעקביות ובבסיס
        v += leanAlignment(s.player.ideology, o.lean) * Math.abs(o.d) * 1.2;
        break;
      case 'skill':
        v += o.d * 0.3;
        break;
      case 'att':
        v += o.d * 0.05;
        break;
      case 'momentum':
      case 'poll':
        if (o.party === s.player.partyId || o.party === '@player') v += o.d * 1.5;
        break;
      case 'stability':
        if (s.player.partyId && s.coalition.parties.includes(s.player.partyId)) v += o.d * 0.1;
        break;
    }
  }
  return v;
}

function choiceValue(s: GameState, c: EventChoice, ctx: Ctx): number {
  const ok = opsValue(s, choiceOps(s, c, ctx));
  if (!c.chance) return ok;
  const p = Math.max(0.05, Math.min(0.95, c.chance.p(s, ctx)));
  return p * ok + (1 - p) * opsValue(s, c.chance.fail);
}

/** הבחירה שהטייס האוטומטי היה עושה באירוע שבראש התור */
export function autoChoice(s: GameState): number {
  const cur = currentEvent(s);
  if (!cur) return -1;
  let best = -1;
  let bestV = -Infinity;
  cur.ev.choices.forEach((c, i) => {
    if (choiceBlocked(s, c, cur.ctx)) return;
    const v = choiceValue(s, c, cur.ctx);
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  });
  return best;
}

/**
 * מכריע את האירועים שבתור מהמקום `from` והלאה (מה שההגרלה השבועית הוסיפה).
 * אירועי המשך שנכנסים לראש התור נשארים לשחקן.
 */
export function autoResolveFrom(s: GameState, from: number) {
  if (!isSimple(s)) return;
  const items = s.eventQueue.slice(from);
  s.eventQueue.splice(from);
  const rest = [...s.eventQueue];
  for (const it of items) {
    s.eventQueue = [it];
    const cur = currentEvent(s);
    if (!cur) continue;
    const idx = autoChoice(s);
    if (idx < 0) {
      rest.push(it);
      continue;
    }
    const title = fill(s, cur.ev.title, cur.ctx);
    const choice = cur.ev.choices[idx].label;
    const res = resolveEvent(s, idx);
    // אירוע המשך שנוצר – נשאר לשחקן
    rest.push(...s.eventQueue);
    s.autoDecisions.push({ week: s.week, title, choice, line: res.lines[0] ?? '' });
  }
  s.eventQueue = rest;
  if (s.autoDecisions.length > 30) s.autoDecisions.splice(0, s.autoDecisions.length - 30);
}
