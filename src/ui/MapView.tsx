import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { dateLabel, SESSION_NAMES, sessionOf } from '../engine/calendar';
import { LOCATIONS, locationLock } from '../engine/data/locations';
import type { LocationId } from '../engine/types';
import { useGame, useStore } from '../store';
import { Avatar } from './Avatar';

// ---------- גיאומטריה איזומטרית ----------
const K = 22;
const C = 0.866 * K;
const S = 0.5 * K;
const P = (x: number, y: number, z = 0) => ({ x: (x - y) * C, y: (x + y) * S - z * K });
const pts = (arr: [number, number, number][]) => arr.map(([x, y, z]) => { const p = P(x, y, z); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

interface BoxProps {
  x: number; y: number; w: number; d: number; h: number; z?: number;
  color: string; detail?: 'columns' | 'windows' | 'glass' | 'none'; opacity?: number;
}

function Box({ x, y, w, d, h, z = 0, color, detail = 'none', opacity = 1 }: BoxProps) {
  const x1 = x + w;
  const y1 = y + d;
  const top = pts([[x, y, z + h], [x1, y, z + h], [x1, y1, z + h], [x, y1, z + h]]);
  const right = pts([[x1, y, z], [x1, y1, z], [x1, y1, z + h], [x1, y, z + h]]);
  const left = pts([[x, y1, z], [x1, y1, z], [x1, y1, z + h], [x, y1, z + h]]);
  const lines: ReactNode[] = [];
  if (detail === 'columns') {
    for (let i = 0.4; i < d; i += 0.55) {
      const a = P(x1, y + i, z + 0.15);
      const b = P(x1, y + i, z + h - 0.35);
      lines.push(<line key={`r${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff8e6" strokeOpacity="0.55" strokeWidth="2.2" />);
    }
    for (let i = 0.4; i < w; i += 0.55) {
      const a = P(x + i, y1, z + 0.15);
      const b = P(x + i, y1, z + h - 0.35);
      lines.push(<line key={`l${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff8e6" strokeOpacity="0.45" strokeWidth="2.2" />);
    }
  }
  if (detail === 'windows' || detail === 'glass') {
    const step = detail === 'glass' ? 0.5 : 0.7;
    for (let zz = z + 0.5; zz < z + h - 0.2; zz += step) {
      const a = P(x1, y + 0.2, zz);
      const b = P(x1, y1 - 0.2, zz);
      const c = P(x + 0.2, y1, zz);
      const e = P(x1 - 0.2, y1, zz);
      lines.push(<line key={`wr${zz}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#bfe0ff" strokeOpacity="0.35" strokeWidth="2.5" />);
      lines.push(<line key={`wl${zz}`} x1={c.x} y1={c.y} x2={e.x} y2={e.y} stroke="#bfe0ff" strokeOpacity="0.3" strokeWidth="2.5" />);
    }
  }
  return (
    <g opacity={opacity}>
      <polygon points={left} fill={shade(color, 0.78)} />
      <polygon points={right} fill={shade(color, 0.6)} />
      <polygon points={top} fill={shade(color, 1.08)} />
      {lines}
    </g>
  );
}

function Flat({ x, y, w, d, color, opacity = 1 }: { x: number; y: number; w: number; d: number; color: string; opacity?: number }) {
  return <polygon points={pts([[x, y, 0], [x + w, y, 0], [x + w, y + d, 0], [x, y + d, 0]])} fill={color} opacity={opacity} />;
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const p = P(x, y);
  return (
    <g>
      <ellipse cx={p.x} cy={p.y} rx={7 * s} ry={3 * s} fill="#000" opacity="0.25" />
      <rect x={p.x - 1.5} y={p.y - 10 * s} width="3" height={10 * s} fill="#5b4532" />
      <circle cx={p.x} cy={p.y - 15 * s} r={8 * s} fill="#2f6b3c" />
      <circle cx={p.x - 3 * s} cy={p.y - 18 * s} r={5 * s} fill="#3d8a4d" />
    </g>
  );
}

function Pyramid({ x, y, w, d, z, color }: { x: number; y: number; w: number; d: number; z: number; color: string }) {
  const apex: [number, number, number] = [x + w / 2, y + d / 2, z + Math.min(w, d) * 0.55];
  return (
    <g>
      <polygon points={pts([[x, y + d, z], [x + w, y + d, z], apex])} fill={shade(color, 0.8)} />
      <polygon points={pts([[x + w, y, z], [x + w, y + d, z], apex])} fill={shade(color, 0.62)} />
    </g>
  );
}

function Menorah({ x, y }: { x: number; y: number }) {
  const p = P(x, y);
  const c = '#8a6a3a';
  return (
    <g transform={`translate(${p.x},${p.y})`}>
      <ellipse cx="0" cy="0" rx="12" ry="5" fill="#000" opacity="0.25" />
      <rect x="-7" y="-6" width="14" height="6" fill="#6b5232" />
      <rect x="-1.5" y="-44" width="3" height="40" fill={c} />
      {[8, 15, 22].map((r) => (
        <path key={r} d={`M0 -16 Q${-r} -16 ${-r} -${30 + r * 0.6} M0 -16 Q${r} -16 ${r} -${30 + r * 0.6}`} stroke={c} strokeWidth="3" fill="none" />
      ))}
    </g>
  );
}

function House({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <Box x={x} y={y} w={1.4} d={1.4} h={0.9} color="#e7dcc5" />
      <polygon points={pts([[x, y + 1.4, 0.9], [x + 1.4, y + 1.4, 0.9], [x + 1.4, y + 0.7, 1.6], [x, y + 0.7, 1.6]])} fill="#b4533c" />
      <polygon points={pts([[x + 1.4, y, 0.9], [x + 1.4, y + 1.4, 0.9], [x + 1.4, y + 0.7, 1.6]])} fill="#8f3f2d" />
    </g>
  );
}

// ---------- מיקומים ----------
interface Site {
  id: LocationId;
  label: [number, number, number];
  render: () => ReactNode;
}

const SITES: Site[] = [
  { id: 'offices', label: [12.5, 1.5, 3.4], render: () => <Box x={8} y={0} w={9} d={3.2} h={2.6} color="#cdbb94" detail="windows" /> },
  { id: 'factions', label: [6.2, 5.5, 2.9], render: () => <Box x={5} y={4} w={2.6} d={3} h={2.2} color="#c9b48a" detail="windows" /> },
  {
    id: 'plenum',
    label: [11, 6.5, 4.4],
    render: () => (
      <g>
        <Box x={8} y={4} w={6} d={5} h={3.1} color="#dccaa3" detail="columns" />
        <Box x={9} y={5} w={4} d={3} h={0.5} z={3.1} color="#b8a581" />
        <line {...lineP(13.6, 8.6, 3.1, 13.6, 8.6, 5.2)} stroke="#cbd5e1" strokeWidth="1.5" />
        <polygon points={pts([[13.6, 8.6, 5.2], [13.6, 7.6, 5.2], [13.6, 7.6, 4.55], [13.6, 8.6, 4.55]])} fill="#f8fafc" />
        <polygon points={pts([[13.6, 8.55, 5.05], [13.6, 7.65, 5.05], [13.6, 7.65, 4.95], [13.6, 8.55, 4.95]])} fill="#1d4ed8" />
        <polygon points={pts([[13.6, 8.55, 4.8], [13.6, 7.65, 4.8], [13.6, 7.65, 4.7], [13.6, 8.55, 4.7]])} fill="#1d4ed8" />
      </g>
    ),
  },
  { id: 'committees', label: [15.7, 6.5, 3.2], render: () => <Box x={14.5} y={4} w={2.6} d={5} h={2.4} color="#d2c09a" detail="windows" /> },
  { id: 'cafeteria', label: [6.2, 8.5, 2.1], render: () => <Box x={5} y={7.6} w={2.6} d={2} h={1.3} color="#7fb3d5" detail="glass" opacity={0.95} /> },
  {
    id: 'plaza',
    label: [12.5, 11.5, 1.6],
    render: () => (
      <g>
        <Flat x={8} y={9.6} w={9} d={3.6} color="#b9ab8e" />
        <Flat x={8.3} y={9.9} w={8.4} d={3} color="#cbbfa5" />
        <Menorah x={15.5} y={12.4} />
      </g>
    ),
  },
  {
    id: 'pmo',
    label: [21, 3.5, 3.6],
    render: () => <Box x={19.5} y={1.5} w={3.2} d={3.6} h={2.8} color="#a8b0b8" detail="windows" />,
  },
  {
    id: 'ministry',
    label: [21, -0.8, 3.4],
    render: () => (
      <g>
        <Box x={19.5} y={-2.5} w={3.2} d={3.2} h={2.6} color="#b7c4cf" detail="windows" />
        <Box x={20.3} y={-1.7} w={1.6} d={1.6} h={0.4} z={2.6} color="#94a3b8" />
      </g>
    ),
  },
  {
    id: 'finance',
    label: [21, 8, 3.2],
    render: () => <Box x={19.5} y={6.3} w={3.2} d={3.2} h={2.4} color="#c2b59b" detail="windows" />,
  },
  {
    id: 'court',
    label: [21, 12.5, 4],
    render: () => (
      <g>
        <Box x={19.5} y={11} w={3.2} d={3.2} h={1.8} color="#e8e4da" />
        <Pyramid x={20.3} y={11.8} w={1.6} d={1.6} z={1.8} color="#d6d0c2" />
      </g>
    ),
  },
  {
    id: 'studio',
    label: [3.5, 18.5, 3.8],
    render: () => (
      <g>
        <Box x={2} y={17} w={3} d={3} h={2.2} color="#3a4658" detail="windows" />
        <line {...lineP(3, 18, 2.2, 3, 18, 4.4)} stroke="#cbd5e1" strokeWidth="1.5" />
        <circle cx={P(3, 18, 4.4).x} cy={P(3, 18, 4.4).y} r="3" fill="#ef4444" className="glow" />
      </g>
    ),
  },
  { id: 'partyhq', label: [9.5, 19.5, 5.4], render: () => <Box x={8.5} y={18.5} w={2.4} d={2.4} h={4.4} color="#4c7bb3" detail="glass" /> },
  {
    id: 'field',
    label: [17.5, 20, 2.4],
    render: () => (
      <g>
        <Flat x={14.5} y={17.5} w={7} d={5} color="#5d8a4e" opacity={0.7} />
        <House x={15} y={18} />
        <House x={17.5} y={18.2} />
        <House x={20} y={18} />
        <House x={15.5} y={20.5} />
        <House x={18.2} y={20.6} />
      </g>
    ),
  },
];

function lineP(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
  const a = P(x1, y1, z1);
  const b = P(x2, y2, z2);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

function Ground() {
  return (
    <g>
      <polygon points={pts([[-1, -3, 0], [25, -3, 0], [25, 25, 0], [-1, 25, 0]])} fill="#2b4a37" />
      <polygon points={pts([[-1, 25, 0], [25, 25, 0], [25, 25, -0.6], [-1, 25, -0.6]])} fill="#1d3226" />
      <polygon points={pts([[25, -3, 0], [25, 25, 0], [25, 25, -0.6], [25, -3, -0.6]])} fill="#16271d" />
      {/* קמפוס */}
      <Flat x={3.5} y={-0.5} w={14.5} d={14.5} color="#3b6147" />
      {/* כבישים */}
      <Flat x={-1} y={15} w={26} d={1.4} color="#3c4250" />
      <Flat x={18.3} y={-3} w={0.9} d={18} color="#3c4250" />
      <Flat x={6.2} y={15} w={1.1} d={10} color="#3c4250" />
      {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((x) => (
        <Flat key={x} x={x} y={15.6} w={1.2} d={0.18} color="#cbd5e1" opacity={0.5} />
      ))}
      {/* גן הוורדים */}
      <Flat x={4} y={10.2} w={3.6} d={4} color="#46804f" />
      {[[4.6, 10.8], [5.6, 11.6], [6.8, 10.9], [4.9, 12.8], [6.3, 13.3], [5.4, 13.7]].map(([x, y], i) => {
        const p = P(x, y);
        return <circle key={i} cx={p.x} cy={p.y} r="2.4" fill={i % 2 ? '#f472b6' : '#fb7185'} />;
      })}
    </g>
  );
}

const TREES: [number, number, number?][] = [
  [3.8, 2], [3.8, 4.5], [4.2, 9.5], [7.8, 14.2], [10, 14.3], [13, 14.3], [17.6, 13.8], [17.8, 10.5], [17.8, 2.5], [0.5, 10], [1.2, 13], [0.8, 6],
  [23.5, 16.8], [13, 17.2], [12.5, 22], [3, 22.5], [1, 20], [23, 22], [22.5, 0.2], [14, -0.4],
];

function sortKey(site: Site) {
  return site.label[0] + site.label[1];
}

export function MapScene({ interactive, onPick, here, counts, alerts, locks }: {
  interactive?: boolean;
  locks?: Partial<Record<LocationId, string | null>>;
  onPick?: (id: LocationId) => void;
  here?: LocationId;
  counts?: Partial<Record<LocationId, number>>;
  alerts?: Partial<Record<LocationId, boolean>>;
}) {
  const ordered = useMemo(() => [...SITES].sort((a, b) => sortKey(a) - sortKey(b)), []);
  return (
    <g>
      <Ground />
      {TREES.filter(([x, y]) => x + y < 14).map(([x, y, s], i) => <Tree key={`t${i}`} x={x} y={y} s={s ?? 1} />)}
      {ordered.map((site) => {
        const loc = LOCATIONS[site.id];
        const locked = locks ? !!locks[site.id] : !!loc.locked;
        const lp = P(...site.label);
        const n = counts?.[site.id] ?? 0;
        return (
          <g
            key={site.id}
            className={`bld ${locked ? 'locked' : ''}`}
            onClick={interactive ? () => onPick?.(site.id) : undefined}
            role={interactive ? 'button' : undefined}
            aria-label={loc.name}
          >
            <g className="bld-shape">{site.render()}</g>
            {interactive && (
              <g transform={`translate(${lp.x},${lp.y - 6})`}>
                {alerts?.[site.id] && <circle r="20" cy="-4" fill="#e8c37a" className="glow" opacity="0.5" />}
                <text className="bld-label" textAnchor="middle" y="0">
                  {locked ? '🔒 ' : ''}
                  {loc.name}
                </text>
                {n > 0 && !locked && (
                  <g transform="translate(0,12)">
                    <rect x="-15" y="-8" width="30" height="16" rx="8" fill="rgba(10,19,34,0.85)" stroke="#29405f" />
                    <text textAnchor="middle" y="4" fontSize="11" fill="#e9eef6" fontFamily="Heebo">👤{n}</text>
                  </g>
                )}
                {here === site.id && (
                  <g transform="translate(0,-26)">
                    <path d="M0 10 L-7 -2 A8 8 0 1 1 7 -2 Z" fill="#e8c37a" stroke="#1b1405" strokeWidth="1.5" />
                    <circle cy="-5" r="3" fill="#1b1405" />
                  </g>
                )}
              </g>
            )}
          </g>
        );
      })}
      {TREES.filter(([x, y]) => x + y >= 14).map(([x, y, s], i) => <Tree key={`f${i}`} x={x} y={y} s={s ?? 1} />)}
    </g>
  );
}

/** רקע סטטי למסך הפתיחה */
export function IsoSkyline() {
  const c = P(12, 8);
  return (
    <svg viewBox={`${c.x - 260} ${c.y - 230} 520 420`} preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%' }}>
      <MapScene />
    </svg>
  );
}

// ---------- מסך המפה עם גרירה וזום ----------
export function MapView() {
  const g = useGame();
  const open = useStore((s) => s.open);
  const act = useStore((s) => s.act);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1.4);
  const home = P(11, 11);
  const [view, setView] = useState({ cx: home.x, cy: home.y, w: 560 });
  const drag = useRef<{ pts: Map<number, { x: number; y: number }>; moved: number; dist: number }>({ pts: new Map(), moved: 0, dist: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(el.clientHeight / Math.max(1, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = view.w * aspect;
  const alertsInit: Partial<Record<LocationId, boolean>> = {};
  const locks = Object.fromEntries((Object.keys(LOCATIONS) as LocationId[]).map((id) => [id, locationLock(g, id)]));
  if (g.ministryState && g.ministryState.budget >= 0.5) alertsInit.ministry = true;
  const counts = Object.fromEntries(Object.entries(g.presence).map(([k, v]) => [k, v?.length ?? 0]));
  const alerts: Partial<Record<LocationId, boolean>> = alertsInit;
  if (g.bills.some((b) => ['preliminary', 'first', 'final'].includes(b.stage) && (b.sponsor === 'player' || b.sponsor === g.player.employerId))) alerts.plenum = true;
  if (g.player.employerId && g.presence.offices?.includes(g.player.employerId)) alerts.offices = true;

  const onDown = (e: React.PointerEvent) => {
    const d = drag.current;
    d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (d.pts.size === 1) d.moved = 0;
    if (d.pts.size === 2) {
      const [a, b] = [...d.pts.values()];
      d.dist = Math.hypot(a.x - b.x, a.y - b.y);
    }
    const move = (ev: PointerEvent) => {
      const prev = d.pts.get(ev.pointerId);
      if (!prev) return;
      const el = wrapRef.current!;
      if (d.pts.size === 1) {
        const dx = ev.clientX - prev.x;
        const dy = ev.clientY - prev.y;
        d.moved += Math.abs(dx) + Math.abs(dy);
        setView((v) => ({ ...v, cx: v.cx - dx * (v.w / el.clientWidth), cy: v.cy - dy * (v.w / el.clientWidth) }));
      }
      d.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (d.pts.size === 2) {
        const [a, b] = [...d.pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (d.dist > 0) {
          const f = d.dist / dist;
          setView((v) => ({ ...v, w: Math.max(240, Math.min(1000, v.w * f)) }));
        }
        d.dist = dist;
        d.moved += 20;
      }
    };
    const up = (ev: PointerEvent) => {
      d.pts.delete(ev.pointerId);
      if (d.pts.size === 0) {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      }
    };
    if (d.pts.size === 1) {
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const f = e.deltaY > 0 ? 1.1 : 0.9;
    setView((v) => ({ ...v, w: Math.max(240, Math.min(1000, v.w * f)) }));
  };

  const pick = (id: LocationId) => {
    if (drag.current.moved > 10) return;
    if (!locationLock(g, id) && g.player.location !== id) act((s) => (s.player.location = id));
    open({ kind: 'location', id });
  };

  const session = sessionOf(g);
  return (
    <div className="map-wrap" ref={wrapRef} onPointerDown={onDown} onWheel={onWheel}>
      <svg viewBox={`${view.cx - view.w / 2} ${view.cy - h / 2} ${view.w} ${h}`} preserveAspectRatio="xMidYMid meet">
        <MapScene interactive onPick={pick} here={g.player.location} counts={counts} alerts={alerts} locks={locks} />
      </svg>
      <div className="map-hint">
        <span className="pill">📅 {dateLabel(g)} · {SESSION_NAMES[session]}</span>
        <span className="pill">
          📍 {LOCATIONS[g.player.location].name}
        </span>
      </div>
      <div className="map-fab">
        <button className="btn block" style={{ background: 'rgba(17,31,53,0.94)' }} onClick={() => open({ kind: 'location', id: g.player.location })}>
          <Avatar spec={g.player.avatar} size={26} /> פעולות כאן
        </button>
        <NextWeekButton />
      </div>
    </div>
  );
}

export function NextWeekButton({ block }: { block?: boolean }) {
  const g = useGame();
  const nextWeek = useStore((s) => s.nextWeek);
  const blocked = g.eventQueue.length > 0;
  return (
    <button
      className={`btn primary ${block ? 'block' : ''}`}
      style={{ flex: block ? undefined : '0 0 auto' }}
      disabled={blocked}
      onClick={() => nextWeek()}
    >
      {g.player.ap > 0 ? `סיום שבוע (${g.player.ap} זמן נותר)` : 'סיום שבוע ⏭'}
    </button>
  );
}
