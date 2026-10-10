// שרשרת חקירה: בדיקה → חקירה → המלצות → שימוע → כתב אישום → משפט. הרשעה = סוף הקריירה.
import { addStat } from '../stats';
import { chance, rand } from '../rng';
import type { GameState } from '../types';
import { clamp } from '../util';
import { addNews } from './news';
import { changeApproval, takeStance } from './opinion';
import { log } from './report';
import { resignMinistry } from './ministry';
import { pardonBonus } from './president';

export const SCANDAL_STAGES = ['', 'בדיקה מקדמית', 'חקירה פלילית', 'המלצות המשטרה', 'שימוע אצל היועמ"ש', 'כתב אישום'];

export function startScandal(s: GameState, source: string, heat: number) {
  if (s.scandal || s.gameOver) return;
  s.scandal = { stage: 1, heat, source, startWeek: s.week, nextWeek: s.week + 1 };
  addNews(s, `נפתחה בדיקה נגד ${s.player.name} בפרשת ${source}`, 'bad', true);
  log(s, `נפתחה נגדך בדיקה: ${source}.`, 'career');
}

export function tickScandal(s: GameState) {
  if (!s.scandal) {
    if (s.flags.lobbyMoney && chance(s, 0.03)) {
      delete s.flags.lobbyMoney;
      startScandal(s, 'התרומות מהלוביסטים', 55);
    } else if (s.ministryState?.dgType === 'crony' && chance(s, 0.015)) startScandal(s, 'המינויים הפוליטיים במשרד', 50);
    return;
  }
  const sc = s.scandal;
  if (s.week >= sc.nextWeek && !s.eventQueue.some((q) => q.eventId === 'scandal_stage')) {
    s.eventQueue.push({ eventId: 'scandal_stage', ctx: { stageName: SCANDAL_STAGES[sc.stage], source: sc.source } });
    sc.nextWeek = s.week + 99; // ייקבע מחדש אחרי ההחלטה
  }
}

function closeCase(s: GameState, text: string) {
  s.scandal = null;
  addStat(s, 'fame', 2);
  addNews(s, `התיק נגד ${s.player.name} נסגר`, 'good', true);
  log(s, text, 'career');
}

/** קידום השלב או סגירת התיק אחרי החלטה של השחקן */
function advance(s: GameState, closeChance: number): string {
  const sc = s.scandal!;
  if (s.flags.agLoyal) closeChance += 0.1; // יועמ"ש נאמן
  if (rand(s) < closeChance) {
    closeCase(s, 'התיק נסגר.');
    return 'התיק נסגר מחוסר ראיות!';
  }
  changeApproval(s, 'all', -1);
  addStat(s, 'fame', 1);
  if (sc.stage >= 5) {
    // משפט
    if (rand(s) < sc.heat / 100) {
      s.scandal = null;
      s.gameOver = 'convicted';
      addNews(s, `${s.player.name} הורשע/ה. הקריירה הפוליטית הסתיימה`, 'bad', true);
      log(s, 'הורשעת בבית המשפט.', 'career');
      return 'בית המשפט הרשיע אותך. זה הסוף.';
    }
    s.scandal = null;
    addStat(s, 'reputation', 5);
    addStat(s, 'fame', 5);
    addNews(s, `${s.player.name} זוכה/תה מכל האישומים`, 'good', true);
    return 'זוכית! "רדיפה פוליטית", את/ה אומר/ת עכשיו לכולם.';
  }
  sc.stage += 1;
  sc.nextWeek = s.week + 4;
  addNews(s, `פרשת ${sc.source}: התיק עבר לשלב "${SCANDAL_STAGES[sc.stage]}"`, 'bad', true);
  return `התיק מתקדם: ${SCANDAL_STAGES[sc.stage]}.`;
}

export function scandalCooperate(s: GameState): string {
  const sc = s.scandal;
  if (!sc) return '';
  sc.heat = clamp(sc.heat - 12, 0, 100);
  s.player.reputation = clamp(s.player.reputation - 1, 0, 100);
  return advance(s, (100 - sc.heat) / 160);
}

export function scandalAttack(s: GameState): string {
  const sc = s.scandal;
  if (!sc) return '';
  sc.heat = clamp(sc.heat + 5, 0, 100);
  addStat(s, 'fame', 2);
  takeStance(s, { judiciary: 70 }, 1.5);
  return advance(s, (100 - sc.heat) / 260);
}

export function scandalStepDown(s: GameState): string {
  const sc = s.scandal;
  if (!sc) return '';
  sc.heat = clamp(sc.heat - 25, 0, 100);
  s.player.consistency = clamp(s.player.consistency + 3, 0, 100);
  if (s.player.ministry) resignMinistry(s);
  return advance(s, (100 - sc.heat) / 140);
}

/** בקשת חנינה מהנשיא (בשלב השימוע/כתב האישום) */
export function scandalPardon(s: GameState): string {
  const sc = s.scandal;
  if (!sc) return '';
  s.player.reputation = clamp(s.player.reputation - 4, 0, 100);
  if (rand(s) < 0.15 + s.player.reputation / 400 + pardonBonus(s)) {
    s.scandal = null;
    s.player.consistency = clamp(s.player.consistency - 3, 0, 100);
    addNews(s, `הנשיא העניק חנינה ל${s.player.name}. סערה ציבורית`, 'neutral', true);
    log(s, 'קיבלת חנינה מהנשיא.', 'career');
    return 'הנשיא העניק חנינה. התיק נסגר – אבל הכתם נשאר.';
  }
  sc.heat = clamp(sc.heat + 5, 0, 100);
  sc.nextWeek = s.week + 4;
  addNews(s, `הנשיא דחה את בקשת החנינה של ${s.player.name}`, 'bad', true);
  return 'הנשיא דחה את הבקשה. והציבור יודע שביקשת.';
}
