import { useMemo } from 'react';
import { loadSaved, useStore } from '../store';
import { dateLabel } from '../engine/calendar';
import { IsoSkyline } from './MapView';

export function TitleScreen() {
  const setScreen = useStore((s) => s.setScreen);
  const continueGame = useStore((s) => s.continueGame);
  const setPendingMod = useStore((s) => s.setPendingMod);
  const saved = useMemo(() => loadSaved(), []);
  return (
    <div className="title-screen">
      <div style={{ position: 'absolute', inset: '0 0 40% 0', opacity: 0.9 }}>
        <IsoSkyline />
      </div>
      <div style={{ position: 'relative' }}>
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
          <button className={`btn block ${saved ? '' : 'primary'}`} onClick={() => { setPendingMod(null); setScreen('create'); }}>
            משחק חדש
          </button>
          <button className="btn block ghost" onClick={() => { setPendingMod(null); setScreen('editor'); }}>
            🛠️ עורך כנסת – בנה/י הרכב משלך
          </button>
        </div>
        <p className="faint tiny" style={{ marginTop: 16, textAlign: 'center' }}>
          עולם בדיוני, או הכנסת האמיתית: 1949, 2022 ובחירות 2026. התהליכים – אמיתיים.
        </p>
      </div>
    </div>
  );
}
