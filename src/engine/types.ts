// טיפוסי הליבה של מנוע המשחק. כל ה-GameState ניתן לסריאליזציה ל-JSON (ללא פונקציות).

export type Sector = 'secular' | 'traditional' | 'religious' | 'haredi' | 'arab' | 'olim';
export type Axis = 'econ' | 'security' | 'religion' | 'judiciary';
export type Ideology = Record<Axis, number>;
export type Skill = 'speech' | 'negotiation' | 'media' | 'law' | 'organization';
export type Gender = 'm' | 'f';
export type Trait = 'loyal' | 'vindictive' | 'leaker' | 'opportunist' | 'principled' | 'vain' | 'pragmatic';

export type LocationId =
  | 'plenum'
  | 'committees'
  | 'offices'
  | 'cafeteria'
  | 'factions'
  | 'plaza'
  | 'studio'
  | 'partyhq'
  | 'field'
  | 'pmo'
  | 'finance'
  | 'ministry'
  | 'court';

export type CareerRank = 'citizen' | 'activist' | 'aide' | 'candidate' | 'mk' | 'chair' | 'minister';
export type BackgroundId = 'aide' | 'journalist' | 'officer' | 'entrepreneur';
export type ScenarioId = 'grassroots' | 'freshman';

export type WorldKey = 'economy' | 'affordability' | 'housing' | 'security' | 'trust' | 'cohesion';
export type World = Record<WorldKey, number>;

export interface AvatarSpec {
  seed: number;
  gender: Gender;
  cover: 'none' | 'kippah' | 'kippah-black' | 'hijab' | 'hat';
  beard: boolean;
  glasses: boolean;
  age: number; // 30-75
}

export interface Npc {
  id: string;
  name: string;
  gender: Gender;
  partyId: string | null;
  role: 'mk' | 'candidate' | 'journalist' | 'lobbyist';
  isMK: boolean;
  title?: string;
  ministry?: string;
  avatar: AvatarSpec;
  ideology: Ideology;
  traits: Trait[];
  knownTraits: Trait[];
  influence: number; // 0-100
  attitude: number; // -100..100 כלפי השחקן
  trust: number; // 0-100
  lastContact: number;
  friends: string[];
  haunts: LocationId[];
  notable: boolean;
  primaryStrength: number; // כוח בפריימריז/אצל היו"ר
  pledges: string[]; // מזהי הצעות חוק שהתחייב לתמוך בהן
  bio: string;
}

export interface Party {
  id: string;
  name: string;
  short: string;
  color: string;
  ideology: Ideology;
  leaderId: string;
  seats: number;
  poll: number; // אחוז תמיכה
  base: number; // תמיכת בסיס שאליה הסקרים חוזרים
  primaries: boolean;
  sectors: Partial<Record<Sector, number>>; // משקל זיקה למגזרים
  list: string[]; // רשימת מועמדים (מזהי NPC או 'player')
  playerFounded?: boolean;
  foundedWeek?: number;
  inOutgoingKnesset: boolean;
  surplusPartner?: string;
  incompatible?: string[];
}

export interface Committee {
  id: string;
  name: string;
  chairId: string;
  members: string[];
  topics: string[];
}

export type BillStage =
  | 'draft'
  | 'tabled'
  | 'ministerial'
  | 'preliminary'
  | 'committee1'
  | 'first'
  | 'committee2'
  | 'final'
  | 'passed'
  | 'failed';

export interface VoteResult {
  week: number;
  stage: BillStage;
  for: number;
  against: number;
  abstain: number;
  absent: number;
  passed: boolean;
  seats: ('for' | 'against' | 'abstain' | 'absent')[]; // 120 מושבים לפי סדר המליאה
}

export interface Bill {
  id: string;
  templateId: string;
  title: string;
  sponsor: string; // 'player' או מזהה NPC
  scope: 1 | 2 | 3;
  stage: BillStage;
  stageWeek: number;
  waitUntil: number;
  exemption: boolean;
  govPosition: 'support' | 'oppose' | 'free' | null;
  committeeId: string;
  committeeProgress: number;
  committeeNeeded: number;
  amendments: number; // ריכוך: יותר תמיכה, פחות השפעה
  pushWeek: number; // השבוע האחרון שבו לחצו על יו"ר הוועדה
  sessionPending: boolean;
  votedThisWeek: boolean;
  lastVote?: VoteResult;
  government?: boolean; // הצעת חוק ממשלתית
  agreementParty?: string; // סעיף בהסכם הקואליציוני
  history: { week: number; text: string }[];
}

export interface Debt {
  id: string;
  npcId: string;
  dir: 'owes_player' | 'player_owes';
  reason: string;
  week: number;
}

