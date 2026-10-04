import { addStat } from './stats';
import { inSession } from './calendar';
import { COMMITTEE_DEFS } from './data/committees';
import { applyOps, type Op } from './ops';
import { chance, pick, rand } from './rng';
import { isCoalition, partyMKs } from './systems/government';
import { addNews } from './systems/news';
import { takeStance } from './systems/opinion';
import { challengeLeader, leadershipBlocked, recruitCandidate } from './systems/parties';
import { threatenQuit, tryNoConfidence } from './systems/coalition';
import { askBudget } from './systems/ministry';
import { pressFactor } from './systems/influence';
import { directRival, playerLeads } from './systems/mergers';
import { checkMissions } from './systems/missions';
import { scheduleEvent, strikeChance } from './systems/issues';
import { CABINET_EVENTS } from './data/events';
import { addMemory, changeAttitude, revealTrait, TRAIT_INFO } from './systems/relationships';
import { log } from './systems/report';
import { staffBonus } from './systems/staff';
import type { GameState, Ideology, LocationId } from './types';
import { AXES, SECTORS, SECTOR_IDEOLOGY, SECTOR_NAMES, clamp, leanAlignment } from './util';

export type OpenPanel = 'billBuilder' | 'staff' | 'party' | 'bills' | 'coalition' | 'ministry' | 'caucus' | 'alliances';

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

