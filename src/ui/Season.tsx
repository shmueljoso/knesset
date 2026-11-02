import { GRADE_TEXT, SEASON_WEEKS, seasonProgress } from '../engine/systems/seasons';
import { useGame, useStore } from '../store';
import { Meter } from './common';

/** כרטיס העונה במסך הבית: היעדים וההתקדמות */
export function SeasonCard() {
  const g = useGame();
  const se = g.season;
  if (!se) return null;
  const left = Math.max(0, se.start + SEASON_WEEKS - g.week);
  return (
    <div className="card" data-testid="season-card">
      <div className="card-title">
        <h3>🏁 עונה {se.n}{se.n === 1 ? ' · עונת היכרות' : ''}</h3>
        <span className="tiny muted">עוד {left} שבועות</span>
      </div>
      {se.goals.map((goal, i) => (
        <div key={i} className={goal.done ? 'season-goal done' : 'season-goal'}>
          <Meter label={`${goal.done ? '✅ ' : ''}${goal.text}`} value={Math.round(seasonProgress(g, goal) * 100)} color={goal.done ? 'var(--good)' : 'var(--gold)'} suffix="%" />
        </div>
      ))}
      <p className="tiny faint" style={{ margin: '6px 0 0' }}>כל יעד: +4 הון פוליטי. כל היעדים בעונה: בונוס וציון A.</p>
    </div>
  );
}

/** סיכום עונה: ציון, מה הושג, ומה היעדים לעונה הבאה */
export function SeasonModal() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const r = g.seasonLog[g.seasonLog.length - 1];
  const close = () => act((s) => void delete s.flags.showSeason);
  if (!r) {
    close();
    return null;
  }
  return (
    <div className="event-overlay">
      <div className="event-card" data-testid="season-review">
        <div className="tiny gold" style={{ fontWeight: 700 }}>סיכום עונה {r.n}</div>
        <div className="row" style={{ gap: 14, alignItems: 'center', marginTop: 8 }}>
          <div className={`grade grade-${r.grade}`}>{r.grade}</div>
          <div>
            <h2 style={{ margin: 0 }}>{GRADE_TEXT[r.grade]}</h2>
            <div className="small muted">
              {r.done}/{r.total} יעדים · {r.laws} חוקים · מוכרות {r.fameDelta >= 0 ? '+' : ''}
              {r.fameDelta}
            </div>
          </div>
        </div>
        <div className="section-label">היעדים</div>
        {r.goals.map((x, i) => (
          <p key={i} className="small" style={{ margin: '0 0 4px' }}>
            {x.done ? '✅' : '❌'} {x.text}
          </p>
        ))}
        <div className="section-label">העונה הבאה – עונה {g.season.n}</div>
        {g.season.goals.map((x, i) => (
          <p key={i} className="small" style={{ margin: '0 0 4px' }}>
            🎯 {x.text}
          </p>
        ))}
        <button className="btn primary block" style={{ marginTop: 14 }} onClick={close}>
          לעונה {g.season.n} ←
        </button>
      </div>
    </div>
  );
}
