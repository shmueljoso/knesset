import { outletName } from '../engine/systems/media';
import { dateLabel } from '../engine/calendar';
import { WORLD_NAMES, pollSeats } from '../engine/systems/opinion';
import { useEffect, useState } from 'react';
import { allocateSeats } from '../engine/systems/elections';
import { pmRaceLabel } from '../engine/systems/regime';
import type { GameState, WorldKey } from '../engine/types';
import { useGame, useStore } from '../store';
import { Delta } from './common';
import { Hemicycle } from './Charts';
import { g2 } from './labels';
import { haptic, keepAwake } from '../platform';
import { play } from '../sound';
import { ShareButton } from './ShareButton';

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
                📰 <span className="gold">{outletName(g, n.outlet)}{n.byline ? ` · ${n.byline}` : ''}:</span> {n.headline}
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

const COUNT_PHASES = [
  { time: '22:00', label: 'המדגם של ערוץ המשכן', noise: 0.14 },
  { time: '23:40', label: 'נספרו 30% מהקולות', noise: 0.08 },
  { time: '01:30', label: 'נספרו 65% מהקולות', noise: 0.04 },
  { time: '04:15', label: 'נספרו 92% מהקולות', noise: 0.015 },
  { time: '09:00', label: 'תוצאות סופיות, כולל המעטפות הכפולות', noise: 0 },
];

/** רעש קבוע לכל מפלגה ושלב, כדי שהספירה תיראה אמינה ולא תקפוץ בכל רינדור */
function noise(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 2001) / 1000 - 1;
}

function seatsAt(g: GameState, phase: number): Record<string, number> {
  const e = g.lastElection!;
  if (phase >= COUNT_PHASES.length - 1) return e.seats;
  const k = COUNT_PHASES[phase].noise;
  const votes = Object.fromEntries(Object.entries(e.votes).map(([id, v]) => [id, v * (1 + noise(id + phase) * k)]));
  const surplus = Object.fromEntries(Object.values(g.parties).map((p) => [p.id, p.surplusPartner]));
  return allocateSeats(votes, surplus, 120, (g.rules?.threshold ?? 3.25) / 100);
}

