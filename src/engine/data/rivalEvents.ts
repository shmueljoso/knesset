// אירועי יריבות ובעלי ברית, ושני "מיני-משחקים" בשרשרת: עימות טלוויזיוני (3 סבבים) וציד קולות (3 ח"כים).
import type { GameEvent } from './events';
import type { GameState, Npc } from '../types';
import { registerSpecial, type Op } from '../ops';
import { chance, pick, rand } from '../rng';
import { ally, addMoment, nemesis } from '../systems/rivals';
import { addStat } from '../stats';
import { addMomentum, changeApproval } from '../systems/opinion';
import { addNews } from '../systems/news';
import { changeAttitude } from '../systems/relationships';
import { ISSUES } from './issues';
import { leanAlignment } from '../util';
import { effectiveLean } from '../systems/votes';

const sp = (id: string): Op => ({ op: 'special', id });

// ---------------- יריבות ----------------
export const RIVAL_EVENTS: GameEvent[] = [
  {
    id: 'riv_attack', icon: '⚔️', weight: 4, cooldown: 8,
    title: '{npc} תוקף/ת אותך',
    body: 'היריב/ה הקבוע/ה שלך, {npc}, אמר/ה עלייך בראיון בוקר: "פוליטיקאי/ת של כותרות, בלי שום הישג". הקליפ כבר ברשתות.',
    when: (s) => !!nemesis(s),
    ctx: (s) => ({ npc: nemesis(s)!.id }),
    choices: [
      {
        label: 'להחזיר מכה – בשידור', hint: 'מוכרות, אבל היריבות מחריפה',
        chance: { p: (s) => 0.45 + s.player.skills.media / 150, fail: [{ op: 'reputation', d: -2 }, { op: 'att', who: '@ctx', d: -6 }], failText: 'נשמע/ת נעלב/ת. הפרשנים מכריזים: 1:0 לטובת היריב/ה.' },
        ops: [{ op: 'fame', d: 3 }, { op: 'att', who: '@ctx', d: -8 }], result: 'התשובה שלך הייתה חדה יותר. הקליפ שלך עקף את שלו/ה.',
      },
      { label: 'להתעלם בכבוד', hint: 'מוניטין', ops: [{ op: 'reputation', d: 1.5 }, { op: 'consistency', d: 1 }], result: '"אני עסוק/ה בעבודה." עמיתים העריכו.' },
      { label: 'להזמין לשיחת פיוס', ops: [{ op: 'att', who: '@ctx', d: 10 }, { op: 'fame', d: -0.5 }], result: 'נפגשתם לקפה. הקרח נסדק – קצת.' },
    ],
  },
  {
    id: 'riv_block', icon: '🧱', weight: 3, cooldown: 10,
    title: '{npc} מנסה לתקוע לך את ההצעה',
    body: '{npc} מסתובב/ת בין חברי הוועדה ומשכנע/ת אותם להצביע נגד ההצעה שלך – רק כדי שלא תרשום/י הישג.',
    when: (s) => !!nemesis(s) && s.player.isMK && s.bills.some((b) => b.sponsor === 'player' && ['preliminary', 'committee1', 'first', 'committee2', 'final'].includes(b.stage)),
    ctx: (s) => ({ npc: nemesis(s)!.id }),
    choices: [
      { label: 'לגייס תמיכה נגדית', hint: 'עולה הון פוליטי', ops: [{ op: 'capital', d: -3 }, sp('riv_counter')], result: 'דיברת עם חברי הוועדה לפני שהספיק/ה.' },
      { label: 'לחשוף את זה בתקשורת', chance: { p: (s) => 0.5 + s.player.skills.media / 200, fail: [{ op: 'reputation', d: -1.5 }], failText: 'זה נראה כמו בכיינות.' }, ops: [{ op: 'fame', d: 2 }, { op: 'att', who: '@ctx', d: -6 }], result: '"פוליטיקה קטנה" – כתבו עליו/ה. הלחץ עבר אליו/ה.' },
      { label: 'לתת לזה לעבור', ops: [{ op: 'consistency', d: 0.5 }] },
    ],
  },
  {
    id: 'riv_scoop', icon: '🗞️', weight: 2, cooldown: 14,
    title: 'מידע מביך על {npc}',
    body: 'עוזר לשעבר של {npc} פונה אלייך עם מסמכים מביכים. לא פלילי – אבל מכוער.',
    when: (s) => !!nemesis(s),
    ctx: (s) => ({ npc: nemesis(s)!.id }),
    choices: [
      { label: 'להדליף לעיתונאי', hint: 'פוגע ביריב/ה – ועלול לחזור אלייך', chance: { p: () => 0.65, fail: [{ op: 'reputation', d: -4 }, { op: 'news', headline: 'מקורבי {player} עומדים מאחורי ההדלפה נגד {npc}', tone: 'bad', about: true }], failText: 'התגלה מי הדליף. מביך מאוד.' }, ops: [sp('riv_hurt'), { op: 'att', who: '@ctx', d: -10 }], result: 'הכתבה פורסמה. {npc} בהגנה.' },
      { label: 'לסרב – "אני לא משחק/ת ככה"', ops: [{ op: 'reputation', d: 2 }, { op: 'consistency', d: 1.5 }], result: 'שמרת על הידיים נקיות.' },
    ],
  },
  // ---------------- בעלי ברית ----------------
  {
    id: 'ally_offer', icon: '🤝', weight: 3, cooldown: 10,
    title: '{npc} מציע/ה עזרה',
    body: '{npc}, בעל/ת הברית שלך: "שמעתי שאת/ה צריך/ה תמיכה. אני יכול/ה להביא לך כמה ח"כים – ונסגור חשבון אחר כך."',
    when: (s) => !!ally(s) && s.player.isMK,
    ctx: (s) => ({ npc: ally(s)!.id }),
    choices: [
      { label: 'לקבל בתודה', hint: 'הון פוליטי עכשיו, חוב אחר כך', ops: [{ op: 'capital', d: 6 }, { op: 'debt', who: '@ctx', dir: 'player_owes', reason: 'עזרה בגיוס תמיכה' }], result: 'הטלפונים התחילו לצלצל.' },
      { label: '"אני מסתדר/ת – אבל תודה"', ops: [{ op: 'att', who: '@ctx', d: -2 }, { op: 'reputation', d: 0.5 }] },
    ],
  },
  {
    id: 'ally_ask', icon: '🫱', weight: 3, cooldown: 10,
    title: '{npc} צריך/ה אותך',
    body: '{npc} בצרה: הצעה שלו/ה עומדת ליפול, והוא/היא מבקש/ת שתעמוד/י לצידו/ה בפומבי.',
    when: (s) => !!ally(s),
    ctx: (s) => ({ npc: ally(s)!.id }),
    choices: [
      { label: 'לעמוד לצידו/ה', hint: 'עולה הון – ובונה ברית עמוקה', ops: [{ op: 'capital', d: -3 }, { op: 'att', who: '@ctx', d: 10 }, { op: 'trust', who: '@ctx', d: 8 }, { op: 'debt', who: '@ctx', dir: 'owes_player', reason: 'עמידה לצידו/ה ברגע קשה' }], result: '"לא אשכח לך את זה." – ואמרו שזה אמיתי.' },
      { label: 'להתנצל ולהישאר בצד', ops: [{ op: 'att', who: '@ctx', d: -12 }, { op: 'trust', who: '@ctx', d: -10 }], result: 'הוא/היא הבינ/ה. אבל משהו נסדק.' },
    ],
  },
];

