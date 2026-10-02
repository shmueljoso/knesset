import { templateById } from '../engine/data/bills';
import { ENDINGS, computeLegacy } from '../engine/systems/legacy';
import { clearSaved, useGame, useStore } from '../store';
import { Avatar } from './Avatar';

export function LegacyModal() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const setScreen = useStore((s) => s.setScreen);
  const end = ENDINGS[g.gameOver ?? 'retired'] ?? ENDINGS.retired;
  const L = computeLegacy(g);
  const keepPlaying = () =>
    act((s) => {
      s.flags.endSeen = s.gameOver ?? '';
      s.gameOver = null;
    });
  const newCareer = () => {
    clearSaved();
    setScreen('create');
  };
  return (
    <div className="event-overlay">
      <div className="event-card">
        <div className="row" style={{ marginBottom: 10 }}>
          <Avatar spec={g.player.avatar} size={64} ring="var(--gold)" />
          <div className="grow">
            <div className="tiny gold" style={{ fontWeight: 700 }}>
              🏁 {end.title}
            </div>
            <h2>{g.player.name}</h2>
            <div className="small muted">{end.text}</div>
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="tiny muted">המורשת שלך</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--gold)' }}>{L.title}</div>
          <div className="small">ציון: {L.score}</div>
          {L.tags.length > 0 && (
            <div className="chips" style={{ justifyContent: 'center', marginTop: 8 }}>
              {L.tags.map((t) => (
                <span key={t} className="chip gold">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="section-label">תפקידים</div>
        <div className="small">{L.roles.length ? L.roles.join(' · ') : 'לא הגעת לכנסת.'}</div>
        <div className="section-label">החוקים שלך ({L.laws.length})</div>
        {L.laws.length === 0 && <div className="small muted">לא העברת חוקים.</div>}
        {L.laws.map((l, i) => (
          <div key={i} className="small">
            {templateById(l.templateId).icon} {l.title}
          </div>
        ))}
        {L.coLaws.length > 0 && <div className="small muted" style={{ marginTop: 4 }}>ועוד {L.coLaws.length} חוקים שהיית שותף/ה להם.</div>}
        <div className="section-label">המדינה והאנשים</div>
        <div className="small">
          מצב המדינה מאז שהתחלת: <b className={L.worldDelta >= 0 ? 'good' : 'bad'}>{L.worldDelta >= 0 ? '+' : ''}{L.worldDelta.toFixed(1)}</b> · בעלי ברית: {L.allies} · אויבים: {L.enemies} · שיא מנדטים למפלגה: {g.career.peakSeats}
        </div>
        <div className="col" style={{ marginTop: 16 }}>
          {end.canContinue && (
            <button className="btn primary" onClick={keepPlaying}>
              להמשיך לשחק
            </button>
          )}
          <button className={`btn ${end.canContinue ? '' : 'primary'}`} onClick={newCareer}>
            קריירה חדשה
          </button>
        </div>
      </div>
    </div>
  );
}
