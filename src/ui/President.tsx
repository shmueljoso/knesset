import { useState } from 'react';
import {
  CAMPAIGN_WINDOW, DIVIDES, INITIATIVES, MANDATE_DOCTRINES, MAX_ACTIVE_INITIATIVES, THEMES, WORLD_LABEL,
  campaignAction, campaignMenu, declareBlocked, declareCandidacy, expectedVotes, initiativeBlocked, investInitiative, isPresident, presAction, presMenu,
  presidencyScore, runBlockers, unityDrivers, weeksToVote, withdrawCandidacy, type PresActionInfo, type PresResult,
} from '../engine/systems/presidency';
import { PRESIDENT_TERM } from '../engine/systems/president';
import { useGame, useStore } from '../store';
import { Meter, Sheet } from './common';

const round4 = (n: number) => Math.max(4, Math.round(n / 4) * 4);

function ActionRow({ a, cost, onRun }: { a: { icon: string; label: string; desc: string; blocked: string | null }; cost: string; onRun: () => void }) {
  return (
    <button className="list-item action-item" disabled={!!a.blocked} onClick={onRun}>
      <span className="a-ico">{a.icon}</span>
      <div className="grow">
        <div className="spread">
          <b>{a.label}</b>
          <span className="cost">{cost}</span>
        </div>
        <div className="small muted">{a.blocked ?? a.desc}</div>
      </div>
    </button>
  );
}

const apCost = (a: PresActionInfo) => `⏱${a.ap}`;

/** מטה הקמפיין: הכרזת מועמדות ופעולות לפני ההצבעה בכנסת */
export function PresidentSheet() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const c = g.presCampaign;
  const blockers = runBlockers(g);
  const decl = declareBlocked(g);
  const run = (fn: (s: typeof g) => PresResult) => {
    const r = act((s) => fn(s));
    toast(r.text, r.ok ? 'good' : 'bad', r.lines);
  };
  const toVote = weeksToVote(g);
  const votes = expectedVotes(g);
  const nameOf = (id: string) => (id === 'player' ? g.player.name : g.npcs[id]?.name ?? '?');
  const my = votes.find((v) => v.id === 'player')?.votes ?? 0;
  const lead = votes[0];
  const status = my >= 61 ? 'סיכוי טוב כבר בסבב הראשון' : lead.id === 'player' ? 'מובילים, אבל צריך לשכנע עוד' : my >= 40 ? 'במרוץ צמוד' : 'מאחור – צריך קמפיין';

  return (
    <Sheet title="🏛️ הבחירות לנשיאות" sub="הכנסת בוחרת נשיא/ה כל שבע שנים, בהצבעה חשאית">
      <div className="card" data-testid="pres-status">
        <div className="chips">
          <span className="chip gold">ההצבעה בעוד כ-{round4(toVote)} שבועות</span>
          {c && <span className="chip good">מועמד/ת מוכרז/ת</span>}
        </div>
        <div className="section-label" style={{ marginTop: 10 }}>תנאי הסף</div>
        {blockers.length === 0 ? (
          <div className="small good">✓ את/ה עומד/ת בכל התנאים</div>
        ) : (
          blockers.map((b) => (
            <div key={b} className="small bad">
              ✗ {b}
            </div>
          ))
        )}
        {!c && (
          <div style={{ marginTop: 10 }}>
            <button className="btn primary block" disabled={!!decl} onClick={() => run(declareCandidacy)} data-testid="pres-declare">
              📣 להכריז על מועמדות
            </button>
            {decl && <div className="tiny faint" style={{ marginTop: 4 }}>{decl}</div>}
            <p className="tiny faint" style={{ margin: '8px 0 0' }}>
              אפשר להכריז ב-{CAMPAIGN_WINDOW} השבועות שלפני ההצבעה. מי שמכריז/ה ולא מושך/ת תאוצה משלם/ת על כך; מי שלא הכריז/ה יכול/ה עדיין להתמודד בפתק אחרון, בלי קמפיין.
            </p>
          </div>
        )}
      </div>

      {c && (
        <>
          <div className="section-label">מצב המרוץ</div>
          <div className="card" data-testid="pres-race">
            <Meter label="תאוצה" value={c.momentum} color="var(--gold)" />
            <div className="small" style={{ margin: '8px 0' }}>
              {c.pledges.length} ח"כים התחייבו · {status}
            </div>
            <div className="tiny faint">ספירת ראשים משוערת בסבב הראשון (דרושים 61):</div>
            {votes.map((v) => (
              <div key={v.id} style={{ marginTop: 6 }}>
                <div className="spread small" style={{ fontWeight: v.id === 'player' ? 800 : 400 }}>
                  <span>{nameOf(v.id)}</span>
                  <b>{v.votes}</b>
                </div>
                <div className="bar" style={{ height: 6 }}>
                  <i style={{ width: `${Math.min(100, (v.votes / 120) * 100)}%`, background: v.id === 'player' ? 'var(--gold)' : '#64748b' }} />
                </div>
              </div>
            ))}
            {c.theme && <div className="small" style={{ marginTop: 8 }}>נושא הקמפיין: <b>{THEMES[c.theme].name}</b></div>}
          </div>

          <div className="section-label">פעולות קמפיין</div>
          {campaignMenu(g).map((a) => (
            <ActionRow key={a.id} a={a} cost={`⏱${a.ap}${a.money ? ` ₪${a.money}K` : ''}${a.capital ? ` 🏛️${a.capital}` : ''}`} onRun={() => run((s) => campaignAction(s, a.id))} />
          ))}
          <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => run(withdrawCandidacy)}>
            לפרוש מהמרוץ
          </button>
        </>
      )}
    </Sheet>
  );
}