/** המרוץ הישיר לראשות הממשלה: אחוזים שמתייצבים עם הספירה, וסיבוב שני אם צריך */
function PmRaceCard({ phase }: { phase: number }) {
  const g = useGame();
  const race = g.lastElection?.pmRace;
  if (!race) return null;
  const final = phase >= COUNT_PHASES.length - 1;
  const shown = final ? race.rounds : race.rounds.slice(0, 1);
  return (
    <div className="card" style={{ margin: '10px 0' }} data-testid="pm-race">
      <div className="card-title">
        <h3>🗳️ הבחירה הישירה לראשות הממשלה</h3>
      </div>
      {shown.map((r, ri) => {
        const pct = final ? r.pct : r.pct.map((x, i) => x * (1 + noise(r.candidates[i] + 'pm' + phase) * COUNT_PHASES[phase].noise));
        const sum = pct.reduce((a, b) => a + b, 0) || 1;
        const norm = pct.map((x) => (x / sum) * 100);
        const lead = norm.indexOf(Math.max(...norm));
        return (
          <div key={ri} style={{ marginBottom: 8 }}>
            {race.rounds.length > 1 && <div className="tiny gold">{ri === 0 ? 'סיבוב ראשון' : 'סיבוב שני'}</div>}
            {r.candidates.map((c, i) => {
              const party = g.parties[race.parties[c]];
              return (
                <div key={c} style={{ margin: '6px 0' }}>
                  <div className="spread small" style={{ fontWeight: c === 'player' ? 800 : 400 }}>
                    <span>
                      {pmRaceLabel(g, c)} <span className="tiny muted">({party?.short ?? '?'})</span>
                    </span>
                    <b className={!final && i === lead ? 'beat' : ''}>{norm[i].toFixed(1)}%</b>
                  </div>
                  <div className="count-bar" style={{ height: 10, position: 'relative' }}>
                    <i style={{ width: `${norm[i]}%`, background: party?.color ?? '#64748b' }} />
                    <span style={{ position: 'absolute', top: -2, bottom: -2, insetInlineStart: '50%', width: 2, background: '#f87171' }} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      {!final && race.rounds.length > 1 && <p className="suspense tiny">אף מועמד/ת עוד לא חצה/תה את ה-50%…</p>}
      {final && (
        <p className="small" style={{ margin: '6px 0 0' }}>
          <b className={race.winner === 'player' ? 'good' : ''}>{pmRaceLabel(g, race.winner)}</b> {race.winner === 'player' ? 'נבחרת לראשות הממשלה!' : 'נבחר/ה לראשות הממשלה'} ומרכיב/ה את הממשלה
          {g.parties[race.parties[race.winner]] && Object.values(g.parties).some((p) => p.seats > g.parties[race.parties[race.winner]].seats) ? ' – למרות שהמפלגה שלו/ה לא הגדולה.' : '.'}
          {g.rules.presidential ? ' בשיטה הנשיאותית לא צריך 61.' : ''}
        </p>
      )}
    </div>
  );
}

export function ElectionModal() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const open = useStore((s) => s.open);
  const [phase, setPhase] = useState(-1);
  const [countdown, setCountdown] = useState(5);
  useEffect(() => {
    keepAwake(true);
    return () => keepAwake(false);
  }, []);
  // צלילים ורטט: תקתוק בספירה לאחור, צליל בכל עדכון, ובסוף – לפי מה שקרה לך
  useEffect(() => {
    if (phase === -1) {
      play('tick');
      return;
    }
    if (phase < COUNT_PHASES.length - 1) {
      play(phase === 0 ? 'bell' : 'chime');
      haptic('tap');
      return;
    }
    const e = g.lastElection;
    play(e?.playerElected ? 'win' : e?.playerPosition ? 'lose' : 'chime');
    haptic(e?.playerPosition && !e.playerElected ? 'bad' : 'good');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdown]);
  useEffect(() => {
    if (phase >= COUNT_PHASES.length - 1) return;
    if (phase === -1) {
      const id = setTimeout(() => (countdown > 1 ? setCountdown((c) => c - 1) : setPhase(0)), 900);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setPhase((x) => x + 1), phase === 0 ? 5000 : 4200);
    return () => clearTimeout(id);
  }, [phase, countdown]);
  const e = g.lastElection;
  if (!e) return null;
  if (phase === -1) {
    return (
      <div className="event-overlay">
        <div className="event-card" style={{ textAlign: 'center' }}>
          <div className="tiny gold" style={{ fontWeight: 700 }}>🗳️ ליל הבחירות לכנסת ה-{e.knesset}</div>
          <p className="muted" style={{ margin: '16px 0 4px' }}>21:59 · הקלפיות נסגרות. כל המפלגות מחזיקות את הנשימה.</p>
          <div className="beat" style={{ fontSize: 72, fontWeight: 900, color: 'var(--gold)' }} data-testid="exit-countdown">
            {countdown}
          </div>
          <p className="suspense">המדגם בעוד רגע…</p>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setPhase(COUNT_PHASES.length - 1)}>
            ⏩ לתוצאות הסופיות
          </button>
        </div>
      </div>
    );
  }
  const thr = g.rules?.threshold ?? 3.25;
  const total = Object.values(e.votes).reduce((a, b) => a + b, 0);
  const last = COUNT_PHASES.length - 1;
  const final = phase >= last;
  const prevSeats = phase > 0 ? seatsAt(g, phase - 1) : null;
  const curSeats = seatsAt(g, phase);
  const rows = Object.values(g.parties)
    .map((p) => ({ p, seats: curSeats[p.id] ?? 0, pct: ((e.votes[p.id] ?? 0) / total) * 100 * (1 + noise(p.id + phase) * COUNT_PHASES[phase].noise), prev: prevSeats?.[p.id] }))
    .sort((a, b) => b.seats - a.seats || b.pct - a.pct);
  const pm = g.coalition.pmId === 'player' ? g.player.name : g.npcs[g.coalition.pmId]?.name;
  const close = () => {
    act((s) => delete s.flags.showElection);
    if (g.negotiation) open({ kind: 'negotiation' });
  };
  return (
    <div className="event-overlay">
      <div className="event-card">
        <div className="tiny gold" style={{ fontWeight: 700 }}>🗳️ ליל הבחירות</div>
        <h2>{final ? `תוצאות הבחירות לכנסת ה-${e.knesset}` : `ליל הבחירות לכנסת ה-${e.knesset}`}</h2>
        <div className="spread" style={{ alignItems: 'center' }}>
          <div className={`chip ${final ? 'good' : 'gold'}`} data-testid="count-phase">{COUNT_PHASES[phase].label}</div>
          <span className={`vote-clock ${!final ? '' : ''}`}>🕙 {COUNT_PHASES[phase].time}</span>
        </div>
        <div className="count-bar">
          <i style={{ width: `${[8, 30, 65, 92, 100][phase]}%` }} />
        </div>
        {!final && <p className="suspense" style={{ margin: '4px 0' }}>{phase === 0 ? 'זה רק מדגם – הכל עוד יכול להשתנות' : 'הספירה נמשכת…'}</p>}
        {final && (
          <div style={{ margin: '12px 0' }}>
            <Hemicycle />
          </div>
        )}
        <PmRaceCard phase={phase} />
        {!final && (
          <button className="btn sm" style={{ margin: '8px 0' }} onClick={() => setPhase(COUNT_PHASES.length - 1)}>
            ⏩ לתוצאות הסופיות
          </button>
        )}
        <table className="results">
          <tbody>
            {rows.map(({ p, seats, pct, prev }) => (
              <tr key={p.id} className={!final && Math.abs(pct - thr) < 0.7 ? 'flash-row' : ''} style={{ opacity: seats ? 1 : 0.55, fontWeight: p.id === g.player.partyId ? 800 : 400 }}>
                <td>
                  <span className="party-dot" style={{ background: p.color, marginInlineEnd: 6 }} />
                  {p.name}
                </td>
                <td className="muted small">{pct.toFixed(2)}%</td>
                <td style={{ textAlign: 'end' }}>
                  {prev !== undefined && prev !== seats && <span className={seats > prev ? 'good' : 'bad'} style={{ marginInlineEnd: 4 }}>{seats > prev ? '▲' : '▼'}</span>}
                  <b>{seats || (pct > 2 && !final ? 'על הסף…' : 'מתחת לחסימה')}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {final && <div className="card" style={{ marginTop: 14, textAlign: 'center' }}>
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
        </div>}
        {final && pm && !g.negotiation && (
          <p className="small" style={{ marginTop: 10 }}>
            הממשלה החדשה: <b>{pm}</b> עם {g.coalition.parties.map((c) => g.parties[c].short).join(', ')}.
          </p>
        )}
        {final && (
          <div style={{ marginTop: 10 }}>
            <ShareButton g={g} kind="election" />
          </div>
        )}
        <button className="btn primary block" style={{ marginTop: 12 }} disabled={!final} onClick={close}>
          {!final ? 'סופרים קולות…' : g.negotiation ? 'למשא ומתן הקואליציוני ←' : 'המשך'}
        </button>
      </div>
    </div>
  );
}
