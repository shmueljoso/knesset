import { useEffect, useMemo, useState } from 'react';
import { inSession } from '../engine/calendar';
import { BILL_TEMPLATES, SCOPE_FACTOR, templateById } from '../engine/data/bills';
import {
  GOV_POS_NAMES,
  STAGES,
  STAGE_NAMES,
  appealBlocked,
  appealChance,
  appealToGovernment,
  cabinetBlock,
  canBringToVote,
  issueUltimatum,
  pressureRole,
  startVote,
  ultimatumBlocked,
  ultimatumChance,
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
import { SECTOR_NAMES, leanAlignment, type SECTORS } from '../engine/util';
import { useGame, useStore } from '../store';
import { Avatar } from './Avatar';
import { Hemicycle, VOTE_COLORS, VOTE_NAMES } from './Charts';
import { Empty, Sheet } from './common';
import { LawBook } from './Issues';
import { ISSUES } from '../engine/data/issues';
import { coalitionMood, lawEffects, lawSectors, requiredMajority, strikeChance } from '../engine/systems/issues';
import { TRANSFORM_INFO, TRANSFORM_LEVELS } from '../engine/data/transforms';
import { hasTransform, publicSupport } from '../engine/systems/transforms';
import { billBlocked, constitutionReferendum } from '../engine/systems/regime';
import { radicalClimate } from '../engine/systems/climate';

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
  const ultBlock = ultimatumBlocked(g, b);
  const appealBlock = appealBlocked(g, b);
  const pressure = cabinetBlock(g, b);
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
        {pressure && (
          <div className="card small" style={{ background: 'var(--bg)' }} data-testid="cabinet-pressure">
            <b>🚫 {pressure === 'before' ? 'ועדת השרים צפויה להתנגד' : pressure === 'fell' ? 'ההצעה נפלה בגלל התנגדות הממשלה' : 'ועדת השרים חוסמת את ההצעה'}</b>
            <div className="muted">
              {pressure === 'before' ? 'לפי הרכב הממשלה, ההצעה תיתקל בהתנגדות.' : pressure === 'fell' ? (b.cabinetRejected ? 'ההצעה הממשלתית נגנזה.' : 'הקואליציה הצביעה נגד.') + ' הצלחה תחזיר אותה למסלול.' : 'הקואליציה תצביע נגד – כמעט אין סיכוי בקריאה הטרומית.'} אפשר ללחוץ:
            </div>
            {!pressureRole(g) && <div className="tiny faint" style={{ marginTop: 4 }}>{g.coalition.pmId === 'player' ? 'כראש הממשלה – ועדת השרים כבר בצד שלך.' : 'מהאופוזיציה אין מנוף על הממשלה. נסה/י לגייס תומכים בספירת הקולות, או להגיש מחדש בהיקף מתון.'}</div>}
            {!ultBlock && (
              <button
                className="btn danger block"
                style={{ marginTop: 6 }}
                onClick={() => {
                  const r = act((s) => issueUltimatum(s, s.bills.find((x) => x.id === id)!));
                  toast(r.text, r.ok ? 'good' : 'bad');
                }}
              >
                😤 אולטימטום: "{pressureRole(g) === 'leader' ? 'בלי החוק – אנחנו פורשים' : pressureRole(g) === 'minister' ? 'בלי החוק – אני מתפטר/ת' : 'בלי החוק – אני מצביע/ה נגד הקואליציה'}" (הון 3 · סיכוי {Math.round(ultimatumChance(g, b) * 100)}%)
              </button>
            )}
            {ultBlock && <div className="tiny faint" style={{ marginTop: 4 }}>אולטימטום: {ultBlock}</div>}
            {!appealBlock && (
              <button
                className="btn block"
                style={{ marginTop: 6 }}
                onClick={() => {
                  const r = act((s) => appealToGovernment(s, s.bills.find((x) => x.id === id)!));
                  toast(r.text, r.ok ? 'good' : 'bad');
                }}
              >
                ⚖️ ערר למליאת הממשלה (⏱1 · סיכוי {Math.round(appealChance(g, b) * 100)}%)
              </button>
            )}
            {pressureRole(g) === 'leader' && <div className="tiny muted" style={{ marginTop: 4 }}>ואם נמאס – משרד ראש הממשלה ← ניהול הקואליציה ← לפרוש.</div>}
          </div>
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
  const closeSheet = useStore((s) => s.close);
  const b = g.bills.find((x) => x.id === id);
  const f = useMemo(() => (b ? forecast(g, b) : null), [g, b]);
  if (!b || !f) return null;
  const block = canBringToVote(g, b);
  const lobby = (npcId: string, m: LobbyMethod) => {
    const r = act((s) => lobbyMK(s, s.bills.find((x) => x.id === id)!, npcId, m));
    toast(r.text, r.ok ? 'good' : 'bad');
  };
  const vote = () => {
    act((s) => startVote(s, s.bills.find((x) => x.id === id)!, 'own'));
    closeSheet();
  };
  const probs = f.seats.map((x) => (x ? x.pFor / Math.max(0.01, x.pFor + x.pAgainst) : null));
  const margin = f.eFor - f.eAgainst;
  const maj = b.stage === 'final' ? requiredMajority(g, b.templateId) : null;
  const verdict = maj ? f.eFor - maj : margin;

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
  ['welfare', 'בריאות ורווחה'],
  ['religion', 'דת ומדינה'],
  ['society', 'חברה'],
  ['security', 'ביטחון'],
  ['governance', 'ממשל'],
  ['basic', 'חוקי יסוד'],
  ['radical', '🌋 מהפכות'],
];

/** תגיות לשורת חוק: למה כדאי (או אי אפשר) להגיש אותו עכשיו */
function lawTags(g: GameState, id: string): { text: string; cls: string }[] {
  const t = templateById(id);
  const out: { text: string; cls: string }[] = [];
  if (billBlocked(g, id)) out.push({ text: '🚫 חסום', cls: 'bad' });
  if (t.issue && g.issues[t.issue] >= 60 && !t.inflames) out.push({ text: '🔥 סוגיה בוערת', cls: 'gold' });
  if (t.issue && g.issues[t.issue] >= 60 && t.inflames) out.push({ text: '⚠️ ילבה מחאות', cls: 'warn' });
  if (Object.keys(t.lean).length && leanAlignment(g.player.ideology, t.lean) >= 0.55) out.push({ text: '⭐ בקו שלך', cls: 'good' });
  if (t.basic) out.push({ text: `🏛️ חוק יסוד ${requiredMajority(g, id)}`, cls: '' });
  if (t.referendum) out.push({ text: '🗳️ משאל עם', cls: '' });
  if (t.rule) out.push({ text: '📜 משנה כללים', cls: '' });
  return out.slice(0, 3);
}

function Section({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="fold" open={open}>
      <summary>{title}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

export function BillBuilder() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const close = useStore((s) => s.close);
  const open = useStore((s) => s.open);
  const toast = useStore((s) => s.toast);
  const canGov = !!g.player.ministry || g.coalition.pmId === 'player';
  const [gov, setGov] = useState(canGov);
  const [tid, setTid] = useState<string | null>(null);
  const [scope, setScope] = useState<1 | 2 | 3>(2);
  const [query, setQuery] = useState('');
  const visible = BILL_TEMPLATES.filter((x) => !x.hidden);
  const hot = visible.filter((x) => x.issue && g.issues[x.issue] >= 60 && !x.inflames && !x.radical && !billBlocked(g, x.id)).sort((a, b) => g.issues[b.issue!] - g.issues[a.issue!]);
  const [cat, setCat] = useState<string>(hot.length ? 'hot' : 'economy');
  const role = legislativeRole(g);

  const q = query.trim();
  const list = q
    ? visible.filter((x) => `${x.title} ${x.summary}`.includes(q))
    : cat === 'hot'
      ? hot.slice(0, 10)
      : visible.filter((x) => x.category === cat);

  useEffect(() => {
    document.querySelectorAll('.sheet, .sheet-body').forEach((el) => el.scrollTo?.({ top: 0 }));
  }, [tid]);
  const sub = role.sponsor && role.sponsor !== 'player' ? `בשם ${g.npcs[role.sponsor].name}` : gov ? 'הצעת חוק ממשלתית' : 'הצעת חוק פרטית';
  if (!tid) {
    return (
      <Sheet title="✍️ ניסוח הצעת חוק" sub={sub}>
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
        <input className="text-input" placeholder="🔍 חיפוש חוק (למשל: דיור, שבת, מס)" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="bill-search" />
        {!q && (
          <div className="chip-grid" style={{ margin: '10px 0' }}>
            {hot.length > 0 && (
              <button className={cat === 'hot' ? 'on' : ''} onClick={() => setCat('hot')}>
                🔥 בוער עכשיו
              </button>
            )}
            {CATEGORIES.map(([id, label]) => (
              <button key={id} className={cat === id ? 'on' : ''} onClick={() => setCat(id)}>
                {label}
              </button>
            ))}
          </div>
        )}
        {q && <div className="tiny muted" style={{ margin: '8px 0' }}>{list.length} תוצאות</div>}
        {cat === 'hot' && !q && <div className="tiny muted" style={{ marginBottom: 6 }}>סוגיות שהציבור כועס עליהן ועוד לא נחקק בהן חוק – הזדמנות לקרדיט.</div>}
        {list.length === 0 && <Empty>לא נמצאו חוקים.</Empty>}
        {list.map((x) => {
          const tags = lawTags(g, x.id);
          return (
            <button key={x.id} className="list-item law-row" onClick={() => { setTid(x.id); setScope(2); }}>
              <span style={{ fontSize: 24 }}>{x.icon}</span>
              <div className="grow" style={{ textAlign: 'start' }}>
                <div style={{ fontWeight: 700 }}>{x.title}</div>
                <div className="tiny muted law-sum">{x.summary}</div>
                {tags.length > 0 && (
                  <div className="chips" style={{ marginTop: 4 }}>
                    {tags.map((tg) => (
                      <span key={tg.text} className={`chip ${tg.cls}`}>
                        {tg.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="muted">‹</span>
            </button>
          );
        })}
      </Sheet>
    );
  }

  return (
    <Sheet title={`${templateById(tid).icon} ${templateById(tid).title}`} sub={sub}>
      <BillDetails tid={tid} scope={scope} setScope={setScope} gov={gov} back={() => setTid(null)} close={close} open={open} toast={toast} act={act} />
    </Sheet>
  );
}

function BillDetails({ tid, scope, setScope, gov, back, close, open, toast, act }: {
  tid: string;
  scope: 1 | 2 | 3;
  setScope: (s: 1 | 2 | 3) => void;
  gov: boolean;
  back: () => void;
  close: () => void;
  open: ReturnType<typeof useStore.getState>['open'];
  toast: ReturnType<typeof useStore.getState>['toast'];
  act: ReturnType<typeof useStore.getState>['act'];
}) {
  const g = useGame();
  const t = templateById(tid);
  const role = legislativeRole(g);
  const blocked = billBlocked(g, tid);
  const effects = lawEffects(tid, scope);
  const stirs = Object.entries(t.stirs ?? {});
  const partners = coalitionMood(g, tid, scope);
  const need = t.basic ? requiredMajority(g, tid) ?? 61 : 61;

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

  const odds = preview.eFor >= need ? 'good' : preview.eFor >= need - 12 ? 'warn' : 'bad';
  const oddsText = odds === 'good' ? 'סיכוי טוב' : odds === 'warn' ? 'צריך לגייס עוד' : 'קשה מאוד';

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
    <>
      <button className="btn sm" onClick={back} style={{ marginBottom: 8 }}>
        ‹ חזרה לרשימת החוקים
      </button>
      <p className="small" style={{ marginTop: 0 }}>{t.summary}</p>
      <div className="chips" style={{ marginBottom: 10 }}>
        {t.issue && (
          <span className={`chip ${g.issues[t.issue] >= 60 ? 'bad' : ''}`}>
            {ISSUES.find((i) => i.id === t.issue)!.icon} {ISSUES.find((i) => i.id === t.issue)!.name} ({Math.round(g.issues[t.issue])})
          </span>
        )}
        {t.basic && <span className="chip gold">חוק יסוד: רוב של {requiredMajority(g, t.id)}</span>}
        {t.rule && <span className="chip gold">משנה את כללי המשחק</span>}
        {t.petitionRisk ? <span className="chip warn">סיכון פסילה: {Math.round(strikeChance(g, t.id) * 100)}%</span> : null}
        {(t.referendum || constitutionReferendum(g, t.id)) && <span className="chip gold">משאל עם · סקר {publicSupport(g, t.id)}% בעד</span>}
      </div>
      {blocked && (
        <p className="small bad" data-testid="bill-blocked">
          🚫 {blocked}
        </p>
      )}

      <div className="card">
        <div className="small muted" style={{ marginBottom: 6 }}>היקף ההצעה</div>
        <div className="seg">
          {([1, 2, 3] as const).map((sc) => (
            <button key={sc} className={scope === sc ? 'on' : ''} onClick={() => setScope(sc)}>
              {['מתון', 'בינוני', 'מרחיק לכת'][sc - 1]}
            </button>
          ))}
        </div>
        <p className="tiny gold" style={{ margin: '6px 0 0' }}>{t.scopes[scope - 1]}</p>
        <p className="tiny muted" style={{ margin: '2px 0 0' }}>היקף רחב = השפעה גדולה ויותר מתנגדים (×{SCOPE_FACTOR[scope]}).</p>
      </div>

      <div className="card" data-testid="bill-odds">
        <div className="spread">
          <b>סיכוי לעבור (טרומית)</b>
          <span className={`chip ${odds}`}>{oddsText}</span>
        </div>
        <div className="odds-bar">
          <i style={{ width: `${Math.min(100, (preview.eFor / 120) * 100)}%` }} className="for" />
          <i style={{ width: `${Math.min(100, (preview.eAgainst / 120) * 100)}%` }} className="against" />
          <span className="need" style={{ insetInlineStart: `${(need / 120) * 100}%` }} />
        </div>
        <div className="spread tiny">
          <span className="good">{Math.round(preview.eFor)} בעד</span>
          <span className="muted">דרוש {need}</span>
          <span className="bad">{Math.round(preview.eAgainst)} נגד</span>
        </div>
        <div className="small" style={{ marginTop: 6 }}>
          {gov ? 'ועדת השרים (ממשלתית):' : 'ועדת השרים צפויה:'} <b className={preview.gov === 'support' ? 'good' : preview.gov === 'oppose' ? 'bad' : 'warn'}>{GOV_POS_NAMES[preview.gov!]}</b>
        </div>
      </div>

      {t.radical && (
        <div className="card small" data-testid="radical-info">
          <b>🌋 הצעה מרחיקת לכת</b>
          <div className="muted">אין משמעת קואליציונית: כל ח"כ מצביע לפי המצפון והפחד מההשלכות. כמעט אין סיכוי שתעבור.</div>
          <div style={{ marginTop: 6 }}>
            <b>אם תעבור{t.referendum ? ' ותאושר במשאל עם' : ''}:</b> {TRANSFORM_INFO[t.radical].now}
          </div>
          <div className="gold" style={{ marginTop: 6 }} data-testid="radical-level">
            <b>ברמה שבחרת ({['מתון', 'בינוני', 'מרחיק לכת'][scope - 1]}):</b> {TRANSFORM_LEVELS[t.radical][scope - 1]}
          </div>
          {(() => {
            const c = radicalClimate(g, t.id);
            return (
              <div style={{ marginTop: 8 }} data-testid="radical-climate">
                <b>🌡️ אקלים פוליטי: {c.bonus >= 0.55 ? 'הרעיון באוויר!' : c.bonus >= 0.25 ? 'פתוח לדיון' : 'קר'}</b>
                <div className="count-bar">
                  <i style={{ width: `${Math.round(c.bonus * 100)}%` }} />
                </div>
                {c.reasons.length ? c.reasons.map((r) => <div key={r} className="tiny">• {r}</div>) : <div className="tiny muted">כדי שזה יקרה צריך ממשלה שתומכת ברעיון, קואליציה רחבה, או "חלון הזדמנויות" אחרי זעזוע (מלחמה, מחדל, משבר, מחאה).</div>}
              </div>
            );
          })()}
          {hasTransform(g, t.radical) && <div className="gold">השינוי הזה כבר בתוקף.</div>}
        </div>
      )}

      <Section title="🌍 מה זה ישנה במדינה">
        <div className="small muted" style={{ marginBottom: 6 }}>בהדרגה, החל מ-{t.delay} שבועות אחרי</div>
        <div className="chips">
          {Object.entries(t.world).map(([k, v]) => (
            <span key={k} className={`chip ${v! > 0 ? 'good' : 'bad'}`}>
              {WORLD_NAMES[k as WorldKey]} {v! > 0 ? '+' : ''}
              {(v! * preview.impact).toFixed(1)}
            </span>
          ))}
          <span className="chip">{t.cost < 0 ? `חיסכון/הכנסה: ${(-t.cost * SCOPE_FACTOR[scope]).toFixed(1)}` : `עלות: ${(t.cost * SCOPE_FACTOR[scope]).toFixed(1)}`} מיליארד ₪</span>
        </div>
      </Section>

      {(effects.length > 0 || t.inflames || stirs.length > 0) && (
        <Section title="⚖️ הצד השני של המטבע">
          <div data-testid="bill-tradeoffs">
            {effects.map((e, i) => (
              <div key={i} className="small" style={{ marginBottom: 4 }}>
                <span className={e.d > 0 ? 'good' : 'bad'}>
                  {e.d > 0 ? '▲' : '▼'} {WORLD_NAMES[e.key]} {e.d > 0 ? '+' : ''}
                  {(e.d * preview.impact).toFixed(1)}
                </span>{' '}
                <span className="muted">
                  · {e.note} ({(e.delay ?? 0) <= 2 ? 'מיד' : `אחרי ${e.delay} שבועות`}
                  {e.from === 3 ? ' · רק בהיקף מרחיק לכת' : e.from === 2 ? ' · מהיקף בינוני ומעלה' : ''})
                </span>
              </div>
            ))}
            {t.inflames && t.issue && <div className="small bad">🔥 מלבה את הסוגיה "{ISSUES.find((i) => i.id === t.issue)!.name}" – צפויות מחאות</div>}
            {stirs.map(([id, d]) => (
              <div key={id} className={`small ${d! > 0 ? 'bad' : 'good'}`}>
                {d! > 0 ? '🔥 מלבה' : '🧯 מרגיע'} את "{ISSUES.find((i) => i.id === id)!.name}"
              </div>
            ))}
          </div>
        </Section>
      )}

      {partners.length > 0 && (
        <Section title="🤝 איך תגיב הקואליציה">
          <div className="small" data-testid="bill-partners">
            {partners.map(({ id, d }) => (
              <span key={id} className={`chip ${d > 0 ? 'good' : 'bad'}`} style={{ marginInlineEnd: 4 }}>
                {g.parties[id].short} {d > 0 ? '😊' : '😠'}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="🪞 איך זה ישפיע על התדמית שלך" open={false}>
        <div className="chips">
          {Object.entries(lawSectors(t.id, scope))
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <span key={k} className={`chip ${v! > 0 ? 'good' : 'bad'}`}>
                {SECTOR_NAMES[k as (typeof SECTORS)[number]]} {v! > 0 ? '+' : ''}
                {(v! * preview.impact).toFixed(1)}
              </span>
            ))}
        </div>
        {(t.scopeSectors ?? []).filter((x) => x.from <= scope).map((x) => (
          <p key={x.note} className="tiny warn" style={{ margin: '4px 0 0' }}>
            בהיקף הזה: {x.note}
          </p>
        ))}
      </Section>

      <div className="sticky-submit">
        <button className="btn primary block" onClick={submit} disabled={!role.canPropose || !!blocked}>
          להניח על שולחן הכנסת (⏱2)
        </button>
      </div>
    </>
  );
}
