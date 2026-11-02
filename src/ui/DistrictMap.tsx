import type { DistrictResult, GameState } from '../engine/types';
import { DISTRICTS } from '../engine/data/districts';
import { localLeader } from '../engine/systems/districts';

export interface MapTile {
  id: string;
  leader: string;
  /** מושבים לפי מפלגה במחוז (שיטה מחוזית) – אם יש */
  seats?: Record<string, number>;
  margin: number;
}

/** אריחים לקרטוגרמה: מי הוביל בכל מחוז (לפי המושבים שנקבעו בו, ואם אין – לפי אחוזי הקולות) */
export function tilesFrom(results: DistrictResult[] | Record<string, Record<string, number>>): MapTile[] {
  const arr: DistrictResult[] = Array.isArray(results) ? results : Object.entries(results).map(([id, shares]) => ({ id, shares, seats: {} }));
  return arr.map((r) => {
    const byVotes = localLeader(r.shares);
    const bySeats = Object.entries(r.seats).sort((a, b) => b[1] - a[1])[0];
    return { id: r.id, leader: bySeats ? bySeats[0] : byVotes.id, seats: Object.keys(r.seats).length ? r.seats : undefined, margin: byVotes.margin };
  });
}

/** קרטוגרמה סכמטית של ישראל: אריח לכל מחוז, צבוע בצבע המפלגה המובילה */
export function DistrictMap({ g, tiles, selected, home, onSelect }: { g: GameState; tiles: MapTile[]; selected?: string | null; home?: string; onSelect?: (id: string) => void }) {
  return (
    <div className="dmap-wrap">
      <IsraelBackdrop />
    <div className="dmap" data-testid="district-map">
      {DISTRICTS.map((d) => {
        const t = tiles.find((x) => x.id === d.id);
        const party = t ? g.parties[t.leader] : undefined;
        const color = party?.color ?? '#64748b';
        const total = t?.seats ? Object.values(t.seats).reduce((a, b) => a + b, 0) : 0;
        return (
          <button
            key={d.id}
            className={`dtile ${selected === d.id ? 'on' : ''}`}
            style={{ gridColumn: d.gx, gridRow: d.gy, borderColor: color, background: `${color}33` }}
            onClick={() => onSelect?.(d.id)}
            data-testid={`dtile-${d.id}`}
            aria-label={d.name}
          >
            <span className="dname">{home === d.id ? '🏠 ' : ''}{d.short}</span>
            <span className="dlead" style={{ color }}>
              {party?.short ?? '—'}
            </span>
            <span className="dsub">{total ? `${t!.seats![t!.leader] ?? 0}/${total}` : t ? `+${t.margin}` : ''}</span>
          </button>
        );
      })}
    </div>
      <span className="dm-sea-label">הים התיכון</span>
    </div>
  );
}

/** רקע מצויר: הים (עם גלים זזים), צורת הארץ, הכנרת, ים המלח והחוד של אילת */
function IsraelBackdrop() {
  return (
    <svg className="dm-bg" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="dmSea" x1="0" x2="1">
          <stop offset="0" stopColor="#0b3a66" />
          <stop offset="1" stopColor="#1565a8" />
        </linearGradient>
        <linearGradient id="dmLand" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2f5132" />
          <stop offset="0.55" stopColor="#5b5a35" />
          <stop offset="1" stopColor="#8a6b3c" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="140" fill="url(#dmSea)" />
      <g className="dm-waves" stroke="rgba(255,255,255,0.25)" strokeWidth="0.6" fill="none">
        {[10, 30, 50, 70, 90, 110].map((y) => (
          <path key={y} d={`M2 ${y} q2 -2 4 0 t4 0`} />
        ))}
      </g>
      <path
        d="M7 0 L100 0 L100 129 L72 129 L62 139 L58 139 L48 129 L10 129 L5 118 L6 104 L4 88 L6 72 L5 56 L7 40 L5 24 L7 10 Z"
        fill="url(#dmLand)"
        stroke="#c8b98a"
        strokeWidth="0.8"
      />
      <ellipse className="dm-lake" cx="96" cy="30" rx="2.4" ry="4.5" fill="#3b82f6" />
      <ellipse className="dm-lake" cx="98" cy="96" rx="1.8" ry="8" fill="#60a5fa" />
      <circle cx="60" cy="137" r="1.3" fill="#fbbf24" />
    </svg>
  );
}
