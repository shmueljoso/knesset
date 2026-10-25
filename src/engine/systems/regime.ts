// כללי המשחק שחוקים משנים בפועל: החוק הנורבגי, הגבלת כהונה, חוקים שנחסמים במדינה שהשתנתה,
// ובחירה ישירה לראשות הממשלה.
import { templateById } from '../data/bills';
import { TRANSFORM_INFO } from '../data/transforms';
import { spawnCandidate } from '../newGame';
import { rand } from '../rng';
import type { GameState, PmRace, TransformId } from '../types';
import { ideologyDistance } from '../util';
import { MINISTRIES } from './government';
import { addNews } from './news';
import { log } from './report';

// ---------------- החוק הנורבגי ----------------

export const norwegianLimit = (s: GameState) => (s.rules.norwegian ? s.rules.norwegianLimit ?? 5 : 0);

// פונקציה ולא קבוע: government.ts מייבא את המודול הזה (מעגל ייבוא)
const isMinistry = (id: string | undefined) => !!id && MINISTRIES.some((m) => m.id === id);

/** השר/ה מתפטר/ת מהכנסת; הבא/ה ברשימה נכנס/ת (גם השחקן, אם הוא/היא הבא/ה בתור) */
function swapOut(s: GameState, ministerId: string): boolean {
  const n = s.npcs[ministerId];
  const party = n?.partyId ? s.parties[n.partyId] : null;
  if (!n || !party || !s.seating.includes(ministerId)) return false;
  const swapped = new Set([...Object.keys(s.norwegianSwaps), ...Object.values(s.norwegianSwaps)]);
  let next = party.list.find((x) =>
    x === 'player'
      ? s.player.partyId === party.id && !s.player.isMK && !s.player.defector
      : x !== ministerId && !!s.npcs[x] && !s.npcs[x].isMK && !swapped.has(x) && s.npcs[x].partyId === party.id,
  );
  if (!next) next = spawnCandidate(s, party.id).id;
  n.isMK = false;
  s.seating = s.seating.map((x) => (x === ministerId ? next! : x));
  s.norwegianSwaps[ministerId] = next;
  if (next === 'player') {
    s.player.isMK = true;
    s.player.rank = s.player.ministry ? s.player.rank : 'mk';
    s.player.employerId = null;
    if (!s.player.achievements.includes('elected')) s.player.achievements.push('elected');
    addNews(s, `החוק הנורבגי: ${n.name} התפטר/ה מהכנסת ו${s.player.name} נכנס/ת במקומו/ה`, 'good', true);
    log(s, `החוק הנורבגי: ${n.name} פינה/תה מושב – ונכנסת לכנסת! המושב שלך תלוי בכך שהוא/היא נשאר/ת בממשלה.`, 'career');
  } else {
    const r = s.npcs[next];
    r.isMK = true;
    r.role = 'mk';
  }
  return true;
}

/** השר/ה חוזר/ת לכנסת (סיים/ה את התפקיד), ומי שנכנס/ה במקומו/ה יוצא/ת */
function swapBack(s: GameState, ministerId: string) {
  const repl = s.norwegianSwaps[ministerId];
  delete s.norwegianSwaps[ministerId];
  const n = s.npcs[ministerId];
  if (!repl) return;
  // השר/ה כבר חזר/ה לכנסת בדרך אחרת (למשל במקום ח"כ שהתפטר/ה) – מי שנכנס/ה נשאר/ת
  if (s.seating.includes(ministerId)) return;
  const back = !!n && !!n.partyId && s.parties[n.partyId]?.seats > 0;
  if (back) n.isMK = true;
  const into = back ? ministerId : repl;
  s.seating = s.seating.map((x) => (x === repl ? into : x));
  for (const c of s.committees) {
    c.members = c.members.map((m) => (m === repl ? into : m));
    if (c.chairId === repl) c.chairId = into;
  }
  if (!back) return;
  if (repl === 'player') {
    s.player.isMK = false;
    s.player.committees = [];
    if (!s.player.ministry) s.player.rank = s.player.partyId ? 'activist' : 'citizen';
    addNews(s, `${n.name} חוזר/ת לכנסת – ו${s.player.name} מאבד/ת את המושב הנורבגי`, 'bad', true);
    log(s, `${n.name} סיים/ה את התפקיד בממשלה וחזר/ה לכנסת. איבדת את המושב.`, 'career');
  } else if (s.npcs[repl]) {
    s.npcs[repl].isMK = false;
    s.npcs[repl].role = 'candidate';
  }
}

