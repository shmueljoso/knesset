import { inSession } from './calendar';
import { COMMITTEE_DEFS } from './data/committees';
import { applyOps, type Op } from './ops';
import { chance, pick, rand } from './rng';
import { isCoalition, partyMKs } from './systems/government';
import { addNews } from './systems/news';
import { takeStance } from './systems/opinion';
import { recruitCandidate } from './systems/parties';
import { changeAttitude, revealTrait, TRAIT_INFO } from './systems/relationships';
import { log } from './systems/report';
import { staffBonus } from './systems/staff';
import type { GameState, Ideology, LocationId } from './types';
import { AXES, SECTORS, SECTOR_IDEOLOGY, SECTOR_NAMES, clamp, leanAlignment } from './util';

export type OpenPanel = 'billBuilder' | 'staff' | 'party' | 'bills';

export interface ActionResult {
  text: string;
  lines?: string[];
  open?: OpenPanel;
  good?: boolean;
}

export interface ActionDef {
  id: string;
  loc: LocationId;
  label: string;
  icon: string;
  desc: string;
  ap: number;
  money?: number;
  capital?: number;
  avail?: (s: GameState) => string | null;
  preview?: (s: GameState) => Op[];
  run: (s: GameState) => ActionResult;
}

const needMK = (s: GameState) => (s.player.isMK ? null : 'רק לחברי כנסת');
const needSession = (s: GameState) => (inSession(s) ? null : 'הכנסת בפגרה');
const needParty = (s: GameState) => (s.player.partyId ? null : 'צריך להיות חבר במפלגה');
const all = (...fs: ((s: GameState) => string | null)[]) => (s: GameState) => {
  for (const f of fs) {
    const r = f(s);
    if (r) return r;
  }
  return null;
};

/** העמדה "החתימתית" של השחקן – הציר הבולט ביותר שלו. */
export function signatureLean(s: GameState): Partial<Ideology> {
  const ax = [...AXES].sort((a, b) => Math.abs(s.player.ideology[b]) - Math.abs(s.player.ideology[a]))[0];
  return { [ax]: s.player.ideology[ax] };
}

function run(s: GameState, ops: Op[], text: string, good = true): ActionResult {
  const lines = applyOps(s, ops);
  return { text, lines, good };
}

const mediaPower = (s: GameState) => 1 + staffBonus(s, 'spokesperson') * 0.12 + s.player.skills.media / 200;

