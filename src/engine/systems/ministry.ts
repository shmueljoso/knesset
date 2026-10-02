// השחקן כשר: תכניות דגל, מנכ"ל, תקציב וביצועים.
import { addStat } from '../stats';
import { ministryDef, programDef } from '../data/ministries';
import { chance, rand } from '../rng';
import type { GameState } from '../types';
import { SECTORS, clamp } from '../util';
import { addNews } from './news';
import { addWorldEffect, changeApproval, takeStance } from './opinion';
import { changeAttitude } from './relationships';
import { log } from './report';

export const DG_TYPES = {
  loyal: { name: 'נאמן מפלגתי', desc: 'פעיל ותיק מהמפלגה. המפלגה מרוצה, המשרד פחות.', perf: 2 },
  pro: { name: 'איש מקצוע', desc: 'בכיר מהשירות הציבורי. ביצועים גבוהים, אפס פוליטיקה.', perf: 9 },
  crony: { name: 'מקורב', desc: 'חבר ותיק שיודע "לסדר דברים". הון פוליטי – וסיכון לשערורייה.', perf: -3 },
} as const;
export type DgType = keyof typeof DG_TYPES;

export function launchProgram(s: GameState, pid: string): { ok: boolean; text: string } {
  const ms = s.ministryState;
  const p = programDef(pid);
  if (!ms || !p) return { ok: false, text: 'אין משרד' };
  if (ms.programs.some((x) => x.id === pid)) return { ok: false, text: 'התכנית כבר הושקה' };
  if (s.player.ap < p.ap) return { ok: false, text: 'אין מספיק זמן' };
  if (ms.budget < p.cost) return { ok: false, text: `חסר תקציב: נשארו ${ms.budget.toFixed(1)} מיליארד` };
  s.player.ap -= p.ap;
  ms.budget = Math.round((ms.budget - p.cost) * 10) / 10;
  ms.programs.push({ id: pid, week: s.week });
  for (const [k, v] of Object.entries(p.world)) addWorldEffect(s, k as keyof typeof s.world, v!, p.weeks, p.name, 2);
  const f = 0.5 + s.player.fame / 100;
  for (const sec of SECTORS) if (p.sectors[sec]) changeApproval(s, sec, p.sectors[sec]! * f);
  if (p.lean) takeStance(s, p.lean, 1);
  ms.performance = clamp(ms.performance + p.perf / 2, 0, 100);
  addStat(s, 'fame', 2);
  addNews(s, `${s.player.name} משיק/ה: ${p.name}`, 'good', true);
  log(s, `השקת תכנית: ${p.name}`, 'action');
  return { ok: true, text: `${p.name} יוצאת לדרך!` };
}

export function appointDG(s: GameState, type: DgType): string {
  const ms = s.ministryState;
  if (!ms) return '';
  ms.dgType = type;
  ms.dgId = null;
  if (type === 'loyal') {
    addStat(s, 'partyStanding', 5);
    const p = s.player.partyId ? s.parties[s.player.partyId] : null;
    if (p && s.npcs[p.leaderId]) changeAttitude(s, p.leaderId, 5);
  }
  if (type === 'pro') addStat(s, 'reputation', 3);
  if (type === 'crony') {
    s.player.capital += 6;
    s.player.money += 30;
  }
  s.flags.dgWeek = s.week;
  return `מונה מנכ"ל: ${DG_TYPES[type].name}.`;
}

/** בקשת תוספת תקציב באוצר */
export function askBudget(s: GameState): { ok: boolean; text: string } {
  const ms = s.ministryState;
  if (!ms) return { ok: false, text: '' };
  ms.budgetAskedWeek = s.week;
  const fin = s.npcs[s.ministers.finance];
  const p = clamp(0.25 + s.player.skills.negotiation / 200 + (fin ? fin.attitude / 250 : 0.2) + (s.coalition.pmId === 'player' ? 0.3 : 0), 0.05, 0.9);
  if (rand(s) < p) {
    const extra = Math.round((0.8 + rand(s) * 1.2) * 10) / 10;
    ms.budget = Math.round((ms.budget + extra) * 10) / 10;
    if (fin) changeAttitude(s, fin.id, -3);
    return { ok: true, text: `אגף התקציבים אישר תוספת של ${extra} מיליארד ₪.` };
  }
  if (fin) changeAttitude(s, fin.id, -4);
  return { ok: false, text: `${fin?.name ?? 'האוצר'} סירב: "אין כסף".` };
}

export function resignMinistry(s: GameState): string {
  const mid = s.player.ministry;
  if (!mid) return '';
  s.player.ministry = null;
  s.ministryState = null;
  s.player.rank = s.coalition.pmId === 'player' ? 'minister' : 'mk';
  delete s.ministers[mid];
  // התיק עובר לח"כ אחר מהמפלגה
  const repl = Object.values(s.npcs).find((n) => n.isMK && n.partyId === s.player.partyId && !n.ministry);
  if (repl) {
    repl.ministry = mid;
    s.ministers[mid] = repl.id;
  }
  s.player.consistency = clamp(s.player.consistency + 5, 0, 100);
  addStat(s, 'fame', 3);
  addNews(s, `${s.player.name} התפטר/ה מהממשלה`, 'neutral', true);
  log(s, 'התפטרת מהממשלה.', 'career');
  return 'התפטרת. הציבור מעריך מי שמוותר על כיסא.';
}

export function fireFromMinistry(s: GameState) {
  const mid = s.player.ministry;
  if (!mid) return;
  resignMinistry(s);
  s.player.consistency = clamp(s.player.consistency - 5, 0, 100);
  addNews(s, `ראש הממשלה פיטר/ה את ${s.player.name}`, 'bad', true);
}

export function tickMinistry(s: GameState) {
  const ms = s.ministryState;
  if (!ms || !s.player.ministry) return;
  const def = ministryDef(ms.id);
  if (!def) return;
  const focus = def.focus.reduce((a, k) => a + s.world[k], 0) / def.focus.length;
  const recent = ms.programs.filter((p) => s.week - p.week < 26).reduce((a, p) => a + (programDef(p.id)?.perf ?? 0), 0);
  const dg = ms.dgType ? DG_TYPES[ms.dgType].perf : -2;
  const target = clamp(focus + recent + dg, 0, 100);
  ms.performance = clamp(ms.performance + (target - ms.performance) * 0.1, 0, 100);
  addStat(s, 'fame', 0.25);
  changeApproval(s, 'all', (ms.performance - 50) / 400);
  if (ms.dgType === 'crony' && chance(s, 0.03)) {
    s.player.reputation = clamp(s.player.reputation - 7, 0, 100);
    changeApproval(s, 'all', -2);
    addNews(s, `תחקיר: מנכ"ל ${def.name} חילק ג'ובים למקורבים`, 'bad', true);
  }
  if (ms.performance < 30 && chance(s, 0.15)) addNews(s, `ביקורת חריפה על תפקוד ${def.name}`, 'bad', true);
}

export function resetMinistryBudget(s: GameState) {
  const ms = s.ministryState;
  if (!ms) return;
  ms.budget = ministryDef(ms.id)?.budget ?? 2;
}