export function restoreNorwegian(s: GameState) {
  for (const id of Object.keys(s.norwegianSwaps ?? {})) swapBack(s, id);
}

/** כל שבוע ובהקמת ממשלה: שרים בתפקיד מפנים מושבים (עד המכסה), ושרים לשעבר חוזרים */
export function applyNorwegian(s: GameState) {
  s.norwegianSwaps ??= {};
  const limit = norwegianLimit(s);
  for (const id of Object.keys(s.norwegianSwaps)) {
    const n = s.npcs[id];
    if (!limit || !isMinistry(n?.ministry) || !s.coalition.parties.includes(n.partyId ?? '')) swapBack(s, id);
  }
  if (!limit) return;
  for (const pid of s.coalition.parties) {
    let used = Object.keys(s.norwegianSwaps).filter((id) => s.npcs[id]?.partyId === pid).length;
    const ministers = Object.values(s.npcs)
      .filter((n) => n.partyId === pid && n.isMK && isMinistry(n.ministry) && !s.norwegianSwaps[n.id])
      .sort((a, b) => a.influence - b.influence || a.id.localeCompare(b.id));
    for (const m of ministers) {
      if (used >= limit) break;
      if (swapOut(s, m.id)) used++;
    }
  }
}

// ---------------- הגבלת כהונה ----------------

/** האם החוק אוסר על מישהו/י לכהן שוב כראש ממשלה */
export function termLimited(s: GameState, id: string): boolean {
  if (!s.rules.termLimit) return false;
  const t = s.pmTerms?.[id];
  if (!t) return false;
  const scope = s.rules.termLimitScope ?? 2;
  return scope === 1 ? t.streak >= 3 : scope === 2 ? t.streak >= 2 : t.total >= 2;
}

export const termLimitText = (s: GameState) =>
  ['שלוש קדנציות רצופות', 'שתי קדנציות רצופות', 'שתי קדנציות לכל החיים'][(s.rules.termLimitScope ?? 2) - 1];

/** ביום הבחירות: ראש הממשלה היוצא/ת "סוגר/ת" קדנציה */
export function recordPmTerm(s: GameState) {
  s.pmTerms ??= {};
  const pm = s.coalition.pmId;
  if (!pm || (pm !== 'player' && !s.npcs[pm])) return;
  for (const [id, t] of Object.entries(s.pmTerms)) if (id !== pm) t.streak = 0;
  const t = (s.pmTerms[pm] ??= { total: 0, streak: 0 });
  t.total += 1;
  t.streak += 1;
}

/** מי יעמוד/תעמוד בראש הממשלה מטעם המפלגה: היו"ר, או – אם נחסם/ה בהגבלת הכהונה – הבכיר/ה הבא/ה */
export function pmFor(s: GameState, partyId: string): string {
  const party = s.parties[partyId];
  if (!termLimited(s, party.leaderId)) return party.leaderId;
  const alt = Object.values(s.npcs)
    .filter((n) => n.partyId === partyId && n.isMK && n.id !== party.leaderId && !termLimited(s, n.id))
    .sort((a, b) => b.influence - a.influence)[0];
  return alt?.id ?? party.leaderId;
}

/** לפני הבחירות: מפלגה שהיו"ר שלה חסום/ה בוחרת מנהיג/ה חדש/ה (השחקן נשאר/ת יו"ר, אבל לא יכול/ה להיות ראש ממשלה) */
export function enforceTermLimit(s: GameState) {
  if (!s.rules.termLimit) return;
  for (const party of Object.values(s.parties)) {
    const leader = party.leaderId;
    if (leader === 'player' || !termLimited(s, leader)) continue;
    const alt = party.list
      .map((id) => s.npcs[id])
      .filter((n) => n && n.id !== leader && !termLimited(s, n.id))
      .sort((a, b) => b.influence - a.influence)[0];
    if (!alt) continue;
    party.leaderId = alt.id;
    party.list = [alt.id, ...party.list.filter((x) => x !== alt.id)];
    addNews(s, `הגבלת הכהונה: ${s.npcs[leader]?.name} לא יכול/ה לרוץ שוב. ${alt.name} מוביל/ה את ${party.name}`, 'neutral', false, undefined, 'ערוץ המשכן');
  }
  if (termLimited(s, 'player')) log(s, `הגבלת הכהונה (${termLimitText(s)}): לא תוכל/י לכהן שוב כראש הממשלה.`, 'career');
}

