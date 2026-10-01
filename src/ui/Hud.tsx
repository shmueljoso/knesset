import { avgApproval } from '../engine/util';
import { useGame, useStore } from '../store';
import { Avatar } from './Avatar';
import { careerTitle } from './labels';

export function Hud() {
  const g = useGame();
  const open = useStore((s) => s.open);
  const p = g.player;
  return (
    <header className="hud">
      <div className="hud-top">
        <button onClick={() => open({ kind: 'settings' })} aria-label="תפריט">
          <Avatar spec={p.avatar} size={42} ring="var(--gold)" />
        </button>
        <div className="grow">
          <div className="hud-name ellipsis">{p.name}</div>
          <div className="hud-role ellipsis">{careerTitle(g)}</div>
        </div>
        <div style={{ textAlign: 'end' }}>
          <div className="small" style={{ fontWeight: 700 }}>
            ₪{Math.round(p.money)}K
          </div>
          <div className="tiny muted">שבוע {g.week + 1}</div>
        </div>
        <button className="icon-btn" onClick={() => open({ kind: 'help' })} aria-label="עזרה">
          ?
        </button>
      </div>
      <div className="hud-stats">
        <div className="stat" title="נקודות זמן לשבוע">
          <b>{p.ap}</b>
          <div className="ap-pips">
            {Array.from({ length: p.apMax }, (_, i) => (
              <i key={i} className={`ap-pip ${i < p.ap ? '' : 'off'}`} />
            ))}
          </div>
        </div>
        <div className="stat">
          <b>{Math.round(p.fame)}</b>
          <span>מוכרות</span>
        </div>
        <div className="stat">
          <b>{Math.round(avgApproval(g))}</b>
          <span>תדמית</span>
        </div>
        <div className="stat">
          <b>{Math.round(p.reputation)}</b>
          <span>מוניטין</span>
        </div>
        <div className="stat">
          <b>{Math.round(p.capital)}</b>
          <span>הון פוליטי</span>
        </div>
      </div>
    </header>
  );
}

export function TabBar() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const g = useGame();
  const votable = g.bills.filter((b) => (b.sponsor === 'player' || b.sponsor === g.player.employerId) && ['preliminary', 'first', 'final'].includes(b.stage)).length;
  const freshNews = g.news.filter((n) => n.week >= g.week - 1 && n.aboutPlayer).length;
  const tabs = [
    { id: 'map', ico: '🗺️', label: 'מפה' },
    { id: 'dashboard', ico: '📊', label: 'לוח' },
    { id: 'people', ico: '👥', label: 'אנשים' },
    { id: 'laws', ico: '📜', label: 'חקיקה', badge: votable },
    { id: 'news', ico: '📰', label: 'חדשות', badge: freshNews },
  ] as const;
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
          <span className="ico">{t.ico}</span>
          {t.label}
          {'badge' in t && t.badge ? <span className="badge">{t.badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}
