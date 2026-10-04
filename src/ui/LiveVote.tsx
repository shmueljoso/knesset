import { useEffect, useMemo, useState } from 'react';
import { templateById } from '../engine/data/bills';
import { RESCUE_COST, STAGE_NAMES, finishVote, rescueInfo, rescueVote } from '../engine/systems/legislation';
import { useGame, useStore } from '../store';
import { Hemicycle, VOTE_NAMES } from './Charts';

const KIND_LABEL = { own: 'ההצעה שלך', other: 'הצבעה במליאה', budget: 'חוק התקציב – אם ייפול: בחירות' } as const;
const ICON = { for: '✅', against: '❌', abstain: '✋', absent: '🚪' } as const;

/** הצבעה חיה: הקולות נכנסים אחד אחד, ובסוף – אולי עוד אפשר להציל. */
export function LiveVoteModal() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const lv = g.liveVote!;
  const b = g.bills.find((x) => x.id === lv.billId);
  const total = lv.order.length;
  const [n, setN] = useState(0);
  const res = lv.result;
  const close = lv.majority ? Math.abs(res.for - lv.majority) <= 4 : Math.abs(res.for - res.against) <= 6;

  useEffect(() => {
    if (n >= total) return;
    const left = total - n;
    const delay = close && left <= 12 ? 320 : left <= 30 ? 90 : 35;
    const id = setTimeout(() => setN((x) => x + 1), delay);
    return () => clearTimeout(id);
  }, [n, total, close]);

  const shown = useMemo(() => new Set(lv.order.slice(0, n)), [lv.order, n]);
  const votes = res.seats.map((v, i) => (shown.has(i) ? v : null));
  const count = (k: 'for' | 'against' | 'abstain' | 'absent') => votes.filter((v) => v === k).length;
  const done = n >= total;
  const rescue = done ? rescueInfo(g) : null;
  const ticker = lv.order
    .slice(Math.max(0, n - 4), n)
    .reverse()
    .map((i) => {
      const id = g.seating[i];
      const name = id === 'player' ? `${g.player.name} (את/ה)` : g.npcs[id]?.name;
      const party = id === 'player' ? g.parties[g.player.partyId ?? '']?.short : g.parties[g.npcs[id]?.partyId ?? '']?.short;
      return { i, text: `${ICON[res.seats[i]]} ${name ?? ''}${party ? ` · ${party}` : ''}` };
    });
  const need = lv.majority ? `דרושים ${lv.majority} בעד` : 'רוב רגיל של המצביעים';
  const finish = () => {
    const r = act((s) => finishVote(s));
    if (r) toast(r.text, r.result.passed ? 'good' : 'bad');
  };

  return (
    <div className="event-overlay" data-testid="live-vote">
      <div className="event-card">
        <div className="tiny gold" style={{ fontWeight: 700 }}>
          🗳️ {KIND_LABEL[lv.kind]} · {STAGE_NAMES[res.stage]}
        </div>
        <h2 style={{ margin: '4px 0' }}>
          {b ? `${templateById(b.templateId).icon} ${b.title}` : 'הצבעה'}
        </h2>
        <div className="tiny muted">{need}{lv.playerVote ? ` · הצבעת: ${VOTE_NAMES[lv.playerVote]}` : ''}</div>
        <div style={{ margin: '10px 0 4px' }}>
          <Hemicycle votes={votes} highlight={lv.flipped} />
        </div>
        <div className="spread" style={{ fontSize: 28, fontWeight: 900 }}>
          <span className="good" data-testid="live-for">{count('for')}</span>
          <span className="tiny muted" style={{ alignSelf: 'center' }}>
            {done ? 'הספירה הסתיימה' : `נספרו ${n}/${total}`}
          </span>
          <span className="bad">{count('against')}</span>
        </div>
        <div className="spread tiny muted">
          <span>בעד</span>
          <span>נמנעים {count('abstain')} · נעדרים {count('absent')}</span>
          <span>נגד</span>
        </div>
        {lv.majority && (
          <div className="meter" style={{ marginTop: 6, height: 8, background: 'var(--line)', borderRadius: 99, position: 'relative' }}>
            <div style={{ width: `${(count('for') / 120) * 100}%`, height: '100%', background: '#4ade80', borderRadius: 99 }} />
            <div style={{ position: 'absolute', top: -3, bottom: -3, insetInlineStart: `${(lv.majority / 120) * 100}%`, width: 2, background: 'var(--gold)' }} />
          </div>
        )}
        <div className="small" style={{ minHeight: 76, marginTop: 8 }}>
          {!done && ticker.map((x, k) => (
            <div key={x.i} style={{ opacity: 1 - k * 0.22 }}>
              {x.text}
            </div>
          ))}
          {done && (
            <h2 style={{ textAlign: 'center', margin: '8px 0' }} className={res.passed ? 'good' : 'bad'}>
              {res.passed ? (lv.kind === 'budget' ? 'התקציב עבר!' : 'ההצעה התקבלה!') : lv.kind === 'budget' ? 'התקציב נפל!' : 'ההצעה נדחתה'}
            </h2>
          )}
          {done && lv.flipped.length > 0 && <p className="tiny gold" style={{ textAlign: 'center', margin: 0 }}>הבאת {lv.flipped.length} מהמזנון ברגע האחרון.</p>}
        </div>
        {!done && (
          <button className="btn block" onClick={() => setN(total)}>
            ⏩ לדלג לתוצאה
          </button>
        )}
        {rescue && (
          <div className="card small" style={{ marginTop: 8, background: 'var(--bg)' }}>
            <b>⏱️ הדלתות עוד לא ננעלו!</b>
            <div className="muted">
              חסרים {rescue.need} קולות. במזנון יש {rescue.candidates.length} ח"כים שנוטים לצד שלך ולא הצביעו. כל ניסיון: {RESCUE_COST} הון פוליטי (יש לך {g.player.capital}).
            </div>
            <button
              className="btn primary block"
              style={{ marginTop: 6 }}
              disabled={g.player.capital < RESCUE_COST}
              onClick={() => {
                const t = act((s) => rescueVote(s));
                toast(t, 'neutral');
              }}
            >
              🏃 לרוץ למזנון ולהביא אותם
            </button>
          </div>
        )}
        {done && (
          <button className="btn primary block" style={{ marginTop: 8 }} onClick={finish}>
            המשך
          </button>
        )}
      </div>
    </div>
  );
}