registerSpecial('riv_counter', (s) => {
  const b = s.bills.find((x) => x.sponsor === 'player' && ['preliminary', 'committee1', 'first', 'committee2', 'final'].includes(x.stage));
  if (!b) return;
  const mks = Object.values(s.npcs).filter((n) => n.isMK && !n.pledges.includes(b.id) && n.attitude > -10);
  for (let i = 0; i < 2 && mks.length; i++) {
    const n = mks.splice(Math.floor(rand(s) * mks.length), 1)[0];
    n.pledges.push(b.id);
  }
  return 'שני ח"כים התחייבו לתמוך.';
});
registerSpecial('riv_hurt', (s, ctx) => {
  const n = s.npcs[ctx.npc];
  if (!n) return;
  n.influence = Math.max(5, n.influence - 6);
  if (n.partyId) addMomentum(s, n.partyId, -0.8);
  addNews(s, `חשיפה: הצד הפחות מחמיא של ${n.name}`, 'neutral');
  return `ההשפעה של ${n.name} נפגעה.`;
});

// ---------------- עימות טלוויזיוני ----------------
type Move = 'attack' | 'policy' | 'humor' | 'defend';
const MOVE_NAME: Record<Move, string> = { attack: 'התקפה', policy: 'תכנית', humor: 'הומור', defend: 'הגנה' };
/** מי מנצח את מי: התקפה > תכנית > הומור > התקפה; הגנה מנצחת התקפה ומפסידה לכל השאר */
function duel(a: Move, b: Move): number {
  if (a === b) return 0;
  const beats: Record<Move, Move[]> = { attack: ['policy'], policy: ['humor', 'defend'], humor: ['attack', 'defend'], defend: ['attack'] };
  return beats[a].includes(b) ? 1 : beats[b].includes(a) ? -1 : 0;
}

