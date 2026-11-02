import { useState } from 'react';
import { templateById } from '../engine/data/bills';
import { ISSUES } from '../engine/data/issues';
import { recentLaw } from '../engine/systems/issues';
import { useGame, useStore } from '../store';
import { REPEAL_COST, repealBlocked, repealByPlayer } from '../engine/systems/lawlife';
import { DRAFT_LABEL, worldFacts } from '../engine/systems/facts';

const heatColor = (v: number) => (v >= 65 ? 'var(--bad)' : v >= 45 ? 'var(--warn)' : 'var(--good)');

export function IssuesCard() {
  const g = useGame();
  const list = [...ISSUES].sort((a, b) => g.issues[b.id] - g.issues[a.id]);
  return (
    <div className="card">
      <div className="card-title">
        <h3>🔥 סוגיות בוערות</h3>
        <span className="tiny muted">מה מעסיק את הציבור</span>
      </div>
      {list.map((i) => {
        const v = g.issues[i.id];
        const tr = g.issueTrend[i.id] ?? 0;
        const solved = recentLaw(g, i.id);
        return (
          <div key={i.id} className="meter-row" title={i.blurb} style={{ gridTemplateColumns: '128px 1fr 46px' }}>
            <span className="ellipsis">
              {i.icon} {i.name}
            </span>
            <div className="bar">
              <i style={{ width: `${v}%`, background: heatColor(v) }} />
            </div>
            <b style={{ textAlign: 'end', fontSize: 12 }}>
              {solved ? '✅' : tr > 0.3 ? '▲' : tr < -0.3 ? '▼' : '•'}
              {Math.round(v)}
            </b>
          </div>
        );
      })}
      <StateLine />
      <p className="tiny muted" style={{ margin: '8px 0 0' }}>
        סוגיה בוערת = מחאות ואירועים. עמדה פומבית בסוגיה בוערת מזיזה את הציבור חזק יותר. חוק שעובר בנושא מקרר אותה (✅).
      </p>
    </div>
  );
}

/** המצב בשטח: מה בתוקף ומי בממשלה – זה מה שקובע אילו אירועים וכותרות יגיעו */
function StateLine() {
  const g = useGame();
  const f = worldFacts(g);
  const chips = [
    `🪖 גיוס: ${DRAFT_LABEL[f.draft]}`,
    f.haredimInGov ? '📜 החרדים בממשלה' : '📜 החרדים באופוזיציה',
    f.arabsInGov ? '🤝 מפלגה ערבית בממשלה' : null,
    `🏛️ ממשלת ${f.govLean === 'right' ? 'ימין' : f.govLean === 'left' ? 'שמאל' : 'מרכז'}`,
    f.courtActive ? (f.canOverride ? '⚖️ בג"ץ – עם פסקת התגברות' : '⚖️ בג"ץ פעיל') : '⚖️ בלי ביקורת שיפוטית',
    f.shabbatTransit ? '🚌 תחבורה בשבת' : null,
    f.civilMarriage ? '💍 נישואים אזרחיים' : null,
    f.coreStudies ? '📐 חובת ליבה' : null,
  ].filter(Boolean);
  return (
    <div className="chips" style={{ marginTop: 10 }} data-testid="state-facts">
      {chips.map((c) => (
        <span key={c} className="chip">
          {c}
        </span>
      ))}
    </div>
  );
}

export function LawBook() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const [armed, setArmed] = useState<string | null>(null);
  if (!g.lawsPassed.length) return null;
  const pm = g.coalition.pmId === 'player';
  // האם לשחקן יש בכלל סמכות לבטל חוקים (ראש ממשלה או יו"ר מפלגה בקואליציה)
  const canRepeal = pm || (!!g.player.partyId && g.parties[g.player.partyId]?.leaderId === 'player' && g.coalition.parties.includes(g.player.partyId));
  return (
    <>
      <div className="section-label">📚 ספר החוקים – מה עבר בכנסת הזו ובקודמות</div>
      <div className="card" data-testid="lawbook">
        {canRepeal && <div className="tiny muted" style={{ marginBottom: 6 }}>✂️ ביטול חוק: {pm ? `${REPEAL_COST.pm} הון – עובר במשמעת קואליציונית` : `${REPEAL_COST.partner} הון – רק אם ראש הממשלה יסכים`}. השותפות מגיבות לפי עמדתן.</div>}
        {[...g.lawsPassed].reverse().map((l, i) => {
          const t = templateById(l.templateId);
          const who = l.sponsor === 'player' ? 'שלך' : l.sponsor === 'history' ? 'בתוקף מהפתיחה' : l.coSponsor ? 'שותפות שלך' : g.npcs[l.sponsor]?.name ?? '';
          const latest = !g.lawsPassed.slice(g.lawsPassed.length - i).some((x) => x.templateId === l.templateId);
          const blocked = canRepeal && !l.struck && latest ? repealBlocked(g, l.templateId) : null;
          return (
            <div key={i} className="spread small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', opacity: l.struck ? 0.55 : 1, gap: 8 }}>
              <span>
                {t.icon} {l.title} {t.basic && <span className="chip gold">חוק יסוד</span>} {l.struck && <span className="chip bad">{l.repealed ? 'בוטל בכנסת' : 'נפסל בבג"ץ'}</span>}
              </span>
              <span className="row" style={{ gap: 6, flexShrink: 0 }}>
                <span className="tiny muted">{who}</span>
                {canRepeal && !l.struck && latest && !t.radical && (
                  armed === l.templateId ? (
                    <button className="btn sm danger" onClick={() => { const r = act((s) => repealByPlayer(s, l.templateId)); toast(r.text, r.ok ? 'neutral' : 'bad'); setArmed(null); }}>
                      לבטל?
                    </button>
                  ) : (
                    <button className="btn sm ghost" disabled={!!blocked} title={blocked ?? undefined} onClick={() => setArmed(l.templateId)} data-testid={`repeal-${l.templateId}`}>
                      ✂️
                    </button>
                  )
                )}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
