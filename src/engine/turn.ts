import { isBudgetDeadline } from './calendar';
import { chance, pick } from './rng';
import { onBudgetPassed, tickCoalition, tickNegotiation } from './systems/coalition';
import { buildLists, callEarlyElections, runElection } from './systems/elections';
import { resetMinistryBudget, tickMinistry } from './systems/ministry';
import { rollEvents } from './systems/events';
import { isCoalition } from './systems/government';
import { releaseScheduled, tickIssues } from './systems/issues';
import { tickPartyDynamics } from './systems/mergers';
import { rollShocks } from './systems/shocks';
import { tickNpcs } from './systems/npcs';
import { checkMissions } from './systems/missions';
import { tickScandal } from './systems/scandals';
import { tickCareer } from './systems/legacy';
import { tickPresident } from './systems/president';
import { finishVote, queueBill, queueOtherVote, startVote, tickLegislation } from './systems/legislation';
import { radicalClimate } from './systems/climate';
import { BILL_TEMPLATES } from './data/bills';
import { inSession } from './calendar';
import { addNews, npcLabel } from './systems/news';
import { WORLD_NAMES, normalizePolls, pollSeats, tickWorld, updatePolls } from './systems/opinion';
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

/**
 * ממשלה שהרעיון "באוויר" בשבילה (תמימת דעים, רחבה או בחלון הזדמנויות) עשויה להעלות מהפכה בעצמה.
 * ח"כ מצביע/ה בהצבעה חיה; אחרת ההצבעה מתקיימת ברקע.
 */
function governmentRevolution(s: GameState) {
  if (s.negotiation || s.liveVote || s.coalition.pmId === 'player' || !s.npcs[s.coalition.pmId] || !inSession(s)) return;
  if (s.week - Number(s.flags.radInitAny ?? -999) < 26) return;
  const eligible = BILL_TEMPLATES.filter((t) => {
    if (!t.radical || (s.transforms ?? []).some((x) => x.id === t.radical)) return false;
    if (s.week - Number(s.flags[`radInit_${t.id}`] ?? -999) < 104) return false;
    const c = radicalClimate(s, t.id);
    return c.bonus >= 0.55 && c.coalAlign >= 0.45;
  });
  if (!eligible.length) return;
  const t = pick(s, eligible);
  const c = radicalClimate(s, t.id);
  if (!chance(s, 0.06 * c.bonus)) return;
  s.flags[`radInit_${t.id}`] = s.week;
  s.flags.radInitAny = s.week;
  addNews(s, `הממשלה מעלה להצבעה: "${t.title}". ${c.reasons.join(' · ')}`, 'neutral', false, undefined, 'ערוץ המשכן');
  if (s.player.isMK) queueOtherVote(s, s.coalition.pmId, t.id, 2);
  else {
    startVote(s, queueBill(s, s.coalition.pmId, t.id, 2), 'other');
    finishVote(s);
  }
}

/** סוף שבוע: כל מערכות העולם מתקדמות. */
export function endWeek(s: GameState) {
  if (s.liveVote) finishVote(s);
  if (s.eventQueue.length) return;
  const before = s.weekStart;
  const worldBefore = { ...s.world };
  const p = s.player;

  p.money += weeklyIncome(s);
  // מחזור החדשות שוכח, ומוניטין גבוה נשחק לאט
  if (p.fame > 20) p.fame = Math.max(20, p.fame - 0.2 - p.fame * 0.006);
  if (p.reputation > 60) p.reputation -= 0.15;
  if (p.money > 300) p.money -= (p.money - 300) * 0.02; // הוצאות מטה ופעילות
  tickStaff(s);
  // "למה זה קרה": מה הזיז את מצב המדינה השבוע
  const agg: Record<string, number> = {};
  for (const e of s.effects) {
    if (s.week < e.startWeek || e.weeksLeft <= 0) continue;
    const k = `${e.source === 'event' ? 'אירועים' : e.source}|${e.key}`;
    agg[k] = (agg[k] ?? 0) + e.perWeek;
  }
  const drivers = Object.entries(agg)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5)
    .filter(([, v]) => Math.abs(v) >= 0.05)
    .map(([k, v]) => {
      const [src, key] = k.split('|');
      return `${src}: ${WORLD_NAMES[key as keyof typeof WORLD_NAMES]} ${v > 0 ? '+' : ''}${v.toFixed(1)}`;
    });
  tickWorld(s);
  updatePolls(s);
  tickPartyDynamics(s);
  tickLegislation(s);
  tickIssues(s);
  tickNpcs(s);
  tickScandal(s);
  tickCareer(s);
  tickPresident(s);

  // קואליציה, משא ומתן ומשרד
  tickNegotiation(s);
  if (!s.negotiation) tickCoalition(s);
  if (s.flags.npcNoConfidence) {
    queueOtherVote(s, String(s.flags.npcNoConfidence), 'no_confidence', 2);
    delete s.flags.npcNoConfidence;
  }
  tickMinistry(s);
  // שלושה שבועות לפני התקציב: משא ומתן עם השותפות
  if (isBudgetDeadline(s, s.week + 3) && !s.negotiation && p.isMK) {
    if (s.coalition.pmId === 'player' || p.ministry === 'finance') s.eventQueue.push({ eventId: 'budget_talks', ctx: {} });
    else if (p.partyId && s.parties[p.partyId]?.leaderId === 'player' && isCoalition(s, p.partyId)) s.eventQueue.push({ eventId: 'budget_demand', ctx: {} });
  }
  if (isBudgetDeadline(s) && !s.negotiation) {
    // ח"כ: הצבעת תקציב חיה ומותחת. אחרת – לפי יציבות הקואליציה
    if (p.isMK) queueOtherVote(s, s.ministers.finance ?? s.coalition.pmId, 'budget_law', 2);
    else if (s.coalition.stability < 25) callEarlyElections(s, 'חוק התקציב לא עבר במועד');
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
  checkMissions(s);
  releaseScheduled(s);
  rollEvents(s);
  rollShocks(s);
  governmentRevolution(s);
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
  normalizePolls(s);
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
    drivers,
  };
  s.weekStart = after;
  if (p.money < -50 && !s.flags.debtWarned) {
    s.flags.debtWarned = true;
    log(s, 'החשבון בבנק במינוס עמוק. כדאי לגייס כספים.', 'system');
  }
}