/** היריב/ה בעימות: הנמסיס, ואם אין – יו"ר מפלגה מתחרה */
export function debateOpponent(s: GameState): Npc | null {
  const nm = nemesis(s);
  if (nm) return nm;
  const my = s.player.partyId;
  const leaders = Object.values(s.parties)
    .filter((p) => p.id !== my && p.seats > 0 && s.npcs[p.leaderId])
    .sort((a, b) => b.poll - a.poll)
    .map((p) => s.npcs[p.leaderId]);
  return leaders[0] ?? null;
}

function oppMove(s: GameState, n: Npc): Move {
  const w: [Move, number][] = [
    ['attack', n.traits.includes('vindictive') ? 3 : 2],
    ['policy', n.traits.includes('principled') ? 3 : 2],
    ['humor', 1.5],
    ['defend', 1],
  ];
  // יריב/ה שמוביל/ה מתגונן/ת יותר בסבב האחרון
  if (Number(s.flags.debScore ?? 0) < 0) w[3][1] += 1;
  const total = w.reduce((a, x) => a + x[1], 0);
  let r = rand(s) * total;
  for (const [m, x] of w) if ((r -= x) <= 0) return m;
  return 'policy';
}

function debateCtx(s: GameState, n: number) {
  const hot = [...ISSUES].sort((a, b) => s.issues[b.id] - s.issues[a.id]).slice(0, 4);
  const issue = hot[(n - 1) % hot.length];
  return { npc: String(s.flags.debOpp ?? ''), n: String(n), issueName: issue.name };
}

export function startDebate(s: GameState): string | null {
  const opp = debateOpponent(s);
  if (!opp) return null;
  s.flags.debOpp = opp.id;
  s.flags.debScore = 0;
  s.flags.debStep = 1;
  s.eventQueue.unshift({ eventId: 'deb_round', ctx: debateCtx(s, 1) });
  return opp.name;
}

for (const m of ['attack', 'policy', 'humor', 'defend'] as Move[]) {
  registerSpecial(`deb_${m}`, (s) => {
    const opp = s.npcs[String(s.flags.debOpp ?? '')];
    if (!opp) return;
    const o = oppMove(s, opp);
    let r = duel(m, o);
    // מיומנות: נאום / תקשורת יכולים להציל סבב שוויוני
    if (r === 0 && chance(s, (s.player.skills.speech + s.player.skills.media) / 400)) r = 1;
    s.flags.debScore = Number(s.flags.debScore ?? 0) + r;
    return `${opp.name} בחר/ה ב${MOVE_NAME[o]}. ${r > 0 ? '✅ הסבב שלך!' : r < 0 ? '❌ הסבב הלך ליריב/ה.' : '➖ תיקו.'}`;
  });
}

