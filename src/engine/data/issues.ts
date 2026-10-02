import type { Axis, IssueId, Sector, WorldKey } from '../types';

export interface IssueDef {
  id: IssueId;
  name: string;
  icon: string;
  world?: WorldKey; // משתנה העולם שמחמם את הסוגיה כשהוא נמוך
  axis: Axis; // הציר שעמדות עליו "נוגעות" בסוגיה
  sectors: Sector[]; // מי הכי רגיש לסוגיה
  base: number; // בולטות התחלתית
  blurb: string;
}

export const ISSUES: IssueDef[] = [
  { id: 'housing', name: 'יוקר הדיור', icon: '🏠', world: 'housing', axis: 'econ', sectors: ['secular', 'traditional', 'olim'], base: 65, blurb: 'זוגות צעירים לא מצליחים לקנות דירה.' },
  { id: 'cost', name: 'יוקר המחיה', icon: '🛒', world: 'affordability', axis: 'econ', sectors: ['traditional', 'haredi', 'arab', 'olim'], base: 60, blurb: 'מחירי המזון והחשבונות בשמיים.' },
  { id: 'draft', name: 'השוויון בנטל', icon: '🪖', axis: 'religion', sectors: ['secular', 'religious', 'haredi', 'olim'], base: 55, blurb: 'גיוס חרדים – הסוגיה שמפרקת קואליציות.' },
  { id: 'religion', name: 'דת ומדינה', icon: '🕍', world: 'cohesion', axis: 'religion', sectors: ['secular', 'haredi', 'olim'], base: 40, blurb: 'שבת, נישואים, כשרות וגיור.' },
  { id: 'judiciary', name: 'מערכת המשפט', icon: '⚖️', world: 'trust', axis: 'judiciary', sectors: ['secular', 'religious', 'arab'], base: 45, blurb: 'מי אחרון לקבוע: הכנסת או בית המשפט?' },
  { id: 'security', name: 'ביטחון', icon: '🛡️', world: 'security', axis: 'security', sectors: ['traditional', 'religious', 'olim'], base: 50, blurb: 'רקטות, גבולות ומלחמה בטרור.' },
  { id: 'crime', name: 'פשיעה בחברה הערבית', icon: '🚔', axis: 'security', sectors: ['arab'], base: 50, blurb: 'שיא של קורבנות ירי ביישובים הערביים.' },
  { id: 'education', name: 'חינוך', icon: '🎒', world: 'economy', axis: 'religion', sectors: ['secular', 'traditional', 'arab'], base: 35, blurb: 'כיתות צפופות, ליבה ומורים שעוזבים.' },
  { id: 'wages', name: 'שכר ופנסיה', icon: '💵', world: 'affordability', axis: 'econ', sectors: ['traditional', 'arab', 'haredi'], base: 40, blurb: 'שכר מינימום, פנסיה וזכויות עובדים.' },
];

export const issueById = (id: IssueId) => ISSUES.find((i) => i.id === id)!;
