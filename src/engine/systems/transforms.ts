// שינויי משטר: מה קורה כשהצעה מרחיקת לכת עוברת, משאל העם, ובג"ץ.
import { SCOPE_FACTOR, templateById } from '../data/bills';
import { TRANSFORM_INFO } from '../data/transforms';
import { registerSpecial, type Ctx } from '../ops';
import { rand } from '../rng';
import type { GameState, TransformId, WorldKey } from '../types';
import { SECTORS, SECTOR_IDEOLOGY, SECTOR_WEIGHTS, clamp, leanAlignment } from '../util';
import { bumpIssue, scheduleEvent } from './issues';
import { listsOpen, spawnParty } from './mergers';
import { addNews } from './news';
import { addMomentum, addWorldEffect } from './opinion';
import { foundParty } from './parties';
import { log } from './report';

export const hasTransform = (s: GameState, id: TransformId) => (s.transforms ?? []).some((t) => t.id === id);

/** תמיכת הציבור (באחוזים) בהצעה, לפי עמדות המגזרים */
export function publicSupport(_s: GameState, templateId: string): number {
  const t = templateById(templateId);
  let sum = 0;
  for (const sec of SECTORS) sum += SECTOR_WEIGHTS[sec] * clamp(0.5 + 0.5 * leanAlignment(SECTOR_IDEOLOGY[sec], t.lean), 0.05, 0.95);
  return Math.round(sum * 100 + 10); // +10: "הכנסת כבר אישרה" נותן לגיטימציה
}

/** נקרא כשהצעה מרחיקת לכת עוברת בקריאה שלישית */
export function onRadicalPassed(s: GameState, templateId: string, scope: 1 | 2 | 3, sponsor: string) {
  const t = templateById(templateId);
  if (!t.radical) return;
  if (t.referendum) {
    const forecast = publicSupport(s, templateId);
    scheduleEvent(s, 'referendum', 4, { law: t.id, title: t.title, scope: String(scope), sponsor, forecast: String(forecast) });
    addNews(s, `"${t.title}" עברה בכנסת! בעוד חודש – משאל עם. סקר: ${forecast}% בעד`, 'neutral', true, undefined, 'ערוץ המשכן');
    return;
  }
  applyTransform(s, t.radical, scope, sponsor, templateId);
}

const fx = (s: GameState, key: WorldKey, total: number, weeks: number, id: TransformId, delay = 0) =>
  addWorldEffect(s, key, total, weeks, `${TRANSFORM_INFO[id].icon} ${TRANSFORM_INFO[id].name}`, delay);

function strikeLaws(s: GameState, ids: string[]) {
  for (const l of s.lawsPassed) if (ids.includes(l.templateId) && !l.struck) l.struck = true;
}

function swingBy(s: GameState, axis: 'econ' | 'security' | 'religion' | 'judiciary', d: number) {
  for (const p of Object.values(s.parties)) addMomentum(s, p.id, (p.ideology[axis] / 100) * d);
}