registerSpecial('deb_next', (s) => {
  const n = Number(s.flags.debStep ?? 1) + 1;
  s.flags.debStep = n;
  if (n <= 3) {
    s.eventQueue.unshift({ eventId: 'deb_round', ctx: debateCtx(s, n) });
    return;
  }
  const score = Number(s.flags.debScore ?? 0);
  const opp = s.npcs[String(s.flags.debOpp ?? '')];
  delete s.flags.debScore;
  delete s.flags.debStep;
  delete s.flags.debOpp;
  const name = opp?.name ?? 'היריב/ה';
  if (opp) changeAttitude(s, opp.id, score > 0 ? -6 : -2, { spread: false });
  if (score > 0) {
    addStat(s, 'fame', 4);
    changeApproval(s, 'all', 1.2);
    if (s.player.partyId) addMomentum(s, s.player.partyId, 0.8);
    addNews(s, `העימות של הערב: ${s.player.name} ניצח/ה את ${name}`, 'good', true);
    addMoment(s, '🎙️', `ניצחון בעימות טלוויזיוני מול ${name}`);
    s.counters.debatesWon = (s.counters.debatesWon ?? 0) + 1;
    return `ניצחת בעימות (${score > 1 ? 'בנוק־אאוט' : 'בנקודות'})! הסקרים מגיבים.`;
  }
  if (score < 0) {
    addStat(s, 'fame', 1.5);
    changeApproval(s, 'all', -0.8);
    if (s.player.partyId) addMomentum(s, s.player.partyId, -0.5);
    addNews(s, `${name} ניצח/ה בעימות מול ${s.player.name}`, 'bad', true);
    return 'הפסדת בעימות. מחר ידברו על זה.';
  }
  addStat(s, 'fame', 2.5);
  return 'תיקו בעימות. שני הצדדים מכריזים על ניצחון.';
});

const debChoice = (m: Move, label: string, hint: string) => ({ label, hint, ops: [sp(`deb_${m}`), sp('deb_next')] });

export const DEBATE_EVENTS: GameEvent[] = [
  {
    id: 'deb_round', queued: true, icon: '🎙️',
    title: 'עימות מול {npc} · סבב {n}/3',
    body: 'הנושא: {issueName}. המנחה מסתובב/ת אלייך. היריב/ה מחכה לראות מה תעשה/י. (התקפה מנצחת תכנית, תכנית מנצחת הומור, הומור מנצח התקפה; הגנה עוצרת רק התקפה.)',
    choices: [
      debChoice('attack', '🗡️ להתקיף את הרקורד שלו/ה', 'חזק נגד מי שמציג/ה תכנית'),
      debChoice('policy', '📊 להציג תכנית מסודרת', 'חזק נגד הומור והגנה'),
      debChoice('humor', '😄 עקיצה מצחיקה', 'מפרק/ת התקפות'),
      debChoice('defend', '🛡️ להתגונן ולהרגיע', 'עוצר/ת רק התקפה'),
    ],
  },
];

// ---------------- ציד קולות ----------------
/** ההצעה שלך שמחכה להצבעה, אם יש */
export const whipBill = (s: GameState) => s.bills.find((b) => b.sponsor === 'player' && ['preliminary', 'first', 'final'].includes(b.stage));

function whipTarget(s: GameState): Npc | null {
  const b = whipBill(s);
  if (!b) return null;
  const done = String(s.flags.whipDone ?? '').split(',');
  const pool = Object.values(s.npcs).filter((n) => n.isMK && !n.pledges.includes(b.id) && !done.includes(n.id) && n.partyId !== s.player.partyId && n.attitude > -35 && n.attitude < 50);
  if (!pool.length) return null;
  // המתלבטים: יחס בינוני ועמדה לא רחוקה
  return pick(s, pool.sort((a, b2) => Math.abs(a.attitude - 10) - Math.abs(b2.attitude - 10)).slice(0, 8));
}

export function startWhip(s: GameState): boolean {
  const b = whipBill(s);
  const t = b && whipTarget(s);
  if (!b || !t) return false;
  s.flags.whipStep = 1;
  s.flags.whipGot = 0;
  s.flags.whipDone = t.id;
  s.eventQueue.unshift({ eventId: 'whip_round', ctx: { npc: t.id, n: '1', billTitle: b.title, bill: b.id } });
  return true;
}

