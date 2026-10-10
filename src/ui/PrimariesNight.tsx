import { useEffect, useState } from 'react';
import { useGame, useStore } from '../store';
import { Avatar } from './Avatar';

const PHASES = [
  { time: '22:00', label: 'הקלפיות נסגרו – תוצאות ראשונות מהסניפים', amp: 7 },
  { time: '23:30', label: 'נספרו 40% מהקולות', amp: 4 },
  { time: '01:00', label: 'נספרו 80% מהקולות', amp: 2 },
  { time: '03:10', label: 'ועדת הבחירות של המפלגה: הרשימה הסופית', amp: 0 },
];

function noise(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 2001) / 1000 - 1;
}

/** ליל הפריימריז (או פרסום הרשימה בידי היו"ר): המקום שלך מתברר לאט */
export function PrimariesNight() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const [phase, setPhase] = useState(0);
  const lp = g.lastPrimaries!;
  const last = PHASES.length - 1;
  useEffect(() => {
    if (phase >= last) return;
    const id = setTimeout(() => setPhase((x) => x + 1), 3600);
    return () => clearTimeout(id);
  }, [phase, last]);
  const party = g.parties[lp.partyId];
  const final = phase >= last;
  const amp = PHASES[phase].amp;
  // הראש (מקום 1) קבוע; השאר מתערבבים לפי רעש שהולך וקטן
  const head = lp.list[0];
  const rest = lp.list.slice(1).map((id, i) => ({ id, v: i + noise(`${id}${phase}${lp.week}`) * amp })).sort((a, b) => a.v - b.v).map((x) => x.id);
  const ranked = [head, ...rest];
  const myPos = ranked.indexOf('player') + 1 || lp.playerPos;
  const shown = ranked.slice(0, 14);
  const tail = myPos > 14 ? ranked.slice(Math.max(14, myPos - 2), myPos + 1) : [];
  const name = (id: string) => (id === 'player' ? `${g.player.name} (את/ה)` : g.npcs[id]?.name ?? '');
  const close = () => act((s) => delete s.flags.showPrimaries);
  const safe = lp.playerPos <= lp.realistic;
  return (
    <div className="event-overlay" data-testid="primaries-night">
      <div className="event-card">
        <div className="tiny gold" style={{ fontWeight: 700 }}>
          🗳️ {lp.primaries ? 'ליל הפריימריז' : 'הרשימה מתפרסמת'} · {party?.name}
        </div>
        <div className="spread" style={{ alignItems: 'center', marginTop: 4 }}>
          <span className={`chip ${final ? 'good' : 'gold'}`}>{lp.primaries ? PHASES[phase].label : final ? 'היו"ר פרסם/ה את הרשימה' : 'היו"ר מתלבט/ת בחדר סגור…'}</span>
          <span className="vote-clock">🕙 {PHASES[phase].time}</span>
        </div>
        <div className="count-bar">
          <i style={{ width: `${[15, 40, 80, 100][phase]}%` }} />
        </div>
        <h2 style={{ textAlign: 'center', margin: '8px 0' }} className={!final ? 'beat' : safe ? 'good' : 'bad'} data-testid="primaries-pos">
          מקום {myPos}
        </h2>
        <p className="tiny muted" style={{ textAlign: 'center', margin: 0 }}>
          בסקרים: כ-{lp.realistic} מנדטים – זה קו הכניסה הריאלי
        </p>
        <div style={{ marginTop: 8 }}>
          {shown.map((id, i) => (
            <div key={id}>
              {i === lp.realistic && <div className="tiny bad" style={{ borderTop: '2px dashed #f87171', margin: '4px 0', paddingTop: 2 }}>— קו הכניסה לכנסת —</div>}
              <div className="row small" style={{ gap: 8, padding: '3px 0', fontWeight: id === 'player' ? 800 : 400, color: id === 'player' ? 'var(--gold)' : undefined }}>
                <span style={{ width: 22, textAlign: 'center' }}>{i + 1}</span>
                {id !== 'player' && g.npcs[id] && <Avatar spec={g.npcs[id].avatar} size={22} />}
                <span>{name(id)}</span>
              </div>
            </div>
          ))}
          {tail.length > 0 && <div className="tiny faint" style={{ textAlign: 'center' }}>⋯</div>}
          {tail.map((id) => (
            <div key={id} className="row small" style={{ gap: 8, padding: '3px 0', fontWeight: id === 'player' ? 800 : 400, color: id === 'player' ? 'var(--gold)' : undefined }}>
              <span style={{ width: 22, textAlign: 'center' }}>{ranked.indexOf(id) + 1}</span>
              <span>{name(id)}</span>
            </div>
          ))}
        </div>
        {!final && (
          <button className="btn block" style={{ marginTop: 8 }} onClick={() => setPhase(last)}>
            ⏩ לתוצאה הסופית
          </button>
        )}
        {final && (
          <>
            <p className="small" style={{ textAlign: 'center' }}>{safe ? 'מקום ריאלי! עכשיו צריך שהמפלגה תחזיק בסקרים.' : 'מקום לא ריאלי. כל מנדט שהמפלגה תעלה – מקרב אותך.'}</p>
            <button className="btn primary block" onClick={close}>
              המשך
            </button>
          </>
        )}
      </div>
    </div>
  );
}
