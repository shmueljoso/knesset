// "למה זה קרה": מי הזיז את המדדים שלך השבוע. כל פעולה, אירוע או שלב שבועי עטוף ב-withCause –
// לוקחים צילום של המדדים לפני ואחרי ורושמים את ההפרש ב-s.whyLog תחת השם של הגורם.
// עטיפות מקוננות לא נספרות פעמיים (רק החיצונית רושמת). מה שלא עטוף מופיע בדוח כ"אחר".
import type { GameState, Snapshot, WhyEntry, WhyKey } from './types';
import { avgApproval } from './util';

export const WHY_KEYS: WhyKey[] = ['fame', 'approval', 'reputation', 'partyStanding', 'capital', 'money', 'poll'];
export const WHY_LABEL: Record<WhyKey, string> = {
  fame: 'מוכרות',
  approval: 'תדמית',
  reputation: 'מוניטין',
  partyStanding: 'מעמד במפלגה',
  capital: 'הון פוליטי',
  money: 'כסף (אלפי ₪)',
  poll: 'המפלגה בסקרים',
};

let depth = 0;

function snap(s: GameState): number[] {
  const p = s.player;
  const pp = p.partyId ? s.parties[p.partyId]?.poll ?? 0 : 0;
  return [p.fame, avgApproval(s), p.reputation, p.partyStanding, p.capital, p.money, pp];
}

/** רישום ישיר של תרומה (למשל פירוק הסקר השבועי) */
export function noteWhy(s: GameState, k: WhyKey, d: number, cause: string) {
  if (!s.whyLog || !Number.isFinite(d) || Math.abs(d) < 0.005) return;
  const e = s.whyLog.find((x) => x.k === k && x.c === cause);
  if (e) e.d += d;
  else if (s.whyLog.length < 150) s.whyLog.push({ k, c: cause, d });
}

/** מריץ fn ורושם את השינוי במדדים תחת cause */
export function withCause<T>(s: GameState, cause: string, fn: () => T): T {
  if (depth > 0 || !s.whyLog) return fn();
  const party = s.player.partyId;
  const a = snap(s);
  depth++;
  try {
    return fn();
  } finally {
    depth--;
    const b = snap(s);
    WHY_KEYS.forEach((k, i) => {
      if (k === 'poll' && s.player.partyId !== party) return; // החלפת מפלגה – הסקר לא בר השוואה
      noteWhy(s, k, b[i] - a[i], cause);
    });
  }
}

/** סיכום לדוח: לכל מדד – הגורמים, ממוינים לפי גודל, ו"אחר" לשארית */
export function summarizeWhy(s: GameState, before: Snapshot | null, after: Snapshot | null): WhyEntry[] {
  const out: WhyEntry[] = [];
  for (const k of WHY_KEYS) {
    const items = (s.whyLog ?? []).filter((x) => x.k === k && Math.abs(x.d) >= 0.05).map((x) => ({ ...x, d: Math.round(x.d * 10) / 10 }));
    const val = (x: Snapshot) => (k === 'poll' ? x.playerPartyPoll : x[k]);
    const b0 = before && val(before);
    const b1 = after && val(after);
    if (b0 !== null && b1 !== null && b0 !== undefined && b1 !== undefined) {
      const total = b1 - b0;
      const rest = total - (s.whyLog ?? []).filter((x) => x.k === k).reduce((a, x) => a + x.d, 0);
      if (Math.abs(rest) >= 0.3) items.push({ k, c: k === 'poll' ? '↔️ תנועה של מפלגות אחרות' : 'אחר', d: Math.round(rest * 10) / 10 });
    }
    out.push(...items.filter((x) => x.d !== 0).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 6));
  }
  return out;
}
