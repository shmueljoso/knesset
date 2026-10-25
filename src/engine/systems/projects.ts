// מיזמים ארוכי טווח של השחקן: מה שמתחילים היום מניב תוצאות בעוד שבועות וחודשים (ולפעמים גם סיכון).
import { chance, rand } from '../rng';
import { addStat } from '../stats';
import type { GameState, Project, ProjectKind, Sector } from '../types';
import { SECTORS, newId } from '../util';
import { addNews } from './news';
import { addMomentum, changeApproval } from './opinion';
import { log } from './report';
import { SECTOR_LABEL, sectorWeights } from './society';

export const MAX_PROJECTS = 3;

export const PROJECT_INFO: Record<ProjectKind, { name: string; icon: string; weeks: number; cost: number; blurb: string }> = {
  tour: { name: 'סיור שטח', icon: '🚌', weeks: 6, cost: 12, blurb: 'מפגשים ומפגני נוכחות במגזר שבו את/ה הכי חלש/ה. כל שבוע מוסיף תדמית.' },
  branches: { name: 'בניית סניפים', icon: '🏢', weeks: 12, cost: 30, blurb: 'מכונה ארגונית: בסיום המפלגה (והמעמד שלך בה) חזקים יותר, לצמיתות. עד 5 רמות.' },
  ads: { name: 'קמפיין פרסום', icon: '📣', weeks: 6, cost: 40, blurb: 'דחיפה שבועית בסקרים למפלגה – ואחריה "עייפות פרסום" קצרה.' },
  supporters: { name: 'מועדון תומכים', icon: '🎗️', weeks: 16, cost: 20, blurb: 'בסיום מזרים הכנסה קבועה. אבל כסף של תורמים מושך תשומת לב: ברמה 2+ יש סיכון לפרשה.' },
};

export const activeOf = (s: GameState, kind: ProjectKind) => (s.projects ?? []).find((p) => p.kind === kind);

/** המגזר הכי "משתלם" לסיור: גדול, ובו התדמית שלך חלשה */
export function tourTarget(s: GameState): Sector {
  const busy = new Set((s.projects ?? []).filter((p) => p.kind === 'tour').map((p) => p.sector));
  const w = sectorWeights(s);
  return [...SECTORS].filter((x) => !busy.has(x)).sort((a, b) => w[b] * (75 - s.player.approval[b]) - w[a] * (75 - s.player.approval[a]))[0] ?? 'secular';
}

export function projectBlocked(s: GameState, kind: ProjectKind): string | null {
  if ((s.projects ?? []).length >= MAX_PROJECTS) return `כבר ${MAX_PROJECTS} מיזמים פעילים`;
  if (kind !== 'tour' && activeOf(s, kind)) return 'המיזם הזה כבר פעיל';
  if (kind === 'tour' && (s.projects ?? []).some((p) => p.kind === 'tour')) return 'סיור כבר מתקיים';
  if ((kind === 'branches' || kind === 'ads') && !s.player.partyId) return 'צריך להיות חבר/ה במפלגה';
  if (kind === 'branches' && Number(s.flags.machine ?? 0) >= 5) return 'המכונה כבר ברמה המקסימלית';
  if (kind === 'supporters' && Number(s.flags.supporters ?? 0) >= 3) return 'המועדון כבר ברמה המקסימלית';
  return null;
}

export function startProject(s: GameState, kind: ProjectKind): string {
  const info = PROJECT_INFO[kind];
  const p: Project = { id: newId(s, 'prj'), kind, start: s.week, weeks: info.weeks, level: 1 };
  if (kind === 'tour') p.sector = tourTarget(s);
  s.projects = [...(s.projects ?? []), p];
  log(s, `יצאת לדרך: ${info.name}${p.sector ? ` (${SECTOR_LABEL[p.sector]})` : ''}.`, 'action');
  return `${info.icon} ${info.name}${p.sector ? ` – ${SECTOR_LABEL[p.sector]}` : ''} יוצא לדרך. התוצאות יגיעו בהדרגה (${info.weeks} שבועות).`;
}

export const supportersIncome = (s: GameState) => Number(s.flags.supporters ?? 0) * 1.5;

function finish(s: GameState, p: Project) {
  const party = s.player.partyId ? s.parties[s.player.partyId] : null;
  if (p.kind === 'tour') {
    addStat(s, 'fame', 2);
    addNews(s, `${s.player.name} סיים/ה סיור בקרב ${SECTOR_LABEL[p.sector!]}: "הם הרגישו שמישהו הגיע"`, 'good', true);
  } else if (p.kind === 'branches') {
    s.flags.machine = Math.min(5, Number(s.flags.machine ?? 0) + 1);
    if (party) party.base += 0.18;
    addStat(s, 'partyStanding', 3);
    s.player.primariesScore += 3;
    addNews(s, `הסניפים של ${party?.short ?? 'המפלגה'} נפתחו: מכונה ארגונית ברמה ${s.flags.machine}`, 'good', true);
  } else if (p.kind === 'ads') {
    if (party) addMomentum(s, party.id, -0.8);
    addNews(s, `קמפיין הפרסום נגמר; הציבור כבר "לא רואה" את השלטים`, 'neutral', true);
  } else if (p.kind === 'supporters') {
    s.flags.supporters = Math.min(3, Number(s.flags.supporters ?? 0) + 1);
    addNews(s, `מועדון התומכים של ${s.player.name} גדל: רמה ${s.flags.supporters}`, 'good', true, `הכנסה קבועה: ${supportersIncome(s).toFixed(1)} אלף ₪ בשבוע.`);
  }
}

/** התקדמות שבועית */
export function tickProjects(s: GameState) {
  if (!s.projects?.length) {
    if (Number(s.flags.supporters ?? 0) >= 2 && chance(s, 0.012)) s.flags.lobbyMoney = true;
    return;
  }
  const party = s.player.partyId ? s.parties[s.player.partyId] : null;
  for (const p of s.projects) {
    if (p.kind === 'tour' && p.sector) {
      changeApproval(s, p.sector, 0.7 * (0.6 + s.player.skills.speech / 100));
      addStat(s, 'fame', 0.25);
      if (chance(s, 0.06)) {
        changeApproval(s, p.sector, -1.5);
        addNews(s, `אירוע בסיור של ${s.player.name}: מפגש סוער עם תושבי ${SECTOR_LABEL[p.sector]}`, 'bad', true);
      }
    } else if (p.kind === 'ads' && party) addMomentum(s, party.id, 0.22);
  }
  const done = s.projects.filter((p) => s.week - p.start >= p.weeks);
  for (const p of done) finish(s, p);
  s.projects = s.projects.filter((p) => !done.includes(p));
  if (Number(s.flags.supporters ?? 0) >= 2 && chance(s, 0.012)) s.flags.lobbyMoney = true;
  // התרוצצות מתישה: יותר מדי מיזמים בבת אחת עולים במוניטין
  if (s.projects.length >= MAX_PROJECTS && rand(s) < 0.04) addStat(s, 'reputation', -0.5);
}