export function applyTransform(s: GameState, id: TransformId, scope: 1 | 2 | 3, sponsor: string, templateId: string) {
  if (hasTransform(s, id)) return;
  const k = SCOPE_FACTOR[scope];
  s.transforms.push({ id, week: s.week, scope, sponsor });
  const info = TRANSFORM_INFO[id];
  addNews(s, `${info.icon} ${info.headline}`, 'neutral', sponsor === 'player', info.now, 'ערוץ המשכן');
  log(s, `המדינה השתנתה: ${info.name}.`, 'system');
  const ctx = { law: templateId, title: templateById(templateId).title };
  switch (id) {
    case 'peace':
      fx(s, 'security', -8 * k, 4, id);
      fx(s, 'security', 16 * k, 80, id, 8);
      fx(s, 'economy', 12 * k, 60, id, 6);
      fx(s, 'cohesion', -10 * k, 12, id);
      fx(s, 'trust', 3, 10, id);
      bumpIssue(s, 'security', -40);
      swingBy(s, 'security', -3);
      scheduleEvent(s, 'peace_spoilers', 3, ctx);
      if (scope >= 2) scheduleEvent(s, 'peace_evacuation', 10, ctx); // הסכם מסגרת: עוד אין פינויים
      if (scope === 3) fx(s, 'cohesion', -5, 8, id); // ירושלים
      scheduleEvent(s, 'peace_dividend', 40, ctx);
      break;
    case 'annexation':
      fx(s, 'economy', -12 * k, 30, id);
      fx(s, 'security', -10 * k, 8, id);
      fx(s, 'cohesion', -8 * k, 12, id);
      fx(s, 'trust', -4, 10, id);
      bumpIssue(s, 'security', 35);
      swingBy(s, 'security', 2);
      scheduleEvent(s, 'annex_intifada', 2, ctx);
      scheduleEvent(s, 'annex_sanctions', 8, ctx);
      if (scope === 3) scheduleEvent(s, 'annex_citizenship', 26, ctx); // רק בסיפוח מלא עולה שאלת האזרחות
      break;
    case 'halacha':
      fx(s, 'economy', -16 * k, 52, id);
      fx(s, 'cohesion', -22 * k, 12, id);
      fx(s, 'trust', -12 * k, 12, id);
      bumpIssue(s, 'religion', 45);
      // מתון: משפט עברי כמקור מחייב. בינוני: בתי הדין מכריעים גם בענייני אזרחות. גבוה: מדינת הלכה מלאה
      strikeLaws(s, scope === 1 ? ['civil', 'conversion'] : ['shabbat', 'civil', 'cannabis', 'conversion', 'r_secular', 'basic_dignity']);
      if (scope >= 2) s.rules.equality = false;
      swingBy(s, 'religion', 1 + scope);
      if (scope >= 2) scheduleEvent(s, 'halacha_shabbat', 2, ctx);
      if (scope >= 2) scheduleEvent(s, 'halacha_resistance', 6, ctx);
      if (scope === 3) scheduleEvent(s, 'halacha_exodus', 12, ctx);
      if (!s.rules.noReview) scheduleEvent(s, 'radical_court', 5, { ...ctx, transform: id });
      break;
    case 'secular':
      fx(s, 'cohesion', -12 * k, 12, id);
      fx(s, 'economy', 5 * k, 52, id, 8);
      fx(s, 'affordability', 3 * k, 26, id, 4);
      bumpIssue(s, 'religion', 35);
      if (scope === 3) strikeLaws(s, ['yeshiva']); // רק בהפרדה מלאה נגמר תקצוב הישיבות
      swingBy(s, 'religion', -2);
      for (const p of Object.values(s.parties)) if (p.ideology.religion > 70) addMomentum(s, p.id, 0.5 * scope); // התגייסות חרדית
      if (scope >= 2) scheduleEvent(s, 'secular_revolt', 2, ctx); // פירוק הרבנות
      scheduleEvent(s, 'secular_wedding', 5, ctx);
      break;
    case 'constitution':
      s.rules.entrench = scope >= 2; // מגילת זכויות בלבד – בלי שריון
      s.rules.equality = true;
      s.rules.noReview = false;
      fx(s, 'trust', 10 * k, 20, id);
      fx(s, 'cohesion', 6 * k, 20, id);
      bumpIssue(s, 'judiciary', -50);
      scheduleEvent(s, 'constitution_day', 3, ctx);
      break;
    case 'sovereignty':
      // מתון: התגברות + ביטול הסבירות. בינוני: שליטה במינוי השופטים. גבוה: אין ביקורת שיפוטית
      s.rules.override = true;
      s.rules.packedCourt = scope >= 2;
      s.rules.noReview = scope === 3;
      fx(s, 'trust', -16 * k, 8, id);
      fx(s, 'economy', -7 * k, 20, id, 4);
      fx(s, 'cohesion', -10 * k, 8, id);
      bumpIssue(s, 'judiciary', 40);
      scheduleEvent(s, 'sovereign_protest', 1, ctx);
      scheduleEvent(s, 'sovereign_downgrade', 6, ctx);
      break;
    case 'presidential':
      if (scope === 1) {
        // בחירה ישירה (כמו 1996-2001): עדיין צריך קואליציה, אבל אי-אמון מוביל לבחירות. הבוחרים מפצלים את הפתק
        s.rules.directPM = true;
        for (const p of Object.values(s.parties)) addMomentum(s, p.id, p.seats >= 20 ? -3 : p.seats > 0 && p.seats <= 12 ? 1.5 : 0);
        fx(s, 'trust', 1, 10, id);
        scheduleEvent(s, 'direct_pm_first', 4, ctx);
        break;
      }
      s.rules.presidential = true;
      s.coalition.stability = Math.max(s.coalition.stability, 85);
      s.coalition.minoritySince = null;
      fx(s, 'trust', 2, 10, id);
      if (scope === 3) {
        // מחוזות בחירה: המפלגות הגדולות מתחזקות, הקטנות נמחקות
        s.rules.districts = true;
        for (const p of Object.values(s.parties)) addMomentum(s, p.id, p.seats >= 20 ? 3 : p.seats > 0 && p.seats <= 8 ? -2.5 : 0);
        scheduleEvent(s, 'districts_first', 6, ctx);
      }
      scheduleEvent(s, 'presidential_first', 4, ctx);
      break;
    case 'ubi':
      fx(s, 'affordability', 16 * k, 30, id, 4);
      fx(s, 'economy', -12 * k, 52, id, 8);
      fx(s, 'cohesion', 5 * k, 30, id, 4);
      bumpIssue(s, 'cost', -40);
      bumpIssue(s, 'wages', -30);
      scheduleEvent(s, 'ubi_payday', 4, ctx);
      scheduleEvent(s, 'ubi_inflation', 30, ctx);
      break;
    case 'libertarian':
      fx(s, 'economy', 14 * k, 52, id, 4);
      fx(s, 'affordability', -10 * k, 26, id);
      fx(s, 'cohesion', -10 * k, 20, id);
      bumpIssue(s, 'wages', 40);
      swingBy(s, 'econ', 1.5);
      scheduleEvent(s, 'lib_strike', 3, ctx);
      scheduleEvent(s, 'lib_boom', 40, ctx);
      break;
    case 'volunteer':
      fx(s, 'security', -5 * k, 20, id);
      fx(s, 'economy', 7 * k, 52, id, 6);
      // מתון: שירות של שנה – הוויכוח נרגע אבל לא נגמר. גבוה: צבא מקצועי מלא
      s.issues.draft = scope === 1 ? Math.max(0, s.issues.draft - 30) : 0;
      if (scope >= 2) strikeLaws(s, ['draft', 'yeshiva']);
      if (scope >= 2) scheduleEvent(s, 'volunteer_first', 12, ctx);
      break;
    case 'citizens':
      fx(s, 'cohesion', -14 * k, 12, id);
      fx(s, 'cohesion', 8 * k, 60, id, 40);
      for (const p of Object.values(s.parties)) if (p.ideology.security < -50) addMomentum(s, p.id, 3);
      scheduleEvent(s, 'citizens_symbols', 2, ctx);
      break;
    case 'emergency': {
      const delay = scope === 1 ? 52 : 104;
      s.flags.emergencyFrom = s.electionWeek;
      s.electionWeek += delay;
      s.primariesWeek = s.electionWeek - 12;
      fx(s, 'trust', -22 * k, 8, id);
      fx(s, 'cohesion', -14 * k, 8, id);
      bumpIssue(s, 'judiciary', 50);
      scheduleEvent(s, 'emergency_streets', 1, ctx);
      if (!s.rules.noReview) scheduleEvent(s, 'radical_court', 4, { ...ctx, transform: id });
      break;
    }
  }
}

