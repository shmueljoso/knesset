// כותרות ממצב המדינה: בכל שבוע 1-2 כותרות מתוך מה שרלוונטי עכשיו, בלי לחזור על אותה כותרת שוב ושוב.
import { HEADLINES } from '../data/headlines';
import { chance, pick, pickWeighted } from '../rng';
import type { GameState } from '../types';
import { addNews } from './news';

const COOLDOWN = 8;

export function stateHeadlines(s: GameState) {
  const n = chance(s, 0.45) ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const pool = HEADLINES.filter((h) => s.week - Number(s.flags[`hl_${h.id}`] ?? -99) >= COOLDOWN && h.when(s));
    const def = pickWeighted(s, pool, (h) => h.weight);
    if (!def) return;
    s.flags[`hl_${def.id}`] = s.week;
    const [headline, tone, body] = pick(s, def.make(s));
    addNews(s, headline, tone, false, body, def.outlet);
  }
}
