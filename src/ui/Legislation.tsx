import { useMemo, useState } from 'react';
import { inSession } from '../engine/calendar';
import { BILL_TEMPLATES, SCOPE_FACTOR, templateById } from '../engine/data/bills';
import {
  GOV_POS_NAMES,
  STAGES,
  STAGE_NAMES,
  bringToVote,
  canBringToVote,
  committeeChair,
  committeeName,
  createBill,
  isPlayerBill,
  legislativeRole,
  lobbyMK,
  lobbyMinisterial,
  ministerialDecision,
  pushChair,
  requestExemption,
  scheduleChance,
  type LobbyMethod,
} from '../engine/systems/legislation';
import { WORLD_NAMES } from '../engine/systems/opinion';
import { attitudeColor } from '../engine/systems/relationships';
import { LINE_NAMES, billImpact, forecast } from '../engine/systems/votes';
import type { Bill, GameState, VoteResult, WorldKey } from '../engine/types';
import { SECTOR_NAMES, type SECTORS } from '../engine/util';
import { useGame, useStore } from '../store';
import { Avatar } from './Avatar';
import { Hemicycle, VOTE_COLORS, VOTE_NAMES } from './Charts';
import { Empty, Sheet } from './common';
import { LawBook } from './Issues';
import { ISSUES } from '../engine/data/issues';
import { requiredMajority, strikeChance } from '../engine/systems/issues';
import { TRANSFORM_INFO } from '../engine/data/transforms';
import { hasTransform, publicSupport } from '../engine/systems/transforms';

function Pipeline({ b }: { b: Bill }) {
  const idx = b.stage === 'failed' ? STAGES.indexOf(b.history.length > 2 ? 'preliminary' : 'tabled') : STAGES.indexOf(b.stage);
  return (
    <div className="pipeline" title={STAGE_NAMES[b.stage]}>
      {STAGES.map((st, i) => (
        <i key={st} className={b.stage === 'passed' || i < idx ? 'done' : i === idx ? (b.stage === 'failed' ? 'fail' : 'now') : ''} />
      ))}
    </div>
  );
}

function nextStepHint(g: GameState, b: Bill): string {
  switch (b.stage) {
    case 'tabled':
      return b.waitUntil > g.week ? `תקופת המתנה: עוד ${b.waitUntil - g.week} שבועות (אפשר לבקש פטור)` : 'עולה לוועדת השרים';
    case 'ministerial':
      return 'ועדת השרים תכריע ביום ראשון הקרוב';
    case 'preliminary':
    case 'first':
    case 'final':
      return inSession(g) ? 'מוכנה להצבעה! גייס תומכים ועלה למליאה' : 'מחכה לסוף הפגרה';
    case 'committee1':
    case 'committee2':
      return `בוועדה: ${b.committeeProgress}/${b.committeeNeeded} דיונים · סיכוי לדיון השבוע ${Math.round(scheduleChance(g, b) * 100)}%`;
    case 'passed':
      return 'חוק! ההשפעה מורגשת בהדרגה';
    case 'failed':
      return 'נפלה. אפשר להגיש מחדש בהמשך';
    default:
      return '';
  }
}

export function LegislationView() {
  const g = useGame();
  const open = useStore((s) => s.open);
  const role = legislativeRole(g);
  const mine = g.bills.filter((b) => isPlayerBill(g, b) || b.sponsor === 'player');
  const active = mine.filter((b) => b.stage !== 'passed' && b.stage !== 'failed');
  const done = mine.filter((b) => b.stage === 'passed' || b.stage === 'failed');
  return (
    <div className="scroll">
      <div className="page">
        <div className="card">
          <h3>📜 החקיקה שלך</h3>
          <p className="small muted" style={{ margin: '6px 0 10px' }}>
            {role.canPropose
              ? role.sponsor === 'player'
                ? 'כח"כ את/ה יכול/ה להגיש הצעות חוק פרטיות. המסלול: הנחה ← ועדת שרים ← טרומית ← ועדה ← ראשונה ← ועדה ← שנייה ושלישית.'
                : `כעוזר/ת – מנסחים בשם ${g.npcs[role.sponsor!].name}. ההצלחה נזקפת גם לזכותך.`
              : role.reason}
          </p>
          <button className="btn primary block" disabled={!role.canPropose} onClick={() => open({ kind: 'billBuilder' })}>
            ✍️ הצעת חוק חדשה
          </button>
        </div>
        <div className="section-label">פעילות ({active.length})</div>
        {active.length === 0 && <Empty>אין הצעות פעילות.</Empty>}
        {active.map((b) => (
          <BillCard key={b.id} b={b} />
        ))}
        <LawBook />
        {done.length > 0 && <div className="section-label">ארכיון</div>}
        {done.map((b) => (
          <BillCard key={b.id} b={b} />
        ))}
      </div>
    </div>
  );
}