/** כרטיס בלוח: נקודת הכניסה לקמפיין */
export function PresidentCard() {
  const g = useGame();
  const open = useStore((s) => s.open);
  if (isPresident(g) || !g.player.isMK) return null;
  const c = g.presCampaign;
  const eligible = runBlockers(g).length === 0;
  if (!c && !eligible) return null;
  const toVote = weeksToVote(g);
  if (!c && toVote > CAMPAIGN_WINDOW + 60) return null;
  return (
    <div className="card" data-testid="pres-card">
      <div className="card-title">
        <h3>🏛️ נשיאות המדינה</h3>
        <span className="small muted">בעוד כ-{round4(toVote)} שבועות</span>
      </div>
      <p className="small" style={{ margin: '0 0 10px' }}>
        {c ? `אתה/את מועמד/ת. תאוצה ${Math.round(c.momentum)}, ${c.pledges.length} ח"כים התחייבו.` : 'את/ה עומד/ת בתנאים להתמודד. הכרזה מוקדמת מאפשרת לבנות קמפיין, לשכנע ח"כים ולהצטייד בתאוצה.'}
      </p>
      <button className="btn block" onClick={() => open({ kind: 'president' })} data-testid="pres-open">
        {c ? 'למטה הקמפיין' : 'לבחירות לנשיאות'}
      </button>
    </div>
  );
}

