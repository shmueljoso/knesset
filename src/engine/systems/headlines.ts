// כותרות ממצב המדינה: בכל שבוע 1-2 כותרות מתוך מה שרלוונטי עכשיו, בלי לחזור על אותה כותרת שוב ושוב.
import { HEADLINES } from '../data/headlines';
import { chance, pick, pickWeighted } from '../rng';
import type { GameState } from '../types';
import { addNews } from './news';

/** הפעם הראשונה – אחרי 8 שבועות; כל חזרה מאריכה את ההמתנה (עד 40), כדי שאותו מצב לא ימלא את העיתון */
const cooldown = (s: GameState, id: string) => Math.min(40, 8 + 6 * Number(s.flags[`hln_${id}`] ?? 0));

export function stateHeadlines(s: GameState) {
  // כשהמצב השתנה (התנאי כבר לא מתקיים) – הכותרת "נשכחת", ואם המצב יחזור היא תחזור מהר
  for (const h of HEADLINES) if (s.flags[`hln_${h.id}`] && s.week - Number(s.flags[`hl_${h.id}`] ?? -99) > 12 && !h.when(s)) delete s.flags[`hln_${h.id}`];
  const n = chance(s, 0.45) ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const pool = HEADLINES.filter((h) => s.week - Number(s.flags[`hl_${h.id}`] ?? -99) >= cooldown(s, h.id) && h.when(s));
    const def = pickWeighted(s, pool, (h) => h.weight);
    if (!def) return;
    s.flags[`hl_${def.id}`] = s.week;
    s.flags[`hln_${def.id}`] = Number(s.flags[`hln_${def.id}`] ?? 0) + 1;
    const [headline, tone, body] = pick(s, def.make(s));
    addNews(s, headline, tone, false, body, def.outlet);
  }
}