// ---------------- חוקים שהמדינה החדשה חוסמת ----------------

/** מהפכות שמבטלות זו את זו: כשאחת עוברת, השנייה מתבטלת */
export const TRANSFORM_CONFLICTS: Partial<Record<TransformId, TransformId[]>> = {
  peace: ['annexation'],
  annexation: ['peace'],
  halacha: ['secular', 'citizens'],
  secular: ['halacha'],
  citizens: ['halacha'],
  ubi: ['libertarian'],
  libertarian: ['ubi'],
  sovereignty: ['constitution'],
  constitution: ['sovereignty'],
};

const activeScope = (s: GameState, id: TransformId) => (s.transforms ?? []).find((t) => t.id === id)?.scope ?? 0;

/** למה אי אפשר להגיש את ההצעה במדינה שהשתנתה (או null) */
export function billBlocked(s: GameState, templateId: string): string | null {
  const halacha = activeScope(s, 'halacha');
  if (halacha && (halacha === 1 ? ['civil', 'conversion'] : ['shabbat', 'civil', 'cannabis', 'conversion', 'basic_dignity']).includes(templateId))
    return `${TRANSFORM_INFO.halacha.icon} במדינת הלכה החוק סותר את חוק יסוד: התורה`;
  const secular = activeScope(s, 'secular');
  if (secular === 3 && templateId === 'yeshiva') return `${TRANSFORM_INFO.secular.icon} אחרי הפרדת הדת מהמדינה אין תקצוב לישיבות`;
  if (secular && ['civil', 'shabbat'].includes(templateId)) return `${TRANSFORM_INFO.secular.icon} כבר בתוקף – חלק מהפרדת הדת מהמדינה`;
  if (activeScope(s, 'volunteer') >= 2 && ['draft', 'yeshiva'].includes(templateId)) return `${TRANSFORM_INFO.volunteer.icon} אין יותר גיוס חובה – אין על מה לחוקק`;
  const t = templateById(templateId);
  if (t?.rule === 'override' && s.rules.noReview) return 'אין ביקורת שיפוטית – אין מה "להתגבר" עליו';
  return null;
}

/** האם החוקה מחייבת משאל עם לשינוי משטר */
export const constitutionReferendum = (s: GameState, templateId: string) => {
  const t = templateById(templateId);
  return !!t?.radical && t.radical !== 'constitution' && activeScope(s, 'constitution') === 3;
};

/** האם הכנסת יכולה להפיל את הממשלה באי-אמון (או למה לא) */
export function noConfidenceFrozen(s: GameState): string | null {
  if (s.rules.presidential) return 'בשיטה הנשיאותית הכנסת לא יכולה להפיל את הממשלה באי-אמון.';
  if (activeScope(s, 'emergency') === 3) return 'תקנות שעת החירום מקפיאות הצבעות אי-אמון.';
  return null;
}

// ---------------- בחירה ישירה לראשות הממשלה ----------------

export const directElection = (s: GameState) => !!(s.rules.directPM || s.rules.presidential);

const candName = (s: GameState, id: string) => (id === 'player' ? s.player.name : s.npcs[id]?.name ?? '?');
export const pmRaceLabel = candName;

/** הכוח האישי של מועמד/ת: מוכרות ומוניטין לשחקן, השפעה ל-NPC */
function appeal(s: GameState, id: string): number {
  if (id === 'player') return (s.player.fame - 50) / 35 + (s.player.reputation - 50) / 60;
  return ((s.npcs[id]?.influence ?? 50) - 50) / 40;
}

