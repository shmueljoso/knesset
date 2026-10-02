// משימות: 2–3 יעדים פעילים שמובילים את השחקן בקריירה, עם פרס על כל אחד.
import { applyOps, type Op } from '../ops';
import type { GameState } from '../types';
import { listForecast } from './influence';
import { legislativeRole } from './legislation';
import { log } from './report';

interface MissionDef {
  id: string;
  title: string;
  hint: string;
  eligible: (s: GameState) => boolean;
  done: (s: GameState) => boolean;
  reward: Op[];
}

const c = (s: GameState, ...keys: string[]) => keys.reduce((a, k) => a + (s.counters[k] ?? 0), 0);
const playerBill = (s: GameState) => s.bills.filter((b) => b.sponsor === 'player' || b.sponsor === s.player.employerId);

export const MISSIONS: MissionDef[] = [
  { id: 'join_party', title: 'להצטרף למפלגה', hint: 'מטה המפלגה → הצטרפות', eligible: (s) => !s.player.partyId, done: (s) => !!s.player.partyId, reward: [{ op: 'capital', d: 2 }] },
  { id: 'first_talk', title: 'שיחה ראשונה עם פוליטיקאי', hint: 'הקש/י על דמות → שיחה', eligible: () => true, done: (s) => c(s, 'int_chat', 'int_phone') >= 1, reward: [{ op: 'capital', d: 1 }] },
  { id: 'cafeteria', title: 'להסתובב במזנון', hint: 'המזנון → להסתובב', eligible: () => true, done: (s) => c(s, 'act_mingle') >= 1, reward: [{ op: 'reputation', d: 1 }] },
  { id: 'media_debut', title: 'הופעת בכורה בתקשורת', hint: 'רחבת הכניסה או האולפנים – פעמיים', eligible: () => true, done: (s) => c(s, 'act_press', 'act_interview', 'act_social', 'act_oped') >= 2, reward: [{ op: 'fame', d: 2 }] },
  { id: 'allies3', title: '3 בעלי ברית', hint: 'יחס 40+ עם שלוש דמויות', eligible: () => true, done: (s) => Object.values(s.npcs).filter((n) => n.attitude >= 40).length >= 3, reward: [{ op: 'reputation', d: 3 }] },
  { id: 'home_circles', title: '3 חוגי בית', hint: 'השטח → חוג בית', eligible: (s) => !!s.player.partyId, done: (s) => c(s, 'act_home_circle') >= 3, reward: [{ op: 'partyStanding', d: 2 }] },
  { id: 'register_list', title: 'להגיש מועמדות לכנסת', hint: 'מטה המפלגה → הגשת מועמדות', eligible: (s) => !!s.player.partyId && !s.player.isMK && s.parties[s.player.partyId].leaderId !== 'player', done: (s) => s.player.wantsList, reward: [{ op: 'partyStanding', d: 3 }] },
  {
    id: 'realistic', title: 'להגיע למקום ריאלי ברשימה', hint: 'מעמד במפלגה, מוכרות, קמפיין ותמיכת בכירים', eligible: (s) => s.player.wantsList && !s.player.isMK,
    done: (s) => {
      const f = listForecast(s);
      return !!f && f.position <= f.realistic;
    },
    reward: [{ op: 'fame', d: 2 }],
  },
  { id: 'elected', title: 'להיבחר לכנסת', hint: 'מקום ריאלי + מפלגה מעל אחוז החסימה', eligible: (s) => !s.player.isMK && !!s.player.partyId, done: (s) => s.player.isMK, reward: [{ op: 'capital', d: 5 }] },
  { id: 'first_query', title: 'שאילתה ראשונה לשר', hint: 'אולם המליאה → שאילתה', eligible: (s) => s.player.isMK, done: (s) => c(s, 'act_query') >= 1, reward: [{ op: 'fame', d: 1 }] },
  { id: 'first_bill', title: 'להגיש הצעת חוק', hint: 'אגף הלשכות או טאב חקיקה', eligible: (s) => legislativeRole(s).canPropose, done: (s) => playerBill(s).length >= 1, reward: [{ op: 'capital', d: 2 }] },
  { id: 'caucus', title: 'להקים שדולה', hint: 'חדרי הוועדות → שדולות', eligible: (s) => s.player.isMK, done: (s) => s.caucuses.length >= 1, reward: [{ op: 'reputation', d: 2 }] },
  { id: 'pass_prelim', title: 'לעבור קריאה טרומית', hint: 'ספירת קולות ושכנוע מתלבטים', eligible: (s) => playerBill(s).length >= 1, done: (s) => playerBill(s).some((b) => ['committee1', 'first', 'committee2', 'final', 'passed'].includes(b.stage)), reward: [{ op: 'reputation', d: 3 }] },
  { id: 'first_law', title: 'להעביר חוק בשלוש קריאות', hint: 'ועדה, קריאה ראשונה, ועדה, שנייה ושלישית', eligible: (s) => playerBill(s).length >= 1, done: (s) => s.player.achievements.includes('first_law'), reward: [{ op: 'capital', d: 5 }] },
  { id: 'cosponsor', title: 'חוק שהיית שותף/ה לו עובר', hint: 'הסכם/י להצעות של ח"כים אחרים', eligible: (s) => s.player.isMK, done: (s) => s.lawsPassed.some((l) => l.coSponsor), reward: [{ op: 'fame', d: 2 }] },
  { id: 'two_committees', title: 'שתי ועדות', hint: 'חדרי הסיעות → שיבוץ בוועדה', eligible: (s) => s.player.isMK && !s.player.ministry, done: (s) => s.player.committees.length >= 2, reward: [{ op: 'partyStanding', d: 2 }] },
  { id: 'minister', title: 'להתמנות לשר/ה', hint: 'מעמד 60+ ומוניטין 50+ במפלגת קואליציה', eligible: (s) => s.player.isMK && !s.player.defector, done: (s) => !!s.player.ministry, reward: [{ op: 'capital', d: 5 }] },
  { id: 'program', title: 'להשיק תכנית דגל', hint: 'המשרד שלך → לשכת השר/ה', eligible: (s) => !!s.player.ministry, done: (s) => (s.ministryState?.programs.length ?? 0) >= 1, reward: [{ op: 'fame', d: 2 }] },
  { id: 'leader', title: 'לעמוד בראש מפלגה', hint: 'מטה המפלגה → התמודדות, או הקמת מפלגה', eligible: (s) => s.player.isMK && s.player.partyStanding >= 45, done: (s) => !!s.player.partyId && s.parties[s.player.partyId].leaderId === 'player', reward: [{ op: 'fame', d: 5 }] },
  { id: 'pm', title: 'להיות ראש הממשלה', hint: 'המפלגה הגדולה בגוש + 61 ח"כים', eligible: (s) => !!s.player.partyId && s.parties[s.player.partyId].leaderId === 'player', done: (s) => s.coalition.pmId === 'player', reward: [{ op: 'fame', d: 10 }] },
];

export const missionById = (id: string) => MISSIONS.find((m) => m.id === id);

/** בדיקת השלמה ומילוי משימות חדשות. מחזיר את המשימות שהושלמו עכשיו. */
export function checkMissions(s: GameState): string[] {
  const completed: string[] = [];
  for (const id of [...s.missions]) {
    const m = missionById(id);
    if (!m) continue;
    if (m.done(s)) {
      applyOps(s, m.reward);
      s.missionsDone.push(id);
      s.missions = s.missions.filter((x) => x !== id);
      log(s, `✅ משימה הושלמה: ${m.title}`, 'career');
      completed.push(m.title);
    } else if (!m.eligible(s)) s.missions = s.missions.filter((x) => x !== id);
  }
  for (const m of MISSIONS) {
    if (s.missions.length >= 3) break;
    if (s.missionsDone.includes(m.id) || s.missions.includes(m.id)) continue;
    if (m.eligible(s) && !m.done(s)) s.missions.push(m.id);
  }
  return completed;
}
