// רכיבים גרפיים "חיים": לוח ההצבעה האלקטרוני של המליאה, אולפן ליל הבחירות, עמוד ראשון של עיתון
// לסיכום השבוע, ורקע אולם המליאה. רק תצוגה.
import type { ReactNode } from 'react';
import type { GameState } from '../engine/types';
import { Avatar } from './Avatar';

/** ספרות לד של לוח ההצבעה */
function Led({ v, tone, label, testId, beat }: { v: number; tone: 'for' | 'against' | 'abstain'; label: string; testId?: string; beat?: boolean }) {
  return (
    <div className={`led-cell ${tone}`}>
      <span className="led-label">{label}</span>
      <b className={`led ${beat ? 'beat' : ''}`} data-testid={testId} key={v}>
        {String(v).padStart(3, '0').replace(/^0+(?=\d)/, (m) => ' '.repeat(m.length))}
      </b>
    </div>
  );
}

/** לוח ההצבעה האלקטרוני של הכנסת */
export function VoteBoard({ title, forN, against, abstain, absent, open, need, beat, knesset }: { knesset: number; title: string; forN: number; against: number; abstain: number; absent: number; open: boolean; need?: string; beat?: boolean }) {
  return (
    <div className="voteboard" data-testid="vote-board">
      <div className="vb-top">
        <span className={`vb-lamp ${open ? 'open' : 'closed'}`} />
        <span className="vb-status">{open ? 'ההצבעה פתוחה' : 'ההצבעה ננעלה'}</span>
        <span className="vb-marquee">
          <span>{title}{need ? ` · ${need}` : ''}</span>
        </span>
      </div>
      <div className="vb-digits">
        <Led v={forN} tone="for" label="בעד" testId="live-for" beat={beat} />
        <Led v={against} tone="against" label="נגד" beat={beat} />
        <Led v={abstain} tone="abstain" label="נמנעים" />
      </div>
      <div className="vb-foot">נעדרים: {absent} · מליאת הכנסת ה-{knesset}</div>
    </div>
  );
}

/** אולם המליאה: רקע עץ, דוכן היו"ר וסמל המדינה מאחורי חצי המעגל */
export function Chamber({ children }: { children: ReactNode }) {
  return (
    <div className="chamber">
      <div className="ch-wall" />
      <div className="ch-arc" />
      <div className="ch-seats">{children}</div>
      <div className="ch-podium">
        <span>🕎</span>
      </div>
    </div>
  );
}

/** אולפן ליל הבחירות: מסך מדגם עם עמודות שגדלות, שעון ופס חדשות */
export function ElectionStudio({ g, rows, phaseLabel, time, countdown }: { g: GameState; rows: { id: string; short: string; color: string; seats: number }[]; phaseLabel: string; time: string; countdown?: number }) {
  const top = rows.filter((r) => r.seats > 0).slice(0, 8);
  const max = Math.max(30, ...top.map((r) => r.seats));
  return (
    <div className="scene sc-studio estudio" data-testid="election-studio">
      <div className="sc-beam a" />
      <div className="sc-beam b" />
      <div className="sc-live">● שידור חי</div>
      <div className="es-clock">🕙 {time}</div>
      <div className="es-screen">
        {countdown !== undefined ? (
          <div className="es-count">
            <span>המדגם בעוד</span>
            <b key={countdown} className="beat" data-testid="exit-countdown">
              {countdown}
            </b>
          </div>
        ) : (
          <div className="es-bars">
            {top.map((r) => (
              <div key={r.id} className={`es-bar ${r.id === g.player.partyId ? 'mine' : ''}`}>
                <b>{r.seats}</b>
                <i style={{ height: `${(r.seats / max) * 100}%`, background: r.color }} />
                <span>{r.short}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="sc-lower">
        <b>{countdown !== undefined ? 'ליל הבחירות' : 'מדגם'}</b>
        <span className="sc-ticker">
          <span>{phaseLabel} · {top.slice(0, 4).map((r) => `${r.short} ${r.seats}`).join(' · ')}</span>
        </span>
      </div>
    </div>
  );
}

/** עמוד ראשון של עיתון לסיכום השבוע */
export function FrontPage({ g, date, headline, sub, items, photo }: { g: GameState; date: string; headline: string; sub?: string; items: { label: string; v: string; tone: 'good' | 'bad' | '' }[]; photo?: boolean }) {
  return (
    <div className="frontpage" data-testid="front-page">
      <div className="fp-mast">
        <span className="fp-ed">מהדורת שבוע</span>
        <b>המשכן היומי</b>
        <span className="fp-ed">{date}</span>
      </div>
      <div className="fp-rule" />
      <div className="fp-body">
        {photo && (
          <figure className="fp-photo">
            <Avatar spec={g.player.avatar} size={64} />
            <figcaption>{g.player.name}</figcaption>
          </figure>
        )}
        <div className="grow">
          <h2 className="fp-head">{headline}</h2>
          {sub && <p className="fp-sub">{sub}</p>}
        </div>
      </div>
      {items.length > 0 && (
        <div className="fp-cols">
          {items.map((x) => (
            <div key={x.label} className="fp-col">
              <span>{x.label}</span>
              <b className={x.tone}>{x.v}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
