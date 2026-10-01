import { inSession } from '../calendar';
import { ACTIVE_LOCATIONS } from '../data/locations';
import { rand } from '../rng';
import type { GameState, LocationId } from '../types';

const KNESSET_LOCS: LocationId[] = ['plenum', 'committees', 'offices', 'cafeteria', 'factions', 'plaza'];

/** מי נמצא איפה השבוע. בפגרה הכנסת ריקה יותר. */
export function refreshPresence(s: GameState) {
  const session = inSession(s);
  const presence: Partial<Record<LocationId, string[]>> = {};
  for (const loc of ACTIVE_LOCATIONS) presence[loc] = [];
  for (const npc of Object.values(s.npcs)) {
    if (npc.role === 'candidate') continue;
    for (const loc of npc.haunts) {
      let p = npc.notable ? 0.45 : 0.18;
      if (KNESSET_LOCS.includes(loc) && !session) p *= 0.4;
      if (npc.id === s.player.employerId) p = loc === 'offices' ? 1 : 0.3;
      if (rand(s) < p) presence[loc]!.push(npc.id);
    }
  }
  for (const loc of ACTIVE_LOCATIONS) {
    const list = presence[loc]!;
    list.sort((a, b) => {
      const na = s.npcs[a];
      const nb = s.npcs[b];
      const sa = (na.notable ? 50 : 0) + na.influence + (a === s.player.employerId ? 200 : 0) + (na.partyId === s.player.partyId ? 15 : 0);
      const sb = (nb.notable ? 50 : 0) + nb.influence + (b === s.player.employerId ? 200 : 0) + (nb.partyId === s.player.partyId ? 15 : 0);
      return sb - sa;
    });
    presence[loc] = [...new Set(list)].slice(0, 7);
  }
  // קריית הממשלה: שרים
  const ministers = Object.entries(s.ministers).filter(([m, id]) => m !== 'pm' && s.npcs[id]).map(([, id]) => id);
  presence.pmo = [s.coalition.pmId, ...ministers.filter(() => rand(s) < 0.35)].filter((id) => s.npcs[id]).slice(0, 6);
  presence.finance = [s.ministers.finance].filter((id) => id && s.npcs[id]);
  s.presence = presence;
}
