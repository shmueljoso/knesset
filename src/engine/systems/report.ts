import type { GameState, Snapshot } from '../types';
import { avgApproval } from '../util';

export function snapshot(s: GameState): Snapshot {
  const pp = s.player.partyId ? s.parties[s.player.partyId] : null;
  return {
    fame: s.player.fame,
    approval: avgApproval(s),
    reputation: s.player.reputation,
    partyStanding: s.player.partyStanding,
    capital: s.player.capital,
    money: s.player.money,
    stability: s.coalition.stability,
    playerPartyPoll: pp ? pp.poll : null,
  };
}

export function log(s: GameState, text: string, kind: 'action' | 'event' | 'system' | 'vote' | 'career' = 'system') {
  s.log.push({ week: s.week, text, kind });
  // רגעי קריירה נשמרים גם לגלריה (היומן נחתך)
  if (kind === 'career' && s.moments) {
    s.moments.push({ week: s.week, icon: '⭐', text });
    if (s.moments.length > 120) s.moments.shift();
  }
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}