/** ביטול שינוי (בג"ץ, משאל עם שנכשל) */
export function undoTransform(s: GameState, id: TransformId, templateId: string) {
  s.transforms = s.transforms.filter((t) => t.id !== id);
  const info = TRANSFORM_INFO[id];
  s.effects = s.effects.filter((e) => e.source !== `${info.icon} ${info.name}`);
  for (const l of s.lawsPassed) if (l.templateId === templateId) l.struck = true;
  s.scheduled = s.scheduled.filter((x) => x.ctx.law !== templateId);
  if (id === 'emergency' && s.flags.emergencyFrom !== undefined) {
    s.electionWeek = Math.max(s.week + 13, Number(s.flags.emergencyFrom));
    s.primariesWeek = s.electionWeek - 12;
    delete s.flags.emergencyFrom;
  }
  if (id === 'sovereignty') s.rules.noReview = false;
  if (id === 'presidential') {
    s.rules.presidential = false;
    s.rules.directPM = false;
    s.rules.districts = false;
  }
  if (id === 'sovereignty') s.rules.packedCourt = false;
}

function runReferendum(s: GameState, ctx: Ctx, bias: number): string {
  const t = templateById(ctx.law);
  const yes = clamp(publicSupport(s, ctx.law) + bias + (rand(s) - 0.5) * 10, 3, 97);
  const pct = Math.round(yes * 10) / 10;
  if (yes > 50) {
    addNews(s, `משאל העם: ${pct}% בעד "${t.title}". העם אמר את דברו`, 'neutral', true, undefined, 'ערוץ המשכן');
    applyTransform(s, t.radical!, Number(ctx.scope) as 1 | 2 | 3, ctx.sponsor, ctx.law);
    return `${pct}% הצביעו בעד. השינוי נכנס לתוקף.`;
  }
  for (const l of s.lawsPassed) if (l.templateId === ctx.law) l.struck = true;
  addNews(s, `משאל העם: רק ${pct}% בעד. "${t.title}" נדחתה`, 'neutral', true, undefined, 'ערוץ המשכן');
  if (ctx.sponsor === 'player') s.player.reputation = clamp(s.player.reputation - 4, 0, 100);
  return `רק ${pct}% הצביעו בעד. החוק בטל.`;
}

