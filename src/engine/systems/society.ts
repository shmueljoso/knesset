// החברה משתנה: הרכב האוכלוסייה זז לאורך השנים, מפלגות והציבור משנים עמדות אחרי אירועים גדולים,
// ומפלגה שנוחלת מפלה בקלפי מחליפה יו"ר. הכול נשלט בהגדרה "קצב שינוי בחברה" (כבוי / רגיל / חזק).
import type { Dynamics, GameState, Ideology, Sector } from '../types';
import { AXES, SECTORS, SECTOR_WEIGHTS, clamp } from '../util';
import { addNews } from './news';
import { addMomentum } from './opinion';
import { log } from './report';

const K: Record<Dynamics, number> = { off: 0, normal: 1, strong: 2 };
export const dynK = (s: GameState) => K[s.settings?.dynamics ?? 'normal'];

export const SECTOR_LABEL: Record<Sector, string> = { secular: 'חילונים', traditional: 'מסורתיים', religious: 'דתיים-לאומיים', haredi: 'חרדים', arab: 'ערבים', olim: 'עולים' };

/** משקל כל מגזר באוכלוסייה בפועל (מנורמל ל-1) */
export function sectorWeights(s: GameState): Record<Sector, number> {
  const raw = Object.fromEntries(SECTORS.map((sec) => [sec, SECTOR_WEIGHTS[sec] * (s.demo?.[sec] ?? 1)])) as Record<Sector, number>;
  const tot = SECTORS.reduce((a, sec) => a + raw[sec], 0) || 1;
  return Object.fromEntries(SECTORS.map((sec) => [sec, raw[sec] / tot])) as Record<Sector, number>;
}

/** מכפיל לבסיס של מפלגה: איך שינוי ההרכב מאז הבחירות האחרונות משפיע עליה */
export function demoFactor(s: GameState, sectors: Partial<Record<Sector, number>>): number {
  if (!s.demo || !s.demoRef) return 1;
  const aff = SECTORS.reduce((a, sec) => a + (sectors[sec] ?? 0), 0);
  if (!aff) return 1;
  const refTot = SECTORS.reduce((a, sec) => a + SECTOR_WEIGHTS[sec] * s.demoRef[sec], 0);
  const nowTot = SECTORS.reduce((a, sec) => a + SECTOR_WEIGHTS[sec] * s.demo[sec], 0);
  let f = 1;
  for (const sec of SECTORS) {
    const share = (SECTOR_WEIGHTS[sec] * s.demo[sec]) / nowTot / ((SECTOR_WEIGHTS[sec] * s.demoRef[sec]) / refTot);
    f += ((sectors[sec] ?? 0) / aff) * (share - 1);
  }
  return clamp(f, 0.6, 1.6);
}

/** שינוי הרכב: גל עלייה, הגירה, או שינוי כללי. d = שינוי יחסי (0.05 = 5%) */
export function shiftDemo(s: GameState, sec: Sector, d: number) {
  s.demo[sec] = clamp(s.demo[sec] * (1 + d * Math.max(0.5, dynK(s))), 0.4, 2.5);
}

const pct = (s: GameState, sec: Sector) => Math.round(sectorWeights(s)[sec] * 1000) / 10;

/** פעם בשנה: ההרכב משתנה לפי הילודה ומצב המדינה, והעמדות זזות לאט לכיוון רוח הציבור */
export function tickSociety(s: GameState) {
  if (!dynK(s) || s.week <= 0 || s.week % 52 !== 0) return;
  const k = dynK(s);
  const w = s.world;
  const before = { ...sectorWeights(s) };
  // הילודה: חרדים וערבים גדלים, חילונים ומסורתיים קטנים יחסית
  shiftDemo(s, 'haredi', 0.032);
  shiftDemo(s, 'arab', 0.017);
  shiftDemo(s, 'religious', 0.01);
  shiftDemo(s, 'secular', -0.004);
  shiftDemo(s, 'traditional', -0.004);
  // מצב המדינה: כלכלה וביטחון טובים מושכים עלייה; משבר מניע הגירה של חילונים
  if (w.economy > 58 && w.security > 45) shiftDemo(s, 'olim', 0.09);
  else if (w.economy < 38 || w.security < 32) {
    shiftDemo(s, 'secular', -0.012);
    shiftDemo(s, 'olim', -0.04);
  }
  if ((s.transforms ?? []).some((t) => t.id === 'halacha')) shiftDemo(s, 'secular', -0.03);
  if ((s.transforms ?? []).some((t) => t.id === 'peace')) shiftDemo(s, 'olim', 0.05);
  if ((s.transforms ?? []).some((t) => t.id === 'ubi') && w.affordability > 55) shiftDemo(s, 'olim', 0.04);
  const after = sectorWeights(s);
  const moved = [...SECTORS].sort((a, b) => Math.abs(after[b] - before[b]) - Math.abs(after[a] - before[a]))[0];
  addNews(
    s,
    `הלמ"ס: ${SECTOR_LABEL[moved]} ${after[moved] > before[moved] ? 'מתחזקים' : 'מצטמצמים'} – ${pct(s, moved)}% מהאוכלוסייה`,
    'neutral',
    false,
    `מגמה ארוכת טווח: ${SECTORS.filter((x) => Math.abs(after[x] - before[x]) > 0.002).map((x) => `${SECTOR_LABEL[x]} ${after[x] > before[x] ? '▲' : '▼'}${pct(s, x)}%`).join(' · ')}. מפלגות שנשענות על המגזרים האלה מרגישות את זה בסקרים.`,
    'ערוץ המשכן',
  );
  driftOpinions(s, k);
}

