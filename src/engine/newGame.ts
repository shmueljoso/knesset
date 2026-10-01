import { backgroundById } from './data/backgrounds';
import { makeName } from './data/names';
import { makeAvatar } from './avatarGen';
import { INITIAL_COALITION, PARTY_DEFS, SURPLUS_PAIRS, type NamePoolId } from './data/parties';
import { makeLocalRng } from './rng';
import { formGovernment } from './systems/government';
import { snapshot } from './systems/report';
import { refreshPresence } from './systems/presence';
import type {
  AvatarSpec,
  BackgroundId,
  Gender,
  GameState,
  Ideology,
  LocationId,
  Npc,
  Party,
  Player,
  ScenarioId,
  Sector,
  Trait,
} from './types';
import { AXES, SECTORS, clamp } from './util';

export interface NewGameOptions {
  name: string;
  gender: Gender;
  background: BackgroundId;
  ideology: Ideology;
  partyId: string | null;
  scenario: ScenarioId;
  avatar: Omit<AvatarSpec, 'gender'>;
  seed?: number;
}

export const TRAITS: Trait[] = ['loyal', 'vindictive', 'leaker', 'opportunist', 'principled', 'vain', 'pragmatic'];
const HAUNTS: LocationId[] = ['plenum', 'committees', 'offices', 'cafeteria', 'factions', 'plaza', 'studio'];
const PROFESSIONS = ['עורך/ת דין', 'ראש/ת מועצה', 'כלכלן/ית', 'מורה', 'עיתונאי/ת', 'קצין/ה בצבא', 'רב/ה ומחנך/ת', 'רופא/ה', 'פעיל/ה חברתי/ת', 'איש/אשת עסקים', 'עובד/ת סוציאלי/ת', 'מהנדס/ת'];

function pickPool(rnd: () => number, pools: Partial<Record<NamePoolId, number>>): NamePoolId {
  const entries = Object.entries(pools) as [NamePoolId, number][];
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rnd() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[0][0];
}

export function makeNpc(
  rnd: () => number,
  used: Set<string>,
  id: string,
  party: { id: string; ideology: Ideology; namePool: Partial<Record<NamePoolId, number>> } | null,
  role: Npc['role'],
  rank: number,
): Npc {
  const pool = party ? pickPool(rnd, party.namePool) : pickPool(rnd, { jewish: 0.8, arab: 0.1, russian: 0.1 });
  const femaleRate = pool === 'haredi' ? 0.03 : 0.33;
  const gender: Gender = rnd() < femaleRate ? 'f' : 'm';
  const base = party?.ideology ?? { econ: 0, security: 0, religion: -20, judiciary: -20 };
  const ideology = Object.fromEntries(AXES.map((a) => [a, clamp(base[a] + (rnd() - 0.5) * 40, -100, 100)])) as Ideology;
  const traits: Trait[] = [];
  traits.push(TRAITS[Math.floor(rnd() * TRAITS.length)]);
  if (rnd() < 0.45) {
    const t = TRAITS[Math.floor(rnd() * TRAITS.length)];
    if (!traits.includes(t)) traits.push(t);
  }
  const haunts = new Set<LocationId>();
  if (rnd() < 0.7) haunts.add('cafeteria');
  while (haunts.size < 3) haunts.add(HAUNTS[Math.floor(rnd() * HAUNTS.length)]);
  const prof = PROFESSIONS[Math.floor(rnd() * PROFESSIONS.length)];
  const name = makeName(rnd, pool, gender, used);
  return {
    id,
    name,
    gender,
    partyId: party?.id ?? null,
    role,
    isMK: false,
    avatar: makeAvatar(rnd, gender, pool),
    ideology,
    traits,
    knownTraits: [],
    influence: clamp(Math.round(85 - rank * 2.2 + (rnd() - 0.5) * 20), 5, 100),
    attitude: Math.round((rnd() - 0.4) * 25),
    trust: 30 + Math.floor(rnd() * 20),
    lastContact: -10,
    friends: [],
    haunts: [...haunts],
    notable: rank < 4,
    primaryStrength: clamp(Math.round(90 - rank * 3 + (rnd() - 0.5) * 30), 5, 100),
    pledges: [],
    bio: `לשעבר ${prof}.`,
  };
}

