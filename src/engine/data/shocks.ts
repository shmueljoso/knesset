// טלטלות: אירועים נדירים שמשנים את המפה הפוליטית – מפלגות חדשות "יש מאין", קריסות, מלחמות ופילוגים.
// כל טלטלה קורית בעולם בכל מקרה (setup), והשחקן בוחר איך להגיב (choices).
import type { Ctx } from '../ops';
import { pick, rand } from '../rng';
import { callEarlyElections } from '../systems/elections';
import { isCoalition } from '../systems/government';
import { bumpIssue, scheduleEvent } from '../systems/issues';
import { listsOpen, mergeBlocked, mergeChance, npcSplit, playerLeads, spawnParty, type Archetype } from '../systems/mergers';
import { addNews } from '../systems/news';
import { addMomentum, addWorldEffect } from '../systems/opinion';
import type { GameState, Party } from '../types';
import { ideologyDistance, leanAlignment } from '../util';
import { BILL_TEMPLATES } from './bills';
import type { GameEvent } from './events';

export interface ShockDef {
  id: string;
  weight: number;
  when?: (s: GameState) => boolean;
  setup: (s: GameState) => Ctx | null;
}

const leads = (s: GameState) => !!playerLeads(s);
const canMerge = (s: GameState, ctx: Ctx) => (!leads(s) ? 'רק יו"ר מפלגה' : mergeBlocked(s, s.player.partyId!, ctx.party));
const canJoin = (s: GameState, ctx: Ctx) =>
  leads(s) ? 'את/ה יו"ר מפלגה' : s.player.isMK ? 'ח"כ לא יכול לעבור מפלגה באמצע כנסת' : !listsOpen(s) ? 'הרשימות כבר נסגרו' : s.player.partyId === ctx.party ? 'כבר שם' : null;
const roomForNew = (s: GameState) => listsOpen(s) && Object.keys(s.parties).length < 16;
const seated = (s: GameState) => Object.values(s.parties).filter((p) => p.seats > 0);
const npcLed = (p: Party) => p.leaderId !== 'player';

const ARCH: Record<string, Archetype> = {
  general: {
    names: ['ישראל במדים', 'הדרך הממלכתית', 'אחדות לאומית', 'חוסן'],
    ideology: { econ: 10, security: 45, religion: -20, judiciary: -15 },
    sectors: { secular: 0.7, traditional: 0.5, olim: 0.3 },
    momentum: 14,
    bio: 'רמטכ"ל לשעבר. נכנס/ה לפוליטיקה בהפתעה, עם סקרים בשמיים ובלי עבר פוליטי.',
  },
  celeb: {
    names: ['קול העם', 'פשוט ישר', 'ישראל שלנו', 'בלי פוליטיקה'],
    ideology: { econ: -15, security: 15, religion: -10, judiciary: 5 },
    sectors: { traditional: 0.7, secular: 0.5, olim: 0.3 },
    momentum: 10,
    bio: 'כוכב/ת טלוויזיה ופודקאסט. בלי ניסיון – עם מיליון עוקבים.',
  },
  social: {
    names: ['תנועת האוהלים', 'צדק חברתי', 'הדור הבא', 'שכר הוגן'],
    ideology: { econ: -55, security: -5, religion: -25, judiciary: -20 },
    sectors: { secular: 0.8, traditional: 0.4, arab: 0.2 },
    momentum: 6,
    bio: 'מנהיג/ת מחאת יוקר המחיה. ישן/ה באוהל בשדרה שלושה חודשים.',
  },
};