/** העמדות של המפלגות (וחבריהן) זזות לאט לכיוון רוח הציבור. תקרה: 20 נקודות מהמקור */
function driftOpinions(s: GameState, k: number) {
  s.drift ??= {};
  for (const p of Object.values(s.parties)) {
    const d = (s.drift[p.id] ??= { econ: 0, security: 0, religion: 0, judiciary: 0 });
    for (const ax of AXES) {
      // מפלגה זזה פחות אם היא רחוקה מהמרכז (בסיס אידיאולוגי) ויותר אם היא קרובה אליו
      const room = 1 - Math.abs(p.ideology[ax]) / 140;
      const step = clamp((s.mood[ax] / 50) * 3 * k * room, -4, 4);
      const next = clamp(d[ax] + step, -20, 20);
      const applied = next - d[ax];
      d[ax] = next;
      p.ideology[ax] = clamp(p.ideology[ax] + applied, -100, 100);
      for (const n of Object.values(s.npcs)) if (n.partyId === p.id) n.ideology[ax] = clamp(n.ideology[ax] + applied, -100, 100);
    }
  }
  const strongest = AXES.map((ax) => ({ ax, m: s.mood[ax] })).sort((a, b) => Math.abs(b.m) - Math.abs(a.m))[0];
  if (strongest && Math.abs(strongest.m) >= 10) {
    const txt: Record<keyof Ideology, [string, string]> = {
      security: ['המפלגות זזות ימינה בביטחון', 'המפלגות מתרככות בביטחון'],
      econ: ['המפלגות מאמצות שוק חופשי', 'המפלגות עוברות לשפה חברתית יותר'],
      religion: ['הציבור והמפלגות מתקרבים למסורת', 'הציבור והמפלגות זזים לחילוניות'],
      judiciary: ['המפלגות מחמירות מול המערכת המשפטית', 'המפלגות הופכות לשומרות סף'],
    };
    addNews(s, `שנה אחרי שנה, זה מצטבר: ${txt[strongest.ax][strongest.m > 0 ? 0 : 1]}`, 'neutral', false, 'התוכניות המפלגתיות כבר לא נראות כמו לפני כמה שנים. שימו לב איפה אתם עומדים.', 'ערוץ המשכן');
  }
}

/**
 * אירוע גדול שמזיז את הציבור: רוח הציבור מקבלת דחיפה מיידית (וחוזרת לאט),
 * והעמדות של המפלגות זזות במעט באופן קבוע. shifts = כיוון וגודל על כל ציר (עד ±40)
 */
export function shiftOpinion(s: GameState, shifts: Partial<Ideology>, why: string) {
  const k = dynK(s);
  if (!k) return;
  s.drift ??= {};
  const moves: string[] = [];
  for (const ax of AXES) {
    const v = shifts[ax];
    if (!v) continue;
    s.mood[ax] = clamp(s.mood[ax] + v * 0.5 * k, -50, 50);
    for (const p of Object.values(s.parties)) {
      const d = (s.drift[p.id] ??= { econ: 0, security: 0, religion: 0, judiciary: 0 });
      const next = clamp(d[ax] + v * 0.05 * k * (1 - Math.abs(p.ideology[ax]) / 140), -20, 20);
      const applied = next - d[ax];
      d[ax] = next;
      p.ideology[ax] = clamp(p.ideology[ax] + applied, -100, 100);
      for (const n of Object.values(s.npcs)) if (n.partyId === p.id) n.ideology[ax] = clamp(n.ideology[ax] + applied, -100, 100);
    }
    moves.push(v > 0 ? `${ax === 'security' ? 'ניציות' : ax === 'econ' ? 'שוק' : ax === 'religion' ? 'דתיות' : 'ביקורת על המערכת'}` : `${ax === 'security' ? 'פיוס' : ax === 'econ' ? 'רווחה' : ax === 'religion' ? 'חילוניות' : 'שמירה על המערכת'}`);
  }
  if (moves.length) log(s, `${why}: הציבור זז – ${moves.join(', ')}.`, 'system');
}

/** אחרי בחירות: מפלגה שקרסה מחליפה יו"ר, ומי שזינקה מתחזקת. oldSeats = המנדטים לפני הבחירות */
export function afterElection(s: GameState, oldSeats: Record<string, number>) {
  s.demoRef = { ...s.demo };
  for (const p of Object.values(s.parties)) {
    const was = oldSeats[p.id];
    if (!was || was < 6) continue;
    if (p.seats <= was * 0.6 && p.seats > 0 && p.leaderId !== 'player' && s.npcs[p.leaderId]) {
      const old = s.npcs[p.leaderId];
      const next = p.list.map((id) => s.npcs[id]).filter((n) => n && n.id !== old.id && n.isMK).sort((a, b) => b.influence - a.influence)[0];
      addNews(s, `${old.name} מתפטר/ת מראשות ${p.name} אחרי המפלה: ${was} ← ${p.seats} מנדטים`, 'neutral', p.id === s.player.partyId, next ? `${next.name} ייבחר/תיבחר למחליף/ה.` : undefined, 'ערוץ המשכן');
      if (next) {
        p.leaderId = next.id;
        p.list = [next.id, ...p.list.filter((x) => x !== next.id)];
      }
      addMomentum(s, p.id, 1.2); // "דם חדש"
    } else if (p.seats >= was * 1.5 && p.seats - was >= 4) {
      addNews(s, `${p.name} זינקה מ-${was} ל-${p.seats} מנדטים – "הניצחון הגדול של הערב"`, 'neutral', p.id === s.player.partyId, undefined, 'ערוץ המשכן');
    }
  }
}
