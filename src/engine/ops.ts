// מפעיל אפקטים דקלרטיבי: אירועים ופעולות מתארים את ההשפעה כרשימת Op,
// וכך אפשר גם להציג לשחקן "השפעה צפויה" לפני שהוא בוחר.
import { addNews } from './systems/news';
import { WORLD_NAMES, addWorldEffect, changeApproval, takeStance } from './systems/opinion';
import { addDebt, addMemory, changeAttitude, changeTrust, clearDebt, revealTrait, TRAIT_INFO } from './systems/relationships';
import { log } from './systems/report';
import type { Debt, GameState, Ideology, NewsItem, Sector, Skill, WorldKey } from './types';
import { SECTOR_NAMES, clamp, fmtDelta } from './util';

export type StatKey = 'fame' | 'reputation' | 'partyStanding' | 'capital' | 'money' | 'consistency' | 'ap';
export type Ctx = Record<string, string>;

export type Op =
  | { op: StatKey; d: number }
  | { op: 'approval'; sector: Sector | 'all'; d: number }
  | { op: 'stance'; lean: Partial<Ideology>; d: number }
  | { op: 'skill'; skill: Skill; d: number }
  | { op: 'att'; who: string; d: number; public?: boolean }
  | { op: 'trust'; who: string; d: number }
  | { op: 'world'; key: WorldKey; d: number; weeks?: number }
  | { op: 'poll'; party: string; d: number }
  | { op: 'stability'; d: number }
  | { op: 'news'; headline: string; tone: NewsItem['tone']; about?: boolean }
  | { op: 'debt'; who: string; dir: Debt['dir']; reason: string }
  | { op: 'clearDebt'; who: string; dir: Debt['dir'] }
  | { op: 'flag'; key: string; v: number | string | boolean }
  | { op: 'reveal'; who: string }
  | { op: 'special'; id: string; label?: string }
  | { op: 'log'; text: string }
  | { op: 'memory'; who: string; text: string; d?: number };

export const STAT_NAMES: Record<StatKey, string> = {
  fame: 'מוכרות',
  reputation: 'מוניטין',
  partyStanding: 'מעמד במפלגה',
  capital: 'הון פוליטי',
  money: 'כסף (אלפי ₪)',
  consistency: 'עקביות',
  ap: 'זמן',
};
export const SKILL_NAMES: Record<Skill, string> = {
  speech: 'נאום',
  negotiation: 'משא ומתן',
  media: 'תקשורת',
  law: 'משפט וחקיקה',
  organization: 'ארגון',
};

type Special = (s: GameState, ctx: Ctx) => string | void;
export const SPECIALS: Record<string, Special> = {};
export const registerSpecial = (id: string, fn: Special) => {
  SPECIALS[id] = fn;
};

/** פענוח יעד: מזהה NPC או כינוי (@ctx, @employer, @leader, @pm, @party, @coalition, @justice, @friends:<id>) */
export function resolveWho(s: GameState, who: string, ctx: Ctx): string[] {
  if (!who.startsWith('@')) return s.npcs[who] ? [who] : [];
  const [key, arg] = who.slice(1).split(':');
  switch (key) {
    case 'ctx':
      return ctx.npc && s.npcs[ctx.npc] ? [ctx.npc] : [];
    case 'ctx2':
      return ctx.npc2 && s.npcs[ctx.npc2] ? [ctx.npc2] : [];
    case 'employer':
      return s.player.employerId ? [s.player.employerId] : [];
    case 'leader': {
      const p = s.player.partyId ? s.parties[s.player.partyId] : null;
      return p && p.leaderId !== 'player' ? [p.leaderId] : [];
    }
    case 'pm':
      return s.npcs[s.coalition.pmId] ? [s.coalition.pmId] : [];
    case 'justice':
      return s.ministers.justice ? [s.ministers.justice] : [];
    case 'party':
      return Object.values(s.npcs).filter((n) => n.partyId === s.player.partyId && n.isMK).map((n) => n.id);
    case 'coalition':
      return Object.values(s.npcs).filter((n) => n.isMK && n.partyId && s.coalition.parties.includes(n.partyId)).map((n) => n.id);
    case 'friends': {
      const base = arg === 'ctx' ? ctx.npc : arg;
      return s.npcs[base]?.friends ?? [];
    }
    case 'journalists':
      return Object.values(s.npcs).filter((n) => n.role === 'journalist').map((n) => n.id);
    default:
      return [];
  }
}

