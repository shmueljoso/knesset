// יריבויות וסיפורים: "הנמסיס" (היריב/ה הקבוע/ה) ו"בעל/ת הברית" – נבחרים מתוך היחסים האמיתיים,
// ומשפיעים על אירועים, עימותים בטלוויזיה וציד קולות. "רגעים": אוסף נקודות השיא של הקריירה.
import type { GameState, Npc } from '../types';
import { addNews } from './news';

const alive = (n: Npc | undefined): n is Npc => !!n && n.notable && !n.outside && (n.isMK || n.role === 'mk' || n.role === 'candidate');

/** רגע בקריירה – נשמר לתמיד (עד 120) */
export function addMoment(s: GameState, icon: string, text: string) {
  if (!s.moments) return;
  const last = s.moments[s.moments.length - 1];
  if (last && last.text === text && last.week === s.week) return;
  s.moments.push({ week: s.week, icon, text });
  if (s.moments.length > 120) s.moments.shift();
}

export const nemesis = (s: GameState): Npc | null => {
  const n = s.rivals?.nemesis ? s.npcs[s.rivals.nemesis] : undefined;
  return alive(n) ? n : null;
};
export const ally = (s: GameState): Npc | null => {
  const n = s.rivals?.ally ? s.npcs[s.rivals.ally] : undefined;
  return alive(n) ? n : null;
};

/** כל 4 שבועות: האם יש יריב/ה חדש/ה או בעל/ת ברית חדש/ה (עם "דביקות" – לא מחליפים על כל שינוי קטן) */
export function tickRivals(s: GameState) {
  if (s.week % 4 !== 0) return;
  if (s.presidency && s.president?.id === 'player') return;
  const r = (s.rivals ??= {});
  const pool = Object.values(s.npcs).filter(alive);
  const cur = nemesis(s);
  if (!cur || cur.attitude > -15) {
    const next = pool.filter((n) => n.attitude <= -35 && n.id !== r.ally).sort((a, b) => a.attitude - b.attitude || b.influence - a.influence)[0];
    if (next && next.id !== r.nemesis) {
      r.nemesis = next.id;
      r.nemesisSince = s.week;
      addNews(s, `${next.name} נגד ${s.player.name}: "זו לא מחלוקת, זו מלחמה"`, 'neutral', true);
      addMoment(s, '⚔️', `${next.name} הפך/ה ליריב/ה המר/ה שלך`);
    } else if (!next && cur) {
      delete r.nemesis;
      addMoment(s, '🕊️', `היריבות עם ${cur.name} שככה`);
    }
  }
  const al = ally(s);
  if (!al || al.attitude < 25) {
    const next = pool.filter((n) => n.attitude >= 45 && n.id !== r.nemesis).sort((a, b) => b.attitude - a.attitude || b.influence - a.influence)[0];
    if (next && next.id !== r.ally) {
      r.ally = next.id;
      r.allySince = s.week;
      addMoment(s, '🤝', `${next.name} – בעל/ת הברית הקרוב/ה שלך`);
    } else if (!next && al) delete r.ally;
  }
}