export const ACTIONS: ActionDef[] = [
  // ---------- מליאה ----------
  {
    id: 'speech', loc: 'plenum', icon: '🎤', label: 'נאום במליאה', ap: 1,
    desc: 'נאום על הנושא שלך. בונה מוכרות ומיומנות נאום.',
    avail: all(needMK, needSession),
    preview: (s) => [{ op: 'fame', d: 1.5 + s.player.skills.speech / 40 }, { op: 'skill', skill: 'speech', d: 1.5 }, { op: 'stance', lean: {}, d: 1 }],
    run: (s) => {
      takeStance(s, signatureLean(s), 1.2);
      return run(s, [{ op: 'fame', d: 1.5 + s.player.skills.speech / 40 }, { op: 'skill', skill: 'speech', d: 1.5 }], 'נאמת מול מליאה חצי ריקה – אבל הקטע הגיע לערוץ הכנסת.');
    },
  },
  {
    id: 'query', loc: 'plenum', icon: '❓', label: 'שאילתה לשר', ap: 1,
    desc: 'להקשות על שר מהממשלה. מוכרות ומוניטין – על חשבון היחסים איתו.',
    avail: all(needMK, needSession),
    run: (s) => {
      const ministers = Object.values(s.ministers).filter((id) => s.npcs[id]);
      const m = s.npcs[pick(s, ministers)];
      changeAttitude(s, m.id, -5);
      const ops: Op[] = [{ op: 'fame', d: 1.2 }, { op: 'reputation', d: 1 }, { op: 'skill', skill: 'law', d: 1 }];
      if (isCoalition(s, s.player.partyId)) ops.push({ op: 'partyStanding', d: -1.5 });
      return run(s, ops, `הגשת שאילתה ל${m.title ?? 'שר'} ${m.name}. התשובה הייתה מתחמקת – והתקשורת שמה לב.`);
    },
  },
  {
    id: 'motion', loc: 'plenum', icon: '📢', label: 'הצעה לסדר היום', ap: 2,
    desc: 'דיון מהיר על נושא בוער. במה גדולה, עמדה ברורה.',
    avail: all(needMK, needSession),
    run: (s) => {
      takeStance(s, signatureLean(s), 2.2);
      return run(s, [{ op: 'fame', d: 3 }, { op: 'skill', skill: 'speech', d: 1 }], 'הדיון שיזמת עורר סערה במליאה.');
    },
  },
  {
    id: 'gallery', loc: 'plenum', icon: '👀', label: 'לצפות מהיציע', ap: 1,
    desc: 'ללמוד איך הדברים עובדים באמת.',
    avail: (s) => (s.player.isMK ? 'אתה כבר למטה, באולם' : null),
    run: (s) => run(s, [{ op: 'skill', skill: 'law', d: 2 }, { op: 'skill', skill: 'organization', d: 1 }], 'צפית בדיון ובהצבעות ולמדת לא מעט על נהלים.'),
  },
  // ---------- ועדות ----------
  {
    id: 'attend', loc: 'committees', icon: '🗣️', label: 'להשתתף בדיון בוועדה', ap: 1,
    desc: 'העבודה השקטה שבונה מוניטין אצל עמיתים.',
    avail: all(needMK, (s) => (s.player.committees.length ? null : 'אינך חבר בוועדה')),
    run: (s) => {
      const c = s.committees.find((x) => x.id === pick(s, s.player.committees))!;
      if (s.npcs[c.chairId]) changeAttitude(s, c.chairId, 2);
      return run(s, [{ op: 'skill', skill: 'law', d: 2 }, { op: 'reputation', d: 1.2 }, { op: 'fame', d: 0.5 }], `השתתפת בדיון ב${c.name}. העמיתים התרשמו מההכנה שלך.`);
    },
  },
  {
    id: 'accompany', loc: 'committees', icon: '📎', label: 'ללוות את הח"כ לוועדה', ap: 1,
    desc: 'להכין ניירות, ללחוש באוזן ולהכיר את כולם.',
    avail: (s) => (s.player.employerId ? null : 'רק לעוזרים פרלמנטריים'),
    run: (s) => run(s, [{ op: 'skill', skill: 'law', d: 2 }, { op: 'att', who: '@employer', d: 4 }, { op: 'reputation', d: 0.8 }], 'הדיון עבר חלק בזכות ההכנה שלך.'),
  },
  {
    id: 'push_chair', loc: 'committees', icon: '⏩', label: 'לקדם הצעת חוק בוועדה', ap: 0,
    desc: 'ללחוץ על יו"ר הוועדה לקבוע דיון (דרך מסך החקיקה).',
    run: () => ({ text: '', open: 'bills' }),
  },
  // ---------- לשכות ----------
  {
    id: 'draft', loc: 'offices', icon: '✍️', label: 'לנסח הצעת חוק', ap: 0,
    desc: 'לבחור נושא, היקף ולראות את ההשפעה הצפויה. ההגשה עולה 2 זמן.',
    run: () => ({ text: '', open: 'billBuilder' }),
  },
  {
    id: 'office_work', loc: 'offices', icon: '🗂️', label: 'עבודת לשכה', ap: 1,
    desc: 'פניות ציבור, ניירות עמדה ותיאומים.',
    avail: (s) => (s.player.employerId ? null : 'רק לעוזרים פרלמנטריים'),
    run: (s) => run(s, [{ op: 'att', who: '@employer', d: 5 }, { op: 'skill', skill: 'organization', d: 1.5 }, { op: 'money', d: 2 }], 'הלשכה מתפקדת כמו שעון. הבוס מרוצה.'),
  },
  {
    id: 'staff', loc: 'offices', icon: '👥', label: 'ניהול צוות הלשכה', ap: 0,
    desc: 'גיוס עוזרים, דובר ויועץ.',
    run: () => ({ text: '', open: 'staff' }),
  },
  {
    id: 'study', loc: 'offices', icon: '📚', label: 'לימוד ותחקיר', ap: 1,
    desc: 'לקרוא דו"חות מבקר, מחקרי מרכז המחקר והמידע ופרוטוקולים.',
    run: (s) => {
      const weakest = (['law', 'negotiation', 'organization', 'media', 'speech'] as const).reduce((a, b) => (s.player.skills[a] <= s.player.skills[b] ? a : b));
      return run(s, [{ op: 'skill', skill: weakest, d: 2.5 }], 'השקעת בלמידה – זה ישתלם.');
    },
  },
  // ---------- מזנון ----------
  {
    id: 'mingle', loc: 'cafeteria', icon: '☕', label: 'להסתובב במזנון', ap: 1,
    desc: 'קפה, בורקס ושיחות מסדרון. פוגשים אנשים ומחממים קשרים.',
    run: (s) => {
      const here = (s.presence.cafeteria ?? []).filter((id) => s.npcs[id]);
      const met = [...here].sort(() => rand(s) - 0.5).slice(0, 2);
      const lines: string[] = [];
      for (const id of met) {
        const d = changeAttitude(s, id, 3 + rand(s) * 4);
        s.npcs[id].lastContact = s.week;
        lines.push(`${s.npcs[id].name}: יחס ${d >= 0 ? '+' : ''}${d}`);
      }
      s.player.reputation = clamp(s.player.reputation + 0.5, 0, 100);
      return { text: met.length ? 'שתית קפה עם כמה חברי כנסת.' : 'המזנון ריק היום.', lines };
    },
  },
  {
    id: 'gossip', loc: 'cafeteria', icon: '👂', label: 'לשמוע רכילות', ap: 1,
    desc: 'לגלות מי נקמן, מי מדליף ומי פתוח לדילים.',
    run: (s) => {
      const pool = Object.values(s.npcs).filter((n) => n.notable && n.knownTraits.length < n.traits.length);
      if (!pool.length) return { text: 'שמעת רק דברים שכבר ידעת.' };
      const n = pick(s, pool);
      const t = revealTrait(s, n.id);
      const extra = chance(s, 0.4) ? ` ובנוסף: יציבות הקואליציה בערך ${Math.round(s.coalition.stability)}/100.` : '';
      return { text: `שמעת על ${n.name}: ${t ? TRAIT_INFO[t].name + ' – ' + TRAIT_INFO[t].desc : ''}${extra}` };
    },
  },
  // ---------- חדרי סיעות ----------
  {
    id: 'faction_meeting', loc: 'factions', icon: '🚪', label: 'ישיבת סיעה', ap: 1,
    desc: 'להיות נוכח, להשמיע קול ולהראות נאמנות.',
    avail: all(needParty, (s) => (s.player.isMK || s.player.employerId ? null : 'רק ח"כים ועוזרים')),
    run: (s) => run(s, [{ op: 'partyStanding', d: 3 }, { op: 'att', who: '@leader', d: 3 }], 'השתתפת בישיבת הסיעה ותמכת בקו של היו"ר.'),
  },
  {
    id: 'dissent', loc: 'factions', icon: '✊', label: 'ביקורת פנימית', ap: 1,
    desc: 'לומר ליו"ר בפנים מה שאחרים לוחשים. בונה עקביות ותומכים – ויריבים.',
    avail: all(needParty, needMK),
    run: (s) => {
      const mates = partyMKs(s, s.player.partyId!).filter((id) => id !== 'player' && s.npcs[id]);
      for (const id of mates) {
        const align = leanAlignment(s.npcs[id].ideology, signatureLean(s));
        if (align > 0.6) changeAttitude(s, id, 4, { spread: false });
      }
      return run(s, [{ op: 'partyStanding', d: -3 }, { op: 'consistency', d: 2 }, { op: 'fame', d: 1 }, { op: 'att', who: '@leader', d: -6 }], 'מתחת לפני השטח – יש מי שמסכים איתך.');
    },
  },
  {
    id: 'ask_committee', loc: 'factions', icon: '🪑', label: 'לבקש שיבוץ בוועדה', ap: 1,
    desc: 'לבקש מהנהלת הסיעה מקום בוועדה נוספת.',
    avail: all(needMK, needParty, (s) => (s.player.committees.length >= 2 ? 'כבר חבר בשתי ועדות' : null)),
    run: (s) => {
      const party = s.parties[s.player.partyId!];
      const leader = s.npcs[party.leaderId];
      const p = clamp(0.2 + s.player.partyStanding / 120 + (leader ? leader.attitude / 200 : 0.3), 0.05, 0.9);
      if (rand(s) > p) return { text: 'הנהלת הסיעה: "אין כרגע מקום. תוכיח את עצמך."', good: false };
      const options = COMMITTEE_DEFS.filter((c) => !s.player.committees.includes(c.id));
      const def = pick(s, options);
      const c = s.committees.find((x) => x.id === def.id)!;
      const mateIdx = c.members.findIndex((m) => m !== c.chairId && s.npcs[m]?.partyId === s.player.partyId);
      if (mateIdx >= 0) {
        changeAttitude(s, c.members[mateIdx], -10);
        c.members[mateIdx] = 'player';
      } else c.members.push('player');
      s.player.committees.push(c.id);
      return { text: `שובצת ב${c.name}!`, good: true };
    },
  },
  // ---------- רחבה ----------
  {
    id: 'protesters', loc: 'plaza', icon: '📣', label: 'לשוחח עם מפגינים', ap: 1,
    desc: 'מול המצלמות, עם הציבור. מחזק את מי שמסכים איתך.',
    run: (s) => {
      takeStance(s, signatureLean(s), 1.6);
      return run(s, [{ op: 'fame', d: 1.2 * mediaPower(s) }], 'המפגינים הריעו – או שרקו בוז, תלוי את מי שאלת.');
    },
  },
  {
    id: 'press', loc: 'plaza', icon: '🎥', label: 'הצהרה לתקשורת', ap: 1,
    desc: 'משפט חד מול המיקרופונים. הדובר שלך מגביר את האפקט.',
    run: (s) => run(s, [{ op: 'fame', d: (1.5 + s.player.skills.media / 50) * mediaPower(s) }, { op: 'skill', skill: 'media', d: 1 }], 'הציטוט שלך עלה לאתרי החדשות.'),
  },
  {
    id: 'lobby', loc: 'plaza', icon: '💼', label: 'פגישה עם לוביסט', ap: 1,
    desc: 'תרומות וקשרים, עם ריח לא נעים.',
    avail: needParty,
    run: (s) => {
      const l = Object.values(s.npcs).find((n) => n.role === 'lobbyist' && (s.presence.plaza ?? []).includes(n.id)) ?? Object.values(s.npcs).find((n) => n.role === 'lobbyist')!;
      changeAttitude(s, l.id, 5);
      const ops: Op[] = [{ op: 'money', d: 20 }, { op: 'capital', d: 1 }, { op: 'reputation', d: -1 }];
      if (chance(s, 0.25)) s.flags.lobbyMoney = true;
      return run(s, ops, `${l.name} שמח לעזור. "רק תזכור אותנו."`);
    },
  },
  // ---------- אולפנים ----------
  {
    id: 'interview', loc: 'studio', icon: '📺', label: 'ראיון באולפן', ap: 2,
    desc: 'במה גדולה. הצלחה מקפיצה מוכרות ותדמית; כישלון – פדיחה.',
    run: (s) => {
      const p = clamp(0.4 + s.player.skills.media / 120 + staffBonus(s, 'spokesperson') * 0.05, 0.1, 0.92);
      s.player.skills.media = clamp(s.player.skills.media + 1.5, 0, 100);
      if (rand(s) < p) {
        takeStance(s, signatureLean(s), 2.5);
        addNews(s, `${s.player.name} בראיון: "הגיע הזמן לשינוי אמיתי"`, 'good', true);
        return run(s, [{ op: 'fame', d: 4 * mediaPower(s) }], 'ראיון מצוין! הקליפ מסתובב ברשתות.');
      }
      addNews(s, `פדיחה באולפן: ${s.player.name} הסתבך/ה בשאלה פשוטה`, 'bad', true);
      return run(s, [{ op: 'fame', d: 2 }, { op: 'approval', sector: 'all', d: -2 }], 'המגיש תפס אותך לא מוכן. אאוץ׳.', false);
    },
  },
  {
    id: 'oped', loc: 'studio', icon: '📰', label: 'מאמר דעה', ap: 1,
    desc: 'טיעון מנומק. פחות רעש, יותר אמינות.',
    run: (s) => {
      takeStance(s, signatureLean(s), 1);
      return run(s, [{ op: 'reputation', d: 1.5 }, { op: 'consistency', d: 2 }, { op: 'fame', d: 0.8 }], 'המאמר פורסם במדור הדעות.');
    },
  },
  {
    id: 'social', loc: 'studio', icon: '📱', label: 'פוסט ברשתות', ap: 1,
    desc: 'מהיר, זול ומסוכן מעט.',
    run: (s) => {
      takeStance(s, signatureLean(s), 0.8);
      if (chance(s, 0.12)) return run(s, [{ op: 'fame', d: 1 }, { op: 'approval', sector: 'all', d: -1.5 }], 'הפוסט עורר סערת ביקורת.', false);
      return run(s, [{ op: 'fame', d: 1.3 * mediaPower(s) }], 'הפוסט זכה לאלפי שיתופים.');
    },
  },
  // ---------- מטה מפלגה ----------
  {
    id: 'fundraise', loc: 'partyhq', icon: '💰', label: 'גיוס כספים', ap: 1,
    desc: 'ערבי התרמה ותורמים קטנים. כמה שאתה מוכר יותר – קל יותר.',
    run: (s) => {
      const amount = Math.round((8 + s.player.fame * 0.9 + s.player.skills.organization * 0.2) * (0.7 + rand(s) * 0.6));
      return run(s, [{ op: 'money', d: amount }, { op: 'skill', skill: 'organization', d: 0.5 }], `גייסת ${amount} אלף ₪.`);
    },
  },
  {
    id: 'members', loc: 'partyhq', icon: '🙋', label: 'כנס מתפקדים', ap: 1,
    desc: 'לפגוש את מי שבוחר את הרשימה. מעמד במפלגה ותמיכה בפריימריז.',
    avail: needParty,
    run: (s) => {
      const ops: Op[] = [{ op: 'partyStanding', d: 3.5 }, { op: 'skill', skill: 'organization', d: 1 }];
      if (s.player.wantsList) s.player.primariesScore += 2;
      return run(s, ops, 'אולם מלא מתפקדים. החתמת עוד כמה עשרות תומכים.');
    },
  },
  {
    id: 'register_list', loc: 'partyhq', icon: '🗳️', label: 'להגיש מועמדות לרשימה', ap: 0, money: 10,
    desc: 'להיכנס למרוץ לרשימה לכנסת הבאה.',
    avail: (s) =>
      !s.player.partyId ? 'צריך מפלגה' : s.player.isMK ? 'כח"כ אתה רץ אוטומטית' : s.player.wantsList ? 'כבר הגשת מועמדות' : s.week >= s.primariesWeek ? 'הרשימות כבר נסגרו' : null,
    run: (s) => {
      s.player.wantsList = true;
      return { text: 'הגשת מועמדות. עכשיו צריך לגייס תמיכה.', good: true };
    },
  },
  {
    id: 'primaries_campaign', loc: 'partyhq', icon: '📣', label: 'קמפיין לרשימה', ap: 2, money: 40,
    desc: 'שלטים, מוקד טלפוני וחוגי בית למתפקדים / לחץ על מוסדות המפלגה.',
    avail: (s) => (!s.player.wantsList && !s.player.isMK ? 'קודם להגיש מועמדות' : s.week >= s.primariesWeek ? 'הרשימות כבר נסגרו' : s.player.partyId && s.parties[s.player.partyId].playerFounded ? 'אתה בראש הרשימה' : null),
    run: (s) => {
      s.player.primariesScore += 6;
      return run(s, [{ op: 'partyStanding', d: 1.5 }, { op: 'fame', d: 0.5 }], 'הקמפיין יצא לדרך. השם שלך בכל קבוצת ווטסאפ של מתפקדים.');
    },
  },
  {
    id: 'party_menu', loc: 'partyhq', icon: '🔀', label: 'הצטרפות / מעבר / הקמת מפלגה', ap: 0,
    desc: 'לנהל את השייכות המפלגתית שלך.',
    run: () => ({ text: '', open: 'party' }),
  },
  {
    id: 'recruit', loc: 'partyhq', icon: '🧲', label: 'גיוס מועמדים לרשימה', ap: 1,
    desc: 'לשכנע אנשים טובים להצטרף למפלגה החדשה.',
    avail: (s) => (s.player.partyId && s.parties[s.player.partyId].playerFounded ? null : 'רק למפלגה שהקמת'),
    run: (s) => {
      const r = recruitCandidate(s);
      return { text: r.text, good: r.ok };
    },
  },
  // ---------- שטח ----------
  {
    id: 'home_circle', loc: 'field', icon: '🏠', label: 'חוג בית', ap: 1,
    desc: 'ערב בסלון של תומכים. מחזק את המגזר הקרוב אליך.',
    run: (s) => {
      const sec = [...SECTORS].sort((a, b) => leanAlignment(SECTOR_IDEOLOGY[b], s.player.ideology) - leanAlignment(SECTOR_IDEOLOGY[a], s.player.ideology))[0];
      const ops: Op[] = [{ op: 'approval', sector: sec, d: 2.2 }, { op: 'fame', d: 0.5 }, { op: 'partyStanding', d: 1 }];
      return run(s, ops, `חוג בית מוצלח בקהל ${SECTOR_NAMES[sec]}.`);
    },
  },
  {
    id: 'outreach', loc: 'field', icon: '🤝', label: 'ביקור בקהילה שלא מכירה אותך', ap: 2,
    desc: 'ללכת דווקא למגזר שבו התדמית שלך הכי חלשה.',
    run: (s) => {
      const sec = [...SECTORS].sort((a, b) => s.player.approval[a] - s.player.approval[b])[0];
      return run(s, [{ op: 'approval', sector: sec, d: 3.5 }, { op: 'fame', d: 1 }, { op: 'consistency', d: 1 }], `ביקור מרגש בקרב ${SECTOR_NAMES[sec]}. גשרים נבנים לאט.`);
    },
  },
  {
    id: 'periphery', loc: 'field', icon: '🚗', label: 'סיור בפריפריה', ap: 2,
    desc: 'עיירות פיתוח, מושבים וכפרים. התקשורת אוהבת את זה.',
    run: (s) => run(s, [{ op: 'approval', sector: 'traditional', d: 2.5 }, { op: 'approval', sector: 'olim', d: 1.5 }, { op: 'approval', sector: 'arab', d: 1 }, { op: 'fame', d: 2 }], 'סיור ארוך ומתיש – והתמונות מצוינות.'),
  },
];

export const actionsAt = (loc: LocationId) => ACTIONS.filter((a) => a.loc === loc);

export function actionBlocked(s: GameState, a: ActionDef): string | null {
  if (s.player.ap < a.ap) return 'אין מספיק זמן השבוע';
  if (a.money && s.player.money < a.money) return `נדרשים ${a.money} אלף ₪`;
  if (a.capital && s.player.capital < a.capital) return 'אין מספיק הון פוליטי';
  return a.avail ? a.avail(s) : null;
}

export function performAction(s: GameState, id: string): ActionResult {
  const a = ACTIONS.find((x) => x.id === id);
  if (!a) return { text: 'פעולה לא קיימת', good: false };
  const blocked = actionBlocked(s, a);
  if (blocked) return { text: blocked, good: false };
  s.player.ap -= a.ap;
  if (a.money) s.player.money -= a.money;
  if (a.capital) s.player.capital -= a.capital;
  const res = a.run(s);
  if (res.text && !res.open) log(s, `${a.label}: ${res.text}`, 'action');
  return res;
}