export function fill(s: GameState, text: string, ctx: Ctx): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (k === 'player') return s.player.name;
    if (k === 'npc' || k === 'npc2') {
      const n = s.npcs[ctx[k]];
      return n ? n.name : '?';
    }
    if (k === 'party') return ctx.party ? s.parties[ctx.party]?.name ?? '?' : s.player.partyId ? s.parties[s.player.partyId].name : 'המפלגה';
    if (k === 'npcParty') {
      const n = s.npcs[ctx.npc];
      return n?.partyId ? s.parties[n.partyId].name : 'ללא מפלגה';
    }
    if (k === 'bill') return s.bills.find((b) => b.id === ctx.bill)?.title ?? ctx.billTitle ?? 'הצעת החוק';
    if (k === 'employer') return s.player.employerId ? s.npcs[s.player.employerId].name : 'הח"כ';
    if (k === 'pm') return s.coalition.pmId === 'player' ? s.player.name : s.npcs[s.coalition.pmId]?.name ?? 'ראש הממשלה';
    if (k === 'leader') {
      const p = s.player.partyId ? s.parties[s.player.partyId] : null;
      return p ? (p.leaderId === 'player' ? s.player.name : s.npcs[p.leaderId].name) : 'יו"ר המפלגה';
    }
    return ctx[k] ?? `{${k}}`;
  });
}

function setStat(s: GameState, k: StatKey, d: number) {
  const p = s.player;
  if (k === 'money') p.money = Math.round((p.money + d) * 10) / 10;
  else if (k === 'capital') p.capital = Math.max(0, Math.round((p.capital + d) * 10) / 10);
  else if (k === 'ap') p.ap = Math.max(0, p.ap + d);
  else p[k] = clamp(Math.round((p[k] + d) * 10) / 10, 0, 100);
}

export function applyOps(s: GameState, ops: Op[], ctx: Ctx = {}): string[] {
  const out: string[] = [];
  for (const o of ops) {
    switch (o.op) {
      case 'fame':
      case 'reputation':
      case 'partyStanding':
      case 'capital':
      case 'money':
      case 'consistency':
      case 'ap':
        setStat(s, o.op, o.d);
        break;
      case 'approval':
        changeApproval(s, o.sector, o.d);
        break;
      case 'stance':
        takeStance(s, o.lean, o.d);
        break;
      case 'skill':
        s.player.skills[o.skill] = clamp(s.player.skills[o.skill] + o.d, 0, 100);
        break;
      case 'att':
        for (const id of resolveWho(s, o.who, ctx)) {
          changeAttitude(s, id, o.d, { public: o.public });
          s.npcs[id].lastContact = s.week;
        }
        break;
      case 'trust':
        for (const id of resolveWho(s, o.who, ctx)) changeTrust(s, id, o.d);
        break;
      case 'world':
        addWorldEffect(s, o.key, o.d, o.weeks ?? 1, 'event');
        break;
      case 'poll': {
        const ids =
          o.party === '@player' ? (s.player.partyId ? [s.player.partyId] : []) : o.party === '@coalition' ? s.coalition.parties : o.party === '@ctx' ? [ctx.party] : [o.party];
        for (const id of ids) if (s.parties[id]) s.parties[id].poll = Math.max(0.1, s.parties[id].poll + o.d);
        break;
      }
      case 'stability':
        // יציבות נגזרת משביעות הרצון של השותפות – משנים את כולן
        for (const p of s.coalition.parties) {
          if (s.coalition.satisfaction[p] !== undefined) s.coalition.satisfaction[p] = clamp(s.coalition.satisfaction[p] + o.d, 0, 100);
        }
        s.coalition.stability = clamp(s.coalition.stability + o.d, 0, 100);
        break;
      case 'news':
        addNews(s, fill(s, o.headline, ctx), o.tone, o.about ?? true);
        break;
      case 'debt':
        for (const id of resolveWho(s, o.who, ctx)) addDebt(s, id, o.dir, fill(s, o.reason, ctx));
        break;
      case 'clearDebt':
        for (const id of resolveWho(s, o.who, ctx)) clearDebt(s, id, o.dir);
        break;
      case 'flag':
        s.flags[o.key] = o.v;
        break;
      case 'reveal':
        for (const id of resolveWho(s, o.who, ctx)) {
          const t = revealTrait(s, id);
          if (t) out.push(`גילית: ${s.npcs[id].name} – ${TRAIT_INFO[t].name}`);
        }
        break;
      case 'special': {
        const r = SPECIALS[o.id]?.(s, ctx);
        if (r) out.push(r);
        break;
      }
      case 'log':
        log(s, fill(s, o.text, ctx), 'event');
        break;
      case 'memory':
        for (const id of resolveWho(s, o.who, ctx)) addMemory(s, id, fill(s, o.text, ctx), o.d ?? 0);
        break;
    }
  }
  return out;
}