/** לשונית הנשיא/ה: מדדי אחדות ואמון, פעולות שבועיות, יוזמות ומדיניות מנדט */
export function PresidencyView() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const pr = g.presidency!;
  const [sector, setSector] = useState(false);
  const [tables, setTables] = useState(false);
  const run = (fn: (s: typeof g) => PresResult) => {
    const r = act((s) => fn(s));
    toast(r.text, r.ok ? 'good' : 'bad', r.lines);
  };
  const m = presMenu(g);
  const left = Math.max(0, (g.presidentNextWeek ?? 0) - g.week);
  const years = Math.floor((PRESIDENT_TERM - left) / 52);
  const drivers = unityDrivers(g);
  const active = pr.initiatives.filter((i) => !i.done).length;
  const doctrine = String(g.flags.mandateDoctrine ?? 'largest');
  const unityColor = pr.unity >= 60 ? 'var(--good)' : pr.unity >= 40 ? 'var(--gold)' : 'var(--bad)';
  const trustColor = pr.trust >= 55 ? 'var(--good)' : pr.trust >= 30 ? 'var(--gold)' : 'var(--bad)';
  return (
    <div className="scroll">
      <div className="page dash" data-testid="presidency">
        <div className="card">
          <div className="card-title">
            <h3>🏛️ בית הנשיא</h3>
            <span className="small muted">
              שנה {years + 1} מתוך 7 · עוד {left} שבועות
            </span>
          </div>
          <Meter label="אחדות העם" value={pr.unity} color={unityColor} />
          <Meter label="אמון בך" value={pr.trust} color={trustColor} />
          <div className="bar" style={{ height: 5, marginTop: 10 }}>
            <i style={{ width: `${((PRESIDENT_TERM - left) / PRESIDENT_TERM) * 100}%`, background: 'var(--muted)' }} />
          </div>
          <div className="tiny faint" style={{ marginTop: 6 }}>
            ציון כהונה נוכחי: {presidencyScore(g)} · מטרת הכהונה: {pr.theme ? THEMES[pr.theme].name : 'לא נבחרה'}
          </div>
          {pr.idle >= 4 && <div className="small bad" style={{ marginTop: 6 }}>⚠️ {pr.idle} שבועות בלי פעילות נשיאותית – האמון בך נשחק.</div>}
        </div>

        <div className="section-label">מה מזיז את האחדות</div>
        <div className="card small" data-testid="unity-drivers">
          {drivers.map((d) => (
            <div key={d.label} className="spread">
              <span>{d.label}</span>
              <b className={d.d > 0.4 ? 'good' : d.d < -0.4 ? 'bad' : 'muted'} dir="ltr">
                {d.d > 0 ? '+' : ''}
                {d.d.toFixed(1)}
              </b>
            </div>
          ))}
          <div className="tiny faint" style={{ marginTop: 6 }}>האחדות נמשכת לאט לרמה הזו. פעולות נשיאותיות נותנות דחיפה מיידית; יוזמות, שולחנות עגולים ומדינה שמתייצבת מעלות את הרמה עצמה.</div>
        </div>

        <div className="section-label">פעולות השבוע</div>
        {m.general.map((a) => (
          <ActionRow key={a.id} a={a} cost={apCost(a)} onRun={() => run((s) => presAction(s, a.id))} />
        ))}
        <button className="list-item" onClick={() => setSector(!sector)}>
          <span className="a-ico">🚌</span>
          <div className="grow">
            <b>ביקורים בקהילות</b>
            <div className="small muted">תדמית במגזר ואחדות ({sector ? 'סגירה' : 'בחירת מגזר'})</div>
          </div>
        </button>
        {sector && m.visit.map((a) => <ActionRow key={a.id} a={a} cost={apCost(a)} onRun={() => run((s) => presAction(s, a.id))} />)}
        <button className="list-item" onClick={() => setTables(!tables)}>
          <span className="a-ico">🪑</span>
          <div className="grow">
            <b>שולחנות עגולים</b>
            <div className="small muted">מקרבים בין קצוות ומורידים קיטוב ({tables ? 'סגירה' : 'בחירת מחלוקת'})</div>
          </div>
        </button>
        {tables && m.tables.map((a) => <ActionRow key={a.id} a={a} cost={apCost(a)} onRun={() => run((s) => presAction(s, a.id))} />)}

        <div className="section-label">
          יוזמות נשיאותיות ({active}/{MAX_ACTIVE_INITIATIVES} פעילות)
        </div>
        {INITIATIVES.map((i) => {
          const cur = pr.initiatives.find((x) => x.id === i.id);
          const blocked = initiativeBlocked(g, i.id);
          return (
            <div key={i.id} className="card" style={{ opacity: cur?.done ? 0.7 : 1 }}>
              <div className="spread">
                <b>
                  {i.icon} {i.name}
                </b>
                {cur?.done ? <span className="chip good">הושלמה</span> : <span className="tiny muted">{cur ? `${cur.progress}/${i.need}` : `${i.need} שבועות השקעה`}</span>}
              </div>
              <div className="small muted">{i.desc}</div>
              <div className="tiny faint">
                בסיום: {i.effects.map(([k, v]) => `${WORLD_LABEL[k]} +${v}`).join(' · ')} · אחדות +{i.unity}
              </div>
              {cur && !cur.done && (
                <div className="bar" style={{ height: 6, marginTop: 6 }}>
                  <i style={{ width: `${(cur.progress / i.need) * 100}%`, background: 'var(--gold)' }} />
                </div>
              )}
              {!cur?.done && (
                <button className="btn sm block" style={{ marginTop: 8 }} disabled={!!blocked} onClick={() => run((s) => investInitiative(s, i.id))} data-testid={`init-${i.id}`}>
                  {blocked ?? (cur ? '⏱1 · להשקיע השבוע' : '⏱1 · להתחיל יוזמה')}
                </button>
              )}
            </div>
          );
        })}

        <div className="section-label">מדיניות מנדט (אחרי הבחירות לכנסת)</div>
        <div className="card small" data-testid="mandate">
          <div className="filter-row">
            {Object.entries(MANDATE_DOCTRINES).map(([id, d]) => (
              <button key={id} className={doctrine === id ? 'on' : ''} onClick={() => act((s) => void (s.flags.mandateDoctrine = id))}>
                {d.name}
              </button>
            ))}
          </div>
          <div className="muted" style={{ marginTop: 6 }}>{MANDATE_DOCTRINES[doctrine].desc}</div>
        </div>

        {pr.deeds.length > 0 && (
          <>
            <div className="section-label">הכהונה שלי</div>
            <div className="card small" data-testid="deeds">
              {pr.deeds
                .slice(-10)
                .reverse()
                .map((d, i) => (
                  <div key={i}>• {d}</div>
                ))}
              <div className="tiny faint" style={{ marginTop: 6 }}>
                חנינות: {pr.pardons} · דחיות: {pr.refused} · קונפליקטים שנפתרו: {pr.deeds.filter((d) => d.includes('שולחן')).length}
              </div>
            </div>
          </>
        )}
        <p className="tiny faint">נושאי הדיון בבית הנשיא: {Object.values(DIVIDES).map((d) => d.name).join(' · ')}.</p>
      </div>
    </div>
  );
}
