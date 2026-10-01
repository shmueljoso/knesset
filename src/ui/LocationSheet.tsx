import { actionBlocked, actionsAt, performAction } from '../engine';
import { LOCATIONS } from '../engine/data/locations';
import { describeOps } from '../engine/ops';
import { attitudeColor } from '../engine/systems/relationships';
import type { LocationId } from '../engine/types';
import { useGame, useStore } from '../store';
import { Avatar } from './Avatar';
import { Chips, Sheet } from './common';

export function LocationSheet({ id }: { id: LocationId }) {
  const g = useGame();
  const act = useStore((s) => s.act);
  const open = useStore((s) => s.open);
  const toast = useStore((s) => s.toast);
  const setTab = useStore((s) => s.setTab);
  const loc = LOCATIONS[id];
  const people = (g.presence[id] ?? []).map((nid) => g.npcs[nid]).filter(Boolean);

  if (loc.locked) {
    return (
      <Sheet title={loc.name} icon={<span style={{ fontSize: 30 }}>{loc.icon}</span>} sub={loc.desc}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🔒</div>
          <p className="muted">{loc.locked}</p>
          <p className="small faint">המבנה מופיע במפה כדי שתדע לאן אתה שואף להגיע.</p>
        </div>
      </Sheet>
    );
  }

  const run = (aid: string) => {
    const res = act((s) => performAction(s, aid));
    if (res.open === 'bills') setTab('laws');
    else if (res.open) open({ kind: res.open });
    else toast(res.text, res.good === false ? 'bad' : 'good', res.lines);
  };

  return (
    <Sheet title={loc.name} icon={<span style={{ fontSize: 30 }}>{loc.icon}</span>} sub={loc.desc}>
      <div className="section-label" style={{ marginTop: 0 }}>
        נמצאים כאן השבוע ({people.length})
      </div>
      {people.length ? (
        <div className="people-row">
          {people.map((n) => (
            <button key={n.id} onClick={() => open({ kind: 'npc', id: n.id })} style={{ width: 66, flex: 'none', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Avatar spec={n.avatar} size={52} ring={n.partyId ? g.parties[n.partyId].color : '#64748b'} />
              </div>
              <div className="tiny ellipsis" style={{ marginTop: 3 }}>{n.name.split(' ')[0]}</div>
              <div className="tiny" style={{ color: attitudeColor(n.attitude) }}>
                {n.attitude > 0 ? '+' : ''}
                {n.attitude}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="small faint">אף אחד מעניין כאן כרגע.</p>
      )}

      <div className="section-label">מה עושים</div>
      {actionsAt(id).map((a) => {
        const blocked = actionBlocked(g, a);
        const chips = a.preview ? describeOps(g, a.preview(g)) : [];
        return (
          <button key={a.id} className="list-item action-item" disabled={!!blocked} onClick={() => run(a.id)}>
            <span className="a-ico">{a.icon}</span>
            <div className="grow">
              <div className="spread">
                <b>{a.label}</b>
                <span className="cost">
                  {a.ap ? `⏱${a.ap}` : ''}
                  {a.money ? ` ₪${a.money}K` : ''}
                </span>
              </div>
              <div className="small muted">{blocked ?? a.desc}</div>
              {!blocked && chips.length > 0 && (
                <div style={{ marginTop: 5 }}>
                  <Chips chips={chips} />
                </div>
              )}
            </div>
          </button>
        );
      })}
    </Sheet>
  );
}
