import type { GameState } from './types';

/** השלמת שדות חסרים בשמירות מגרסאות קודמות. */
export function migrate(g: GameState): GameState {
  const c = g.coalition as Partial<GameState['coalition']> & GameState['coalition'];
  if (!c.satisfaction) c.satisfaction = Object.fromEntries(c.parties.map((p) => [p, 65]));
  if (!c.agreement) c.agreement = [];
  if (c.minoritySince === undefined) c.minoritySince = null;
  if (g.negotiation === undefined) g.negotiation = null;
  if (g.ministryState === undefined) g.ministryState = null;
  if (g.player.ministry === undefined) g.player.ministry = null;
  return g;
}
