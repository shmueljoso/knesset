import { useEffect, useMemo, useState } from 'react';
import { loadSaved, useStore } from '../store';
import { dateLabel } from '../engine/calendar';
import { saves } from '../platform';
import type { SaveMeta } from '../saves';
import { IsoSkyline } from './MapView';
import { SavesSheet } from './Saves';

export function TitleScreen() {
  const setScreen = useStore((s) => s.setScreen);
  const continueGame = useStore((s) => s.continueGame);
  const loadGame = useStore((s) => s.loadGame);
  const setPendingMod = useStore((s) => s.setPendingMod);
  const toast = useStore((s) => s.toast);
  const saved = useMemo(() => loadSaved(), []);
  const [showSaves, setShowSaves] = useState(false);
  // השמירה הראשית אבדה (ניקוי נתוני דפדפן, שמירה פגומה)? מציעים לשחזר את הגיבוי האחרון
  const [backup, setBackup] = useState<SaveMeta | null>(null);
  useEffect(() => {
    if (!saved) void saves.latest().then(setBackup);
  }, [saved]);
  const restore = async () => {
    const g = backup ? await saves.load(backup.id) : null;
    if (g) loadGame(g);
    else toast('הגיבוי פגום – נסה/י שמירה אחרת', 'bad');
  };
  return (
    <div className="title-screen">
      <div style={{ position: 'absolute', inset: '0 0 40% 0', opacity: 0.9 }}>
        <IsoSkyline />
      </div>
      <div className="title-body" style={{ position: 'relative' }}>
        <div className="small gold" style={{ fontWeight: 700, letterSpacing: '0.08em' }}>סימולטור קריירה פוליטית</div>
        <h1>המשכן</h1>
        <p className="muted" style={{ margin: '6px 0 22px', maxWidth: 380 }}>
          מעוזר/ת פרלמנטרי/ת ועד ראשות הממשלה. ועדות, חקיקה, קואליציות, בגידות ובריתות – כל החלטה משפיעה.
        </p>
        <div className="col">
          {saved && (
            <button className="btn primary block" onClick={() => continueGame()}>
              המשך משחק – {saved.player.name}, {dateLabel(saved)}
            </button>
          )}
          {!saved && backup && (
            <button className="btn primary block" onClick={() => void restore()} data-testid="restore-latest">
              ♻️ שחזור הגיבוי האחרון – {backup.player}, {backup.date}
            </button>
          )}
          <button className={`btn block ${saved || backup ? '' : 'primary'}`} onClick={() => { setPendingMod(null); setScreen('create'); }}>
            משחק חדש
          </button>
          <button className="btn block ghost" onClick={() => setShowSaves(true)} data-testid="title-saves">
            💾 שמירות וגיבויים
          </button>
          <button className="btn block ghost" onClick={() => { setPendingMod(null); setScreen('editor'); }}>
            🛠️ עורך כנסת – בנה/י הרכב משלך
          </button>
        </div>
        <p className="faint tiny" style={{ marginTop: 16, textAlign: 'center' }}>
          עולם בדיוני, או הכנסת האמיתית: 1949, 2022 ובחירות 2026. התהליכים – אמיתיים.
        </p>
      </div>
      {showSaves && <SavesSheet onClose={() => setShowSaves(false)} />}
    </div>
  );
}
