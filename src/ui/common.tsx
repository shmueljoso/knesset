import type { ReactNode } from 'react';
import type { OpChip } from '../engine/ops';
import type { Party } from '../engine/types';
import { useStore } from '../store';

export function Sheet({ title, sub, icon, children, onClose }: { title: ReactNode; sub?: ReactNode; icon?: ReactNode; children: ReactNode; onClose?: () => void }) {
  const close = useStore((s) => s.close);
  const doClose = onClose ?? close;
  return (
    <>
      <div className="backdrop" onClick={doClose} />
      <div className="sheet" role="dialog">
        <div className="sheet-head">
          <div className="sheet-grip" />
          <div className="row">
            {icon}
            <div className="grow">
              <h2>{title}</h2>
              {sub && <div className="small muted">{sub}</div>}
            </div>
            <button className="icon-btn" onClick={doClose} aria-label="סגירה">
              ✕
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}

export function Chips({ chips }: { chips: OpChip[] }) {
  if (!chips.length) return null;
  return (
    <div className="chips">
      {chips.map((c, i) => (
        <span key={i} className={`chip ${c.tone === 'good' ? 'good' : c.tone === 'bad' ? 'bad' : ''}`}>
          {c.label}
        </span>
      ))}
    </div>
  );
}

export function PartyTag({ party, short }: { party?: Party | null; short?: boolean }) {
  if (!party) return <span className="small muted">ללא מפלגה</span>;
  return (
    <span className="row small" style={{ gap: 6, display: 'inline-flex' }}>
      <span className="party-dot" style={{ background: party.color }} />
      {short ? party.short : party.name}
    </span>
  );
}

export function Meter({ label, value, max = 100, color, suffix }: { label: ReactNode; value: number; max?: number; color?: string; suffix?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter-row">
      <span className="ellipsis">{label}</span>
      <div className="bar">
        <i style={{ width: `${pct}%`, background: color ?? 'var(--accent)' }} />
      </div>
      <b style={{ textAlign: 'end' }}>
        {Math.round(value)}
        {suffix}
      </b>
    </div>
  );
}

export function Delta({ v, digits = 0, invert }: { v: number; digits?: number; invert?: boolean }) {
  if (Math.abs(v) < (digits ? 0.05 : 0.5)) return <span className="delta faint">±0</span>;
  const good = invert ? v < 0 : v > 0;
  return <span className={`delta ${good ? 'good' : 'bad'}`}>{v > 0 ? '▲' : '▼'} {Math.abs(v).toFixed(digits)}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card muted small" style={{ textAlign: 'center' }}>{children}</div>;
}