function BillCard({ b }: { b: Bill }) {
  const g = useGame();
  const open = useStore((s) => s.open);
  const t = templateById(b.templateId);
  const voteReady = ['preliminary', 'first', 'final'].includes(b.stage);
  return (
    <button className="card" style={{ width: '100%', textAlign: 'start', display: 'block' }} onClick={() => open({ kind: 'bill', id: b.id })}>
      <div className="spread">
        <h3>
          {t.icon} {b.title}
        </h3>
        {voteReady && <span className="chip gold">להצבעה</span>}
        {b.stage === 'passed' && <span className="chip good">חוק ✓</span>}
        {b.stage === 'failed' && <span className="chip bad">נפלה</span>}
      </div>
      <Pipeline b={b} />
      <div className="small">
        <b>{STAGE_NAMES[b.stage]}</b>
        {b.govPosition && <span className="muted"> · ממשלה: {GOV_POS_NAMES[b.govPosition]}</span>}
      </div>
      <div className="tiny muted">{nextStepHint(g, b)}</div>
      {b.sponsor !== 'player' && <div className="tiny faint">מגיש/ה: {g.npcs[b.sponsor]?.name}</div>}
      {(b.government || b.agreementParty) && (
        <div className="chips" style={{ marginTop: 6 }}>
          {b.government && <span className="chip gold">ממשלתית</span>}
          {b.agreementParty && <span className="chip">סעיף בהסכם עם {g.parties[b.agreementParty]?.short}</span>}
        </div>
      )}
    </button>
  );
}

