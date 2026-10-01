import type { Ideology, Sector } from '../types';

export interface PartyDef {
  id: string;
  name: string;
  short: string;
  color: string;
  ideology: Ideology;
  seats: number;
  primaries: boolean;
  sectors: Partial<Record<Sector, number>>;
  namePool: Partial<Record<NamePoolId, number>>;
  incompatible?: string[];
  blurb: string;
}

export type NamePoolId = 'jewish' | 'haredi' | 'religious' | 'arab' | 'russian' | 'druze';

// מפלגות בדיוניות בהשראת ארכיטיפים של הפוליטיקה הישראלית.
export const PARTY_DEFS: PartyDef[] = [
  {
    id: 'tikva', name: 'התקווה הלאומית', short: 'תקווה', color: '#2563eb',
    ideology: { econ: 45, security: 65, religion: 15, judiciary: 60 }, seats: 32, primaries: true,
    sectors: { traditional: 1, secular: 0.4, religious: 0.3, olim: 0.4 }, namePool: { jewish: 1 },
    blurb: 'מפלגת השלטון הגדולה של הימין. פריימריז סוערים ומוקדי כוח.',
  },
  {
    id: 'merkaz', name: 'מרכז חדש', short: 'מרכז', color: '#0891b2',
    ideology: { econ: 25, security: 20, religion: -45, judiciary: -55 }, seats: 22, primaries: false,
    sectors: { secular: 1, olim: 0.3, traditional: 0.2 }, namePool: { jewish: 1, russian: 0.1 },
    blurb: 'מפלגת מרכז ליברלית. היו"ר בוחר את הרשימה בעצמו.',
  },
  {
    id: 'mamlachti', name: 'ממלכתיות', short: 'ממלכתיות', color: '#6366f1',
    ideology: { econ: 15, security: 55, religion: -10, judiciary: -25 }, seats: 10, primaries: false,
    sectors: { secular: 0.6, traditional: 0.4, olim: 0.2 }, namePool: { jewish: 1 },
    blurb: 'מרכז-ימין ביטחוניסטי. הרבה אלופים במיל׳.',
  },
  {
    id: 'brit', name: 'הברית הסוציאלית', short: 'הברית', color: '#dc2626',
    ideology: { econ: -55, security: -30, religion: -55, judiciary: -70 }, seats: 8, primaries: true,
    sectors: { secular: 1 }, namePool: { jewish: 1 },
    blurb: 'שמאל-מרכז חברתי ותיק. פריימריז פתוחים.',
  },
  {
    id: 'yahadut', name: 'יהדות המסורת', short: 'יהדות', color: '#b8860b',
    ideology: { econ: -25, security: 20, religion: 95, judiciary: 65 }, seats: 7, primaries: false,
    sectors: { haredi: 1 }, namePool: { haredi: 1 }, incompatible: ['oz', 'smol'],
    blurb: 'מפלגה חרדית. הרשימה נקבעת במועצת חכמי התורה.',
  },
  {
    id: 'shomrim', name: 'שומרי המסורת', short: 'שומרים', color: '#0d9488',
    ideology: { econ: -45, security: 35, religion: 80, judiciary: 55 }, seats: 11, primaries: false,
    sectors: { haredi: 0.6, traditional: 0.7 }, namePool: { haredi: 0.6, jewish: 0.4 }, incompatible: ['oz', 'smol'],
    blurb: 'מפלגה חרדית-מסורתית עם אג׳נדה חברתית.',
  },
  {
    id: 'emuna', name: 'אמונה ומולדת', short: 'אמונה', color: '#ea580c',
    ideology: { econ: 30, security: 90, religion: 70, judiciary: 85 }, seats: 10, primaries: true,
    sectors: { religious: 1, traditional: 0.2 }, namePool: { religious: 1 }, incompatible: ['shivyon', 'tzedek', 'smol'],
    blurb: 'ימין דתי-לאומי אידיאולוגי.',
  },
  {
    id: 'oz', name: 'עוז אזרחי', short: 'עוז', color: '#7c3aed',
    ideology: { econ: 40, security: 65, religion: -75, judiciary: 10 }, seats: 6, primaries: false,
    sectors: { olim: 1, secular: 0.3 }, namePool: { russian: 0.6, jewish: 0.4 }, incompatible: ['yahadut', 'shomrim'],
    blurb: 'ימין חילוני. בעד גיוס חרדים ונישואים אזרחיים.',
  },
  {
    id: 'smol', name: 'שמאל ירוק', short: 'ירוק', color: '#16a34a',
    ideology: { econ: -60, security: -80, religion: -85, judiciary: -85 }, seats: 4, primaries: true,
    sectors: { secular: 0.5 }, namePool: { jewish: 0.85, arab: 0.15 }, incompatible: ['emuna', 'yahadut', 'shomrim'],
    blurb: 'שמאל אזרחי-סביבתי. מתנדנד סביב אחוז החסימה.',
  },
  {
    id: 'shivyon', name: 'ברית השוויון', short: 'שוויון', color: '#db2777',
    ideology: { econ: -55, security: -90, religion: -35, judiciary: -70 }, seats: 5, primaries: true,
    sectors: { arab: 1 }, namePool: { arab: 0.85, jewish: 0.15 }, incompatible: ['emuna'],
    blurb: 'רשימה ערבית-יהודית לאומית-חילונית.',
  },
  {
    id: 'tzedek', name: 'הרשימה הערבית לצדק', short: 'צדק', color: '#65a30d',
    ideology: { econ: -25, security: -65, religion: 45, judiciary: -30 }, seats: 5, primaries: false,
    sectors: { arab: 0.9 }, namePool: { arab: 0.9, druze: 0.1 }, incompatible: ['emuna'],
    blurb: 'רשימה ערבית שמרנית-פרגמטית שמוכנה לשקול שותפות.',
  },
];

// הסכמי עודפים פותחים
export const SURPLUS_PAIRS: [string, string][] = [
  ['tikva', 'emuna'],
  ['merkaz', 'mamlachti'],
  ['yahadut', 'shomrim'],
  ['brit', 'smol'],
  ['shivyon', 'tzedek'],
];

export const INITIAL_COALITION = ['tikva', 'shomrim', 'yahadut', 'emuna', 'oz'];
