import { WHY_KEYS, WHY_LABEL, summarizeWhy } from '../engine/why';
import type { WhyEntry } from '../engine/types';
import { useGame } from '../store';
import { Sheet } from './common';

const fmt = (d: number) => `${d > 0 ? '+' : ''}${d.toFixed(1)}`;

/** פירוט "למה זה קרה": לכל מדד – מי הזיז אותו ובכמה */
export function WhyList({ items, compact }: { items: WhyEntry[]; compact?: boolean }) {
  const keys = WHY_KEYS.filter((k) => items.some((x) => x.k === k));
  if (!keys.length) return <p className="tiny muted" style={{ margin: 0 }}>שבוע שקט – שום דבר לא הזיז את המדדים שלך באופן משמעותי.</p>;
  return (
    <div className="why" data-testid="why-list">
      {keys.map((k) => {
        const rows = items.filter((x) => x.k === k);
        const net = rows.reduce((a, x) => a + x.d, 0);
        return (
          <div key={k} className="why-row">
            <div className="spread small">
              <b>{WHY_LABEL[k]}{k === 'poll' ? ' (%)' : ''}</b>
              <b className={net > 0.05 ? 'good' : net < -0.05 ? 'bad' : 'muted'}>{fmt(net)}</b>
            </div>
            <div className={compact ? 'why-chips compact' : 'why-chips'}>
              {rows.slice(0, compact ? 3 : 6).map((x) => (
                <span key={x.c} className={`chip ${x.d > 0 ? 'good' : 'bad'}`}>
                  {x.c} {fmt(x.d)}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** חלון "למה?": השבוע עד עכשיו, והשבוע שעבר */
export function WhySheet() {
  const g = useGame();
  const now = summarizeWhy(g, null, null);
  const last = g.report?.why ?? [];
  return (
    <Sheet title="❓ למה זה קרה?" sub="מי הזיז את המדדים שלך – פעולות, אירועים והשגרה השבועית">
      <div className="section-label" style={{ marginTop: 0 }}>
        השבוע עד עכשיו
      </div>
      <WhyList items={now} />
      {g.report && (
        <>
          <div className="section-label">שבוע {g.report.week + 1} (שעבר)</div>
          <WhyList items={last} />
        </>
      )}
      <p className="tiny faint" style={{ marginTop: 12 }}>
        הסקרים זזים כל שבוע 12% מהמרחק ל"יעד": הבסיס של המפלגה + התדמית שלך, רוח הציבור, הממשלה, הרכב האוכלוסייה והמומנטום. "תנועה של מפלגות אחרות" = כשאחרות עולות, האחוזים שלך יורדים גם בלי שעשית משהו.
      </p>
    </Sheet>
  );
}
