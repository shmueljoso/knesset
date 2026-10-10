// תרחישים מובנים מתוך תיקיית mods/ – זמינים לבחירה בלי להעלות קובץ.
import k1949 from '../../../mods/knesset-01-1949.json';
import k2022 from '../../../mods/knesset-25-2022.json';
import e2026 from '../../../mods/elections-2026.json';
import k1977 from '../../../mods/knesset-09-1977.json';
import k1992 from '../../../mods/knesset-13-1992.json';
import k1996 from '../../../mods/knesset-14-1996.json';
import k2019 from '../../../mods/knesset-21-2019.json';
import f2040 from '../../../mods/future-2040.json';
import type { ModFile } from '../mods';

export interface ScenarioDef {
  id: string;
  icon: string;
  mod: ModFile;
}

export const SCENARIOS: ScenarioDef[] = [
  { id: 'elections-2026', icon: '🗳️', mod: e2026 as ModFile },
  { id: 'knesset-25-2022', icon: '🏛️', mod: k2022 as ModFile },
  { id: 'knesset-21-2019', icon: '⚖️', mod: k2019 as ModFile },
  { id: 'knesset-14-1996', icon: '🗳️', mod: k1996 as ModFile },
  { id: 'knesset-13-1992', icon: '🕊️', mod: k1992 as ModFile },
  { id: 'knesset-09-1977', icon: '🔄', mod: k1977 as ModFile },
  { id: 'knesset-01-1949', icon: '📜', mod: k1949 as ModFile },
  { id: 'future-2040', icon: '🚀', mod: f2040 as ModFile },
];