const campaignPower = (s: GameState) => 4 + s.player.fame / 15;
registerSpecial('ref_yes', (s, ctx) => runReferendum(s, ctx, campaignPower(s)));
registerSpecial('ref_no', (s, ctx) => runReferendum(s, ctx, -campaignPower(s)));
registerSpecial('ref_neutral', (s, ctx) => runReferendum(s, ctx, 0));

registerSpecial('undo_transform', (s, ctx) => {
  undoTransform(s, ctx.transform as TransformId, ctx.law);
  addNews(s, `הממשלה הודיעה שתכבד את פסק הדין. "${ctx.title}" בטל`, 'neutral', false, undefined, 'ערוץ המשכן');
  return 'החוק בוטל. המדינה חוזרת – פחות או יותר – למה שהייתה.';
});

registerSpecial('defy_court', (s) => {
  s.rules.noReview = true;
  addWorldEffect(s, 'trust', -15, 6, 'משבר חוקתי');
  addWorldEffect(s, 'cohesion', -10, 6, 'משבר חוקתי');
  addNews(s, 'משבר חוקתי: הממשלה מודיעה שלא תציית לפסק הדין', 'bad', false, undefined, 'ערוץ המשכן');
  return 'הממשלה לא מצייתת לבג"ץ. מעכשיו, בפועל, אין ביקורת שיפוטית.';
});

registerSpecial('emergency_compromise', (s) => {
  if (rand(s) < 0.4 && s.flags.emergencyFrom !== undefined) {
    s.electionWeek = s.week + 26;
    s.primariesWeek = s.electionWeek - 12;
    addNews(s, 'פשרה: הבחירות יתקיימו בעוד חצי שנה', 'good', true);
    return 'הפשרה התקבלה: בחירות בעוד חצי שנה.';
  }
  return 'הממשלה דחתה את הפשרה.';
});

const RESIST = {
  names: ['אמנת החופש', 'ישראל החופשית', 'המחתרת החילונית'],
  ideology: { econ: 10, security: 10, religion: -90, judiciary: -70 },
  sectors: { secular: 1, olim: 0.8 },
  momentum: 12,
  bio: 'מנהיג/ת מחאת "אמנת החופש" נגד מדינת ההלכה.',
};
registerSpecial('resistance_party_npc', (s) => {
  if (!listsOpen(s)) return;
  const p = spawnParty(s, RESIST);
  return `"${p.name}" קמה – וכבר דו-ספרתית בסקרים.`;
});
registerSpecial('resistance_party', (s) => {
  s.player.money += 150; // תרומות ההמונים מממנות את ההקמה
  const r = foundParty(s, 'אמנת החופש', '#0ea5e9');
  if (!r.ok) return r.text;
  addMomentum(s, s.player.partyId!, 10);
  return `${r.text} מאות אלפי תורמים מימנו את ההקמה.`;
});
