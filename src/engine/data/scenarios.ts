// תרחישים מובנים מתוך תיקיית mods/ – זמינים לבחירה בלי להעלות קובץ.
import k1949 from '../../../mods/knesset-01-1949.json';
import k2022 from '../../../mods/knesset-25-2022.json';
import e2026 from '../../../mods/elections-2026.json';
import type { ModFile } from '../mods';

export interface ScenarioDef {
  id: string;
  icon: string;
  mod: ModFile;
}

export const SCENARIOS: ScenarioDef[] = [
  { id: 'elections-2026', icon: '🗳️', mod: e2026 as ModFile },
  { id: 'knesset-25-2022', icon: '🏛️', mod: k2022 as ModFile },
  { id: 'knesset-01-1949', icon: '📜', mod: k1949 as ModFile },
];