export interface Staff {
  id: string;
  name: string;
  gender: Gender;
  role: 'aide' | 'spokesperson' | 'advisor';
  level: number; // 1-5
  loyalty: number; // 0-100
  avatar: AvatarSpec;
  hiredWeek: number;
}

export interface Player {
  name: string;
  gender: Gender;
  background: BackgroundId;
  avatar: AvatarSpec;
  ideology: Ideology;
  fame: number;
  approval: Record<Sector, number>;
  reputation: number;
  partyStanding: number;
  capital: number;
  money: number; // באלפי ₪
  skills: Record<Skill, number>;
  consistency: number;
  ap: number;
  apMax: number;
  rank: CareerRank;
  partyId: string | null;
  employerId: string | null;
  isMK: boolean;
  ministry: string | null;
  committees: string[];
  staff: Staff[];
  debts: Debt[];
  partySwitches: number;
  defector: boolean; // "פורש" בכנסת הנוכחית
  memberSince: number;
  listPosition: number | null;
  primariesScore: number;
  wantsList: boolean; // הגיש מועמדות לרשימה
  location: LocationId;
  achievements: string[];
}

export interface NewsItem {
  id: string;
  week: number;
  outlet: string;
  headline: string;
  body?: string;
  tone: 'good' | 'bad' | 'neutral';
  aboutPlayer: boolean;
}

export interface PendingEvent {
  eventId: string;
  ctx: Record<string, string>;
}

export interface ActiveEffect {
  key: WorldKey;
  startWeek: number;
  perWeek: number;
  weeksLeft: number;
  source: string;
}

export interface Snapshot {
  fame: number;
  approval: number;
  reputation: number;
  partyStanding: number;
  capital: number;
  money: number;
  stability: number;
  playerPartyPoll: number | null;
}

export interface WeekReport {
  week: number;
  before: Snapshot;
  after: Snapshot;
  entries: LogEntry[];
  worldBefore: World;
  worldAfter: World;
}

export interface LogEntry {
  week: number;
  text: string;
  kind: 'action' | 'event' | 'system' | 'vote' | 'career';
}

export interface ElectionResult {
  week: number;
  knesset: number;
  votes: Record<string, number>;
  seats: Record<string, number>;
  playerElected: boolean;
  playerPosition: number | null;
}

export interface GameState {
  version: 1;
  seed: number;
  rng: number;
  week: number;
  startDate: string;
  scenario: ScenarioId;
  knesset: number;
  player: Player;
  parties: Record<string, Party>;
  npcs: Record<string, Npc>;
  seating: string[]; // 120 מזהי ח"כים לפי מושבי המליאה
  committees: Committee[];
  bills: Bill[];
  world: World;
  effects: ActiveEffect[];
  news: NewsItem[];
  eventQueue: PendingEvent[];
  eventsFired: Record<string, number>;
  coalition: Coalition;
  negotiation: Negotiation | null;
  ministryState: MinistryState | null;
  ministers: Record<string, string>;
  electionWeek: number;
  primariesWeek: number;
  pollHistory: { week: number; polls: Record<string, number> }[];
  playerHistory: { week: number; fame: number; approval: number; reputation: number }[];
  presence: Partial<Record<LocationId, string[]>>;
  weekStart: Snapshot;
  report: WeekReport | null;
  log: LogEntry[];
  lastElection: ElectionResult | null;
  flags: Record<string, number | string | boolean>;
  counter: number;
  gameOver: string | null;
}

// ---------- קואליציה וממשלה ----------
export type Demand =
  | { kind: 'ministry'; ref: string }
  | { kind: 'chair'; ref: string }
  | { kind: 'budget'; amount: number; sector: Sector }
  | { kind: 'bill'; ref: string }
  | { kind: 'veto'; ref: string };

export interface AgreementItem {
  id: string;
  partyId: string;
  demand: Demand;
  status: 'pending' | 'done' | 'broken';
  dueWeek: number;
}

export interface Coalition {
  parties: string[];
  pmId: string;
  stability: number;
  formedWeek: number;
  satisfaction: Record<string, number>;
  agreement: AgreementItem[];
  minoritySince: number | null;
}

export interface PartnerTalk {
  partyId: string;
  demands: Demand[];
  weights: number[];
  granted: boolean[];
  base: number;
  signed: boolean;
  walkedOut: boolean;
  attempts: number;
}

export interface Negotiation {
  mode: 'formateur' | 'partner';
  formateurParty: string;
  startWeek: number;
  deadline: number;
  extended: boolean;
  talks: PartnerTalk[];
  budgetPool: number;
  log: string[];
}

export interface MinistryState {
  id: string;
  budget: number; // מיליארדי ₪ לתכניות
  performance: number; // 0-100
  dgId: string | null;
  dgType: 'loyal' | 'pro' | 'crony' | null;
  programs: { id: string; week: number }[];
  budgetAskedWeek: number;
  since: number;
}
