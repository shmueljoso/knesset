export interface CommitteeDef {
  id: string;
  name: string;
  size: number;
  topics: string[];
  oppositionChair?: boolean;
}

export const COMMITTEE_DEFS: CommitteeDef[] = [
  { id: 'finance', name: 'ועדת הכספים', size: 17, topics: ['economy', 'housing', 'affordability'] },
  { id: 'constitution', name: 'ועדת החוקה, חוק ומשפט', size: 17, topics: ['judiciary', 'religion'] },
  { id: 'security', name: 'ועדת החוץ והביטחון', size: 17, topics: ['security'] },
  { id: 'economy', name: 'ועדת הכלכלה', size: 13, topics: ['affordability', 'transport', 'economy'] },
  { id: 'labor', name: 'ועדת העבודה והרווחה', size: 13, topics: ['welfare'] },
  { id: 'education', name: 'ועדת החינוך', size: 13, topics: ['education'] },
  { id: 'interior', name: 'ועדת הפנים והגנת הסביבה', size: 13, topics: ['housing', 'environment'] },
  { id: 'audit', name: 'הוועדה לביקורת המדינה', size: 11, topics: ['trust'], oppositionChair: true },
];
