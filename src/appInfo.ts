// טקסטים קצרים על מצב המשחק – לווידג'ט במסך הבית ולהתראות. פונקציות טהורות (נבדקות ב-tests/app.test.ts).
import type { GameState } from './engine';
import { pollSeats } from './engine/systems/opinion';
import { careerTitle } from './ui/labels';
import type { WidgetData } from './platform';

const weeksText = (n: number) => (n === 1 ? 'שבוע אחד' : `${n} שבועות`);

export function widgetData(g: GameState): WidgetData {
  const p = g.player.partyId ? g.parties[g.player.partyId] : null;
  const toElection = g.electionWeek - g.week;
  const seats = p ? pollSeats(p.poll, g.rules.threshold) : 0;
  const last = g.pollHistory.length > 4 && p ? g.pollHistory[g.pollHistory.length - 5].polls[p.id] : undefined;
  const trend = last === undefined || !p ? '' : p.poll - last > 0.4 ? ' ▲' : p.poll - last < -0.4 ? ' ▼' : '';
  return {
    title: `${g.player.name} · ${careerTitle(g)}`,
    line1: p ? `📊 ${p.name}: ${seats} מנדטים בסקר${trend}` : `📣 מוכרות ${Math.round(g.player.fame)} · מוניטין ${Math.round(g.player.reputation)}`,
    line2: g.gameOver ? '🏁 הקריירה הסתיימה' : toElection > 0 ? `🗳️ בחירות בעוד ${weeksText(toElection)}` : '🗳️ שבוע בחירות!',
    line3: `שבוע ${g.week + 1} · מוכרות ${Math.round(g.player.fame)} · מוניטין ${Math.round(g.player.reputation)}`,
  };
}

/** תזכורת לחזור למשחק – לפי מה שמחכה שם */
export function reminderText(g: GameState): { title: string; body: string } {
  const toElection = g.electionWeek - g.week;
  if (g.eventQueue.length) return { title: 'יש החלטה שמחכה לך', body: `${g.player.name}, הכנסת לא עוצרת – ${g.eventQueue.length === 1 ? 'אירוע אחד מחכה' : `${g.eventQueue.length} אירועים מחכים`} לתגובה שלך.` };
  if (g.negotiation) return { title: 'המשא ומתן הקואליציוני תקוע', body: 'השותפות מחכות לתשובה. בלעדיך הממשלה לא תקום.' };
  if (toElection > 0 && toElection <= 8) return { title: `בחירות בעוד ${weeksText(toElection)}`, body: 'הקמפיין בשיאו, והסקר האחרון מחכה לך.' };
  if (g.coalition.pmId === 'player') return { title: 'הממשלה צריכה את ראש הממשלה', body: 'השותפות מתחילות לדבר על פירוק. כדאי לחזור לפני שזה קורה.' };
  return { title: 'המשכן מחכה לך', body: `${g.player.name}, שבוע ${g.week + 1}: הכותרות של היום כבר בחוץ.` };
}

/** מתי מתחיל אתגר השבוע הבא (יום שני, 18:00 בשעון המקומי) */
export function nextChallengeAt(now: Date): Date {
  const d = new Date(now);
  d.setHours(18, 0, 0, 0);
  const add = (8 - d.getDay()) % 7; // 1 = שני
  d.setDate(d.getDate() + add);
  if (d <= now) d.setDate(d.getDate() + 7);
  return d;
}
