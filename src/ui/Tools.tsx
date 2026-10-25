import { useState } from 'react';
import { SKIP_OPTIONS, editFields, setEdit, skipWeeks } from '../engine/systems/tools';
import { useGame, useStore } from '../store';
import { Sheet } from './common';

/** כלים מתקדמים: דילוג על שבועות ועריכת מספרים – עם אזהרה ברורה */
export function ToolsSheet() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const [ok, setOk] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const fields = editFields(g);
  const groups = [...new Set(fields.map((f) => f.group))];
  const open = group ?? groups[0];
  return (
    <Sheet title="🛠️ כלים מתקדמים" sub="דילוג על זמן ועריכת מספרים">
      <div className="card" style={{ borderColor: 'var(--bad)' }} data-testid="tools-warning">
        <b className="bad">⚠️ אזהרה</b>
        <p className="small" style={{ margin: '6px 0' }}>
          הכלים האלה משנים את המשחק מעבר לכללים: דילוג מקבל החלטות <b>במקומך</b> (בלי מזל, ולפעמים לרעתך), ועריכה מזיזה מספרים ישירות. אי אפשר לבטל. השמירה מסומנת כ"נערכה".
        </p>
        <label className="small row" style={{ gap: 8 }}>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} data-testid="tools-ack" />
          הבנתי, אני רוצה להמשיך
        </label>
      </div>

      <div style={{ opacity: ok ? 1 : 0.4, pointerEvents: ok ? 'auto' : 'none' }}>
        <div className="section-label">⏩ דילוג על שבועות</div>
        <div className="card small">
          <div className="muted">עובר שבוע אחרי שבוע ומחליט בשבילך באירועים (הבחירה הראשונה שלא תלויה במזל). נעצר לפני בחירות, משא ומתן קואליציוני וסוף משחק.</div>
          <div className="filter-row" style={{ marginTop: 8 }}>
            {SKIP_OPTIONS.map((n) => (
              <button
                key={n}
                data-testid={`skip-${n}`}
                onClick={() => {
                  const r = act((s) => skipWeeks(s, n));
                  toast(`דילגת על ${r.weeks} שבועות${r.events ? ` (${r.events} אירועים הוכרעו)` : ''}${r.stopped ? ` · נעצר: ${r.stopped}` : ''}`, r.weeks ? 'good' : 'bad');
                }}
              >
                {n === 1 ? 'שבוע' : n === 4 ? 'חודש' : n === 13 ? 'רבעון' : n === 26 ? 'חצי שנה' : 'שנה'}
              </button>
            ))}
          </div>
          {g.flags.skippedWeeks ? <div className="tiny faint" style={{ marginTop: 6 }}>דילגת עד עכשיו על {String(g.flags.skippedWeeks)} שבועות.</div> : null}
        </div>

        <div className="section-label">✏️ עריכת מספרים</div>
        <div className="filter-row">
          {groups.map((x) => (
            <button key={x} className={open === x ? 'on' : ''} onClick={() => setGroup(x)}>
              {x.split(' (')[0]}
            </button>
          ))}
        </div>
        <div className="card" data-testid="edit-fields">
          <div className="small gold" style={{ marginBottom: 6 }}>{open}</div>
          {fields
            .filter((f) => f.group === open)
            .map((f) => (
              <div key={f.id} className="spread small" style={{ padding: '4px 0', gap: 8 }}>
                <span>{f.label}</span>
                <input
                  key={`${f.id}:${f.get(g)}`}
                  data-testid={`edit-${f.id}`}
                  type="number"
                  step="any"
                  defaultValue={f.get(g)}
                  min={f.min}
                  max={f.max}
                  style={{ width: 90, textAlign: 'end' }}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== f.get(g)) act((s) => setEdit(s, f.id, v));
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              </div>
            ))}
          <p className="tiny faint" style={{ margin: '6px 0 0' }}>ההזנה נשמרת ביציאה מהשדה. טווח מותר: מוגבל לכל שדה.</p>
        </div>
      </div>
    </Sheet>
  );
}
