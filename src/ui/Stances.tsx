import { useState } from 'react';
import { STEP_SIZES, changeStance, stanceBlocked, stancePreview } from '../engine/systems/stances';
import type { Axis } from '../engine/types';
import { AXES, AXIS_NAMES } from '../engine/util';
import { useGame, useStore } from '../store';
import { Sheet } from './common';

const pos = (v: number) => `${((v + 100) / 200) * 100}%`;

/** הציר: איפה את/ה, איפה המפלגה שלך, ואיפה תהיה/י אחרי השינוי */
function AxisBar({ axis, preview }: { axis: Axis; preview?: number }) {
  const g = useGame();
  const party = g.player.partyId ? g.parties[g.player.partyId] : null;
  const [, low, high] = AXIS_NAMES[axis];
  return (
    <div style={{ margin: '8px 0 4px' }}>
      <div className="axis" style={{ position: 'relative' }}>
        {party && <span className="mark" style={{ left: pos(party.ideology[axis]), background: party.color, opacity: 0.85 }} title={party.name} />}
        <span className="mark" style={{ left: pos(g.player.ideology[axis]) }} />
        {preview !== undefined && <span className="mark" style={{ left: pos(preview), background: 'var(--gold)' }} />}
      </div>
      <div className="spread tiny muted" style={{ marginTop: 4 }}>
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

/** "שיניתי את דעתי": הודעה פומבית על שינוי עמדה, עם המחיר לפני שמחליטים */
export function StancesSheet() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const [sel, setSel] = useState<{ axis: Axis; delta: number } | null>(null);
  const p = g.player;
  const party = p.partyId ? g.parties[p.partyId] : null;
  return (
    <Sheet title="🧭 העמדות שלי" sub="להודיע בפומבי על שינוי עמדה – או לתת להצהרות שלך להזיז אותך לאט">
      <div className="card small">
        <div>
          ⚪ את/ה{party ? <> · <span style={{ color: party.color }}>●</span> {party.name}</> : ''} · <span className="gold">●</span> אחרי השינוי
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>
          עקביות: <b>{Math.round(p.consistency)}</b>. כל הצהרה פומבית (נאום, ראיון, אירוע) גם מזיזה אותך מעט לכיוונה. שינוי חד עולה בעקביות ובמוניטין, ותפנית מצד לצד מביאה כותרות.
        </div>
      </div>
      {AXES.map((axis) => {
        const blocked = stanceBlocked(g, axis);
        const active = sel?.axis === axis ? sel : null;
        const after = active ? Math.max(-100, Math.min(100, p.ideology[axis] + active.delta)) : undefined;
        const pv = active ? stancePreview(g, axis, active.delta) : null;
        return (
          <div key={axis} className="card" data-testid={`stance-${axis}`}>
            <div className="spread">
              <b>{AXIS_NAMES[axis][0]}</b>
              <span className="tiny muted">{Math.round(p.ideology[axis])}</span>
            </div>
            <AxisBar axis={axis} preview={after} />
            {blocked && blocked !== 'אין מספיק זמן השבוע' ? (
              <div className="tiny faint">{blocked}</div>
            ) : (
              <div className="filter-row" style={{ flexWrap: 'wrap' }}>
                {STEP_SIZES.map((n) => (
                  <button key={`l${n}`} className={active?.delta === -n ? 'on' : ''} onClick={() => setSel({ axis, delta: -n })}>
                    ← {AXIS_NAMES[axis][1]} {n}
                  </button>
                ))}
                {STEP_SIZES.map((n) => (
                  <button key={`h${n}`} className={active?.delta === n ? 'on' : ''} onClick={() => setSel({ axis, delta: n })}>
                    {AXIS_NAMES[axis][2]} {n} →
                  </button>
                ))}
              </div>
            )}
            {active && pv && (
              <div className="small" style={{ marginTop: 8 }}>
                <div>
                  עקביות <b className="bad">{pv.consistency}</b>
                  {pv.reputation ? <> · מוניטין <b className="bad">{pv.reputation}</b></> : null}
                  {pv.flip ? <> · <b className="gold">תפנית!</b></> : null}
                </div>
                {pv.party && <div className="muted tiny">{pv.party}</div>}
                <button
                  className="btn primary block"
                  style={{ marginTop: 8 }}
                  disabled={!!blocked}
                  data-testid="stance-confirm"
                  onClick={() => {
                    const r = act((s) => changeStance(s, axis, active.delta));
                    toast(r.text, r.ok ? 'good' : 'bad', r.lines);
                    setSel(null);
                  }}
                >
                  ⏱1 · להודיע בפומבי
                </button>
              </div>
            )}
          </div>
        );
      })}
    </Sheet>
  );
}

/** כרטיס בלוח: איפה את/ה עומד/ת, וכניסה לשינוי עמדות */
export function StancesCard() {
  const open = useStore((s) => s.open);
  return (
    <div className="card" data-testid="stances-card">
      <div className="card-title">
        <h3>🧭 העמדות שלי</h3>
        <button className="btn sm" onClick={() => open({ kind: 'stances' })} data-testid="open-stances">
          לשנות עמדה
        </button>
      </div>
      {AXES.map((axis) => (
        <div key={axis} className="tiny">
          <div className="spread">
            <span>{AXIS_NAMES[axis][0]}</span>
          </div>
          <AxisBar axis={axis} />
        </div>
      ))}
    </div>
  );
}