export const SHOCKS: ShockDef[] = [
  {
    id: 'shock_general', weight: 3, when: roomForNew,
    setup: (s) => {
      const p = spawnParty(s, ARCH.general);
      addNews(s, `רעידת אדמה פוליטית: הרמטכ"ל לשעבר ${s.npcs[p.leaderId].name} מקים/ה את "${p.name}"`, 'neutral', false, 'סקר בזק: דו-ספרתי כבר בשבוע הראשון.', 'ערוץ המשכן');
      return { party: p.id, npc: p.leaderId };
    },
  },
  {
    id: 'shock_celeb', weight: 3, when: roomForNew,
    setup: (s) => {
      const p = spawnParty(s, ARCH.celeb);
      addNews(s, `${s.npcs[p.leaderId].name}, כוכב/ת הפריים-טיים, נכנס/ה לפוליטיקה עם "${p.name}"`, 'neutral', false, undefined, 'ערוץ המשכן');
      return { party: p.id, npc: p.leaderId };
    },
  },
  {
    id: 'shock_tents', weight: 2, when: (s) => roomForNew(s) && s.world.affordability < 50,
    setup: (s) => {
      const p = spawnParty(s, ARCH.social);
      bumpIssue(s, 'cost', 25);
      bumpIssue(s, 'housing', 15);
      for (const id of s.coalition.parties) addMomentum(s, id, -1);
      addNews(s, `מאות אלפים בכיכר: מחאת יוקר המחיה הופכת למפלגה – "${p.name}"`, 'bad', false, undefined, 'ערוץ המשכן');
      return { party: p.id, npc: p.leaderId };
    },
  },
  {
    id: 'shock_war', weight: 3,
    setup: (s) => {
      addWorldEffect(s, 'security', -12, 4, 'מלחמה');
      addWorldEffect(s, 'economy', -6, 8, 'מלחמה');
      bumpIssue(s, 'security', 30);
      for (const p of Object.values(s.parties)) addMomentum(s, p.id, (p.ideology.security / 100) * 3);
      for (const id of s.coalition.parties) addMomentum(s, id, 1.5); // התלכדות סביב הדגל
      scheduleEvent(s, 'shock_war_after', 10);
      addNews(s, 'מבצע צבאי רחב: אזעקות בכל הארץ, מילואים בהיקף נרחב', 'bad', false, undefined, 'ערוץ המשכן');
      return {};
    },
  },
  {
    id: 'shock_failure', weight: 2, when: (s) => s.coalition.parties.length > 0,
    setup: (s) => {
      addWorldEffect(s, 'security', -8, 3, 'מחדל');
      addWorldEffect(s, 'trust', -8, 6, 'מחדל');
      bumpIssue(s, 'security', 25);
      for (const id of s.coalition.parties) addMomentum(s, id, -6);
      for (const p of seated(s)) if (!s.coalition.parties.includes(p.id)) addMomentum(s, p.id, 2);
      addNews(s, 'מחדל ביטחוני חמור: הציבור דורש ועדת חקירה ממלכתית', 'bad', false, undefined, 'ערוץ המשכן');
      return {};
    },
  },
  {
    id: 'shock_crash', weight: 2,
    setup: (s) => {
      addWorldEffect(s, 'economy', -14, 6, 'משבר כלכלי');
      addWorldEffect(s, 'affordability', -7, 6, 'משבר כלכלי');
      bumpIssue(s, 'cost', 20);
      for (const id of s.coalition.parties) addMomentum(s, id, -3);
      for (const p of Object.values(s.parties)) addMomentum(s, p.id, (-p.ideology.econ / 100) * 2);
      addNews(s, 'קריסה בבורסה, השקל צולל: "המשבר הכלכלי החמור בעשור"', 'bad', false, undefined, 'ערוץ המשכן');
      return {};
    },
  },
  {
    id: 'shock_indict', weight: 3, when: (s) => seated(s).some((p) => npcLed(p) && p.seats >= 4),
    setup: (s) => {
      const own = s.player.partyId ? s.parties[s.player.partyId] : null;
      const pool = seated(s).filter((p) => npcLed(p) && p.seats >= 4 && s.npcs[p.leaderId]);
      const p = own && pool.includes(own) && s.player.isMK && rand(s) < 0.3 ? own : pick(s, pool);
      addMomentum(s, p.id, -7);
      addNews(s, `היועמ"ש החליט: כתב אישום נגד ${s.npcs[p.leaderId].name}, יו"ר ${p.name}`, 'bad', p.id === s.player.partyId, undefined, 'ערוץ המשכן');
      return { party: p.id, npc: p.leaderId };
    },
  },
  {
    id: 'shock_tapes', weight: 3, when: (s) => seated(s).length > 2,
    setup: (s) => {
      const own = s.player.partyId ? s.parties[s.player.partyId] : null;
      const p = own && own.seats > 0 && rand(s) < 0.25 ? own : pick(s, seated(s));
      addMomentum(s, p.id, -4);
      addNews(s, `הקלטות מביכות מישיבה סגורה של ${p.name} דלפו לחדשות`, 'bad', p.id === s.player.partyId, undefined, 'ערוץ המשכן');
      return { party: p.id };
    },
  },
  {
    id: 'shock_leader_exit', weight: 2, when: (s) => seated(s).some((p) => npcLed(p) && p.list.length > 2 && p.leaderId !== s.coalition.pmId),
    setup: (s) => {
      const own = s.player.partyId ? s.parties[s.player.partyId] : null;
      const pool = seated(s).filter((p) => npcLed(p) && p.list.length > 2 && s.npcs[p.leaderId] && p.leaderId !== s.coalition.pmId);
      if (!pool.length) return null;
      const p = own && pool.includes(own) && s.player.isMK && rand(s) < 0.4 ? own : pick(s, pool);
      const old = s.npcs[p.leaderId];
      const heir = p.list.find((id) => id !== old.id && id !== 'player' && s.npcs[id]);
      if (!heir) return null;
      p.leaderId = heir;
      p.list = [heir, ...p.list.filter((id) => id !== heir)];
      addMomentum(s, p.id, -3);
      addNews(s, `${old.name} מודיע/ה על פרישה מהפוליטיקה. ${s.npcs[heir].name} ממלא/ת את מקומו/ה בראשות ${p.short}`, 'neutral', p.id === s.player.partyId, undefined, 'ערוץ המשכן');
      return { party: p.id, npc: old.id, npc2: heir };
    },
  },
  {
    id: 'shock_star_jump', weight: 3, when: listsOpen,
    setup: (s) => {
      const stars = Object.values(s.npcs).filter((n) => !n.isMK && n.partyId && n.influence >= 55 && s.parties[n.partyId] && s.parties[n.partyId].leaderId !== n.id);
      if (!stars.length) return null;
      const star = pick(s, stars);
      const from = s.parties[star.partyId!];
      const to = Object.values(s.parties)
        .filter((p) => p.id !== from.id && npcLed(p))
        .sort((a, b) => ideologyDistance(a.ideology, star.ideology) - ideologyDistance(b.ideology, star.ideology))[0];
      if (!to) return null;
      from.list = from.list.filter((id) => id !== star.id);
      to.list.splice(Math.min(2, to.list.length), 0, star.id);
      star.partyId = to.id;
      star.notable = true;
      addMomentum(s, from.id, -2.5);
      addMomentum(s, to.id, 2.5);
      addNews(s, `החתמה דרמטית: ${star.name} עוזב/ת את ${from.short} ומצטרף/ת ל${to.short}`, 'neutral', from.id === s.player.partyId || to.id === s.player.partyId, undefined, 'ערוץ המשכן');
      return { npc: star.id, party: to.id, party2: from.id, party2Name: from.name };
    },
  },
  {
    id: 'shock_split', weight: 2, when: (s) => roomForNew(s) && seated(s).some((p) => npcLed(p) && p.seats >= 10),
    setup: (s) => {
      const from = pick(s, seated(s).filter((p) => npcLed(p) && p.seats >= 10));
      const fromName = from.name;
      const p = npcSplit(s, from.id, { names: ['המורדים', 'הבית הממלכתי', 'תקומה חדשה', 'הדרך האמיתית', 'הבית הישן'], momentum: 4, bio: '' });
      if (!p) return null;
      addNews(s, `פילוג ב${fromName}: ${s.npcs[p.leaderId].name} ו-${p.list.length - 1} נוספים מקימים את "${p.name}"`, 'neutral', s.player.partyId === from.id, undefined, 'ערוץ המשכן');
      return { party: p.id, party2: from.id, party2Name: fromName, npc: p.leaderId };
    },
  },
  {
    id: 'shock_peace', weight: 1, when: (s) => !!s.coalition.pmId,
    setup: (s) => {
      const pmParty = s.coalition.pmId === 'player' ? s.player.partyId : s.npcs[s.coalition.pmId]?.partyId;
      if (!pmParty) return null;
      addMomentum(s, pmParty, 5);
      addWorldEffect(s, 'security', 6, 8, 'הסכם מדיני');
      addWorldEffect(s, 'economy', 4, 8, 'הסכם מדיני');
      addNews(s, 'פריצת דרך: ישראל ומדינה ערבית גדולה חותמות על הסכם נורמליזציה', 'good', false, undefined, 'ערוץ המשכן');
      return { party: pmParty };
    },
  },
  {
    id: 'shock_draft', weight: 2,
    setup: (s) => {
      bumpIssue(s, 'draft', 30);
      for (const p of Object.values(s.parties)) addMomentum(s, p.id, p.ideology.religion > 60 ? 1.2 : (-p.ideology.religion / 100) * 2.5);
      addWorldEffect(s, 'cohesion', -6, 4, 'מחאת הגיוס');
      addNews(s, 'הפגנת ענק נגד גיוס חרדים חוסמת את הכניסה לירושלים; מנגד – מחאת המילואימניקים', 'bad', false, undefined, 'ערוץ המשכן');
      return {};
    },
  },
  {
    id: 'radical_motion', weight: 2,
    setup: (s) => {
      const radicals = BILL_TEMPLATES.filter((t) => t.radical && !(s.transforms ?? []).some((x) => x.id === t.radical));
      const pairs = Object.values(s.npcs)
        .filter((n) => n.isMK && n.notable)
        .flatMap((n) => radicals.map((t) => ({ n, t, a: leanAlignment(n.ideology, t.lean) })))
        .filter((x) => x.a > 0.55);
      if (!pairs.length) return null;
      const { n, t } = pick(s, pairs);
      addNews(s, `${n.name} הגיש/ה את "${t.title}". "הצעה הזויה", אומרים בכנסת`, 'neutral', false, undefined, 'ערוץ המשכן');
      return { npc: n.id, title: t.title, lean: JSON.stringify(t.lean) };
    },
  },
  {
    id: 'shock_snap', weight: 1, when: (s) => s.coalition.stability < 45 && s.electionWeek - s.week > 30 && s.settings?.drama !== 'calm' && !s.negotiation,
    setup: (s) => {
      callEarlyElections(s, 'הפתעה בלילה: שותפה בכירה פירקה את הקואליציה');
      return {};
    },
  },
];

