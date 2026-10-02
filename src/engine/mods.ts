// מצב "כנסת אמיתית": טעינת הרכב מפלגות וח"כים מקובץ JSON שהשחקן מספק.
import type { PartyDef } from './data/parties';
import type { Ideology, Sector } from './types';
import { AXES, SECTORS } from './util';

export interface ModParty {
  id: string;
  name: string;
  short?: string;
  color: string;
  ideology: Ideology;
  seats: number;
  primaries?: boolean;
  sectors?: Partial<Record<Sector, number>>;
  members?: string[]; // שמות לפי סדר הרשימה
  blurb?: string;
  surplusPartner?: string;
}

export interface ModFile {
  name: string;
  parties: ModParty[];
  coalition?: string[];
}

export function validateMod(raw: unknown): { mod: ModFile | null; errors: string[] } {
  const errors: string[] = [];
  const m = raw as ModFile;
  if (!m || typeof m !== 'object') return { mod: null, errors: ['הקובץ אינו JSON תקין'] };
  if (typeof m.name !== 'string' || !m.name.trim()) errors.push('חסר שדה name');
  if (!Array.isArray(m.parties) || m.parties.length < 2 || m.parties.length > 20) errors.push('parties חייב להיות מערך של 2–20 מפלגות');
  else {
    const ids = new Set<string>();
    let seats = 0;
    m.parties.forEach((p, i) => {
      const where = `מפלגה ${i + 1}`;
      if (!p || typeof p.id !== 'string' || !/^[a-z0-9_-]+$/i.test(p.id)) errors.push(`${where}: id חייב להיות באותיות לטיניות/ספרות`);
      else if (ids.has(p.id)) errors.push(`${where}: id כפול (${p.id})`);
      else ids.add(p.id);
      if (typeof p.name !== 'string' || !p.name.trim()) errors.push(`${where}: חסר name`);
      if (typeof p.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(p.color)) errors.push(`${where}: color צריך להיות בפורמט #RRGGBB`);
      if (!Number.isInteger(p.seats) || p.seats < 0 || p.seats > 120) errors.push(`${where}: seats חייב להיות מספר שלם 0–120`);
      else seats += p.seats;
      if (!p.ideology || AXES.some((a) => typeof p.ideology[a] !== 'number' || Math.abs(p.ideology[a]) > 100)) errors.push(`${where}: ideology צריך econ/security/religion/judiciary בין -100 ל-100`);
      if (p.members !== undefined && (!Array.isArray(p.members) || p.members.some((x) => typeof x !== 'string'))) errors.push(`${where}: members חייב להיות רשימת שמות`);
      if (p.sectors && Object.keys(p.sectors).some((k) => !SECTORS.includes(k as Sector))) errors.push(`${where}: מגזר לא מוכר ב-sectors`);
    });
    if (seats !== 120) errors.push(`סך המושבים צריך להיות 120 (נמצא ${seats})`);
    if (m.coalition && (!Array.isArray(m.coalition) || m.coalition.some((c) => !ids.has(c)))) errors.push('coalition מכיל מזהה מפלגה לא קיים');
  }
  return { mod: errors.length ? null : m, errors };
}

export function modToPartyDefs(mod: ModFile): PartyDef[] {
  return mod.parties.map((p) => ({
    id: p.id,
    name: p.name,
    short: p.short ?? p.name.split(' ')[0],
    color: p.color,
    ideology: p.ideology,
    seats: p.seats,
    primaries: !!p.primaries,
    sectors: p.sectors ?? {},
    namePool: { jewish: 1 },
    blurb: p.blurb ?? 'נטען מקובץ הכנסת.',
  }));
}

export function modSurplusPairs(mod: ModFile): [string, string][] {
  const out: [string, string][] = [];
  for (const p of mod.parties) if (p.surplusPartner && mod.parties.some((q) => q.id === p.surplusPartner) && !out.some(([a, b]) => b === p.id && a === p.surplusPartner)) out.push([p.id, p.surplusPartner]);
  return out;
}
