import { useState } from 'react';
import { dateLabel } from '../engine/calendar';
import { ministryDef } from '../engine/data/ministries';
import {
  DEMAND_ICON,
  budgetUsed,
  demandConflict,
  demandLabel,
  extendMandate,
  formationSeats,
  meetPartner,
  offerDeal,
  partnerAcceptChance,
  partnerDecline,
  partnerLeverage,
  partnersOf,
  partnerSign,
  playerPartyQuits,
  swearIn,
  toggleGrant,
  willingness,
} from '../engine/systems/coalition';
import { coalitionSeats, ministryTitle } from '../engine/systems/government';
import { DG_TYPES, appointDG, launchProgram, resignMinistry, type DgType } from '../engine/systems/ministry';
import { pollSeats, WORLD_NAMES } from '../engine/systems/opinion';
import type { GameState, PartnerTalk } from '../engine/types';
import { SECTOR_NAMES, ideologyDistance } from '../engine/util';
import { useGame, useStore } from '../store';
import { Avatar } from './Avatar';
import { Meter, Sheet } from './common';

const satColor = (v: number) => (v >= 55 ? 'var(--good)' : v >= 30 ? 'var(--warn)' : 'var(--bad)');

// ---------------- משא ומתן ----------------

function Weights({ w }: { w: number }) {
  const n = w >= 20 ? 3 : w >= 12 ? 2 : 1;
  return <span className="tiny gold" title="חשיבות">{'●'.repeat(n)}{'○'.repeat(3 - n)}</span>;
}

