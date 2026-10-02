import { chance, rand } from './rng';
import { addNews } from './systems/news';
import { takeStance } from './systems/opinion';
import { addDebt, addMemory, changeAttitude, changeTrust, clearDebt, debtsWith, revealTrait, TRAIT_INFO } from './systems/relationships';
import { log } from './systems/report';
import { staffBonus } from './systems/staff';
import { checkMissions } from './systems/missions';
import { jointAppearance, jointBlocked, recruitBlocked, recruitToList } from './systems/influence';
import type { GameState, Npc } from './types';
import { clamp, ideologyDistance } from './util';

export type InteractionId = 'chat' | 'phone' | 'offer' | 'ask' | 'praise' | 'attack' | 'endorse' | 'joint' | 'recruit';

export interface InteractionDef {
  id: InteractionId;
  label: string;
  icon: string;
  desc: string;
  ap: number;
  capital?: number;
  inPerson: boolean;
}

export const INTERACTIONS: InteractionDef[] = [
  { id: 'chat', label: 'שיחה אישית', icon: '💬', desc: 'לחמם את הקשר. אולי תגלה משהו עליו.', ap: 1, inPerson: true },
  { id: 'phone', label: 'שיחת טלפון', icon: '📞', desc: 'מכל מקום, אבל פחות אפקטיבי.', ap: 1, inPerson: false },
  { id: 'offer', label: 'להציע עזרה', icon: '🎁', desc: 'טובה עכשיו – חוב לטובתך בהמשך.', ap: 1, capital: 2, inPerson: true },
  { id: 'ask', label: 'לבקש טובה', icon: '🙏', desc: 'אם הוא חייב לך – הוא יפרע. אחרת – אתה תהיה חייב.', ap: 1, inPerson: false },
  { id: 'praise', label: 'מחמאה פומבית', icon: '👏', desc: 'תאבי כבוד מעריכים במיוחד.', ap: 1, inPerson: false },
  { id: 'attack', label: 'מתקפה פומבית', icon: '⚔️', desc: 'מוכרות ונקודות אצל מי שמתנגד לו. אויב לכל החיים.', ap: 1, inPerson: false },
  { id: 'joint', label: 'הופעה משותפת', icon: '🎤', desc: 'כנס או ראיון ביחד: התדמית שלו בקהל שלו עוברת אליך. עם מישהו רחוק ממך – הבסיס שלך יתעצבן.', ap: 1, inPerson: false },
  { id: 'recruit', label: 'לגייס לרשימה שלך', icon: '🧲', desc: 'כיו"ר מפלגה: הוא/היא עובר/ת אליך – עם הקולות שלו/ה.', ap: 2, inPerson: true },
  { id: 'endorse', label: 'לבקש תמיכה ברשימה', icon: '🗳️', desc: 'חבר בכיר במפלגה יכול לקדם אותך ברשימה.', ap: 1, inPerson: true },
];

export function interactionBlocked(s: GameState, n: Npc, it: InteractionDef): string | null {
  if (s.player.ap < it.ap) return 'אין מספיק זמן';
  if (it.capital && s.player.capital < it.capital) return 'אין מספיק הון פוליטי';
  const present = (s.presence[s.player.location] ?? []).includes(n.id);
  if (it.inPerson && !present) return 'צריך לפגוש פנים מול פנים (הוא לא כאן עכשיו)';
  if (it.id === 'phone' && present) return 'הוא כאן – עדיף לדבר פנים מול פנים';
  if (it.id === 'joint') return jointBlocked(s, n);
  if (it.id === 'recruit') return recruitBlocked(s, n);
  if (it.id === 'endorse') {
    if (n.partyId !== s.player.partyId || !s.player.partyId) return 'רק חברי המפלגה שלך';
    if (!s.player.wantsList && !s.player.isMK) return 'קודם להגיש מועמדות לרשימה';
    if (s.flags[`endorsed_${n.id}`]) return 'כבר קיבלת ממנו תמיכה';
  }
  return null;
}

