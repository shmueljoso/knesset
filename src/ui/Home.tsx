import { performAction } from '../engine';
import { weekBrief, nextGoal, type Alert } from '../engine/systems/advisor';
import { SESSION_NAMES, sessionOf } from '../engine/calendar';
import { LOCATIONS } from '../engine/data/locations';
import { seatsEstimate } from '../engine/systems/districts';
import { pollSeats } from '../engine/systems/opinion';
import { avgApproval } from '../engine/util';
import { useGame, useStore, type Panel } from '../store';
import { Chips } from './common';
import { NextWeekButton } from './MapView';
import { careerTitle } from './labels';

/** מסך הבית: מה דחוף, מה כדאי לעשות השבוע ומה המצב – הכול בלחיצה אחת */
export function Home() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const open = useStore((s) => s.open);
  const toast = useStore((s) => s.toast);
  const setTab = useStore((s) => s.setTab);
  const { alerts, recs } = weekBrief(g);
  const p = g.player;
  const party = p.partyId ? g.parties[p.partyId] : null;
  const pres = !!g.presidency && g.president?.id === 'player';

  const run = (id: string) => {
    const res = act((s) => performAction(s, id));
    if (res.open === 'bills') setTab('laws');
    else if (res.open) open({ kind: res.open });
    else toast(res.text, res.good === false ? 'bad' : 'good', res.lines);
  };
  const go = (a: Alert) => {
    if (a.go?.panel) open({ kind: a.go.panel } as Panel);
    else if (a.go?.tab) setTab(a.go.tab);
  };

  return (
    <div className="scroll">
      <div className="page home" data-testid="home">
        <div className="card home-head">
          <div className="spread">
            <div>
              <div className="tiny muted">
                שבוע {g.week + 1} · {SESSION_NAMES[sessionOf(g)]}
              </div>
              <h3 style={{ marginTop: 2 }}>{careerTitle(g)}</h3>
            </div>
            <div className="tiny muted" style={{ textAlign: 'end' }}>
              {g.electionWeek > g.week && <div>🗳️ בחירות בעוד {g.electionWeek - g.week} שב׳</div>}
              {party && <div>{party.short}: {seatsEstimate(g, party.id, pollSeats)} מנדטים</div>}
            </div>
          </div>
          <p className="small" style={{ margin: '10px 0 0' }} data-testid="home-goal">
            🎯 <b>היעד:</b> {nextGoal(g)}
          </p>
        </div>

        {alerts.length > 0 && (
          <div className="card" data-testid="home-alerts">
            <div className="card-title">
              <h3>⚡ דחוף השבוע</h3>
            </div>
            {alerts.map((a) => (
              <button key={a.id} className={`list-item alert ${a.tone}`} onClick={() => go(a)} disabled={!a.go}>
                <span style={{ fontSize: 20 }}>{a.icon}</span>
                <span className="grow small">{a.text}</span>
                {a.go && <span className="tiny faint">←</span>}
              </button>
            ))}
          </div>
        )}

        {!pres && (
          <div className="card" data-testid="home-recs">
            <div className="card-title">
              <h3>✨ מומלץ השבוע</h3>
              <span className="tiny muted">⏳ {p.ap} זמן נותר</span>
            </div>
            {recs.length === 0 && <p className="small muted" style={{ margin: 0 }}>{p.ap > 0 ? 'אין כרגע המלצה – אפשר לחפש פעולות במפה.' : 'נגמר הזמן לשבוע הזה. אפשר לסיים את השבוע.'}</p>}
            {recs.map((r) => (
              <div key={r.id} className="rec" data-testid={`rec-${r.id}`}>
                <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 26 }}>{r.icon}</span>
                  <div className="grow">
                    <b>{r.label}</b>
                    <div className="tiny muted">
                      {r.why} · {r.where}
                    </div>
                    <Chips chips={[{ label: `⏳ ${r.ap}${r.money ? ` · ₪${r.money}K` : ''}${r.capital ? ` · 💎${r.capital}` : ''}`, tone: 'neutral' }, ...r.chips.slice(0, 3)]} />
                  </div>
                  <button className="btn sm primary" onClick={() => run(r.id)} data-testid={`do-${r.id}`}>
                    לעשות
                  </button>
                </div>
              </div>
            ))}
            <button className="btn sm ghost block" style={{ marginTop: 8 }} onClick={() => setTab('map')}>
              🗺️ כל הפעולות – במפה ({LOCATIONS[p.location]?.name ?? 'הכנסת'})
            </button>
          </div>
        )}

        <div className="card" data-testid="home-status">
          <div className="card-title">
            <h3>📋 המצב שלך</h3>
            <button className="btn sm ghost" onClick={() => setTab('dashboard')}>
              ללוח ←
            </button>
          </div>
          <div className="home-stats">
            <Stat v={Math.round(p.fame)} label="מוכרות" />
            <Stat v={Math.round(avgApproval(g))} label="תדמית" />
            <Stat v={Math.round(p.reputation)} label="מוניטין" />
            <Stat v={Math.round(p.capital)} label="הון פוליטי" />
            {party && <Stat v={Math.round(p.partyStanding)} label="מעמד במפלגה" />}
            <Stat v={`₪${Math.round(p.money)}K`} label="קופה" />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <NextWeekButton block />
        </div>
      </div>
    </div>
  );
}

function Stat({ v, label }: { v: number | string; label: string }) {
  return (
    <div className="hstat">
      <b>{v}</b>
      <span>{label}</span>
    </div>
  );
}
