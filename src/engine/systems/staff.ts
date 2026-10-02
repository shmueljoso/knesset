import { addStat } from '../stats';
import { makeName } from '../data/names';
import { makeAvatar } from '../avatarGen';
import { makeLocalRng } from '../rng';
import type { GameState, Staff } from '../types';
import { clamp, newId } from '../util';

export const STAFF_ROLES: Record<Staff['role'], { m: string; f: string; desc: string }> = {
  aide: { m: 'עוזר פרלמנטרי', f: 'עוזרת פרלמנטרית', desc: '+1 זמן בשבוע. ברמה 4+ עוד +1.' },
  spokesperson: { m: 'דובר', f: 'דוברת', desc: 'מוכרות עולה מעצמה כל שבוע, ופעולות תקשורת חזקות יותר.' },
  advisor: { m: 'יועץ אסטרטגי', f: 'יועצת אסטרטגית', desc: 'צובר הון פוליטי כל שבוע ומשפר משא ומתן.' },
};

export const maxStaff = (s: GameState) => (s.player.isMK ? 3 : 1);
/** עלות שבועית (אלפי ₪). לח"כ – תקציב הכנסת משלם על העוזרים. */
export const staffCost = (s: GameState, st: Staff) => (s.player.isMK ? 0 : 2 * st.level);

/** מועמדים לגיוס – דטרמיניסטי לפי שבוע, כדי שלא יתחלפו בכל רענון. */
export function staffCandidates(s: GameState): Staff[] {
  const rnd = makeLocalRng(s.seed + s.week * 977);
  const used = new Set<string>(s.player.staff.map((x) => x.name));
  const roles: Staff['role'][] = ['aide', 'spokesperson', 'advisor'];
  return roles.flatMap((role) =>
    [0, 1].map((k) => {
      const gender = rnd() < 0.5 ? 'm' : 'f';
      const level = 1 + Math.floor(rnd() * 3) + (k === 1 && s.player.reputation > 55 ? 1 : 0);
      return {
        id: `cand-${role}-${k}`,
        name: makeName(rnd, rnd() < 0.85 ? 'jewish' : 'arab', gender, used),
        gender,
        role,
        level,
        loyalty: 40 + Math.floor(rnd() * 40),
        avatar: { ...makeAvatar(rnd, gender, 'jewish'), age: 24 + Math.floor(rnd() * 15) },
        hiredWeek: s.week,
      } satisfies Staff;
    }),
  );
}

export function hireStaff(s: GameState, cand: Staff): string {
  if (s.player.staff.length >= maxStaff(s)) return 'אין תקן פנוי בלשכה';
  if (s.player.staff.some((x) => x.role === cand.role)) return 'כבר יש לך מישהו בתפקיד הזה';
  const req = cand.level * 8;
  if (s.player.reputation < req) return `ברמה ${cand.level} הוא/היא מצפה למוניטין של ${req} לפחות`;
  s.player.staff.push({ ...cand, id: newId(s, 'st'), hiredWeek: s.week });
  recomputeAp(s);
  return `${cand.name} הצטרף/ה ללשכה.`;
}

export function fireStaff(s: GameState, id: string): string {
  const st = s.player.staff.find((x) => x.id === id);
  if (!st) return '';
  s.player.staff = s.player.staff.filter((x) => x.id !== id);
  recomputeAp(s);
  if (st.loyalty < 40) s.flags.disgruntledStaff = st.name;
  return `${st.name} סיים/ה את עבודתו/ה.`;
}

export function recomputeAp(s: GameState) {
  const aide = s.player.staff.find((x) => x.role === 'aide');
  const base = s.player.isMK ? 6 : 5;
  s.player.apMax = base + (aide ? 1 + (aide.level >= 4 ? 1 : 0) : 0);
}

export function tickStaff(s: GameState) {
  for (const st of s.player.staff) {
    if (st.role === 'spokesperson') addStat(s, 'fame', 0.15 * st.level);
    if (st.role === 'advisor') s.player.capital += 0.25 * st.level;
    s.player.money -= staffCost(s, st);
    const target = 40 + s.player.reputation * 0.4;
    st.loyalty = clamp(st.loyalty + (target - st.loyalty) * 0.05, 0, 100);
    if ((s.week - st.hiredWeek) % 26 === 25 && st.level < 5) st.level += 1;
  }
}

export const staffBonus = (s: GameState, role: Staff['role']) => s.player.staff.find((x) => x.role === role)?.level ?? 0;
