import { useState } from 'react';
import { DISTRICTS, districtById } from '../engine/data/districts';
import { composition, districtShares, moveHome, moveHomeBlocked, playerDistrict, projectElection, systemKind, systemLabel, usesDistricts, visitDistrict } from '../engine/systems/districts';
import { SECTOR_NAMES, SECTORS } from '../engine/util';
import { useGame, useStore } from '../store';
import { DistrictMap, tilesFrom } from './DistrictMap';
import { Meter, Sheet } from './common';

const SECTOR_COLORS: Record<string, string> = { secular: '#60a5fa', traditional: '#f59e0b', religious: '#a78bfa', haredi: '#f472b6', arab: '#34d399', olim: '#fb7185' };

/** מפת המחוזות: מי מוביל איפה, מה הרכב האוכלוסייה, ומה אפשר לעשות במחוז */
export function DistrictsSheet() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const home = playerDistrict(g);
  const [sel, setSel] = useState<string>(home);
  const shares = districtShares(g);
  const tiles = tilesFrom(shares);
  const proj = usesDistricts(g) ? projectElection(g) : null;
  const d = districtById(sel)!;
  const comp = composition(g, d);
  const row = Object.entries(shares[sel] ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const myId = g.player.partyId;
  const blocked = moveHomeBlocked(g, sel);
  const run = (fn: () => { ok: boolean; text: string }) => {
    const r = fn();
    toast(r.text, r.ok ? 'good' : 'bad');
  };
  return (
    <Sheet title="🗺️ מפת המחוזות" sub={systemLabel(g)}>
      <div className="card small" data-testid="system-note">
        {systemKind(g) === 'pr' ? (
          <>
            <b>🇮🇱 שיטה ארצית יחסית:</b> המחוזות רק מראים איפה כל מפלגה חזקה – אין להם השפעה על המושבים. אפשר לשנות את השיטה בחוק הבחירות המחוזיות (בונה החוקים ← ממשל).
          </>
        ) : systemKind(g) === 'fptp' ? (
          <>
            <b>🇬🇧 מחוזית מלאה:</b> בכל מחוז מנצח מי שהוביל. אתם מתמודדים ב<b>{districtById(home)?.name}</b> – הנבחרים הם מי שניצחו מקומית. מפלגה קטנה ופזורה לא תקבל מושב.
          </>
        ) : (
          <>
            <b>🗺️ מעורבת:</b> {Math.round(g.rules.districtShare! * 120)} מושבים נקבעים במחוזות, והשאר ארצית. אתם מתמודדים ב<b>{districtById(home)?.name}</b>, ועדיין אפשר להיכנס מהרשימה.
          </>
        )}
      </div>
      <DistrictMap g={g} tiles={tiles} selected={sel} home={home} onSelect={setSel} />
      <p className="tiny muted" style={{ margin: '4px 0 8px' }}>
        צבע = המפלגה המובילה לפי הסקרים. המספר: ההפרש בנקודות אחוז מהמקום השני.
      </p>

      <div className="card" data-testid="district-detail">
        <div className="spread">
          <b>{d.name}</b>
          <span className="tiny muted">{d.seats} מושבים{home === d.id ? ' · מחוז הבית שלך' : ''}</span>
        </div>
        <div className="tiny muted" style={{ margin: '2px 0 8px' }}>{d.blurb}</div>
        <div className="tiny muted">הרכב האוכלוסייה</div>
        <div className="sector-bar" style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', margin: '4px 0 6px' }}>
          {SECTORS.map((k) => (
            <i key={k} style={{ width: `${comp[k] * 100}%`, background: SECTOR_COLORS[k] }} title={`${SECTOR_NAMES[k]} ${Math.round(comp[k] * 100)}%`} />
          ))}
        </div>
        <div className="chips">
          {SECTORS.filter((k) => comp[k] >= 0.08).map((k) => (
            <span key={k} className="chip" style={{ borderColor: SECTOR_COLORS[k] }}>
              {SECTOR_NAMES[k]} {Math.round(comp[k] * 100)}%
            </span>
          ))}
        </div>
        <div className="tiny muted" style={{ marginTop: 8 }}>סקר מקומי</div>
        {row.map(([id, v]) => (
          <Meter key={id} label={<span style={{ fontWeight: id === myId ? 800 : 400 }}>{g.parties[id]?.short}</span>} value={v} max={50} color={g.parties[id]?.color} suffix="%" />
        ))}
        {proj && (
          <div className="tiny muted" style={{ marginTop: 6 }}>
            מושבים במחוז (תחזית): {Object.entries(proj.wins).filter(([, m]) => m[sel]).map(([p, m]) => `${g.parties[p]?.short} ${m[sel]}`).join(' · ') || 'בכל המושבים ארצית'}
          </div>
        )}
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn sm grow" disabled={!myId} onClick={() => run(() => act((s) => visitDistrict(s, sel)))} data-testid="visit-district">
            🚗 ⏱1 · ביקור במחוז
          </button>
          <button className="btn sm grow" disabled={!!blocked} title={blocked ?? undefined} onClick={() => run(() => act((s) => moveHome(s, sel)))} data-testid="move-home">
            🏠 {home === sel ? 'מחוז הבית' : '₪30K · להתמודד כאן'}
          </button>
        </div>
        {blocked && home !== sel && <div className="tiny muted" style={{ marginTop: 4 }}>{blocked}</div>}
      </div>

      {proj && (
        <div className="card small">
          <b>תחזית מושבים לפי השיטה</b>
          <div className="chips" style={{ marginTop: 6 }}>
            {Object.values(g.parties)
              .filter((p) => (proj.seats[p.id] ?? 0) > 0)
              .sort((a, b) => proj.seats[b.id] - proj.seats[a.id])
              .map((p) => (
                <span key={p.id} className="chip" style={{ borderColor: p.color, fontWeight: p.id === myId ? 800 : 400 }}>
                  {p.short} {proj.seats[p.id]}
                </span>
              ))}
          </div>
        </div>
      )}
      <div style={{ height: 8 }} />
    </Sheet>
  );
}

/** בחירת מחוז בית במסך יצירת הדמות */
export function HomeDistrictPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="card small" data-testid="home-district">
      <div className="muted" style={{ marginBottom: 6 }}>🏠 מחוז הבית (חשוב בשיטה מחוזית או מעורבת)</div>
      <div className="filter-row" style={{ flexWrap: 'wrap' }}>
        {DISTRICTS.map((d) => (
          <button key={d.id} className={value === d.id ? 'on' : ''} onClick={() => onChange(d.id)} title={d.blurb}>
            {d.short}
          </button>
        ))}
      </div>
      <div className="tiny faint" style={{ marginTop: 6 }}>{districtById(value)?.blurb}</div>
    </div>
  );
}
