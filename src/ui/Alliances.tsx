import { useState } from 'react';
import { GUIDE, GUIDE_BASICS } from '../engine/data/guide';
import { ACTIONS } from '../engine/actions';
import { isCoalition } from '../engine/systems/government';
import { SHARE_NAMES, listsOpen, mergeBlocked, mergeForecast, playerLeads, proposeMerger, proposeSurplus, surplusBlocked, type MergeTerms, type Share } from '../engine/systems/mergers';
import { pollSeats } from '../engine/systems/opinion';
import { ideologyDistance } from '../engine/util';
import { useGame, useStore } from '../store';
import { Sheet } from './common';

export function AllianceSheet() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const close = useStore((s) => s.close);
  const [sel, setSel] = useState<string | null>(null);
  const [terms, setTerms] = useState<MergeTerms>({ lead: 'me', share: 'fair' });
  const [name, setName] = useState('');
  const me = playerLeads(g);
  const mine = g.player.partyId ? g.parties[g.player.partyId] : null;
  const thr = g.rules.threshold;
  const toClose = g.primariesWeek - g.week;

  const head = (
    <div className="card small">
      <b>איך זה עובד:</b>
      <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }} className="muted">
        <li>מפלגה מתחת ל-{thr}% לא נכנסת לכנסת, והקולות שלה הולכים לפח. ב-6 השבועות האחרונים מצביעים בורחים ממנה ("לא לזרוק את הקול").</li>
        <li>איחוד מחבר קולות – אבל איחוד רחוק אידיאולוגית מאבד חלק מהמצביעים.</li>
        <li>מי שבראש הרשימה הוא היו"ר. לשותפה שומרים מקומות ריאליים לפי ההסכם.</li>
        <li>איחוד אפשרי רק לפני סגירת הרשימות{listsOpen(g) ? ` (בעוד ${toClose} שבועות)` : ' – והן כבר נסגרו'}.</li>
        <li>הסכם עודפים: שתי רשימות מתמודדות כגוש על המושבים האחרונים.</li>
      </ul>
    </div>
  );

  if (!me || !mine) {
    return (
      <Sheet title="🤝 איחודים ובריתות" sub={mine ? mine.name : 'ללא מפלגה'}>
        {head}
        <div className="card">
          <p className="small" style={{ margin: 0 }}>
            רק יו"ר מפלגה מנהל/ת משא ומתן על איחוד. כדי להגיע לשם: להתמודד על הראשות במטה המפלגה (ח"כ, מעמד 60+, מוכרות 30+) או להקים מפלגה.
          </p>
          <p className="tiny muted">כשהמפלגה שלך מתאחדת עם אחרת תקבל/י על כך הודעה – ותוכל/י לברך או להתנגד.</p>
        </div>
      </Sheet>
    );
  }

  const others = Object.values(g.parties)
    .filter((x) => x.id !== me.id)
    .sort((a, b) => ideologyDistance(a.ideology, me.ideology) - ideologyDistance(b.ideology, me.ideology));

  const run = (fn: (s: typeof g) => { ok: boolean; text: string }) => {
    const r = act(fn);
    toast(r.text, r.ok ? 'good' : 'bad');
    if (r.ok) {
      setSel(null);
      close();
    }
  };

  return (
    <Sheet title="🤝 איחודים ובריתות" sub={`${me.name}: ${pollSeats(me.poll, thr)} מנדטים (${me.poll.toFixed(1)}%)${me.surplusPartner ? ` · עודפים עם ${g.parties[me.surplusPartner]?.short}` : ''}`}>
      {head}
      {others.map((x) => {
        const blocked = mergeBlocked(g, me.id, x.id);
        const sBlocked = surplusBlocked(g, x.id);
        const fit = Math.round((1 - ideologyDistance(x.ideology, me.ideology)) * 100);
        const below = x.poll < thr;
        const open = sel === x.id;
        const f = open && !blocked ? mergeForecast(g, x.id, terms) : null;
        const leaderName = g.npcs[x.leaderId]?.name ?? '';
        return (
          <div key={x.id} className="card" style={{ padding: 10 }}>
            <button className="list-item" style={{ width: '100%', border: 0, background: 'none', padding: 0 }} onClick={() => setSel(open ? null : x.id)}>
              <span className="party-dot" style={{ background: x.color, width: 14, height: 14 }} />
              <div className="grow" style={{ textAlign: 'start' }}>
                <b className="small">{x.name}</b>
                <div className="tiny muted">
                  {x.poll.toFixed(1)}% · {pollSeats(x.poll, thr)} מנדטים {below ? '· ⚠️ מתחת לחסימה ' : ''}· {isCoalition(g, x.id) ? 'קואליציה' : 'אופוזיציה'} · התאמה {fit}% · יו"ר: {leaderName}
                </div>
              </div>
              <span className="small">{open ? '▲' : '▼'}</span>
            </button>
            {open && (
              <div style={{ marginTop: 8 }}>
                {blocked ? (
                  <p className="small muted">איחוד: {blocked}</p>
                ) : (
                  <>
                    <div className="tiny muted">מי בראש הרשימה?</div>
                    <div className="filter-row">
                      <button className={terms.lead === 'me' ? 'on' : ''} onClick={() => setTerms({ ...terms, lead: 'me' })}>אני</button>
                      <button className={terms.lead === 'them' ? 'on' : ''} onClick={() => setTerms({ ...terms, lead: 'them' })}>{leaderName || 'הם'}</button>
                    </div>
                    <div className="tiny muted" style={{ marginTop: 6 }}>{terms.lead === 'me' ? 'מקומות ריאליים לשותפה' : 'כמה מקומות את/ה דורש/ת'}</div>
                    <div className="filter-row">
                      {(['low', 'fair', 'high'] as Share[]).map((sh) => (
                        <button key={sh} className={terms.share === sh ? 'on' : ''} onClick={() => setTerms({ ...terms, share: sh })}>
                          {terms.lead === 'me' ? SHARE_NAMES[sh] : sh === 'low' ? 'מעט' : sh === 'high' ? 'הרבה' : 'לפי הכוח'}
                        </button>
                      ))}
                    </div>
                    <input className="text-input" style={{ marginTop: 6 }} placeholder="שם לרשימה המשותפת (לא חובה)" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
                    {f && (
                      <div className="card small" style={{ marginTop: 8, background: 'var(--bg)' }} data-testid="merge-forecast">
                        יחד: <b>{f.seats}</b> מנדטים (בנפרד: {f.separate}) · את/ה במקום <b>{f.position}</b> · סיכוי שיסכימו <b>{Math.round(f.chance * 100)}%</b>
                        {f.lost > 0 && <div className="tiny muted">איחוד עם פער אידיאולוגי מאבד כ-{f.lost}% מהמצביעים.</div>}
                        {terms.lead === 'them' && <div className="tiny bad">תוותר/י על ראשות המפלגה.</div>}
                      </div>
                    )}
                    <button className="btn primary block" style={{ marginTop: 8 }} onClick={() => run((s) => proposeMerger(s, x.id, terms, name))}>
                      🤝 להציע איחוד
                    </button>
                  </>
                )}
                <button className="btn block" style={{ marginTop: 6 }} disabled={!!sBlocked} onClick={() => run((s) => proposeSurplus(s, x.id))}>
                  ➗ הסכם עודפים{sBlocked ? ` – ${sBlocked}` : ''}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </Sheet>
  );
}

export function GuideSheet() {
  const label = (id: string) => {
    const a = ACTIONS.find((x) => x.id === id);
    return a ? `${a.icon} ${a.label}` : id;
  };
  const cost = (id: string) => {
    const a = ACTIONS.find((x) => x.id === id);
    if (!a) return '';
    return [a.ap ? `⏱${a.ap}` : '', a.money ? `₪${a.money}K` : ''].filter(Boolean).join(' ');
  };
  return (
    <Sheet title="📖 מה מרוויחים ממה" sub="מדריך מהלכים: רווח, סיכון ומתי כדאי">
      <div className="card small">
        <b>עקרונות</b>
        <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
          {GUIDE_BASICS.map((b, i) => (
            <li key={i} className="muted">{b}</li>
          ))}
        </ul>
      </div>
      {GUIDE.map((grp) => (
        <div key={grp.title}>
          <div className="section-label">{grp.title}</div>
          <p className="tiny muted" style={{ marginTop: 0 }}>{grp.intro}</p>
          {grp.items.map((e) => (
            <div key={e.id} className="card small" style={{ padding: 10 }}>
              <div className="spread">
                <b>{label(e.id)}</b>
                <span className="cost">{cost(e.id)}</span>
              </div>
              <div>➕ {e.gain}</div>
              {e.risk && <div className="bad">⚠️ {e.risk}</div>}
              <div className="muted">🎯 {e.best}</div>
            </div>
          ))}
        </div>
      ))}
    </Sheet>
  );
}
