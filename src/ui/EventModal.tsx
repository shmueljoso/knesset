import { describeOps, fill } from '../engine/ops';
import { choiceBlocked, choiceOps, currentEvent, resolveEvent } from '../engine/systems/events';
import { useGame, useStore } from '../store';
import { Avatar } from './Avatar';
import { Chips } from './common';

export function EventModal() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const result = useStore((s) => s.eventResult);
  const setResult = useStore((s) => s.setEventResult);
  const cur = currentEvent(g);

  if (result) {
    return (
      <div className="event-overlay">
        <div className="event-card">
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="event-icon">{result.success ? '✅' : '⚠️'}</div>
            <h2 className="grow">{result.title}</h2>
          </div>
          {result.lines.length ? (
            result.lines.map((l, i) => (
              <p key={i} style={{ margin: '0 0 8px' }}>
                {l}
              </p>
            ))
          ) : (
            <p className="muted">ההחלטה התקבלה. ההשפעות יורגשו בהמשך.</p>
          )}
          <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => setResult(null)}>
            המשך
          </button>
        </div>
      </div>
    );
  }
  if (!cur) return null;
  const { ev, ctx } = cur;
  const npc = ctx.npc ? g.npcs[ctx.npc] : null;

  const choose = (i: number) => {
    const title = fill(g, ev.title, ctx);
    const r = act((s) => resolveEvent(s, i));
    // הצבעה חיה נפתחה – התוצאה תוצג שם
    if (!useStore.getState().game?.liveVote) setResult({ ...r, title });
  };

  return (
    <div className="event-overlay">
      <div className="event-card">
        <div className="row" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
          {npc ? <Avatar spec={npc.avatar} size={58} ring={npc.partyId ? g.parties[npc.partyId].color : '#64748b'} /> : <div className="event-icon">{ev.icon}</div>}
          <div className="grow">
            <div className="tiny gold" style={{ fontWeight: 700 }}>
              {ev.icon} אירוע
            </div>
            <h2>{fill(g, ev.title, ctx)}</h2>
          </div>
        </div>
        <p style={{ margin: '0 0 16px', lineHeight: 1.6 }}>{fill(g, ev.body, ctx)}</p>
        {ev.choices.map((c, i) => {
          const blocked = choiceBlocked(g, c, ctx);
          const chips = describeOps(g, choiceOps(g, c, ctx), ctx);
          return (
            <button key={i} className="choice" disabled={!!blocked} onClick={() => choose(i)}>
              <b>{fill(g, c.label, ctx)}</b>
              {(blocked || c.hint) && <span className="small muted">{blocked ?? c.hint}</span>}
              {c.chance && <span className="small warn">סיכון: יש סיכוי שזה ייכשל</span>}
              <Chips chips={chips} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