export function BillSheet({ id }: { id: string }) {
  const g = useGame();
  const act = useStore((s) => s.act);
  const open = useStore((s) => s.open);
  const toast = useStore((s) => s.toast);
  const b = g.bills.find((x) => x.id === id);
  if (!b) return null;
  const t = templateById(b.templateId);
  const chair = committeeChair(g, b);
  const voteBlock = canBringToVote(g, b);
  return (
    <Sheet title={`${t.icon} ${b.title}`} sub={STAGE_NAMES[b.stage]}>
      <p className="small" style={{ marginTop: 0 }}>{t.summary}</p>
      <div className="chips">
        <span className="chip gold">היקף: {t.scopes[b.scope - 1]}</span>
        {b.amendments > 0 && <span className="chip">{b.amendments} הסתייגויות התקבלו</span>}
        <span className="chip">{committeeName(b.committeeId)}</span>
        {b.govPosition && <span className={`chip ${b.govPosition === 'support' ? 'good' : b.govPosition === 'oppose' ? 'bad' : ''}`}>ממשלה: {GOV_POS_NAMES[b.govPosition]}</span>}
      </div>
      <Pipeline b={b} />
      <p className="small muted">{nextStepHint(g, b)}</p>

      <div className="col" style={{ marginTop: 8 }}>
        {b.stage === 'tabled' && !b.exemption && b.waitUntil > g.week && (
          <button
            className="btn"
            disabled={g.player.ap < 1}
            onClick={() => {
              const ok = act((s) => {
                s.player.ap -= 1;
                return requestExemption(s, s.bills.find((x) => x.id === id)!);
              });
              toast(ok ? 'ועדת הכנסת אישרה פטור!' : 'הבקשה נדחתה', ok ? 'good' : 'bad');
            }}
          >
            🏃 לבקש פטור מחובת הנחה (⏱1)
          </button>
        )}
        {(b.stage === 'tabled' || b.stage === 'ministerial') && !g.flags[`minlobby_${b.id}`] && (
          <button
            className="btn"
            disabled={g.player.ap < 1 || g.player.capital < 3}
            onClick={() => {
              const txt = act((s) => {
                s.player.ap -= 1;
                s.player.capital -= 3;
                return lobbyMinisterial(s, s.bills.find((x) => x.id === id)!);
              });
              toast(txt, 'good');
            }}
          >
            🤝 לשכנע את ועדת השרים (⏱1, הון 3)
          </button>
        )}
        {(b.stage === 'committee1' || b.stage === 'committee2') && (
          <button
            className="btn"
            disabled={g.player.ap < 1 || b.pushWeek === g.week}
            onClick={() => {
              const txt = act((s) => {
                s.player.ap -= 1;
                return pushChair(s, s.bills.find((x) => x.id === id)!);
              });
              toast(txt, 'good');
            }}
          >
            ⏩ ללחוץ על יו"ר הוועדה{chair ? ` (${chair.name})` : ''} {b.pushWeek === g.week ? '– כבר לחצת השבוע' : '(⏱1)'}
          </button>
        )}
        {['preliminary', 'first', 'final'].includes(b.stage) && (
          <button className="btn primary" onClick={() => open({ kind: 'vote', id: b.id })}>
            🗳️ ספירת קולות והצבעה {voteBlock && voteBlock !== 'אין מספיק זמן השבוע' ? `– ${voteBlock}` : ''}
          </button>
        )}
      </div>

      {b.lastVote && (
        <>
          <div className="section-label">הצבעה אחרונה – {STAGE_NAMES[b.lastVote.stage]}</div>
          <VoteResultView r={b.lastVote} />
        </>
      )}

      <div className="section-label">היסטוריה</div>
      {[...b.history].reverse().map((h, i) => (
        <div key={i} className="small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
          <span className="faint tiny">שבוע {h.week + 1} · </span>
          {h.text}
        </div>
      ))}
    </Sheet>
  );
}

function VoteResultView({ r }: { r: VoteResult }) {
  return (
    <div className="card">
      <Hemicycle votes={r.seats} />
      <div className="chips" style={{ justifyContent: 'center', marginTop: 6 }}>
        {(['for', 'against', 'abstain', 'absent'] as const).map((k) => (
          <span key={k} className="chip" style={{ color: 'var(--text)' }}>
            <span className="party-dot" style={{ background: VOTE_COLORS[k] === 'transparent' ? '#475569' : VOTE_COLORS[k], marginInlineEnd: 5 }} />
            {VOTE_NAMES[k]} {r[k]}
          </span>
        ))}
      </div>
      <h3 style={{ textAlign: 'center', marginTop: 8 }} className={r.passed ? 'good' : 'bad'}>
        {r.passed ? 'ההצעה התקבלה' : 'ההצעה נדחתה'}
      </h3>
    </div>
  );
}