const join: GameEvent['choices'][number] = {
  label: 'לעבור לרשימה החדשה (מקום ריאלי מובטח)', hint: 'מעבר מפלגה עולה מוניטין, אבל זו רכבת שיוצאת',
  requires: canJoin, ops: [{ op: 'special', id: 'join_new_party', label: 'מעבר מפלגה · מקום 4 מובטח' }],
};
const ignore = (label = 'להמשיך לעבוד כרגיל'): GameEvent['choices'][number] => ({ label, ops: [{ op: 'log', text: 'בחרת לא להגיב.' }] });

export const SHOCK_EVENTS: GameEvent[] = [
  {
    id: 'shock_general', queued: true, icon: '🎖️',
    title: 'רעידת אדמה: {npc} נכנס/ה לפוליטיקה',
    body: 'הרמטכ"ל לשעבר הקים/ה את "{party}". סקר בזק: דו-ספרתי. כל המפלגות במרכז ובימין הרך מרגישות את האדמה רועדת – והטלפונים מצלצלים.',
    choices: [
      { label: 'להציע איחוד – ואני בראש', hint: 'רק אם הם מאמינים שאת/ה מביא/ה יותר', requires: canMerge, chance: { p: (s, c) => mergeChance(s, c.party, { lead: 'me', share: 'fair' }) + 0.1, fail: [{ op: 'fame', d: 1 }], failText: '"תודה, אבל לא." ההצעה דלפה לתקשורת.' }, ops: [{ op: 'special', id: 'shock_merge_me', label: 'רשימה משותפת בראשותך' }] },
      { label: 'להציע איחוד – {npc} בראש', hint: 'מוותרים על הראשות תמורת מקום 2 ברשימה ענקית', requires: canMerge, ops: [{ op: 'special', id: 'shock_merge_them', label: 'רשימה משותפת · את/ה מספר 2' }] },
      join,
      { label: 'לתקוף: "גנרל בלי משנה סדורה"', ops: [{ op: 'momentum', party: '@ctx', d: -1.5 }, { op: 'fame', d: 2 }, { op: 'att', who: '@ctx', d: -20 }, { op: 'reputation', d: -1 }] },
      ignore(),
    ],
  },
  {
    id: 'shock_celeb', queued: true, icon: '📺',
    title: '{npc} מהטלוויזיה – לכנסת',
    body: '"{party}" עולה לאוויר עם קליפ ויראלי ובלי מצע. הסקרים משתגעים, הפרשנים מזהירים שזה בלון שיתפוצץ. או שלא.',
    choices: [
      { label: 'להציע ל{npc} לרוץ איתך', hint: 'כוכב/ת ברשימה = מוכרות', requires: canMerge, chance: { p: (s, c) => mergeChance(s, c.party, { lead: 'me', share: 'high' }) + 0.15, fail: [{ op: 'fame', d: 1 }], failText: '{npc} העדיף/ה לרוץ לבד.' }, ops: [{ op: 'special', id: 'shock_merge_me', label: 'הכוכב/ת מצטרף/ת לרשימה שלך' }] },
      join,
      { label: 'ללעוג ברשתות', ops: [{ op: 'momentum', party: '@ctx', d: -1 }, { op: 'fame', d: 1.5 }, { op: 'approval', sector: 'all', d: -0.5 }] },
      ignore(),
    ],
  },
  {
    id: 'shock_tents', queued: true, icon: '⛺',
    title: 'מחאת האוהלים הופכת למפלגה',
    body: '{npc} הודיע/ה מעל הבמה בכיכר על הקמת "{party}". יוקר המחיה בראש סדר היום, והממשלה בעמדת התגוננות.',
    choices: [
      { label: 'להצטרף למאהל ולנאום', ops: [{ op: 'stance', lean: { econ: -55 }, d: 2.5 }, { op: 'fame', d: 2 }, { op: 'att', who: '@ctx', d: 15 }] },
      { label: 'להגן על המדיניות הכלכלית', ops: [{ op: 'stance', lean: { econ: 45 }, d: 1.5 }, { op: 'capital', d: 1 }, { op: 'att', who: '@pm', d: 6 }] },
      join,
      ignore(),
    ],
  },
  {
    id: 'shock_war', queued: true, icon: '⚔️',
    title: 'מלחמה',
    body: 'מבצע צבאי רחב. בשבועות הראשונים הציבור מתלכד סביב הדגל וסביב הממשלה. אחר כך – יגיעו השאלות.',
    choices: [
      { label: 'להתייצב מאחורי הממשלה וצה"ל', ops: [{ op: 'stance', lean: { security: 60 }, d: 1.5 }, { op: 'reputation', d: 2 }, { op: 'att', who: '@pm', d: 8 }] },
      { label: 'לבקר את ניהול המלחמה', hint: 'מסוכן בהתחלה, משתלם אחר כך', ops: [{ op: 'fame', d: 3 }, { op: 'approval', sector: 'all', d: -1.5 }, { op: 'flag', key: 'warCritic', v: true }, { op: 'att', who: '@pm', d: -12 }] },
      { label: 'לנסוע לחזית ולמשפחות', ops: [{ op: 'fame', d: 2 }, { op: 'approval', sector: 'all', d: 1.2 }, { op: 'ap', d: -1 }] },
    ],
  },
  {
    id: 'shock_war_after', queued: true, icon: '🕯️',
    title: 'אחרי המלחמה: שעת החשבון',
    body: 'הקרבות דעכו. המילואימניקים חוזרים הביתה כועסים, והשאלות על ההחלטות שהתקבלו לפני ובמהלך המלחמה כבר בכל אולפן.',
    choices: [
      { label: 'לדרוש ועדת חקירה ממלכתית', dyn: (s) => [{ op: 'momentum', party: '@coalition', d: -3 }, { op: 'reputation', d: 2 }, ...(s.flags.warCritic ? [{ op: 'fame' as const, d: 3 }, { op: 'momentum' as const, party: '@player', d: 1.5 }] : [])], ops: [] },
      { label: 'להגן על הממשלה', ops: [{ op: 'att', who: '@pm', d: 10 }, { op: 'momentum', party: '@coalition', d: -1.5 }, { op: 'reputation', d: -2 }] },
    ],
  },
  {
    id: 'shock_failure', queued: true, icon: '🔥',
    title: 'מחדל ביטחוני',
    body: 'התברר שהיו התרעות – והן נגנזו. הממשלה בצניחה חופשית בסקרים, והאופוזיציה מריחה דם.',
    choices: [
      { label: 'לדרוש ועדת חקירה ממלכתית', dyn: (s) => [{ op: 'stance', lean: { judiciary: -40 }, d: 1.5 }, { op: 'reputation', d: 2 }, ...(isCoalition(s, s.player.partyId) ? [{ op: 'att' as const, who: '@pm', d: -15 }] : [{ op: 'momentum' as const, party: '@player', d: 1 }])], ops: [] },
      { label: 'להגן על הממשלה ("לא עכשיו")', ops: [{ op: 'att', who: '@pm', d: 10 }, { op: 'reputation', d: -3 }] },
      ignore('לשתוק'),
    ],
  },
  {
    id: 'shock_crash', queued: true, icon: '📉',
    title: 'משבר כלכלי',
    body: 'הבורסה צוללת, הריבית עולה, ומשפחות לא סוגרות את החודש. כל מפלגה מחפשת אשמים.',
    choices: [
      { label: 'להציג תוכנית חירום מפורטת', ops: [{ op: 'reputation', d: 2.5 }, { op: 'skill', skill: 'law', d: 1 }, { op: 'fame', d: 1 }] },
      { label: 'לתקוף את שר/ת האוצר', ops: [{ op: 'fame', d: 2.5 }, { op: 'momentum', party: '@coalition', d: -1 }, { op: 'stability', d: -2 }] },
      { label: 'לקרוא לרגיעה', ops: [{ op: 'reputation', d: 1 }, { op: 'att', who: '@pm', d: 4 }] },
    ],
  },
  {
    id: 'shock_indict', queued: true, icon: '⚖️',
    title: 'כתב אישום נגד {npc}',
    body: 'היועמ"ש החליט/ה: {npc}, יו"ר {party}, יועמד/תועמד לדין. "{party}" בסערה – חלק תובעים להתפטר, חלק מדברים על "רדיפה".',
    choices: [
      { label: 'לקרוא ל{npc} לפנות את מקומו/ה – ולהתמודד', hint: 'רק אם את/ה ח"כ במפלגה. סיכוי לפי מעמד ומוכרות', requires: (s, c) => (s.player.partyId === c.party && s.player.isMK ? null : 'רק לח"כים במפלגה הזו'), ops: [{ op: 'special', id: 'run_for_leader', label: 'מרוץ לראשות' }, { op: 'att', who: '@ctx', d: -35 }] },
      { label: 'חזקת החפות – לתמוך בפומבי', ops: [{ op: 'att', who: '@ctx', d: 15 }, { op: 'reputation', d: -1.5 }, { op: 'stance', lean: { judiciary: 40 }, d: 1 }] },
      { label: 'לנצל את הרגע ולתקוף', requires: (s, c) => (s.player.partyId === c.party ? 'זו המפלגה שלך' : null), ops: [{ op: 'fame', d: 2 }, { op: 'momentum', party: '@ctx', d: -1 }, { op: 'momentum', party: '@player', d: 0.6 }] },
      ignore('לא להגיב'),
    ],
  },
  {
    id: 'shock_tapes', queued: true, icon: '🎙️',
    title: 'ההקלטות של {party}',
    body: 'הקלטה מישיבה סגורה דלפה: צחוק על הבוחרים, קללות ועסקאות. כל האולפנים משדרים בלופ.',
    choices: [
      { label: 'לגנות (גם אם זו המפלגה שלך)', dyn: (s, c) => (s.player.partyId === c.party ? [{ op: 'reputation', d: 3 }, { op: 'partyStanding', d: -4 }, { op: 'att', who: '@leader', d: -8 }] : [{ op: 'reputation', d: 1 }, { op: 'fame', d: 1 }]), ops: [] },
      { label: 'להגן: "הוצא מהקשרו"', requires: (s, c) => (s.player.partyId === c.party ? null : 'רק אם זו המפלגה שלך'), ops: [{ op: 'partyStanding', d: 3 }, { op: 'reputation', d: -2 }, { op: 'att', who: '@leader', d: 8 }] },
      { label: 'לנצל: שידור חוזר בכל במה', requires: (s, c) => (s.player.partyId === c.party ? 'זו המפלגה שלך' : null), ops: [{ op: 'fame', d: 1.5 }, { op: 'momentum', party: '@player', d: 0.5 }, { op: 'momentum', party: '@ctx', d: -0.8 }] },
    ],
  },
  {
    id: 'shock_leader_exit', queued: true, icon: '🕯️',
    title: '{npc} פורש/ת',
    body: 'בהודעה מפתיעה, {npc} פורש/ת מהפוליטיקה. {npc2} מונה/תה לממלא/ת מקום – אבל במפלגה כבר מדברים על מרוץ פתוח.',
    choices: [
      { label: 'להתמודד על ראשות {party}', hint: 'סיכוי לפי מעמד, מוכרות ומוניטין', requires: (s, c) => (s.player.partyId === c.party && s.player.isMK ? null : 'רק לח"כים במפלגה הזו'), ops: [{ op: 'special', id: 'run_for_leader', label: 'מרוץ לראשות' }] },
      { label: 'לתמוך ב{npc2}', requires: (s, c) => (s.player.partyId === c.party ? null : 'רק במפלגה שלך'), ops: [{ op: 'att', who: '@ctx2', d: 25 }, { op: 'partyStanding', d: 4 }, { op: 'debt', who: '@ctx2', dir: 'owes_player', reason: 'תמיכה בראשות' }] },
      { label: 'לכתוב פוסט פרידה מכבד', ops: [{ op: 'reputation', d: 1 }, { op: 'att', who: '@ctx', d: 10 }] },
    ],
  },
  {
    id: 'shock_star_jump', queued: true, icon: '🔀',
    title: 'החתמת השבוע: {npc}',
    body: '{npc} עוזב/ת את {party2Name} ומצטרף/ת ל{party}. בחדרי הסיעות מדברים על "עסקה" ועל מקום שמור.',
    choices: [
      { label: 'לברך – ולהתקשר אחר כך', ops: [{ op: 'att', who: '@ctx', d: 10 }] },
      { label: 'לעקוץ: "נודד פוליטי"', ops: [{ op: 'fame', d: 1 }, { op: 'att', who: '@ctx', d: -15 }, { op: 'consistency', d: 1 }] },
    ],
  },
  {
    id: 'shock_split', queued: true, icon: '✂️',
    title: 'פילוג: "{party}"',
    body: '{npc} ועוד כמה מבכירי {party2Name} הודיעו שהם הולכים לדרך עצמאית. הם מחפשים עוד שמות.',
    choices: [
      { label: 'להצטרף למורדים (מקום 2 מובטח)', requires: canJoin, ops: [{ op: 'special', id: 'join_rebels', label: 'מעבר מפלגה · מקום 2 מובטח' }] },
      { label: 'להישאר נאמן/ה למפלגה', requires: (s, c) => (s.player.partyId === c.party2 ? null : 'רק בתוך המפלגה המתפלגת'), ops: [{ op: 'partyStanding', d: 5 }, { op: 'att', who: '@leader', d: 10 }] },
      ignore('לצפות מהצד'),
    ],
  },
  {
    id: 'shock_peace', queued: true, icon: '🕊️',
    title: 'פריצת דרך מדינית',
    body: 'טקס חתימה בבית הלבן. ראש הממשלה מקבל/ת דחיפה בסקרים, והאופוזיציה מתלבטת אם לברך.',
    choices: [
      { label: 'לברך ולתמוך', ops: [{ op: 'reputation', d: 2 }, { op: 'stance', lean: { security: -15 }, d: 1 }, { op: 'att', who: '@pm', d: 6 }] },
      { label: 'לתקוף את המחיר', ops: [{ op: 'stance', lean: { security: 70 }, d: 1.5 }, { op: 'fame', d: 1.5 }] },
    ],
  },
  {
    id: 'shock_draft', queued: true, icon: '🪖',
    title: 'הרחוב בוער: הגיוס',
    body: 'מאות אלפים חוסמים כבישים נגד גיוס חרדים, ובמקביל מחאת מילואימניקים מול הכנסת. אין מקום באמצע.',
    choices: [
      { label: 'עם המילואימניקים: "שוויון בנטל"', ops: [{ op: 'stance', lean: { religion: -60 }, d: 2.5 }, { op: 'fame', d: 1.5 }] },
      { label: 'עם עולם התורה', ops: [{ op: 'stance', lean: { religion: 75 }, d: 2.5 }, { op: 'fame', d: 1 }] },
      { label: 'להציע מתווה פשרה', ops: [{ op: 'reputation', d: 2 }, { op: 'consistency', d: -1 }, { op: 'skill', skill: 'negotiation', d: 1 }] },
    ],
  },
  {
    id: 'shock_snap', queued: true, icon: '🗳️',
    title: 'בחירות! (בהפתעה)',
    body: 'הקואליציה קרסה בלילה אחד. הכנסת מתפזרת, והבחירות בעוד כשלושה חודשים. מי שלא מוכן/ה – יישאר/תישאר בחוץ.',
    choices: [
      { label: 'לפתוח מטה בחירות מיד', ops: [{ op: 'fame', d: 1.5 }, { op: 'partyStanding', d: 2 }] },
      { label: 'לגייס כסף לקמפיין', ops: [{ op: 'money', d: 25 }] },
    ],
  },
  {
    id: 'tv_debate', queued: true, icon: '📺',
    title: 'עימות הבחירות',
    body: 'האולפן הגדול, שלושה מנחים, שני דוכנים ומיליון צופים. כל מילה תשודר עד יום הבחירות.',
    choices: [
      { label: 'לתקוף בחריפות', hint: 'סיכוי לפי מיומנות תקשורת', chance: { p: (s) => 0.35 + s.player.skills.media / 150, fail: [{ op: 'momentum', party: '@player', d: -2 }, { op: 'reputation', d: -2 }], failText: 'נראית עצבני/ת. הקליפ הכי משותף הוא שלך – מהצד הלא נכון.' }, ops: [{ op: 'momentum', party: '@player', d: 3 }, { op: 'fame', d: 3 }] },
      { label: 'להיות ממלכתי/ת ורגוע/ה', hint: 'סיכוי לפי מיומנות נאום', chance: { p: (s) => 0.55 + s.player.skills.speech / 200, fail: [{ op: 'fame', d: 1 }], failText: 'עברת בשלום, אבל אף אחד לא זוכר מה אמרת.' }, ops: [{ op: 'momentum', party: '@player', d: 2 }, { op: 'reputation', d: 2 }] },
      { label: 'להתמקד בתוכניות ובמספרים', hint: 'סיכוי לפי משפט וחקיקה', chance: { p: (s) => 0.45 + s.player.skills.law / 200, fail: [{ op: 'fame', d: 0.5 }], failText: 'משעמם. הצופים העבירו ערוץ.' }, ops: [{ op: 'momentum', party: '@player', d: 2 }, { op: 'consistency', d: 3 }] },
    ],
  },
  // ---- איחודים ----
  {
    id: 'merger_offer', queued: true, icon: '🤝',
    title: '{party} מציעה איחוד',
    body: '{npc}: "שנינו קרובים לאחוז החסימה. ביחד – עוברים בקלות. נדבר על הסדר ברשימה?"',
    choices: [
      { label: 'לקבל – ואני בראש', hint: 'סיכוי לפי היחסים והכוח', chance: { p: (s, c) => mergeChance(s, c.party, { lead: 'me', share: 'fair' }) + 0.25, fail: [{ op: 'att', who: '@ctx', d: -5 }], failText: '"אז אין עסקה." השיחות התפוצצו.' }, requires: canMerge, ops: [{ op: 'special', id: 'shock_merge_me', label: 'רשימה משותפת בראשותך' }] },
      { label: 'לקבל – {npc} בראש', requires: canMerge, ops: [{ op: 'special', id: 'shock_merge_them', label: 'רשימה משותפת · את/ה מספר 2' }] },
      { label: 'לסרב', ops: [{ op: 'att', who: '@ctx', d: -5 }] },
    ],
  },
  {
    id: 'merger_announced', queued: true, icon: '🤝',
    title: 'המפלגה שלך מתאחדת',
    body: '{gone} ו{party} ירוצו יחד. ברשימה המשותפת יש פחות מקומות ריאליים לכל אחד – והמאבק על הסדר מתחיל.',
    choices: [
      { label: 'לברך ולעבוד', ops: [{ op: 'partyStanding', d: 3 }, { op: 'att', who: '@leader', d: 5 }] },
      { label: 'להתנגד בפומבי', ops: [{ op: 'partyStanding', d: -4 }, { op: 'fame', d: 2 }, { op: 'consistency', d: 2 }, { op: 'att', who: '@leader', d: -10 }] },
    ],
  },
];

export const shockById = (id: string) => SHOCKS.find((x) => x.id === id);