function TalkCard({ t, g }: { t: PartnerTalk; g: GameState }) {
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const [open, setOpen] = useState(false);
  const p = g.parties[t.partyId];
  const leader = g.npcs[p.leaderId];
  const w = willingness(g, t);
  const fit = Math.round((1 - ideologyDistance(p.ideology, g.parties[g.negotiation!.formateurParty].ideology)) * 100);
  return (
    <div className="card" style={{ opacity: t.walkedOut ? 0.5 : 1, borderColor: t.signed ? 'var(--good)' : undefined }}>
      <button className="spread" style={{ width: '100%', textAlign: 'start' }} onClick={() => setOpen(!open)}>
        <div className="row grow">
          {leader && <Avatar spec={leader.avatar} size={40} ring={p.color} />}
          <div className="grow">
            <b>{p.name}</b>
            <div className="tiny muted">
              {p.seats} מנדטים · התאמה {fit}% {leader ? `· ${leader.name}` : ''}
            </div>
          </div>
        </div>
        {t.signed ? <span className="chip good">חתמה ✓</span> : t.walkedOut ? <span className="chip bad">עזבה</span> : <span className="chip">{open ? '▲' : '▼'}</span>}
      </button>
      {!t.signed && !t.walkedOut && (
        <div style={{ marginTop: 8 }}>
          <div className="spread tiny muted">
            <span>נכונות לחתום</span>
            <span>
              <b style={{ color: w >= 70 ? 'var(--good)' : w >= 50 ? 'var(--warn)' : 'var(--bad)' }}>{w}</b>/70
            </span>
          </div>
          <div className="bar" style={{ position: 'relative' }}>
            <i style={{ width: `${w}%`, background: w >= 70 ? 'var(--good)' : w >= 50 ? 'var(--warn)' : 'var(--bad)' }} />
            <span style={{ position: 'absolute', top: -2, bottom: -2, insetInlineStart: '70%', width: 2, background: 'var(--text)' }} />
          </div>
        </div>
      )}
      {open && !t.walkedOut && (
        <div style={{ marginTop: 10 }}>
          {t.demands.map((d, i) => {
            const conflict = !t.granted[i] && !t.signed ? demandConflict(g, t, i) : null;
            return (
              <button
                key={i}
                className="list-item"
                disabled={t.signed || !!conflict}
                onClick={() => {
                  const err = act((s) => toggleGrant(s, t.partyId, i));
                  if (err) toast(err, 'bad');
                }}
                style={{ borderColor: t.granted[i] ? 'var(--gold)' : undefined }}
              >
                <span style={{ fontSize: 20 }}>{t.granted[i] ? '✅' : DEMAND_ICON[d.kind]}</span>
                <div className="grow">
                  <div className="small">{demandLabel(d)}</div>
                  {conflict && <div className="tiny bad">{conflict}</div>}
                </div>
                <Weights w={t.weights[i]} />
              </button>
            );
          })}
          {!t.signed && (
            <button
              className="btn primary block"
              style={{ marginTop: 10 }}
              disabled={g.player.ap < 1}
              onClick={() => {
                const r = act((s) => offerDeal(s, t.partyId));
                toast(r.text, r.ok ? 'good' : 'bad');
              }}
            >
              להציע הסכם (⏱1)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function NegotiationSheet() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const close = useStore((s) => s.close);
  const n = g.negotiation;
  if (!n) return null;
  const weeksLeft = n.deadline - g.week;

  if (n.mode === 'partner') {
    const t = n.talks[0];
    const f = g.parties[n.formateurParty];
    const lev = partnerLeverage(g);
    const chance = Math.round(partnerAcceptChance(g) * 100);
    return (
      <Sheet title="🤝 משא ומתן קואליציוני" sub={`${f.name} מרכיבה ממשלה · ${weeksLeft} שבועות להחלטה`}>
        <div className="card small">
          {lev.pivotal ? (
            <span className="good">אתם לשון המאזניים: בלעדיכם יש להם רק {lev.altSeats} ח"כים. יש לך כוח מיקוח.</span>
          ) : (
            <span className="warn">יש להם {lev.altSeats} ח"כים גם בלעדיכם. אל תמתח/י את החבל.</span>
          )}
        </div>
        <div className="section-label">מה דורשים? (סמן/י)</div>
        {t.demands.map((d, i) => (
          <button key={i} className="list-item" onClick={() => act((s) => toggleGrant(s, t.partyId, i))} style={{ borderColor: t.granted[i] ? 'var(--gold)' : undefined }}>
            <span style={{ fontSize: 20 }}>{t.granted[i] ? '✅' : DEMAND_ICON[d.kind]}</span>
            <div className="grow small">{demandLabel(d)}</div>
            <Weights w={t.weights[i]} />
          </button>
        ))}
        <div className="card" style={{ marginTop: 12 }}>
          <div className="spread">
            <span className="small">סיכוי שיסכימו</span>
            <b style={{ color: chance >= 60 ? 'var(--good)' : chance >= 35 ? 'var(--warn)' : 'var(--bad)' }}>{chance}%</b>
          </div>
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>אם יסרבו – הם ימחקו את הדרישה הכבדה ביותר ותוכל/י לנסות שוב.</p>
        </div>
        <div className="col" style={{ marginTop: 12 }}>
          <button
            className="btn primary"
            onClick={() => {
              const r = act((s) => partnerSign(s));
              toast(r.text, r.ok ? 'good' : 'bad');
              if (r.ok) close();
            }}
          >
            ✍️ לחתום על ההסכם
          </button>
          <button
            className="btn danger"
            onClick={() => {
              act((s) => partnerDecline(s));
              toast('נשארת באופוזיציה. הבוחרים מעריכים עקביות.', 'neutral');
              close();
            }}
          >
            להישאר באופוזיציה
          </button>
        </div>
      </Sheet>
    );
  }

  const seats = formationSeats(g);
  const used = budgetUsed(g);
  const talks = [...n.talks].sort((a, b) => Number(b.signed) - Number(a.signed) || willingness(g, b) - willingness(g, a));
  return (
    <Sheet title="🤝 הרכבת הממשלה" sub={`המנדט פוקע בעוד ${weeksLeft} שבועות (${dateLabel(g, n.deadline)})`}>
      <div className="card">
        <div className="spread">
          <b>{seats} / 61 ח"כים</b>
          <span className="small muted">קופה קואליציונית: {(n.budgetPool - used).toFixed(1)} מ׳ ₪ נותרו</span>
        </div>
        <div className="bar" style={{ marginTop: 8, height: 12 }}>
          <i style={{ width: `${Math.min(100, (seats / 61) * 100)}%`, background: seats >= 61 ? 'var(--good)' : 'var(--gold)' }} />
        </div>
        <p className="tiny muted" style={{ margin: '8px 0 0' }}>
          פתח/י כל מפלגה, סמן/י אילו דרישות לתת, והצע/י הסכם. כל תיק שתיתן/י – פחות לאנשים במפלגה שלך. סעיפי חקיקה יהפכו להצעות חוק ממשלתיות שתצטרך/י להעביר.
        </p>
      </div>
      {seats >= 61 && (
        <button
          className="btn primary block"
          style={{ marginTop: 12 }}
          onClick={() => {
            const r = act((s) => swearIn(s));
            toast(r.text, r.ok ? 'good' : 'bad');
            if (r.ok) close();
          }}
        >
          🏛️ להשביע את הממשלה בכנסת
        </button>
      )}
      {!n.extended && weeksLeft <= 2 && (
        <button className="btn block" style={{ marginTop: 10 }} onClick={() => act((s) => extendMandate(s))}>
          לבקש מהנשיא הארכה של 14 יום
        </button>
      )}
      <div className="section-label">המפלגות</div>
      {talks.map((t) => (
        <TalkCard key={t.partyId} t={t} g={g} />
      ))}
    </Sheet>
  );
}

export function NegotiationBanner() {
  const g = useGame();
  const open = useStore((s) => s.open);
  const n = g.negotiation;
  if (!n) return null;
  return (
    <button className="toast" style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 100px)', insetInline: 12, zIndex: 6, textAlign: 'start', borderInlineStartColor: 'var(--gold)' }} onClick={() => open({ kind: 'negotiation' })}>
      <b>🤝 {n.mode === 'formateur' ? `הרכבת ממשלה: ${formationSeats(g)}/61` : 'מוזמנים לקואליציה'}</b>
      <div className="small muted">עוד {n.deadline - g.week} שבועות · הקש/י כדי לנהל</div>
    </button>
  );
}

// ---------------- ניהול הקואליציה ----------------

export function CoalitionSheet() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const [confirm, setConfirm] = useState(false);
  const c = g.coalition;
  const isPM = c.pmId === 'player';
  const playerPartner = !!g.player.partyId && g.parties[g.player.partyId].leaderId === 'player' && c.parties.includes(g.player.partyId) && !isPM;
  const seats = coalitionSeats(g, c.parties);
  const pmName = isPM ? g.player.name : g.npcs[c.pmId]?.name;
  return (
    <Sheet title="🤝 הקואליציה" sub={`בראשות ${pmName} · ${seats} ח"כים${seats < 61 ? ' – ממשלת מיעוט!' : ''}`}>
      <div className="card">
        <Meter label="יציבות" value={c.stability} color={satColor(c.stability)} />
      </div>
      <div className="section-label">שביעות רצון השותפות</div>
      {partnersOf(g).map((pid) => {
        const p = g.parties[pid];
        const sat = c.satisfaction[pid] ?? 60;
        const mine = p.leaderId === 'player';
        return (
          <div key={pid} className="card">
            <div className="spread">
              <b className="row" style={{ gap: 6 }}>
                <span className="party-dot" style={{ background: p.color }} /> {p.name} ({p.seats})
              </b>
              {isPM && (
                <button
                  className="btn sm"
                  disabled={g.player.ap < 1}
                  onClick={() => toast(act((s) => meetPartner(s, pid)), 'good')}
                >
                  פגישה ⏱1
                </button>
              )}
            </div>
            {!mine && (
              <div style={{ marginTop: 8 }}>
                <Meter label="שביעות רצון" value={sat} color={satColor(sat)} />
              </div>
            )}
            {mine && <p className="tiny muted" style={{ margin: '6px 0 0' }}>זו המפלגה שלך.</p>}
            {c.agreement
              .filter((a) => a.partyId === pid)
              .map((a) => (
                <div key={a.id} className="tiny" style={{ marginTop: 4 }}>
                  {a.status === 'done' ? '✅' : a.status === 'broken' ? '❌' : g.week > a.dueWeek ? '⏰' : '⏳'} {demandLabel(a.demand)}
                </div>
              ))}
          </div>
        );
      })}
      {partnersOf(g).length === 0 && <p className="small muted">ממשלה של מפלגה אחת.</p>}
      {playerPartner && (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="small" style={{ marginTop: 0 }}>
            כיו"ר מפלגה שותפה – את/ה יכול/ה לפרק את הממשלה. בלי {g.parties[g.player.partyId!].seats} המנדטים שלך יישארו לה {seats - g.parties[g.player.partyId!].seats}.
          </p>
          {!confirm ? (
            <button className="btn danger block" onClick={() => setConfirm(true)}>
              🚪 לפרוש מהקואליציה
            </button>
          ) : (
            <button className="btn danger block" onClick={() => { toast(act((s) => playerPartyQuits(s)), 'neutral'); setConfirm(false); }}>
              בטוח? הקש/י שוב
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ---------------- המשרד ----------------

export function MinistrySheet() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const close = useStore((s) => s.close);
  const [confirm, setConfirm] = useState(false);
  const ms = g.ministryState;
  if (!ms || !g.player.ministry) return <Sheet title="המשרד">אינך שר/ה כרגע.</Sheet>;
  const def = ministryDef(ms.id)!;
  const canDG = !ms.dgType || g.week - Number(g.flags.dgWeek ?? -99) >= 26;
  return (
    <Sheet title={`${def.icon} ${def.name}`} sub={`${ministryTitle(ms.id, g.player.gender)} מאז ${dateLabel(g, ms.since)}`}>
      <div className="kpi">
        <div>
          <span>תקציב תכניות</span>
          <b>{ms.budget.toFixed(1)}</b>
          <span>מיליארד ₪</span>
        </div>
        <div>
          <span>ביצועים</span>
          <b style={{ color: satColor(ms.performance) }}>{Math.round(ms.performance)}</b>
          <span>מתוך 100</span>
        </div>
        <div>
          <span>מנכ"ל</span>
          <b style={{ fontSize: 15 }}>{ms.dgType ? DG_TYPES[ms.dgType].name : '—'}</b>
        </div>
      </div>
      <p className="tiny muted">תחומי אחריות: {def.focus.map((k) => WORLD_NAMES[k]).join(', ')}. ביצועים טובים = תדמית עולה כל שבוע. התקציב מתחדש עם חוק התקציב; תוספת – במשרד האוצר.</p>

      {canDG && (
        <>
          <div className="section-label">מינוי מנכ"ל</div>
          {(Object.keys(DG_TYPES) as DgType[]).map((k) => (
            <button key={k} className="list-item" onClick={() => toast(act((s) => appointDG(s, k)), 'good')}>
              <span style={{ fontSize: 20 }}>{k === 'loyal' ? '🎗️' : k === 'pro' ? '🎓' : '🤫'}</span>
              <div className="grow">
                <b className="small">{DG_TYPES[k].name}</b>
                <div className="tiny muted">{DG_TYPES[k].desc}</div>
              </div>
            </button>
          ))}
        </>
      )}

      <div className="section-label">תכניות דגל</div>
      {def.programs.map((p) => {
        const done = ms.programs.some((x) => x.id === p.id);
        const blocked = done ? 'כבר הושקה' : g.player.ap < p.ap ? 'אין מספיק זמן' : ms.budget < p.cost ? 'אין מספיק תקציב' : null;
        return (
          <div key={p.id} className="card">
            <div className="spread">
              <b>{p.name}</b>
              <span className="cost">
                ⏱{p.ap} · {p.cost >= 0 ? `${p.cost} מ׳` : `חוסך ${-p.cost} מ׳`}
              </span>
            </div>
            <p className="small muted" style={{ margin: '4px 0 6px' }}>{p.desc}</p>
            <div className="chips">
              {Object.entries(p.world).map(([k, v]) => (
                <span key={k} className={`chip ${v! > 0 ? 'good' : 'bad'}`}>
                  {WORLD_NAMES[k as keyof typeof WORLD_NAMES]} {v! > 0 ? '+' : ''}
                  {v}
                </span>
              ))}
              {Object.entries(p.sectors).map(([k, v]) => (
                <span key={k} className={`chip ${v! > 0 ? 'good' : 'bad'}`}>
                  {SECTOR_NAMES[k as keyof typeof SECTOR_NAMES]} {v! > 0 ? '+' : ''}
                  {v}
                </span>
              ))}
            </div>
            <button
              className="btn sm block"
              style={{ marginTop: 8 }}
              disabled={!!blocked}
              onClick={() => {
                const r = act((s) => launchProgram(s, p.id));
                toast(r.text, r.ok ? 'good' : 'bad');
              }}
            >
              {blocked ?? '🚀 להשיק'}
            </button>
          </div>
        );
      })}

      <div className="section-label">התפטרות</div>
      {!confirm ? (
        <button className="btn danger block" onClick={() => setConfirm(true)}>
          להתפטר מהממשלה
        </button>
      ) : (
        <button
          className="btn danger block"
          onClick={() => {
            toast(act((s) => resignMinistry(s)), 'neutral');
            close();
          }}
        >
          בטוח? הקש/י שוב
        </button>
      )}
    </Sheet>
  );
}

/** כרטיס לוח: קואליציה ומשרד */
export function GovernmentCard() {
  const g = useGame();
  const open = useStore((s) => s.open);
  const c = g.coalition;
  const seats = coalitionSeats(g, c.parties);
  const pmName = c.pmId === 'player' ? g.player.name : g.npcs[c.pmId]?.name;
  return (
    <div className="card">
      <div className="card-title">
        <h3>🤝 הממשלה</h3>
        <button className="btn sm" onClick={() => open({ kind: 'coalition' })}>
          פרטים
        </button>
      </div>
      <p className="small" style={{ margin: '0 0 8px' }}>
        ראש הממשלה: <b>{pmName}</b> · {seats} ח"כים{seats < 61 ? <span className="bad"> · מיעוט!</span> : ''}
      </p>
      {partnersOf(g).map((pid) => (
        <Meter key={pid} label={g.parties[pid].short} value={c.satisfaction[pid] ?? 60} color={satColor(c.satisfaction[pid] ?? 60)} />
      ))}
      {g.ministryState && (
        <button className="list-item" style={{ marginTop: 10 }} onClick={() => open({ kind: 'ministry' })}>
          <span style={{ fontSize: 22 }}>{ministryDef(g.ministryState.id)?.icon}</span>
          <div className="grow">
            <b className="small">{ministryTitle(g.ministryState.id, g.player.gender)}</b>
            <div className="tiny muted">
              ביצועים {Math.round(g.ministryState.performance)} · תקציב {g.ministryState.budget.toFixed(1)} מ׳ ₪
            </div>
          </div>
        </button>
      )}
      {g.player.partyId && (
        <p className="tiny muted" style={{ margin: '8px 0 0' }}>
          {g.parties[g.player.partyId].name} בסקרים: {pollSeats(g.parties[g.player.partyId].poll)} מנדטים
        </p>
      )}
    </div>
  );
}
