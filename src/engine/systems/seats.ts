// מונה המושבים של כל מפלגה נגזר ממי שיושב בפועל במליאה. אחרי כל מהלך שמזיז אנשים בין מפלגות מסנכרנים אותו.
import type { GameState } from '../types';

export function recountSeats(s: GameState) {
  const counts: Record<string, number> = {};
  for (const id of s.seating) {
    const pid = id === 'player' ? s.player.partyId : s.npcs[id]?.partyId;
    if (pid) counts[pid] = (counts[pid] ?? 0) + 1;
  }
  for (const p of Object.values(s.parties)) {
    p.seats = counts[p.id] ?? 0;
    p.inOutgoingKnesset = p.seats > 0 ? true : p.inOutgoingKnesset;
  }
}
