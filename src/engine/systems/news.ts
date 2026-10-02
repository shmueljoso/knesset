import { pick } from '../rng';
import type { GameState, NewsItem } from '../types';
import { newId } from '../util';

export const OUTLETS = ['ערוץ המשכן', 'חדשות 13+', 'גלי הבירה', 'ידיעות הערב', 'פוליטיקה עכשיו'];

export function addNews(
  s: GameState,
  headline: string,
  tone: NewsItem['tone'] = 'neutral',
  aboutPlayer = false,
  body?: string,
  outlet?: string,
  npcId?: string,
) {
  s.news.unshift({ id: newId(s, 'news'), week: s.week, outlet: outlet ?? pick(s, OUTLETS), headline, body, tone, aboutPlayer, npcId });
  if (s.news.length > 150) s.news.length = 150;
}

export function npcLabel(s: GameState, id: string): string {
  if (id === 'player') return s.player.name;
  const n = s.npcs[id];
  if (!n) return '?';
  const party = n.partyId ? s.parties[n.partyId]?.short : null;
  return party ? `${n.name} (${party})` : n.name;
}