export function interact(s: GameState, npcId: string, id: InteractionId): { text: string; good: boolean } {
  const n = s.npcs[npcId];
  const it = INTERACTIONS.find((x) => x.id === id)!;
  const blocked = interactionBlocked(s, n, it);
  if (blocked) return { text: blocked, good: false };
  s.player.ap -= it.ap;
  if (it.capital) s.player.capital -= it.capital;
  s.counters[`int_${id}`] = (s.counters[`int_${id}`] ?? 0) + 1;
  n.lastContact = s.week;
  const negotiation = s.player.skills.negotiation / 100 + staffBonus(s, 'advisor') * 0.04;
  let text = '';
  let good = true;
  switch (id) {
    case 'chat':
    case 'phone': {
      const mult = id === 'chat' ? 1 : 0.5;
      const d = changeAttitude(s, n.id, (3 + rand(s) * 5) * mult * (0.8 + negotiation));
      changeTrust(s, n.id, 1.5 * mult);
      text = `שוחחתם ${id === 'chat' ? 'בארבע עיניים' : 'בטלפון'}. יחס ${d >= 0 ? '+' : ''}${d}.`;
      if (id === 'chat' && chance(s, 0.3)) {
        const t = revealTrait(s, n.id);
        if (t) text += ` גילית שהוא ${TRAIT_INFO[t].name}.`;
      }
      s.player.skills.negotiation = clamp(s.player.skills.negotiation + 0.3, 0, 100);
      if (id === 'chat' && n.traits.includes('leaker') && chance(s, 0.18)) {
        if (!n.knownTraits.includes('leaker')) n.knownTraits.push('leaker');
        s.player.consistency = clamp(s.player.consistency - 1, 0, 100);
        s.player.partyStanding = clamp(s.player.partyStanding - 2, 0, 100);
        addNews(s, `${n.name} מדליף/ה: "${s.player.name} אמר/ה לי בשיחה פרטית שהסיעה במשבר"`, 'bad', true, undefined, undefined, n.id);
        text += ' …ולמחרת זה היה בעיתון. הוא מדליף.';
      }
      break;
    }
    case 'offer': {
      const d = changeAttitude(s, n.id, 8 + (n.traits.includes('pragmatic') ? 4 : 0));
      changeTrust(s, n.id, 3);
      addDebt(s, n.id, 'owes_player', 'עזרה שהצעת');
      addMemory(s, n.id, 'עזר/ה לי כשהייתי צריך', d);
      text = `עזרת ל${n.name} עם בקשה של בוחרים. יחס +${d}, והוא חייב לך טובה.`;
      break;
    }
    case 'ask': {
      if (debtsWith(s, n.id, 'owes_player').length) {
        clearDebt(s, n.id, 'owes_player');
        s.player.capital += 5;
        changeTrust(s, n.id, 2);
        text = `${n.name} פרע את החוב: הון פוליטי +5.`;
      } else if (rand(s) < clamp(0.15 + n.attitude / 120 + negotiation * 0.3, 0.05, 0.85)) {
        s.player.capital += 3;
        addDebt(s, n.id, 'player_owes', 'טובה שביקשת');
        text = `${n.name} הסכים לעזור – הון פוליטי +3. עכשיו אתה חייב לו.`;
      } else {
        changeAttitude(s, n.id, -3);
        text = `${n.name} סירב: "אני לא חייב לך כלום".`;
        good = false;
      }
      break;
    }
    case 'praise': {
      const d = changeAttitude(s, n.id, 6, { public: true });
      addMemory(s, n.id, 'שיבח/ה אותי בפומבי', d);
      s.player.fame = clamp(s.player.fame + 0.5, 0, 100);
      if (ideologyDistance(n.ideology, s.player.ideology) > 0.35) {
        s.player.consistency = clamp(s.player.consistency - 2, 0, 100);
        text = ' הבוחרים שלך הרימו גבה.';
      }
      text = `שיבחת את ${n.name} ברשתות. יחס +${d}.` + text;
      break;
    }
    case 'attack': {
      const d = changeAttitude(s, n.id, -25);
      addMemory(s, n.id, 'תקף/ה אותי בתקשורת', d);
      takeStance(
        s,
        { econ: -n.ideology.econ / 2, security: -n.ideology.security / 2, religion: -n.ideology.religion / 2, judiciary: -n.ideology.judiciary / 2 },
        1.5,
      );
      s.player.fame = clamp(s.player.fame + 2.5 + n.influence / 40, 0, 100);
      if (n.partyId === s.player.partyId) s.player.partyStanding = clamp(s.player.partyStanding - 6, 0, 100);
      addNews(s, `${s.player.name} נגד ${n.name}: "הגיע הזמן שמישהו יגיד את האמת"`, 'neutral', true);
      text = `תקפת את ${n.name}. יחס ${d}. מוכרות עלתה.`;
      good = false;
      break;
    }
    case 'joint':
      text = jointAppearance(s, n);
      break;
    case 'recruit':
      text = recruitToList(s, n);
      break;
    case 'endorse': {
      if (n.attitude >= 35) {
        s.player.primariesScore += Math.round(n.influence / 8);
        s.flags[`endorsed_${n.id}`] = true;
        addDebt(s, n.id, 'player_owes', 'תמיכה בהתמודדות לרשימה');
        text = `${n.name} תומך בך בפומבי! ציון ברשימה +${Math.round(n.influence / 8)}.`;
      } else {
        changeAttitude(s, n.id, -2);
        text = `${n.name}: "עוד מוקדם בשבילי להתחייב".`;
        good = false;
      }
      break;
    }
  }
  log(s, `${it.label} עם ${n.name}: ${text}`, 'action');
  const done = checkMissions(s);
  if (done.length) text += ` ✅ ${done.join(', ')}`;
  return { text, good };
}
