import { ally, nemesis } from '../engine/systems/rivals';
import { shortDateLabel } from '../engine/calendar';
import { useGame, useStore } from '../store';
import { Avatar } from './Avatar';
import { Sheet } from './common';

/** היריב/ה ובעל/ת הברית */
export function RivalsCard() {
  const g = useGame();
  const open = useStore((s) => s.open);
  const nm = nemesis(g);
  const al = ally(g);
  return (
    <div className="card" data-testid="rivals-card">
      <div className="card-title">
        <h3>⚔️ יריבים ובעלי ברית</h3>
        <button className="btn sm ghost" onClick={() => open({ kind: 'moments' })} data-testid="open-moments">
          ✨ הרגעים שלי
        </button>
      </div>
      {!nm && !al && <p className="small muted" style={{ margin: 0 }}>עוד אין לך יריב/ה מר/ה או בעל/ת ברית קרוב/ה. יחסים של ‎-35 או ‎+45 יוצרים סיפור.</p>}
      {[
        [nm, '⚔️ היריב/ה', 'bad', g.rivals?.nemesisSince],
        [al, '🤝 בעל/ת הברית', 'good', g.rivals?.allySince],
      ].map(([n, label, tone, since]) =>
        n && typeof n === 'object' ? (
          <button key={String(label)} className="list-item" onClick={() => open({ kind: 'npc', id: n.id })}>
            <Avatar spec={n.avatar} size={36} ring={n.partyId ? g.parties[n.partyId]?.color : '#64748b'} />
            <div className="grow">
              <div className="tiny muted">{String(label)}</div>
              <b className="small">{n.name}</b>
            </div>
            <span className={`tiny ${String(tone)}`}>
              יחס {n.attitude > 0 ? '+' : ''}
              {n.attitude}
              {typeof since === 'number' ? ` · מאז ${shortDateLabel(g, since)}` : ''}
            </span>
          </button>
        ) : null,
      )}
      <p className="tiny faint" style={{ margin: '8px 0 0' }}>🎙️ עימות טלוויזיוני – באולפן. 🎯 ציד קולות להצעה שלך – בחדרי הסיעות.</p>
    </div>
  );
}

/** גלריית הרגעים: נקודות השיא של הקריירה, ועונות */
export function MomentsSheet() {
  const g = useGame();
  const moments = [...(g.moments ?? [])].reverse();
  return (
    <Sheet title="✨ הרגעים שלי" sub="נקודות השיא (והשפל) של הקריירה">
      {g.seasonLog.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 0 }}>
            העונות
          </div>
          <div className="chips">
            {g.seasonLog.map((r) => (
              <span key={r.n} className={`chip ${r.grade === 'A' ? 'good' : r.grade === 'D' ? 'bad' : ''}`}>
                עונה {r.n}: {r.grade} ({r.done}/{r.total})
              </span>
            ))}
          </div>
        </>
      )}
      <div className="section-label">ציר הזמן</div>
      {moments.length === 0 && <p className="small muted">עוד לא נכתבה ההיסטוריה. היא תיכתב.</p>}
      <div className="timeline" data-testid="moments">
        {moments.map((m, i) => (
          <div key={i} className="moment">
            <span className="moment-ico">{m.icon}</span>
            <div className="grow">
              <div className="small">{m.text}</div>
              <div className="tiny faint">{shortDateLabel(g, m.week)}</div>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