function shares(s: GameState, cands: string[], parties: Record<string, string>, votes: Record<string, number>, noise: number[]): number[] {
  const out = cands.map(() => 0);
  const total = Object.values(votes).reduce((a, b) => a + b, 0) || 1;
  for (const [pid, v] of Object.entries(votes)) {
    const voter = s.parties[pid];
    if (!voter || !v) continue;
    const w = cands.map((c, i) => {
      const cp = s.parties[parties[c]];
      let score = -ideologyDistance(voter.ideology, cp.ideology) * 4.5 + appeal(s, c) + noise[i];
      if (cp.id === pid) score += 2;
      return Math.exp(score);
    });
    const sum = w.reduce((a, b) => a + b, 0);
    w.forEach((x, i) => (out[i] += (x / sum) * (v / total) * 100));
  }
  return out.map((x) => Math.round(x * 10) / 10);
}

/**
 * ליל הבחירות בשיטה ישירה: יו"רי שתי הרשימות הגדולות (והשחקן, אם הוא/היא מוביל/ה רשימה גדולה).
 * אם אף אחד/ת לא עבר/ה 50% – סיבוב שני בין שני המובילים.
 */
export function runPmRace(s: GameState, votes: Record<string, number>): PmRace | null {
  if (!directElection(s)) return null;
  const ranked = Object.values(s.parties)
    .filter((p) => p.seats > 0)
    .sort((a, b) => (votes[b.id] ?? 0) - (votes[a.id] ?? 0));
  const parties: Record<string, string> = {};
  const cands: string[] = [];
  for (const p of ranked) {
    if (cands.length >= 2) break;
    const id = pmFor(s, p.id);
    if (termLimited(s, id) || (id !== 'player' && !s.npcs[id])) continue;
    cands.push(id);
    parties[id] = p.id;
  }
  const mine = s.player.partyId ? s.parties[s.player.partyId] : null;
  if (mine && mine.leaderId === 'player' && mine.seats >= 6 && !cands.includes('player') && !termLimited(s, 'player')) {
    cands.push('player');
    parties.player = mine.id;
  }
  if (cands.length < 2) return null;
  const noise = cands.map(() => (rand(s) - 0.5) * 0.8);
  const rounds: PmRace['rounds'] = [];
  const first = shares(s, cands, parties, votes, noise);
  rounds.push({ candidates: cands, pct: first });
  let best = first.indexOf(Math.max(...first));
  let winner = cands[best];
  if (first[best] <= 50 && cands.length > 2) {
    const top = cands.map((c, i) => ({ c, i, p: first[i] })).sort((a, b) => b.p - a.p).slice(0, 2);
    const second = shares(s, top.map((x) => x.c), parties, votes, top.map((x) => noise[x.i]));
    rounds.push({ candidates: top.map((x) => x.c), pct: second });
    best = second.indexOf(Math.max(...second));
    winner = top[best].c;
  }
  const last = rounds[rounds.length - 1];
  const pct = last.pct[last.candidates.indexOf(winner)];
  addNews(s, `${candName(s, winner)} נבחר/ה לראשות הממשלה בבחירה ישירה (${pct}%)${rounds.length > 1 ? ' – בסיבוב השני' : ''}`, winner === 'player' ? 'good' : 'neutral', cands.includes('player'), undefined, 'ערוץ המשכן');
  if (winner === 'player') log(s, `נבחרת לראשות הממשלה בבחירה ישירה, עם ${pct}% מהקולות!`, 'career');
  else if (cands.includes('player')) log(s, `הפסדת במרוץ לראשות הממשלה ל${candName(s, winner)}.`, 'career');
  return { rounds, winner, parties };
}

/** המפלגה של ראש הממשלה שנבחר/ה ישירות בבחירות האחרונות (אם יש) – הקואליציה נבנית סביבה */
export function electedLead(s: GameState): string | null {
  const r = s.lastElection?.pmRace;
  if (!r || !directElection(s)) return null;
  const pid = r.parties[r.winner];
  return pid && s.parties[pid]?.seats > 0 ? pid : null;
}

