import { useMemo, useState } from 'react';
import type { VoteResult } from '../engine/types';
import { useGame } from '../store';

// ---------- מליאה: 120 מושבים בחצי עיגול ----------
const ROWS = 6;
function seatPositions() {
  const radii = Array.from({ length: ROWS }, (_, i) => 52 + i * 15);
  const total = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.round((r / total) * 120));
  counts[ROWS - 1] += 120 - counts.reduce((a, b) => a + b, 0);
  const seats: { x: number; y: number; a: number }[] = [];
  radii.forEach((r, i) => {
    for (let k = 0; k < counts[i]; k++) {
      const a = Math.PI - (k / (counts[i] - 1)) * Math.PI;
      seats.push({ x: 150 + r * Math.cos(a), y: 140 - r * Math.sin(a), a });
    }
  });
  return seats.sort((p, q) => q.a - p.a);
}

export const VOTE_COLORS = { for: '#4ade80', against: '#f87171', abstain: '#fbbf24', absent: 'transparent' };
export const VOTE_NAMES = { for: 'בעד', against: 'נגד', abstain: 'נמנע', absent: 'נעדר' };

export function Hemicycle({ votes, probs, onSeat }: { votes?: VoteResult['seats']; probs?: (number | null)[]; onSeat?: (id: string) => void }) {
  const g = useGame();
  const pos = useMemo(seatPositions, []);
  const [hover, setHover] = useState<number | null>(null);
  const label = (i: number) => {
    const id = g.seating[i];
    if (!id) return '';
    if (id === 'player') return `${g.player.name} (את/ה)`;
    const n = g.npcs[id];
    return `${n.name}${n.partyId ? ' · ' + g.parties[n.partyId].short : ''}`;
  };
  const coalSeats = g.coalition.parties.reduce((a, p) => a + (g.parties[p]?.seats ?? 0), 0);
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox="0 0 300 166" style={{ width: '100%', display: 'block' }} role="img" aria-label="מושבי המליאה">
        {pos.map((s, i) => {
          const id = g.seating[i];
          let fill = '#334155';
          let stroke = 'var(--bg2)';
          if (votes) {
            const v = votes[i];
            fill = VOTE_COLORS[v];
            if (v === 'absent') stroke = '#475569';
          } else if (probs) {
            const p = probs[i];
            fill = p === null ? '#e8c37a' : p > 0.65 ? VOTE_COLORS.for : p < 0.35 ? VOTE_COLORS.against : '#94a3b8';
          } else if (id) {
            const partyId = id === 'player' ? g.player.partyId : g.npcs[id]?.partyId;
            fill = partyId ? g.parties[partyId].color : '#64748b';
          }
          const isPlayer = id === 'player';
          return (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={hover === i ? 6.5 : 5}
              fill={fill}
              stroke={isPlayer ? '#e8c37a' : stroke}
              strokeWidth={isPlayer ? 2.5 : 1.5}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onClick={() => id && id !== 'player' && onSeat?.(id)}
              style={{ cursor: onSeat ? 'pointer' : 'default' }}
            />
          );
        })}
        {!votes && !probs && (
          <text x="150" y="161" textAnchor="middle" fontSize="12" fill="var(--muted)" fontFamily="Heebo">
            קואליציה {coalSeats} · אופוזיציה {120 - coalSeats}
          </text>
        )}
      </svg>
      {hover !== null && (
        <div className="pill small" style={{ position: 'absolute', top: 0, insetInlineStart: 0 }}>
          {label(hover)}
        </div>
      )}
    </div>
  );
}

export function HemicycleLegend() {
  const g = useGame();
  const parties = Object.values(g.parties).filter((p) => p.seats > 0).sort((a, b) => b.seats - a.seats);
  return (
    <div className="chips" style={{ marginTop: 8 }}>
      {parties.map((p) => (
        <span key={p.id} className="chip" style={{ color: 'var(--text)', fontWeight: p.id === g.player.partyId ? 800 : 400 }}>
          <span className="party-dot" style={{ background: p.color, marginInlineEnd: 5 }} />
          {p.short} {p.seats}
          {g.coalition.parties.includes(p.id) ? ' ★' : ''}
        </span>
      ))}
    </div>
  );
}

