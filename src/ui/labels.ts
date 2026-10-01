import { ministryTitle } from '../engine/systems/government';
import type { GameState } from '../engine/types';

export function g2(g: GameState, m: string, f: string) {
  return g.player.gender === 'f' ? f : m;
}

export function careerTitle(g: GameState): string {
  const p = g.player;
  const party = p.partyId ? g.parties[p.partyId] : null;
  const leads = party?.leaderId === 'player' && g.coalition.pmId !== 'player';
  if (leads && p.rank === 'mk') return `${g2(g, 'ח"כ', 'ח"כ')} · יו"ר ${party!.name}`;
  const t = rankTitle(g);
  return leads ? `${t} · יו"ר ${party!.short}` : t;
}

function rankTitle(g: GameState): string {
  const p = g.player;
  const party = p.partyId ? g.parties[p.partyId] : null;
  switch (p.rank) {
    case 'citizen':
      return g2(g, 'אזרח פעיל', 'אזרחית פעילה') + (p.defector ? ' · ח"כ יחיד' : '');
    case 'activist':
      return `${g2(g, 'פעיל', 'פעילה')} ב${party?.name ?? 'מפלגה'}`;
    case 'aide':
      return `${g2(g, 'עוזר פרלמנטרי', 'עוזרת פרלמנטרית')} של ${p.employerId ? g.npcs[p.employerId].name : 'ח"כ'}`;
    case 'candidate':
      return `${g2(g, 'מועמד', 'מועמדת')} לכנסת${p.listPosition ? ` · מקום ${p.listPosition}` : ''}`;
    case 'mk':
      return `${g2(g, 'חבר הכנסת', 'חברת הכנסת')}${party ? ' · ' + party.short : p.defector ? ' · פורש' : ''}`;
    case 'chair': {
      const c = g.committees.find((x) => x.chairId === 'player');
      return `${g2(g, 'ח"כ', 'ח"כ')} · יו"ר ${c?.name.replace('ועדת ', '') ?? 'ועדה'}`;
    }
    case 'minister':
      if (g.coalition.pmId === 'player') return g2(g, 'ראש הממשלה', 'ראשת הממשלה');
      return p.ministry ? ministryTitle(p.ministry, p.gender) : g2(g, 'שר', 'שרה');
  }
}

export const RANK_ORDER = ['citizen', 'activist', 'aide', 'candidate', 'mk', 'chair', 'minister'] as const;