export function createGame(opts: NewGameOptions): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rnd = makeLocalRng(seed);
  const used = new Set<string>([opts.name]);
  const npcs: Record<string, Npc> = {};
  const parties: Record<string, Party> = {};
  let n = 0;

  for (const def of PARTY_DEFS) {
    const list: string[] = [];
    const listLen = def.seats + 8;
    for (let r = 0; r < listLen; r++) {
      const npc = makeNpc(rnd, used, `n${++n}`, def, r < def.seats ? 'mk' : 'candidate', r);
      npc.isMK = r < def.seats;
      npc.bio += ` ${r === 0 ? 'יו"ר' : 'חבר/ת'} ${def.name}.`;
      npcs[npc.id] = npc;
      list.push(npc.id);
    }
    parties[def.id] = {
      id: def.id,
      name: def.name,
      short: def.short,
      color: def.color,
      ideology: def.ideology,
      leaderId: list[0],
      seats: def.seats,
      poll: (def.seats / 120) * 100,
      base: (def.seats / 120) * 100,
      primaries: def.primaries,
      sectors: def.sectors,
      list,
      inOutgoingKnesset: true,
      incompatible: def.incompatible,
    };
    npcs[list[0]].influence = 95;
    npcs[list[0]].primaryStrength = 100;
    npcs[list[0]].notable = true;
  }
  for (const [a, b] of SURPLUS_PAIRS) {
    parties[a].surplusPartner = b;
    parties[b].surplusPartner = a;
  }
  // עיתונאים ולוביסטים
  const outlets = ['ערוץ המשכן', 'חדשות 13+', 'גלי הבירה', 'ידיעות הערב'];
  for (let i = 0; i < 4; i++) {
    const j = makeNpc(rnd, used, `n${++n}`, null, 'journalist', 3);
    j.title = j.gender === 'm' ? `כתב פוליטי, ${outlets[i]}` : `כתבת פוליטית, ${outlets[i]}`;
    j.haunts = ['plaza', 'cafeteria', 'studio'];
    j.notable = true;
    j.bio = `מסקר/ת את הכנסת כבר ${5 + Math.floor(rnd() * 15)} שנים.`;
    npcs[j.id] = j;
  }
  const lobbies = ['איגוד התעשיינים', 'פורום הקבלנים', 'ארגון החקלאים'];
  for (let i = 0; i < 3; i++) {
    const l = makeNpc(rnd, used, `n${++n}`, null, 'lobbyist', 5);
    l.title = `לוביסט/ית, ${lobbies[i]}`;
    l.haunts = ['plaza', 'cafeteria'];
    l.notable = true;
    l.bio = `מייצג/ת את ${lobbies[i]}. יודע/ת לפתוח דלתות – תמורת מחיר.`;
    npcs[l.id] = l;
  }
  // רשת חברים
  const all = Object.values(npcs);
  for (const npc of all) {
    const sameParty = all.filter((o) => o.partyId === npc.partyId && o.id !== npc.id && (o.isMK || o.role !== 'candidate'));
    for (let k = 0; k < 3 && sameParty.length; k++) {
      const f = sameParty[Math.floor(rnd() * sameParty.length)];
      if (!npc.friends.includes(f.id)) npc.friends.push(f.id);
    }
    const other = all[Math.floor(rnd() * all.length)];
    if (other.id !== npc.id && !npc.friends.includes(other.id)) npc.friends.push(other.id);
  }

  // סידור מושבים במליאה: משמאל לימין
  const order = Object.values(parties).sort(
    (a, b) => a.ideology.security + a.ideology.judiciary - (b.ideology.security + b.ideology.judiciary),
  );
  const seating = order.flatMap((p) => p.list.slice(0, p.seats));

  const bg = backgroundById(opts.background);
  const approval = Object.fromEntries(SECTORS.map((sec) => [sec, 50 + (bg.approval[sec] ?? 0)])) as Record<Sector, number>;
  const player: Player = {
    name: opts.name,
    gender: opts.gender,
    background: opts.background,
    avatar: { ...opts.avatar, gender: opts.gender },
    ideology: opts.ideology,
    fame: bg.fame,
    approval,
    reputation: bg.reputation,
    partyStanding: 20,
    capital: 5,
    money: bg.money,
    skills: { speech: 25, negotiation: 25, media: 25, law: 20, organization: 25, ...bg.skills },
    consistency: 70,
    ap: 5,
    apMax: 5,
    rank: opts.partyId ? 'activist' : 'citizen',
    partyId: opts.partyId,
    employerId: null,
    isMK: false,
    committees: [],
    staff: [],
    debts: [],
    partySwitches: 0,
    defector: false,
    memberSince: -30,
    listPosition: null,
    primariesScore: 0,
    wantsList: false,
    location: 'plaza',
    achievements: [],
  };

  const freshman = opts.scenario === 'freshman';
  const s: GameState = {
    version: 1,
    seed,
    rng: seed ^ 0x5bd1e995,
    week: 0,
    startDate: freshman ? '2026-11-15' : '2026-10-18',
    scenario: opts.scenario,
    knesset: freshman ? 26 : 25,
    player,
    parties,
    npcs,
    seating,
    committees: [],
    bills: [],
    world: { economy: 55, affordability: 38, housing: 30, security: 50, trust: 42, cohesion: 40 },
    effects: [],
    news: [],
    eventQueue: [],
    eventsFired: {},
    coalition: { parties: [], pmId: '', stability: 70, formedWeek: 0 },
    ministers: {},
    electionWeek: freshman ? 205 : 52,
    primariesWeek: freshman ? 193 : 40,
    pollHistory: [],
    playerHistory: [],
    presence: {},
    weekStart: {} as GameState['weekStart'],
    report: null,
    log: [],
    lastElection: null,
    flags: {},
    counter: 0,
    gameOver: null,
  };

  if (opts.partyId) {
    const party = parties[opts.partyId];
    for (const npc of Object.values(npcs)) if (npc.partyId === party.id) npc.attitude += 10;
    if (freshman) {
      // השחקן נכנס כח"כ אחרון ברשימה
      const replaced = party.list[party.seats - 1];
      npcs[replaced].isMK = false;
      npcs[replaced].role = 'candidate';
      party.list.splice(party.seats - 1, 0, 'player');
      seating[seating.indexOf(replaced)] = 'player';
      player.isMK = true;
      player.rank = 'mk';
      player.listPosition = party.seats;
      player.partyStanding = 35;
      player.committees = [bg.committee];
      player.reputation += 5;
      player.fame += 8;
      player.money += 30;
      player.memberSince = -60;
    } else if (opts.background === 'aide') {
      const boss = party.list.slice(2, Math.min(10, party.seats)).map((id) => npcs[id])[Math.floor(rnd() * 5)];
      player.employerId = boss.id;
      player.rank = 'aide';
      boss.attitude = 35;
      boss.trust = 60;
      player.location = 'offices';
      player.partyStanding = 25;
      player.memberSince = -100;
    }
  }
  if (opts.background === 'journalist') {
    for (const npc of Object.values(npcs)) if (npc.role === 'journalist') npc.attitude += 25;
  }

  formGovernment(s, INITIAL_COALITION);
  refreshPresence(s);
  s.pollHistory.push({ week: 0, polls: Object.fromEntries(Object.values(parties).map((p) => [p.id, p.poll])) });
  s.weekStart = snapshot(s);
  s.news.push({
    id: 'w0',
    week: 0,
    outlet: 'ערוץ המשכן',
    headline: freshman ? `הכנסת ה-${s.knesset} הושבעה: ${opts.name} בין הח"כים החדשים` : 'נפתח מושב החורף של הכנסת; הקואליציה מבטיחה "שנה של משילות"',
    tone: 'neutral',
    aboutPlayer: freshman,
  });
  return s;
}

/** מועמד/ת חדש/ה לרשימה (כשמפלגה זוכה ביותר מושבים מאורך הרשימה). */
export function spawnCandidate(s: GameState, partyId: string): Npc {
  const party = s.parties[partyId];
  const def = PARTY_DEFS.find((d) => d.id === partyId);
  const rnd = makeLocalRng(s.seed + s.counter * 7919 + party.list.length);
  const used = new Set(Object.values(s.npcs).map((n) => n.name));
  s.counter += 1;
  const npc = makeNpc(rnd, used, `c${s.counter}`, { id: partyId, ideology: party.ideology, namePool: def?.namePool ?? { jewish: 1 } }, 'candidate', 12);
  npc.bio += ` מועמד/ת ב${party.name}.`;
  s.npcs[npc.id] = npc;
  party.list.push(npc.id);
  return npc;
}