const mediaPower = (s: GameState) => (1 + staffBonus(s, 'spokesperson') * 0.12 + s.player.skills.media / 200) * pressFactor(s);

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
      const cid = pick(s, s.player.committees);
      const c = s.committees.find((x) => x.id === cid);
      if (!c) return { text: 'הוועדה לא מתכנסת השבוע.', good: false };
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
      addStat(s, 'reputation', 0.5);
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
      // עייפות תורמים: גיוס חוזר בתוך חודש וחצי מכניס פחות
      const recent = String(s.flags.fundLog ?? '').split(',').filter((w) => w && s.week - Number(w) < 6).length;
      s.flags.fundLog = [...String(s.flags.fundLog ?? '').split(',').filter((w) => w && s.week - Number(w) < 6), s.week].join(',');
      const amount = Math.round(((6 + s.player.fame * 0.5 + s.player.skills.organization * 0.15) * (0.7 + rand(s) * 0.6)) / (1 + recent));
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
    id: 'alliances', loc: 'partyhq', icon: '🤝', label: 'איחודים ובריתות', ap: 0,
    desc: 'רשימה משותפת או הסכם עודפים – להציל קולות מתחת לאחוז החסימה, או לבנות גוש גדול.',
    avail: needParty,
    run: () => ({ text: '', open: 'alliances' }),
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
  // ---------- שלב 2: ממשלה וקואליציה ----------
  {
    id: 'no_confidence', loc: 'plenum', icon: '🗳️', label: 'הצעת אי-אמון', ap: 1,
    desc: 'אי-אמון קונסטרוקטיבי: עובר רק אם 61 ח"כים תומכים בממשלה חלופית.',
    avail: all(needMK, needSession, (s) => (isCoalition(s, s.player.partyId) ? 'אתה בקואליציה' : null), (s) => (s.week - Number(s.flags.nocWeek ?? -99) < 4 ? 'הגשת לאחרונה – חכה כמה שבועות' : null)),
    run: (s) => {
      s.flags.nocWeek = s.week;
      addStat(s, 'fame', 2);
      const r = tryNoConfidence(s);
      if (!r.passed) addNews(s, `הצעת האי-אמון של ${s.player.name} נדחתה`, 'neutral', true);
      return { text: r.text, good: r.passed };
    },
  },
  {
    id: 'cabinet', loc: 'pmo', icon: '🏛️', label: 'ישיבת ממשלה', ap: 1,
    desc: 'החלטות שמחייבות את כל השרים. להצביע עם ראש הממשלה – או לא.',
    avail: (s) => (s.player.ministry || s.coalition.pmId === 'player' ? null : 'רק לשרים'),
    run: (s) => {
      const recent = (id: string) => s.week - (s.eventsFired[id] ?? -99) < 10;
      const pool = CABINET_EVENTS.filter((id) => !recent(id));
      const id = pool.length ? pick(s, pool) : pick(s, CABINET_EVENTS);
      s.eventsFired[id] = s.week;
      s.eventQueue.push({ eventId: id, ctx: {} });
      return { text: 'הישיבה נפתחה. על השולחן: החלטה קשה.' };
    },
  },
  {
    id: 'coalition_panel', loc: 'pmo', icon: '🤝', label: 'ניהול הקואליציה', ap: 0,
    desc: 'שביעות רצון השותפות, ההסכם הקואליציוני ופגישות.',
    run: () => ({ text: '', open: 'coalition' }),
  },
  {
    id: 'threaten', loc: 'pmo', icon: '😤', label: 'לאיים בפרישה מהממשלה', ap: 1,
    desc: 'כראש מפלגה שותפה: לחץ שמביא הטבות לבוחרים שלך – ומרגיז את ראש הממשלה.',
    avail: (s) => {
      const p = s.player.partyId ? s.parties[s.player.partyId] : null;
      if (!p || p.leaderId !== 'player' || !isCoalition(s, p.id) || s.coalition.pmId === 'player') return 'רק לראש מפלגה שותפה';
      return s.week - Number(s.flags.threatWeek ?? -99) < 8 ? 'איימת לא מזמן – זה יישחק' : null;
    },
    run: (s) => ({ text: threatenQuit(s), good: true }),
  },
  {
    id: 'coalition_funds', loc: 'finance', icon: '💰', label: 'לדרוש כספים קואליציוניים', ap: 2,
    desc: 'תקציב ייעודי לבוחרים שלך. ככל שהקואליציה רעועה – כוח המיקוח שלך גדול יותר.',
    avail: (s) =>
      !s.player.isMK || !isCoalition(s, s.player.partyId)
        ? 'רק לח"כ בקואליציה'
        : s.flags.fundsYear === Math.floor(s.week / 52)
          ? 'כבר קיבלת השנה'
          : null,
    run: (s) => {
      s.flags.fundsYear = Math.floor(s.week / 52);
      const fin = s.npcs[s.ministers.finance];
      const p = clamp(0.25 + s.player.skills.negotiation / 200 + s.player.partyStanding / 300 + (60 - s.coalition.stability) / 150 + (s.coalition.pmId === 'player' ? 0.4 : 0), 0.05, 0.92);
      if (rand(s) < p) {
        const sec = [...SECTORS].sort((a, b) => leanAlignment(SECTOR_IDEOLOGY[b], s.player.ideology) - leanAlignment(SECTOR_IDEOLOGY[a], s.player.ideology))[0];
        if (fin) changeAttitude(s, fin.id, -5);
        return run(s, [{ op: 'approval', sector: sec, d: 3.5 }, { op: 'capital', d: 2 }, { op: 'world', key: 'economy', d: -0.5, weeks: 8 }], `הוקצו 300 מיליון ₪ ל${SECTOR_NAMES[sec]} – בזכותך.`);
      }
      if (fin) changeAttitude(s, fin.id, -3);
      return { text: `${fin?.name ?? 'האוצר'}: "אין שקל אחד מיותר". נדחית.`, good: false };
    },
  },
  {
    id: 'ministry_budget', loc: 'finance', icon: '📑', label: 'מו"מ על תקציב המשרד', ap: 1,
    desc: 'לבקש תוספת לתקציב התכניות של המשרד שלך.',
    avail: (s) => (!s.ministryState ? 'רק לשרים' : s.week - s.ministryState.budgetAskedWeek < 26 ? 'כבר ביקשת בחצי השנה האחרונה' : null),
    run: (s) => {
      const r = askBudget(s);
      return { text: r.text, good: r.ok };
    },
  },
  {
    id: 'ministry_panel', loc: 'ministry', icon: '🗂️', label: 'לשכת השר/ה', ap: 0,
    desc: 'תכניות דגל, מינוי מנכ"ל ותקציב.',
    run: () => ({ text: '', open: 'ministry' }),
  },
  {
    id: 'ministry_tour', loc: 'ministry', icon: '🚶', label: 'סיור באגפי המשרד', ap: 1,
    desc: 'להכיר את הפקידות, לשמוע בעיות ולשפר ביצועים.',
    avail: (s) => (s.ministryState ? null : 'רק לשרים'),
    run: (s) => {
      s.ministryState!.performance = clamp(s.ministryState!.performance + 2.5, 0, 100);
      return run(s, [{ op: 'skill', skill: 'organization', d: 1.5 }, { op: 'fame', d: 0.5 }], 'העובדים התרשמו שהשר/ה מגיע/ה לשטח.');
    },
  },
  {
    id: 'gov_bill', loc: 'ministry', icon: '📜', label: 'תזכיר חוק ממשלתי', ap: 0,
    desc: 'הצעת חוק של הממשלה: מדלגת על הקריאה הטרומית אם ועדת השרים מאשרת.',
    avail: (s) => (s.player.ministry ? null : 'רק לשרים'),
    run: () => ({ text: '', open: 'billBuilder' }),
  },
  {
    id: 'leadership', loc: 'partyhq', icon: '👑', label: 'להתמודד על ראשות המפלגה', ap: 2,
    desc: 'להדיח את היו"ר. ניצחון = הדרך לראשות הממשלה. הפסד = אויב בצמרת.',
    avail: (s) => leadershipBlocked(s),
    run: (s) => {
      const r = challengeLeader(s);
      return { text: r.text, good: r.ok };
    },
  },
  // ---------- שלב 3: פעולות נוספות ----------
  {
    id: 'rally', loc: 'field', icon: '🎉', label: 'עצרת המונים', ap: 2, money: 30,
    desc: 'אלפי תומכים, במה ודגלים. מוכרות, מעמד במפלגה ועמדה ברורה.',
    avail: needParty,
    run: (s) => {
      takeStance(s, signatureLean(s), 2.5);
      return run(s, [{ op: 'fame', d: 3 * mediaPower(s) }, { op: 'partyStanding', d: 2 }], 'הכיכר התמלאה. התמונות מהרחפן בכל מקום.');
    },
  },
  {
    id: 'digital', loc: 'studio', icon: '🎯', label: 'קמפיין דיגיטלי ממומן', ap: 1, money: 25,
    desc: 'פרסום ממוקד בקהל הקרוב אליך ברשתות.',
    run: (s) => {
      const sec = [...SECTORS].sort((a, b) => leanAlignment(SECTOR_IDEOLOGY[b], s.player.ideology) - leanAlignment(SECTOR_IDEOLOGY[a], s.player.ideology))[0];
      return run(s, [{ op: 'approval', sector: sec, d: 2.5 }, { op: 'fame', d: 1 }], `הקמפיין רץ בקרב ${SECTOR_NAMES[sec]}.`);
    },
  },
  {
    id: 'negative', loc: 'studio', icon: '🗡️', label: 'קמפיין שלילי נגד המתחרה', ap: 1, money: 20,
    desc: 'לתקוף את המפלגה שמתחרה על אותם מצביעים. עובד – אבל מלכלך, ולפעמים מתפוצץ בפנים.',
    avail: (s) => (!s.player.partyId ? 'צריך מפלגה' : directRival(s) ? null : 'אין מתחרה ישירה'),
    preview: (s) => {
      const rival = directRival(s)!;
      const k = playerLeads(s) ? 1 : 0.5;
      return [{ op: 'momentum', party: rival.id, d: -(1.5 + s.player.skills.media / 50) * k }, { op: 'momentum', party: '@player', d: 0.5 * k }, { op: 'reputation', d: -2 }];
    },
    run: (s) => {
      const rival = directRival(s)!;
      const k = playerLeads(s) ? 1 : 0.5;
      if (chance(s, 0.2)) {
        addNews(s, `הקמפיין של ${s.parties[s.player.partyId!].short} נגד ${rival.short} התפוצץ: "פוליטיקה מלוכלכת"`, 'bad', true);
        return run(s, [{ op: 'momentum', party: '@player', d: -1 * k }, { op: 'reputation', d: -3 }], 'הקמפיין התפוצץ בפנים. התגובות ברשתות – נגדך.', false);
      }
      changeAttitude(s, rival.leaderId, -15);
      return run(s, [{ op: 'momentum', party: rival.id, d: -(1.5 + s.player.skills.media / 50) * k }, { op: 'momentum', party: '@player', d: 0.5 * k }, { op: 'reputation', d: -2 }], `הקמפיין נגד ${rival.short} עובד: הם מתגוננים.`);
    },
  },
  {
    id: 'press_dinner', loc: 'cafeteria', icon: '🍷', label: 'ארוחת שישי עם עיתונאים', ap: 1, money: 5,
    desc: 'שיחות רקע. עיתונאים ידידותיים מגבירים כל הופעה שלך בתקשורת.',
    run: (s) => {
      for (const n of Object.values(s.npcs)) if (n.role === 'journalist') changeAttitude(s, n.id, 5, { spread: false });
      return { text: 'הכתבים הפוליטיים יצאו עם "חומר רקע" – ויחס חם יותר.', good: true };
    },
  },
  {
    id: 'delegation', loc: 'offices', icon: '✈️', label: 'משלחת פרלמנטרית לחו"ל', ap: 3,
    desc: 'שבוע בבירה זרה עם ח"כים מכל הסיעות. רק בפגרה.',
    avail: all(needMK, (s) => (inSession(s) ? 'רק בפגרה' : null)),
    run: (s) => {
      const mks = Object.values(s.npcs).filter((n) => n.isMK);
      const lines: string[] = [];
      for (let i = 0; i < 4; i++) {
        const n = pick(s, mks);
        changeAttitude(s, n.id, 8, { spread: false });
        addMemory(s, n.id, 'יצאנו יחד למשלחת', 8);
        lines.push(n.name);
      }
      return run(s, [{ op: 'reputation', d: 1 }], `התגבשת עם ${lines.join(', ')}.`);
    },
  },
  {
    id: 'caucus', loc: 'committees', icon: '🧩', label: 'שדולות בכנסת', ap: 0,
    desc: 'להקים שדולה חוצת-סיעות לנושא – ולגייס תמיכה קבועה בהצבעות.',
    avail: needMK,
    run: () => ({ text: '', open: 'caucus' }),
  },
  // ---------- שלב 3: בית המשפט ----------
  {
    id: 'petition', loc: 'court', icon: '📄', label: 'להגיש עתירה נגד חוק', ap: 1, money: 20,
    desc: 'עתירה לבג"ץ נגד החוק האחרון שעבר ואת/ה מתנגד/ת לו. שכר טרחה: 20 אלף ₪.',
    avail: (s) => (petitionTarget(s) ? null : 'אין חוק שעבר לאחרונה שאפשר לעתור נגדו'),
    run: (s) => {
      const law = petitionTarget(s)!;
      scheduleEvent(s, 'petition', 2, { law: law.templateId, title: law.title });
      takeStance(s, { judiciary: -40 }, 1);
      addStat(s, 'fame', 1.5);
      return { text: `העתירה נגד "${law.title}" הוגשה. סיכוי פסילה מוערך: ${Math.round(strikeChance(s, law.templateId) * 100)}%.` };
    },
  },
  {
    id: 'court_attack', loc: 'court', icon: '🔨', label: 'לתקוף את "שלטון השופטים"', ap: 1,
    desc: 'נאום חריף מול בית המשפט. הבסיס הימני אוהב, המרכז נבהל.',
    run: (s) => {
      takeStance(s, { judiciary: 85 }, 2.5);
      return run(s, [{ op: 'fame', d: 2 }, { op: 'world', key: 'trust', d: -0.5, weeks: 2 }], 'הנאום הוביל את המהדורות.');
    },
  },
  {
    id: 'court_defend', loc: 'court', icon: '🛡️', label: 'להגן על בית המשפט', ap: 1,
    desc: 'שרשרת אנושית סביב העליון. המרכז-שמאל מריע, הימין זועם.',
    run: (s) => {
      takeStance(s, { judiciary: -85 }, 2.5);
      return run(s, [{ op: 'fame', d: 2 }, { op: 'world', key: 'trust', d: 0.5, weeks: 2 }], 'אלפים הצטרפו אליך.');
    },
  },
];

export const actionsAt = (loc: LocationId) => ACTIONS.filter((a) => a.loc === loc);

/** החוק האחרון שעבר (שלא השחקן הגיש) – יעד לעתירה */
export function petitionTarget(s: GameState) {
  return [...s.lawsPassed]
    .reverse()
    .find((l) => !l.struck && l.sponsor !== 'player' && !l.coSponsor && s.week - l.week <= 52 && !s.scheduled.some((x) => x.eventId === 'petition' && x.ctx.law === l.templateId));
}

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
  s.counters[`act_${a.id}`] = (s.counters[`act_${a.id}`] ?? 0) + 1;
  if (a.money) s.player.money -= a.money;
  if (a.capital) s.player.capital -= a.capital;
  const res = a.run(s);
  const done = checkMissions(s);
  if (done.length) res.lines = [...(res.lines ?? []), ...done.map((d) => `✅ משימה הושלמה: ${d}`)];
  if (res.text && !res.open) log(s, `${a.label}: ${res.text}`, 'action');
  return res;
}