/** כללי המשחק שבתוקף והשפעתם בפועל – לתצוגה בלוח */
export function activeRuleNotes(s: GameState): { icon: string; title: string; text: string }[] {
  const r = s.rules;
  const out: { icon: string; title: string; text: string }[] = [];
  if (r.presidential)
    out.push({ icon: '🏛️', title: 'שיטה נשיאותית', text: 'בליל הבחירות יש מרוץ ישיר לראשות הממשלה. הזוכה מרכיב/ה ממשלה גם בלי 61, ומכהן/ת 4 שנים: אין אי-אמון ואין בחירות מוקדמות.' });
  else if (r.directPM)
    out.push({ icon: '🗳️', title: 'בחירה ישירה לראשות הממשלה', text: 'בליל הבחירות יש מרוץ ראש בראש. הזוכה מרכיב/ה, גם אם המפלגה שלו/ה לא הגדולה. אי-אמון מוביל לבחירות, ופיצול הפתק מחליש את המפלגות הגדולות.' });
  if (r.districts) out.push({ icon: '🗺️', title: 'מחוזות בחירה', text: 'בבחירות המפלגות הגדולות מקבלות יותר מנדטים מחלקן בקולות, והקטנות נמחקות.' });
  if (r.threshold > 3.25) out.push({ icon: '🚧', title: `אחוז חסימה ${r.threshold}%`, text: `רשימה מתחת ל-${r.threshold}% לא נכנסת לכנסת. מפלגות קטנות נאלצות להתאחד – או נעלמות.` });
  else if (r.threshold < 3.25) out.push({ icon: '🪜', title: `אחוז חסימה ${r.threshold}%`, text: `גם רשימה עם ${r.threshold}% נכנסת לכנסת: יותר מפלגות קטנות, וקואליציות שבירות יותר.` });
  if (r.immunity)
    out.push({ icon: '🛡️', title: 'החוק הצרפתי', text: `${['ראש ממשלה מכהן/ת', 'ראש הממשלה והשרים', 'כל חברי הכנסת'][r.immunity - 1]} לא נחקרים בזמן הכהונה. חקירה נגדך מוקפאת כל עוד את/ה בתפקיד – ומתחדשת אחריו.` });
  if (r.norwegian) {
    const n = Object.keys(s.norwegianSwaps ?? {}).length;
    const lim = norwegianLimit(s);
    out.push({ icon: '🔄', title: 'החוק הנורבגי', text: `${lim >= 99 ? 'כל השרים' : `עד ${lim} שרים מכל סיעה`} מפנים את המושב לבא/ה ברשימה (כרגע ${n}). אם את/ה הבא/ה בתור – נכנסים לכנסת; כשהשר/ה עוזב/ת את הממשלה, המושב חוזר.` });
  }
  if (r.termLimit) {
    const pm = s.coalition.pmId;
    const t = s.pmTerms?.[pm];
    out.push({ icon: '⏳', title: 'הגבלת כהונה', text: `${termLimitText(s)}. ראש הממשלה המכהן/ת: ${t ? `${t.streak} רצופות, ${t.total} בסך הכול` : 'קדנציה ראשונה'}.` });
  }
  if (r.entrench) out.push({ icon: '🔒', title: 'שריון ברוב 80', text: 'כל חוק יסוד ומהפכה משטרית צריכים 80 ח"כים בקריאה השלישית.' });
  if (activeScope(s, 'constitution') === 3) out.push({ icon: '📜', title: 'חוקה נוקשה', text: 'כל מהפכה משטרית צריכה גם משאל עם.' });
  if (r.noReview) out.push({ icon: '👑', title: 'אין ביקורת שיפוטית', text: 'בג"ץ לא פוסל חוקים.' });
  else {
    if (r.packedCourt) out.push({ icon: '⚖️', title: 'הקואליציה ממנה שופטים', text: 'בג"ץ פוסל הרבה פחות (×0.4).' });
    if (r.equality) out.push({ icon: '⚖️', title: 'זכות השוויון בחוק יסוד', text: 'בג"ץ פוסל יותר חוקים מפלים (×1.3).' });
    if (r.override) out.push({ icon: '↩️', title: 'פסקת התגברות', text: 'חוק שנפסל אפשר לחוקק מחדש.' });
  }
  if (noConfidenceFrozen(s) && !r.presidential) out.push({ icon: '🚨', title: 'תקנות שעת חירום', text: 'אין הצבעות אי-אמון.' });
  if ((s.transforms ?? []).some((t) => t.id === 'emergency')) out.push({ icon: '🚨', title: 'הבחירות נדחו', text: 'אין בחירות מוקדמות עד מועד הבחירות החדש.' });
  return out;
}