export function VoteSheet({ id }: { id: string }) {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const open = useStore((s) => s.open);
  const [result, setResult] = useState<VoteResult | null>(null);
  const b = g.bills.find((x) => x.id === id);
  const f = useMemo(() => (b ? forecast(g, b) : null), [g, b]);
  if (!b || !f) return null;
  const block = canBringToVote(g, b);
  const lobby = (npcId: string, m: LobbyMethod) => {
    const r = act((s) => lobbyMK(s, s.bills.find((x) => x.id === id)!, npcId, m));
    toast(r.text, r.ok ? 'good' : 'bad');
  };
  const vote = () => {
    const r = act((s) => bringToVote(s, s.bills.find((x) => x.id === id)!));
    setResult(r);
  };
  const probs = f.seats.map((x) => (x ? x.pFor / Math.max(0.01, x.pFor + x.pAgainst) : null));
  const margin = f.eFor - f.eAgainst;
  const maj = b.stage === 'final' ? requiredMajority(g, b.templateId) : null;
  const verdict = maj ? f.eFor - maj : margin;

  if (result) {
    return (
      <Sheet title={`תוצאות: ${STAGE_NAMES[result.stage]}`} sub={b.title}>
        <VoteResultView r={result} />
        <p className="small muted">{result.passed ? `השלב הבא: ${STAGE_NAMES[g.bills.find((x) => x.id === id)!.stage]}.` : 'ההצעה נפלה. אפשר לנסות שוב בהמשך עם היקף מתון יותר.'}</p>
      </Sheet>
    );
  }

  return (
    <Sheet title={`ספירת קולות: ${STAGE_NAMES[b.stage]}`} sub={b.title}>
      <div className="card">
        <Hemicycle probs={probs} onSeat={(nid) => open({ kind: 'npc', id: nid })} />
        <div className="spread" style={{ marginTop: 6 }}>
          <span className="good">בעד ~{Math.round(f.eFor)}</span>
          <span className={verdict > 3 ? 'good' : verdict < -3 ? 'bad' : 'warn'} style={{ fontWeight: 800 }}>
            {verdict > 3 ? 'צפוי לעבור' : verdict < -3 ? 'צפוי ליפול' : 'צמוד!'}
          </span>
          <span className="bad">נגד ~{Math.round(f.eAgainst)}</span>
        </div>
        {maj && <p className="small gold" style={{ margin: '6px 0 0' }}>חוק יסוד: נדרשים {maj} קולות בעד (לא רק רוב מהנוכחים).</p>}
        <p className="tiny muted" style={{ margin: '6px 0 0' }}>ירוק = נוטה בעד · אדום = נוטה נגד · אפור = מתלבט · זהב = את/ה. נעדרים לא נספרים.</p>
      </div>

      <div className="section-label">עמדות הסיעות</div>
      <div className="chips">
        {Object.entries(f.lines).map(([pid, line]) => (
          <span key={pid} className={`chip ${line === 'for' ? 'good' : line === 'against' ? 'bad' : ''}`}>
            {g.parties[pid].short}: {LINE_NAMES[line]}
          </span>
        ))}
      </div>

      <div className="section-label">מתלבטים – כאן מכריעים הצבעות ({f.swing.length})</div>
      {f.swing.slice(0, 12).map((sp) => {
        const n = g.npcs[sp.id];
        return (
          <div key={n.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="row">
              <Avatar spec={n.avatar} size={36} ring={n.partyId ? g.parties[n.partyId].color : undefined} />
              <div className="grow">
                <b className="small">{n.name}</b>
                <div className="tiny muted">
                  {n.partyId ? g.parties[n.partyId].short : ''} · יחס <span style={{ color: attitudeColor(n.attitude) }}>{n.attitude}</span> · {Math.round((sp.pFor / Math.max(0.01, sp.pFor + sp.pAgainst)) * 100)}% בעד
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: 6, marginTop: 8 }}>
              <button className="btn sm grow" disabled={g.player.ap < 1} onClick={() => lobby(n.id, 'persuade')}>
                💬 לשכנע ⏱1
              </button>
              <button className="btn sm grow" onClick={() => lobby(n.id, 'trade')}>
                🔁 החלפת קולות
              </button>
              <button className="btn sm grow" disabled={g.player.capital < 3} onClick={() => lobby(n.id, 'capital')}>
                ⭐ הון 3
              </button>
            </div>
          </div>
        );
      })}
      {f.swing.length === 0 && <p className="small muted">אין כמעט מתלבטים – התוצאה כנראה ידועה מראש.</p>}

      <div style={{ position: 'sticky', bottom: 0, paddingTop: 12, background: 'var(--bg2)' }}>
        <button className="btn primary block" disabled={!!block} onClick={vote}>
          {block ?? 'להעלות להצבעה במליאה (⏱1)'}
        </button>
      </div>
    </Sheet>
  );
}

const CATEGORIES: [string, string][] = [
  ['economy', 'כלכלה'],
  ['society', 'חברה'],
  ['security', 'ביטחון'],
  ['governance', 'ממשל'],
  ['basic', 'חוקי יסוד'],
  ['radical', '🌋 מהפכות'],
];