// ---------- גרף קווים עם ריחוף ----------
export interface Series {
  name: string;
  color: string;
  values: number[];
  bold?: boolean;
}

export function LineChart({ series, xLabels, yMax, unit = '', height = 170 }: { series: Series[]; xLabels: string[]; yMax: number; unit?: string; height?: number }) {
  const W = 320;
  const H = height;
  const padL = 26;
  const padR = 56;
  const padT = 10;
  const padB = 20;
  const n = xLabels.length;
  const [hi, setHi] = useState<number | null>(null);
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - v / yMax) * (H - padT - padB);
  const ticks = [0, yMax / 2, yMax].map((v) => Math.round(v));
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - padL) / (W - padL - padR)) * (n - 1));
    setHi(Math.max(0, Math.min(n - 1, i)));
  };
  // תוויות ישירות בקצה, עם הזזה למניעת התנגשות
  const ends = series
    .map((s) => ({ s, yy: y(s.values[s.values.length - 1] ?? 0) }))
    .sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 11) ends[i].yy = ends[i - 1].yy + 11;

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', direction: 'ltr', touchAction: 'pan-y' }} onPointerMove={onMove} onPointerLeave={() => setHi(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" strokeDasharray={t ? '2 4' : undefined} />
            <text x={padL - 5} y={y(t) + 4} fontSize="10" textAnchor="end" fill="var(--faint)" fontFamily="Heebo">
              {t}
            </text>
          </g>
        ))}
        <text x={padL} y={H - 4} fontSize="10" fill="var(--faint)" fontFamily="Heebo">
          {xLabels[0]}
        </text>
        <text x={W - padR} y={H - 4} fontSize="10" fill="var(--faint)" textAnchor="end" fontFamily="Heebo">
          {xLabels[n - 1]}
        </text>
        {series.map((s) => (
          <polyline
            key={s.name}
            points={s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={s.bold ? 3 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {ends.map(({ s, yy }) => (
          <g key={s.name}>
            <circle cx={x(n - 1)} cy={y(s.values[s.values.length - 1] ?? 0)} r="3.5" fill={s.color} stroke="var(--panel)" strokeWidth="2" />
            <text x={x(n - 1) + 7} y={yy + 4} fontSize="10.5" fill="var(--text)" fontFamily="Heebo" fontWeight={s.bold ? 800 : 500}>
              {s.name}
            </text>
          </g>
        ))}
        {hi !== null && (
          <g>
            <line x1={x(hi)} x2={x(hi)} y1={padT} y2={H - padB} stroke="var(--muted)" strokeWidth="1" />
            {series.map((s) => (
              <circle key={s.name} cx={x(hi)} cy={y(s.values[hi] ?? 0)} r="4" fill={s.color} stroke="var(--panel)" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {hi !== null && (
        <div className="pill tiny" style={{ position: 'absolute', top: 0, insetInlineEnd: 0, lineHeight: 1.5 }}>
          <b>{xLabels[hi]}</b>
          {[...series]
            .sort((a, b) => (b.values[hi] ?? 0) - (a.values[hi] ?? 0))
            .map((s) => (
              <div key={s.name} className="row" style={{ gap: 5 }}>
                <span className="party-dot" style={{ background: s.color, width: 8, height: 8 }} />
                {s.name}: {Math.round(s.values[hi] ?? 0)}
                {unit}
              </div>
            ))}
        </div>
      )}
      <div className="chips" style={{ marginTop: 6 }}>
        {series.map((s) => (
          <span key={s.name} className="chip" style={{ color: 'var(--text)' }}>
            <span className="party-dot" style={{ background: s.color, marginInlineEnd: 5 }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