export interface OpChip {
  label: string;
  tone: 'good' | 'bad' | 'neutral';
}

/** תיאור קצר של ההשפעה הצפויה, להצגה לפני בחירה. */
export function describeOps(s: GameState, ops: Op[], ctx: Ctx = {}): OpChip[] {
  const chips: OpChip[] = [];
  const tone = (d: number, invert = false): OpChip['tone'] => (d === 0 ? 'neutral' : (d > 0) !== invert ? 'good' : 'bad');
  for (const o of ops) {
    switch (o.op) {
      case 'fame':
      case 'reputation':
      case 'partyStanding':
      case 'capital':
      case 'money':
      case 'consistency':
      case 'ap':
        chips.push({ label: `${STAT_NAMES[o.op]} ${fmtDelta(o.d)}`, tone: tone(o.d) });
        break;
      case 'approval':
        chips.push({ label: `תדמית${o.sector === 'all' ? '' : ' ב' + SECTOR_NAMES[o.sector]} ${fmtDelta(o.d)}`, tone: tone(o.d) });
        break;
      case 'stance':
        chips.push({ label: 'עמדה פומבית: מגזרים יגיבו', tone: 'neutral' });
        break;
      case 'skill':
        chips.push({ label: `${SKILL_NAMES[o.skill]} ${fmtDelta(o.d)}`, tone: tone(o.d) });
        break;
      case 'att': {
        const ids = resolveWho(s, o.who, ctx);
        const name = o.who === '@party' ? 'חברי הסיעה' : o.who === '@coalition' ? 'ח"כי הקואליציה' : o.who.startsWith('@friends') ? 'החברים שלו' : ids.length === 1 ? s.npcs[ids[0]].name : '';
        if (name) chips.push({ label: `יחס ${name} ${fmtDelta(o.d)}`, tone: tone(o.d) });
        break;
      }
      case 'world':
        chips.push({ label: `${WORLD_NAMES[o.key]} ${fmtDelta(o.d)}`, tone: tone(o.d) });
        break;
      case 'poll':
        chips.push({ label: `סקרים ${fmtDelta(o.d, 1)}%`, tone: o.party === '@player' ? tone(o.d) : 'neutral' });
        break;
      case 'stability':
        chips.push({ label: `יציבות קואליציה ${fmtDelta(o.d)}`, tone: 'neutral' });
        break;
      case 'debt':
        chips.push({ label: o.dir === 'owes_player' ? 'חוב לטובתך' : 'אתה חייב טובה', tone: o.dir === 'owes_player' ? 'good' : 'bad' });
        break;
      case 'special':
        if (o.label) chips.push({ label: o.label, tone: 'neutral' });
        break;
      default:
        break;
    }
  }
  return chips;
}