export function BillBuilder() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const close = useStore((s) => s.close);
  const open = useStore((s) => s.open);
  const toast = useStore((s) => s.toast);
  const [tid, setTid] = useState(BILL_TEMPLATES[0].id);
  const [scope, setScope] = useState<1 | 2 | 3>(2);
  const [cat, setCat] = useState<string>('economy');
  const canGov = !!g.player.ministry || g.coalition.pmId === 'player';
  const [gov, setGov] = useState(canGov);
  const t = templateById(tid);
  const role = legislativeRole(g);

  const preview = useMemo(() => {
    const fake: Bill = {
      id: 'preview', templateId: tid, title: t.title, sponsor: role.sponsor ?? 'player', scope, stage: 'preliminary', stageWeek: g.week, waitUntil: g.week,
      exemption: false, govPosition: null, committeeId: t.committee, committeeProgress: 0, committeeNeeded: 2, amendments: 0, pushWeek: -1,
      sessionPending: false, votedThisWeek: false, history: [], government: gov || undefined,
    };
    fake.govPosition = ministerialDecision(g, fake);
    const f = forecast(g, fake);
    return { gov: fake.govPosition, eFor: f.eFor, eAgainst: f.eAgainst, impact: billImpact(fake) };
  }, [g, tid, scope, t, role.sponsor, gov]);

  const submit = () => {
    if (g.player.ap < 2) return toast('צריך 2 זמן כדי לנסח ולהגיש', 'bad');
    const res = act((s) => {
      const r = createBill(s, tid, scope, { government: gov });
      if (typeof r !== 'string') s.player.ap -= 2;
      return typeof r === 'string' ? r : r.id;
    });
    if (res.startsWith('bill')) {
      close();
      toast('ההצעה הונחה על שולחן הכנסת!', 'good');
      open({ kind: 'bill', id: res });
    } else toast(res, 'bad');
  };

  return (
    <Sheet title="✍️ ניסוח הצעת חוק" sub={role.sponsor && role.sponsor !== 'player' ? `בשם ${g.npcs[role.sponsor].name}` : gov ? 'הצעת חוק ממשלתית' : 'הצעת חוק פרטית'}>
      {canGov && (
        <div className="seg" style={{ marginBottom: 10 }}>
          <button className={gov ? 'on' : ''} onClick={() => setGov(true)}>
            🏛️ ממשלתית
          </button>
          <button className={!gov ? 'on' : ''} onClick={() => setGov(false)}>
            👤 פרטית
          </button>
        </div>
      )}
      {gov && <p className="tiny gold" style={{ marginTop: 0 }}>תזכיר חוק (21 יום) ← ועדת שרים ← ישר לקריאה ראשונה. אם ועדת השרים לא מאשרת – ההצעה נגנזת.</p>}
      <div className="seg" style={{ marginBottom: 8 }}>
        {CATEGORIES.map(([id, label]) => (
          <button key={id} className={cat === id ? 'on' : ''} onClick={() => { setCat(id); setTid(BILL_TEMPLATES.find((x) => x.category === id)!.id); }}>
            {label}
          </button>
        ))}
      </div>
      <div className="filter-row">
        {BILL_TEMPLATES.filter((x) => x.category === cat).map((x) => (
          <button key={x.id} className={tid === x.id ? 'on' : ''} onClick={() => setTid(x.id)}>
            {x.icon} {x.title.replace('חוק ', '')}
          </button>
        ))}
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        <h3>
          {t.icon} {t.title}
        </h3>
        <p className="small muted" style={{ margin: '6px 0 10px' }}>{t.summary}</p>
        <div className="chips" style={{ marginBottom: 10 }}>
          {t.issue && (
            <span className={`chip ${g.issues[t.issue] >= 60 ? 'bad' : ''}`}>
              {ISSUES.find((i) => i.id === t.issue)!.icon} סוגיה: {ISSUES.find((i) => i.id === t.issue)!.name} ({Math.round(g.issues[t.issue])})
            </span>
          )}
          {t.basic && <span className="chip gold">חוק יסוד: דרוש רוב של {requiredMajority(g, t.id)} בקריאה השלישית</span>}
          {t.rule && <span className="chip gold">משנה את כללי המשחק</span>}
          {t.petitionRisk ? <span className="chip warn">סיכון פסילה בבג"ץ: {Math.round(strikeChance(g, t.id) * 100)}%</span> : null}
          {t.referendum && <span className="chip gold">דורש משאל עם · סקר: {publicSupport(g, t.id)}% בעד</span>}
        </div>
        {t.radical && (
          <div className="card small" style={{ background: 'var(--bg)', margin: '0 0 10px' }} data-testid="radical-info">
            <b>🌋 הצעה מרחיקת לכת</b>
            <div className="muted">אין משמעת קואליציונית: כל ח"כ מצביע לפי המצפון והפחד מההשלכות. כמעט אין סיכוי שתעבור.</div>
            <div style={{ marginTop: 6 }}>
              <b>אם תעבור{t.referendum ? ' ותאושר במשאל עם' : ''}:</b> {TRANSFORM_INFO[t.radical].now}
            </div>
            {hasTransform(g, t.radical) && <div className="gold">השינוי הזה כבר בתוקף.</div>}
          </div>
        )}
        <div className="small muted" style={{ marginBottom: 6 }}>היקף ההצעה</div>
        <div className="seg">
          {([1, 2, 3] as const).map((sc) => (
            <button key={sc} className={scope === sc ? 'on' : ''} onClick={() => setScope(sc)}>
              {['מתון', 'בינוני', 'מרחיק לכת'][sc - 1]}
            </button>
          ))}
        </div>
        <p className="tiny gold" style={{ margin: '6px 0 0' }}>{t.scopes[scope - 1]}</p>
      </div>

      <div className="section-label">השפעה צפויה אם יעבור (×{SCOPE_FACTOR[scope]})</div>
      <div className="card">
        <div className="small muted" style={{ marginBottom: 6 }}>על המדינה (בהדרגה, החל מ-{t.delay} שבועות אחרי)</div>
        <div className="chips">
          {Object.entries(t.world).map(([k, v]) => (
            <span key={k} className={`chip ${v! > 0 ? 'good' : 'bad'}`}>
              {WORLD_NAMES[k as WorldKey]} {v! > 0 ? '+' : ''}
              {(v! * preview.impact).toFixed(1)}
            </span>
          ))}
          <span className="chip">עלות: {(t.cost * SCOPE_FACTOR[scope]).toFixed(1)} מיליארד ₪</span>
        </div>
        <div className="small muted" style={{ margin: '10px 0 6px' }}>על התדמית שלך במגזרים</div>
        <div className="chips">
          {Object.entries(t.sectors)
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <span key={k} className={`chip ${v! > 0 ? 'good' : 'bad'}`}>
                {SECTOR_NAMES[k as (typeof SECTORS)[number]]} {v! > 0 ? '+' : ''}
                {(v! * preview.impact).toFixed(1)}
              </span>
            ))}
        </div>
      </div>

      <div className="section-label">תחזית פוליטית (כרגע)</div>
      <div className="card">
        <div className="spread small">
          <span>{gov ? 'ועדת השרים (ממשלתית):' : 'ועדת השרים צפויה:'} <b className={preview.gov === 'support' ? 'good' : preview.gov === 'oppose' ? 'bad' : 'warn'}>{GOV_POS_NAMES[preview.gov!]}</b></span>
          <span>
            טרומית: <span className="good">{Math.round(preview.eFor)}</span> / <span className="bad">{Math.round(preview.eAgainst)}</span>
          </span>
        </div>
        <p className="tiny muted" style={{ margin: '6px 0 0' }}>היקף רחב = השפעה גדולה ויותר מתנגדים. יחסים, טובות והסתייגויות יכולים לשנות את התמונה.</p>
      </div>

      <button className="btn primary block" style={{ marginTop: 14 }} onClick={submit} disabled={!role.canPropose}>
        להניח על שולחן הכנסת (⏱2)
      </button>
    </Sheet>
  );
}
