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
  );
}
