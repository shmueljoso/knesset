import { useEffect, useState } from 'react';
import { presidentLabel } from '../engine/systems/president';
import { useGame, useStore } from '../store';

const STEP = 4; // פתקים בכל "טיק"

/** ספירת הפתקים בבחירות לנשיאות: סבב אחרי סבב, עם שעון ומתח */
export function PresidentRace() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const race = g.presidentRace!;
  const [round, setRound] = useState(0);
  const [counted, setCounted] = useState(0);
  const r = race.rounds[round];
  const total = r.counts.reduce((a, b) => a + b, 0);
  const lastRound = round === race.rounds.length - 1;
  const roundDone = counted >= total;
  const done = lastRound && roundDone;
  useEffect(() => {
    if (!roundDone) {
      const left = total - counted;
      const id = setTimeout(() => setCounted((c) => Math.min(total, c + STEP)), left < 16 ? 260 : 90);
      return () => clearTimeout(id);
    }
    if (!lastRound) {
      const id = setTimeout(() => {
        setRound((x) => x + 1);
        setCounted(0);
      }, 2600);
      return () => clearTimeout(id);
    }
  }, [counted, roundDone, lastRound, total]);
  // חלוקת הפתקים שנספרו עד עכשיו – באופן יחסי לתוצאה הסופית של הסבב
  const shown = r.counts.map((c) => Math.round((c / Math.max(1, total)) * counted));
  const leader = shown.indexOf(Math.max(...shown));
  const need = round < 2 ? 61 : null;
  return (
    <div className="event-overlay" data-testid="president-race">
      <div className="event-card">
        <div className="tiny gold" style={{ fontWeight: 700 }}>🏛️ הבחירות לנשיאות המדינה · סבב {round + 1}</div>
        <div className="spread" style={{ alignItems: 'center', marginTop: 4 }}>
          <span className="chip gold">{need ? `דרושים ${need} קולות` : 'סבב אחרון – מספיק רוב'}</span>
          <span className={`vote-clock ${!roundDone && total - counted < 16 ? 'urgent' : ''}`}>🗳️ {counted}/{total}</span>
        </div>
        <div className="count-bar">
          <i style={{ width: `${(counted / Math.max(1, total)) * 100}%` }} />
        </div>
        {r.candidates.map((c, i) => (
          <div key={c} style={{ margin: '10px 0' }}>
            <div className="spread small" style={{ fontWeight: c === 'player' || c === race.playerVote ? 800 : 400 }}>
              <span>
                {presidentLabel(g, c)}
                {c === race.playerVote ? ' · הקול שלך' : ''}
              </span>
              <b className={!roundDone && i === leader ? 'beat' : ''}>{shown[i]}</b>
            </div>
            <div className="count-bar" style={{ height: 10, position: 'relative' }}>
              <i style={{ width: `${(shown[i] / 120) * 100}%`, background: i === leader ? 'linear-gradient(90deg, var(--gold), #f59e0b)' : '#64748b' }} />
              {need && <span style={{ position: 'absolute', top: -2, bottom: -2, insetInlineStart: `${(need / 120) * 100}%`, width: 2, background: '#f87171' }} />}
            </div>
          </div>
        ))}
        {roundDone && !lastRound && <p className="suspense">אף מועמד/ת לא הגיע/ה ל-61. שני המובילים עולים לסבב נוסף…</p>}
        {done && (
          <h2 style={{ textAlign: 'center' }} className="good">
            {presidentLabel(g, race.winner!)} – נשיא/ת המדינה!
          </h2>
        )}
        {!done && (
          <button
            className="btn block"
            onClick={() => {
              setRound(race.rounds.length - 1);
              setCounted(race.rounds[race.rounds.length - 1].counts.reduce((a, b) => a + b, 0));
            }}
          >
            ⏩ לתוצאה
          </button>
        )}
        {done && (
          <button className="btn primary block" onClick={() => act((s) => delete s.flags.showPresident)}>
            המשך
          </button>
        )}
      </div>
    </div>
  );
}
