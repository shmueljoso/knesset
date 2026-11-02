// עולם מותאם אישית לפני המשחק: כללי משחק, חוקים שכבר בתוקף, מצב המדינה, הסוגיות, רוח הציבור והסקרים.
// אחרי הפתיחה הערכים "נעולים": אי אפשר לערוך אותם בכלים המתקדמים (settings.locked).
import { templateById } from '../data/bills';
import { TRANSFORM_INFO } from '../data/transforms';
import { ISSUES } from '../data/issues';
import type { GameState, Ideology, IssueId, Rules, TransformId, WorldKey } from '../types';
import { AXES, clamp } from '../util';
import { recomputeStability } from './coalition';
import { applyRule } from './issues';
import { WORLD_NAMES } from './opinion';

export type SetupRuleKey = 'presidential' | 'directPM' | 'norwegian' | 'termLimit' | 'override' | 'noReview' | 'packedCourt' | 'electoral' | 'compulsory' | 'age16' | 'allPrimaries';

export interface StartSetup {
  rules?: Partial<Pick<Rules, SetupRuleKey | 'threshold' | 'districtShare' | 'termWeeks'>>;
  /** חוקים שכבר בתוקף בפתיחה */
  laws?: { id: string; scope: 1 | 2 | 3 }[];
  /** מהפכות שכבר קרו */
  transforms?: TransformId[];
  world?: Partial<Record<WorldKey, number>>;
  issues?: Partial<Record<IssueId, number>>;
  mood?: Partial<Ideology>;
  /** אחוז בסקרים לכל מפלגה (השאר מתחלק באופן יחסי) */
  polls?: Record<string, number>;
  /** לנעול: בלי עריכה בכלים המתקדמים (ברירת מחדל: כן) */
  locked?: boolean;
}

export const SETUP_RULES: { key: SetupRuleKey; label: string; desc: string }[] = [
  { key: 'presidential', label: '🏛️ שיטה נשיאותית', desc: 'ראש הממשלה נבחר/ת ישירות ולא תלוי/ה בקואליציה. אין אי-אמון ואין בחירות מוקדמות.' },
  { key: 'directPM', label: '🗳️ בחירה ישירה (1996)', desc: 'פתק נפרד לראשות הממשלה, ואי-אמון מוביל לבחירות.' },
  { key: 'electoral', label: '🇺🇸 אלקטורים לראשות הממשלה', desc: 'ראש הממשלה נקבע לפי מחוזות: המנצח במחוז לוקח את כל האלקטורים שלו.' },
  { key: 'compulsory', label: '📮 חובת הצבעה', desc: 'מגזרים עם הצבעה נמוכה מצביעים יותר.' },
  { key: 'age16', label: '🧒 גיל הצבעה 16', desc: 'הצעירים נכנסים לקלפי.' },
  { key: 'allPrimaries', label: '🗳️ פריימריז חובה', desc: 'כל המפלגות בוחרות רשימה בפריימריז.' },
  { key: 'norwegian', label: '🔁 החוק הנורבגי', desc: 'שרים מפנים את המושב לבא/ה ברשימה.' },
  { key: 'termLimit', label: '⏳ הגבלת כהונה', desc: 'ראש ממשלה מוגבל/ת במספר קדנציות.' },
  { key: 'override', label: '⚖️ פסקת התגברות', desc: 'הכנסת יכולה לחוקק מחדש חוק שנפסל.' },
  { key: 'packedCourt', label: '👨‍⚖️ הקואליציה ממנה שופטים', desc: 'בג"ץ פוסל פחות.' },
  { key: 'noReview', label: '🚫 בלי ביקורת שיפוטית', desc: 'בג"ץ לא יכול לפסול חוקים.' },
];

/** מהפכות שאפשר לבחור בפתיחה (שיטה נשיאותית וריבונות הכנסת – דרך הכללים) */
export const SETUP_TRANSFORMS: TransformId[] = ['volunteer', 'secular', 'halacha', 'peace', 'annexation', 'ubi', 'libertarian', 'citizens', 'constitution'];

export const transformLabel = (id: TransformId) => `${TRANSFORM_INFO[id].icon} ${TRANSFORM_INFO[id].name}`;