function pledge(s: GameState, npcId: string, billId: string) {
  const n = s.npcs[npcId];
  if (n && !n.pledges.includes(billId)) n.pledges.push(billId);
  s.flags.whipGot = Number(s.flags.whipGot ?? 0) + 1;
}

registerSpecial('whip_yes', (s, ctx) => {
  pledge(s, ctx.npc, ctx.bill);
  return `✅ ${s.npcs[ctx.npc]?.name} בפנים.`;
});
registerSpecial('whip_idea', (s, ctx) => {
  const n = s.npcs[ctx.npc];
  const b = s.bills.find((x) => x.id === ctx.bill);
  if (!n || !b) return;
  const al = leanAlignment(n.ideology, effectiveLean(s, b));
  if (chance(s, 0.3 + Math.max(0, al) * 0.6)) {
    pledge(s, n.id, b.id);
    return `✅ ${n.name} השתכנע/ה – זה מתאים לעמדות שלו/ה.`;
  }
  changeAttitude(s, n.id, -2, { spread: false });
  return `❌ ${n.name}: "זה פשוט לא אני."`;
});
registerSpecial('whip_press', (s, ctx) => {
  const n = s.npcs[ctx.npc];
  if (!n) return;
  if (chance(s, n.traits.includes('principled') ? 0.25 : 0.55)) {
    pledge(s, n.id, ctx.bill);
    return `✅ ${n.name} נכנע/ה ללחץ. לא בטוח שישכח/תשכח.`;
  }
  changeAttitude(s, n.id, -10, { spread: false });
  addStat(s, 'reputation', -1);
  return `❌ ${n.name} נעלב/ה. הסיפור עוד יגיע לתקשורת.`;
});
registerSpecial('whip_next', (s, ctx) => {
  const n = Number(s.flags.whipStep ?? 1) + 1;
  s.flags.whipStep = n;
  const t = n <= 3 ? whipTarget(s) : null;
  if (t) {
    s.flags.whipDone = `${String(s.flags.whipDone ?? '')},${t.id}`;
    s.eventQueue.unshift({ eventId: 'whip_round', ctx: { npc: t.id, n: String(n), billTitle: ctx.billTitle, bill: ctx.bill } });
    return;
  }
  const got = Number(s.flags.whipGot ?? 0);
  delete s.flags.whipStep;
  delete s.flags.whipGot;
  delete s.flags.whipDone;
  if (got >= 3) addMoment(s, '🎯', `ציד קולות מושלם ל"${ctx.billTitle}": 3 מתוך 3`);
  return `סיכום ציד הקולות: ${got} התחייבויות חדשות ל"${ctx.billTitle}".`;
});

export const WHIP_EVENTS: GameEvent[] = [
  {
    id: 'whip_round', queued: true, icon: '🎯',
    title: 'ציד קולות · {n}/3: {npc}',
    body: '"{billTitle}" עולה להצבעה. {npc} מתלבט/ת. יש לך דקה במסדרון.',
    choices: [
      { label: '💎 הבטחה תקציבית למגזר שלו/ה', hint: 'כמעט בטוח – עולה הון', requires: (s) => (s.player.capital >= 4 ? null : 'צריך 4 הון פוליטי'), ops: [{ op: 'capital', d: -4 }, sp('whip_yes'), sp('whip_next')] },
      { label: '🤝 טובה תמורת טובה', hint: 'חוב שייגבה', ops: [{ op: 'debt', who: '@ctx', dir: 'player_owes', reason: 'תמיכה בהצעת חוק' }, sp('whip_yes'), sp('whip_next')] },
      { label: '🧭 לשכנע לגופו של עניין', hint: 'תלוי בעמדות שלו/ה', ops: [sp('whip_idea'), sp('whip_next')] },
      { label: '😤 ללחוץ', hint: 'מהיר ומסוכן', ops: [sp('whip_press'), sp('whip_next')] },
    ],
  },
];

export const RIVAL_ALL_EVENTS: GameEvent[] = [...RIVAL_EVENTS, ...DEBATE_EVENTS, ...WHIP_EVENTS];
