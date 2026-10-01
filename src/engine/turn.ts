import { isBudgetDeadline } from './calendar';
import { chance, pick } from './rng';
import { onBudgetPassed, tickCoalition, tickNegotiation } from './systems/coalition';
import { buildLists, callEarlyElections, runElection } from './systems/elections';
import { resetMinistryBudget, tickMinistry } from './systems/ministry';
import { rollEvents } from './systems/events';
import { isCoalition } from './systems/government';
import { tickLegislation } from './systems/legislation';
import { addNews, npcLabel } from './systems/news';
import { pollSeats, tickWorld, updatePolls } from './systems/opinion';
import { refreshPresence } from './systems/presence';
import { decayRelationships } from './systems/relationships';
import { log, snapshot } from './systems/report';
import { recomputeAp, tickStaff } from './systems/staff';
import type { GameState } from './types';
import { avgApproval } from './util';

const QUOTES = [
  'הממשלה הזו מנותקת מהעם',
  'לא ניתן לאופוזיציה לשתק את המדינה',
  'אנחנו לא נשב בממשלה בכל מחיר',
  'יוקר המחיה הוא האיום האסטרטגי הגדול',
  'הגיע הזמן לרפורמה אמיתית בשירות הציבורי',
  'הקואליציה הזו לא תשרוד את המושב',
  'אני לא מתרגש מסקרים',
  'מי שמתקיף את צה"ל מתקיף את כולנו',
];

function weeklyIncome(s: GameState): number {
  if (s.player.isMK) return 11;
  if (s.player.employerId) return 4;
  return 3; // עבודה במקצוע המקורי
}

function worldNews(s: GameState) {
  const mks = Object.values(s.npcs).filter((n) => n.isMK && n.notable);
  if (chance(s, 0.7)) {
    const n = pick(s, mks);
    addNews(s, `${npcLabel(s, n.id)}: "${pick(s, QUOTES)}"`, 'neutral');
  }
  const prev = s.pollHistory[s.pollHistory.length - 2]?.polls;
  if (prev && chance(s, 0.5)) {
    const parties = Object.values(s.parties).filter((p) => prev[p.id] !== undefined);
    const mover = parties.sort((a, b) => Math.abs(b.poll - prev[b.id]) - Math.abs(a.poll - prev[a.id]))[0];
    if (mover) {
      const up = mover.poll > prev[mover.id];
      addNews(s, `סקר: ${mover.name} ${up ? 'מתחזקת' : 'נחלשת'} – ${pollSeats(mover.poll)} מנדטים`, 'neutral', mover.id === s.player.partyId);
    }
  }
  const w = s.world;
  if (w.housing < 28 && chance(s, 0.2)) addNews(s, 'מחירי הדירות שברו שיא חדש; זוגות צעירים מוותרים על החלום', 'bad');
  if (w.security < 38 && chance(s, 0.25)) addNews(s, 'גורמי ביטחון מזהירים מהסלמה בכמה גזרות', 'bad');
  if (w.economy > 65 && chance(s, 0.2)) addNews(s, 'הצמיחה הפתיעה לטובה; הבורסה בשיא', 'good');
  if (s.coalition.stability < 35 && chance(s, 0.35)) addNews(s, 'גורם בכיר בקואליציה: "הממשלה לא תשרוד עד סוף המושב"', 'bad');
}

/** סוף שבוע: כל מערכות העולם מתקדמות. */
export function endWeek(s: GameState) {
  if (s.eventQueue.length) return;
  const before = s.weekStart;
  const worldBefore = { ...s.world };
  const p = s.player;

  p.money += weeklyIncome(s);
  tickStaff(s);
  tickWorld(s);
  updatePolls(s);
  tickLegislation(s);

  // קואליציה, משא ומתן ומשרד
  tickNegotiation(s);
  if (!s.negotiation) tickCoalition(s);
  tickMinistry(s);
  if (isBudgetDeadline(s) && !s.negotiation) {
    if (s.coalition.stability < 25) callEarlyElections(s, 'חוק התקציב לא עבר במועד');
    else {
      addNews(s, 'הכנסת אישרה את תקציב המדינה בקריאה שנייה ושלישית', 'neutral');
      onBudgetPassed(s);
      resetMinistryBudget(s);
      if (p.isMK && isCoalition(s, p.partyId)) p.capital += 2;
    }
  }

  // פריימריז ובחירות
  if (s.week + 1 === s.primariesWeek - 6 && p.partyId && !p.isMK && !s.parties[p.partyId].playerFounded && !p.wantsList) {
    s.eventQueue.push({ eventId: 'primaries_open', ctx: { party: p.partyId } });
  }

  decayRelationships(s);
  rollEvents(s);
  worldNews(s);

  s.week += 1;
  if (s.week === s.primariesWeek) {
    buildLists(s);
    addNews(s, 'נסגרו הרשימות לכנסת. הקמפיינים יוצאים לדרך', 'neutral');
  }
  if (s.week === s.electionWeek && !s.negotiation) {
    runElection(s);
    s.flags.showElection = true;
  }
  recomputeAp(s);
  p.ap = p.apMax + (s.flags.rested ? 1 : 0);
  delete s.flags.rested;
  refreshPresence(s);
  s.pollHistory.push({ week: s.week, polls: Object.fromEntries(Object.values(s.parties).map((x) => [x.id, x.poll])) });
  if (s.pollHistory.length > 260) s.pollHistory.shift();
  s.playerHistory.push({ week: s.week, fame: p.fame, approval: avgApproval(s), reputation: p.reputation });
  if (s.playerHistory.length > 260) s.playerHistory.shift();

  const after = snapshot(s);
  s.report = {
    week: s.week - 1,
    before,
    after,
    entries: s.log.filter((l) => l.week === s.week - 1 || (l.week === s.week && l.kind !== 'action')),
    worldBefore,
    worldAfter: { ...s.world },
  };
  s.weekStart = after;
  if (p.money < -50 && !s.flags.debtWarned) {
    s.flags.debtWarned = true;
    log(s, 'החשבון בבנק במינוס עמוק. כדאי לגייס כספים.', 'system');
  }
}