export function applySetup(s: GameState, setup: StartSetup, fromMod = false) {
  // חוקים בתוקף: כאילו עברו לפני כשנה (בלי לשנות את מצב המדינה – אותו קובעים כאן ידנית)
  for (const l of setup.laws ?? []) {
    let t;
    try {
      t = templateById(l.id);
    } catch {
      continue;
    }
    if (!t || t.radical || s.lawsPassed.some((x) => x.templateId === l.id && !x.struck)) continue;
    const scope = clamp(Math.round(l.scope), 1, 3) as 1 | 2 | 3;
    s.lawsPassed.push({ templateId: t.id, title: t.title, scope, week: s.week - 60, sponsor: 'history' });
    if (t.rule) applyRule(s, t.rule, scope);
  }
  for (const id of setup.transforms ?? []) {
    if (!TRANSFORM_INFO[id] || s.transforms.some((x) => x.id === id)) continue;
    s.transforms.push({ id, week: 0, scope: 2, sponsor: 'history' });
  }
  // כללים: אחרי החוקים, כדי שהבחירה המפורשת תקבע
  const r = setup.rules ?? {};
  if (typeof r.threshold === 'number') s.rules.threshold = clamp(r.threshold, 0, 15);
  if (typeof r.districtShare === 'number') {
    s.rules.districtShare = clamp(r.districtShare, 0, 1);
    s.rules.districts = false;
  }
  if (typeof r.termWeeks === 'number') {
    s.rules.termWeeks = clamp(Math.round(r.termWeeks), 104, 364);
    s.electionWeek = s.week + Math.max(30, s.electionWeek - s.week + (s.rules.termWeeks - 208));
    s.primariesWeek = s.electionWeek - 12;
  }
  for (const { key } of SETUP_RULES) if (r[key] !== undefined) (s.rules as unknown as Record<string, boolean>)[key] = !!r[key];
  if (s.rules.presidential && s.rules.directPM) s.rules.directPM = false;
  if (s.rules.electoral && !s.rules.presidential && !s.rules.directPM) s.rules.directPM = true;
  if (s.rules.allPrimaries) for (const p of Object.values(s.parties)) p.primaries = true;
  if (s.rules.directPM || s.rules.presidential) s.coalition.minoritySince = null;
  if (s.rules.presidential && !s.transforms.some((x) => x.id === 'presidential')) s.transforms.push({ id: 'presidential', week: 0, scope: 2, sponsor: 'history' });
  if (s.rules.noReview && !s.transforms.some((x) => x.id === 'sovereignty')) s.transforms.push({ id: 'sovereignty', week: 0, scope: 3, sponsor: 'history' });
  // מצב המדינה, סוגיות ורוח הציבור
  for (const [k, v] of Object.entries(setup.world ?? {})) if (k in s.world && typeof v === 'number') s.world[k as WorldKey] = clamp(v, 0, 100);
  for (const [k, v] of Object.entries(setup.issues ?? {})) if (k in s.issues && typeof v === 'number') s.issues[k as IssueId] = clamp(v, 0, 100);
  for (const a of AXES) if (typeof setup.mood?.[a] === 'number') s.mood[a] = clamp(setup.mood[a]!, -50, 50);
  // סקרים: מה שנקבע – בדיוק; השאר מתחלק לפי היחס הקיים
  const fixed = Object.entries(setup.polls ?? {}).filter(([id, v]) => s.parties[id] && typeof v === 'number');
  if (fixed.length) {
    const fixedSum = Math.min(100, fixed.reduce((a, [, v]) => a + clamp(v, 0, 100), 0));
    const rest = Object.values(s.parties).filter((p) => !fixed.some(([id]) => id === p.id));
    const restSum = rest.reduce((a, p) => a + p.poll, 0) || 1;
    for (const [id, v] of fixed) s.parties[id].poll = s.parties[id].base = Math.max(0.1, clamp(v, 0, 100));
    for (const p of rest) p.poll = p.base = Math.max(0.1, (p.poll / restSum) * (100 - fixedSum));
    for (const p of Object.values(s.parties)) p.momentum = 0;
  }
  if (!fromMod) {
    s.settings.locked = setup.locked !== false;
    s.flags.customStart = true;
  }
  recomputeStability(s);
}

/** תקציר לתצוגה */
export function setupSummary(setup: StartSetup | null | undefined): string[] {
  if (!setup) return [];
  const out: string[] = [];
  for (const { key, label } of SETUP_RULES) if (setup.rules?.[key]) out.push(label);
  if (typeof setup.rules?.threshold === 'number') out.push(`📊 חסימה ${setup.rules.threshold}%`);
  if (typeof setup.rules?.districtShare === 'number' && setup.rules.districtShare > 0) out.push(`🗺️ ${Math.round(setup.rules.districtShare * 100)}% מהמושבים במחוזות`);
  if (typeof setup.rules?.termWeeks === 'number' && setup.rules.termWeeks !== 208) out.push(`📅 כנסת של ${Math.round(setup.rules.termWeeks / 52)} שנים`);
  for (const l of setup.laws ?? []) {
    try {
      out.push(`${templateById(l.id).icon} ${templateById(l.id).title}`);
    } catch {
      /* חוק שנמחק */
    }
  }
  for (const t of setup.transforms ?? []) out.push(transformLabel(t));
  if (Object.keys(setup.world ?? {}).length) out.push(`🌍 ${Object.keys(setup.world!).map((k) => WORLD_NAMES[k as WorldKey]).join(', ')}`);
  if (Object.keys(setup.issues ?? {}).length) out.push(`🔥 ${Object.keys(setup.issues!).map((k) => ISSUES.find((i) => i.id === k)?.name).join(', ')}`);
  if (Object.keys(setup.polls ?? {}).length) out.push(`📈 סקרים ל-${Object.keys(setup.polls!).length} מפלגות`);
  return out;
}

export const isLocked = (s: GameState) => !!s.settings?.locked;
