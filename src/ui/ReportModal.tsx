import { dateLabel } from '../engine/calendar';
import { WORLD_NAMES, pollSeats } from '../engine/systems/opinion';
import type { WorldKey } from '../engine/types';
import { useGame, useStore } from '../store';
import { Delta } from './common';
import { Hemicycle } from './Charts';
import { g2 } from './labels';

export function ReportModal() {
  const g = useGame();
  const setShowReport = useStore((s) => s.setShowReport);
  const r = g.report;
  if (!r) return null;
  const rows: [string, number, number, number?][] = [
    ['מוכרות', r.before.fame, r.after.fame],
    ['תדמית', r.before.approval, r.after.approval, 1],
    ['מוניטין', r.before.reputation, r.after.reputation],
    ['מעמד במפלגה', r.before.partyStanding, r.after.partyStanding],
    ['הון פוליטי', r.before.capital, r.after.capital],
    ['כסף (אלפי ₪)', r.before.money, r.after.money],
  ];
  const worldChanges = (Object.keys(r.worldAfter) as WorldKey[])
    .map((k) => [k, r.worldAfter[k] - r.worldBefore[k]] as const)
    .filter(([, d]) => Math.abs(d) >= 0.4);
  const important = r.entries.filter((e) => e.kind !== 'action');
  const myNews = g.news.filter((n) => n.week === r.week && n.aboutPlayer).slice(0, 3);

  return (
    <div className="event-overlay">
      <div className="event-card">
        <div className="tiny gold" style={{ fontWeight: 700 }}>סיכום שבוע {r.week + 1}</div>
        <h2>{dateLabel(g)}</h2>
        <div className="kpi" style={{ marginTop: 12 }}>
          {rows.map(([label, a, b, d]) => (
            <div key={label}>
              <span>{label}</span>
              <b>{Math.round(b)}</b>
              <Delta v={b - a} digits={d ?? 0} />
            </div>
          ))}
        </div>
        {r.after.playerPartyPoll !== null && r.before.playerPartyPoll !== null && (
          <p className="small" style={{ margin: '10px 0 0' }}>
            המפלגה שלך בסקרים: <b>{pollSeats(r.after.playerPartyPoll)} מנדטים</b> ({r.after.playerPartyPoll.toFixed(1)}%){' '}
            <Delta v={r.after.playerPartyPoll - r.before.playerPartyPoll} digits={1} />
          </p>
        )}
        <p className="small" style={{ margin: '6px 0 0' }}>
          יציבות הקואליציה: <b>{Math.round(r.after.stability)}</b> <Delta v={r.after.stability - r.before.stability} />
        </p>

        {worldChanges.length > 0 && (
          <>
            <div className="section-label">מצב המדינה</div>
            <div className="chips">
              {worldChanges.map(([k, d]) => (
                <span key={k} className={`chip ${d > 0 ? 'good' : 'bad'}`}>
                  {WORLD_NAMES[k]} {d > 0 ? '▲' : '▼'}
                  {Math.abs(d).toFixed(1)}
                </span>
              ))}
            </div>
          </>
        )}
        {r.drivers && r.drivers.length > 0 && (
          <>
            <div className="section-label">למה זה קרה</div>
            {r.drivers.map((d, i) => (
              <p key={i} className="tiny muted" style={{ margin: '0 0 3px' }}>
                ↳ {d}
              </p>
            ))}
          </>
        )}
        {(important.length > 0 || myNews.length > 0) && (
          <>
            <div className="section-label">מה קרה</div>
            {important.slice(-6).map((e, i) => (
              <p key={i} className="small" style={{ margin: '0 0 6px' }}>
                {e.kind === 'vote' ? '🗳️' : e.kind === 'career' ? '⭐' : e.kind === 'event' ? '📌' : '•'} {e.text}
              </p>
            ))}
            {myNews.map((n) => (
              <p key={n.id} className="small" style={{ margin: '0 0 6px' }}>
                📰 <span className="gold">{n.outlet}:</span> {n.headline}
              </p>
            ))}
          </>
        )}
        {g.eventQueue.length > 0 && (
          <p className="small gold" style={{ marginTop: 12 }}>
            {g.eventQueue.length} {g.eventQueue.length === 1 ? 'אירוע מחכה' : 'אירועים מחכים'} {g2(g, 'לך', 'לך')}.
          </p>
        )}
        <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => setShowReport(false)}>
          קדימה לשבוע {g.week + 1}
        </button>
      </div>
    </div>
  );
}

export function ElectionModal() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const e = g.lastElection;
  if (!e) return null;
  const total = Object.values(e.votes).reduce((a, b) => a + b, 0);
  const rows = Object.values(g.parties)
    .map((p) => ({ p, seats: e.seats[p.id] ?? 0, pct: ((e.votes[p.id] ?? 0) / total) * 100 }))
    .sort((a, b) => b.seats - a.seats || b.pct - a.pct);
  const pm = g.coalition.pmId === 'player' ? g.player.name : g.npcs[g.coalition.pmId]?.name;
  const open = useStore((s) => s.open);
  const close = () => {
    act((s) => delete s.flags.showElection);
    if (g.negotiation) open({ kind: 'negotiation' });
  };
  return (
    <div className="event-overlay">
      <div className="event-card">
        <div className="tiny gold" style={{ fontWeight: 700 }}>🗳️ ליל הבחירות</div>
        <h2>תוצאות הבחירות לכנסת ה-{e.knesset}</h2>
        <div style={{ margin: '12px 0' }}>
          <Hemicycle />
        </div>
        <table className="results">
          <tbody>
            {rows.map(({ p, seats, pct }) => (
              <tr key={p.id} style={{ opacity: seats ? 1 : 0.55, fontWeight: p.id === g.player.partyId ? 800 : 400 }}>
                <td>
                  <span className="party-dot" style={{ background: p.color, marginInlineEnd: 6 }} />
                  {p.name}
                </td>
                <td className="muted small">{pct.toFixed(2)}%</td>
                <td style={{ textAlign: 'end' }}>
                  <b>{seats || 'מתחת לחסימה'}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="card" style={{ marginTop: 14, textAlign: 'center' }}>
          {e.playerElected ? (
            <>
              <div style={{ fontSize: 36 }}>🎉</div>
              <h3>{g2(g, 'נבחרת לכנסת!', 'נבחרת לכנסת!')}</h3>
              <p className="small muted">{e.playerPosition ? `מהמקום ה-${e.playerPosition} ברשימה.` : ''} ברוך הבא לבניין.</p>
            </>
          ) : e.playerPosition ? (
            <>
              <div style={{ fontSize: 36 }}>😔</div>
              <h3>לא הפעם</h3>
              <p className="small muted">המקום ה-{e.playerPosition} לא היה ריאלי. ממשיכים לבנות לקראת הפעם הבאה.</p>
            </>
          ) : (
            <p className="small muted">לא התמודדת בבחירות האלה.</p>
          )}
        </div>
        {pm && !g.negotiation && (
          <p className="small" style={{ marginTop: 10 }}>
            הממשלה החדשה: <b>{pm}</b> עם {g.coalition.parties.map((c) => g.parties[c].short).join(', ')}.
          </p>
        )}
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={close}>
          {g.negotiation ? 'למשא ומתן הקואליציוני ←' : 'המשך'}
        </button>
      </div>
    </div>
  );
}
