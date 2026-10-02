import { ISSUES } from '../engine/data/issues';
import { caucusBlocked, caucusMeeting, foundCaucus, listForecast, partyAudienceApproval, playerSeatContribution, pressFactor } from '../engine/systems/influence';
import { missionById } from '../engine/systems/missions';
import type { IssueId } from '../engine/types';
import { useGame, useStore } from '../store';
import { Avatar } from './Avatar';
import { Sheet } from './common';

const sign = (v: number, d = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`;

export function MissionsCard() {
  const g = useGame();
  return (
    <div className="card">
      <div className="card-title">
        <h3>🎯 משימות</h3>
        <span className="tiny muted">{g.missionsDone.length} הושלמו</span>
      </div>
      {g.missions.length === 0 && <p className="small muted" style={{ margin: 0 }}>אין משימות פתוחות כרגע – את/ה בונה כוח בדרכך.</p>}
      {g.missions.map((id) => {
        const m = missionById(id);
        if (!m) return null;
        return (
          <div key={id} className="list-item" style={{ marginTop: 8 }}>
            <span style={{ fontSize: 18 }}>⬜</span>
            <div className="grow">
              <b className="small">{m.title}</b>
              <div className="tiny muted">💡 {m.hint}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** מפת הכוח: איך המדדים שלך מתורגמים למנדטים, מקום ברשימה וכוח */
export function PowerCard() {
  const g = useGame();
  const p = g.player;
  const contrib = playerSeatContribution(g);
  const list = listForecast(g);
  const allies = Object.values(g.npcs).filter((n) => n.attitude >= 40);
  const rivals = Object.values(g.npcs).filter((n) => n.attitude <= -30);
  const topAllies = [...allies].sort((a, b) => b.influence - a.influence).slice(0, 4);
  const press = pressFactor(g);
  const persuade = Math.round((0.2 + 20 / 160 + p.skills.negotiation / 250) * 100);
  const party = p.partyId ? g.parties[p.partyId] : null;
  return (
    <div className="card">
      <div className="card-title">
        <h3>🧭 מפת הכוח</h3>
        <span className="tiny muted">איך מתקדמים</span>
      </div>

      {contrib && party && (
        <div className="list-item" style={{ display: 'block' }}>
          <div className="spread">
            <b className="small">התרומה שלך ל{party.short}</b>
            <b className={contrib.seats >= 0 ? 'good' : 'bad'}>{sign(contrib.seats)} מנדטים</b>
          </div>
          <div className="tiny muted" style={{ marginTop: 4, lineHeight: 1.7 }}>
            מוכרות {Math.round(p.fame)} × תדמית בקהל של המפלגה {Math.round(contrib.audience)} = {sign(contrib.fromImage, 2)}%
            <br />
            עקביות {Math.round(p.consistency)}: {sign(contrib.fromConsistency, 2)}%{contrib.fromLeader ? ` · בונוס יו"ר: ${sign(contrib.fromLeader, 2)}%` : ''}
            <br />
            💡 כדי להגדיל: להיות מוכר/ת יותר, ולהשקיע בקהל של המפלגה (חוגי בית, קמפיין ממוקד) בלי לזגזג.
          </div>
        </div>
      )}
      {party?.playerFounded && (
        <div className="list-item" style={{ display: 'block' }}>
          <b className="small">המפלגה שלך = את/ה</b>
          <div className="tiny muted">
            הסקרים נגזרים ישירות מהמוכרות שלך, מהתדמית בכל מגזר (מעל 45) ומהשמות ברשימה. גייס/י דמויות חזקות – הקולות שלהן באים איתן. תדמית בקהל המפלגה: {Math.round(partyAudienceApproval(g))}.
          </div>
        </div>
      )}

      {list && (
        <div className="list-item" style={{ display: 'block' }}>
          <div className="spread">
            <b className="small">מקום משוער ברשימה</b>
            <b className={list.position <= list.realistic ? 'good' : 'warn'}>
              {list.position} {list.position <= list.realistic ? '– ריאלי ✓' : `(ריאלי עד ${list.realistic})`}
            </b>
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            {party?.primaries
              ? 'פריימריז: מעמד במפלגה (45%), מוכרות (25%), מוניטין, קמפיין ותמיכת בכירים.'
              : 'רשימה ממונה: יחס היו"ר אליך הוא חצי מהציון; אחר כך מוכרות, מוניטין ומעמד.'}{' '}
            💡 כנסי מתפקדים, "לבקש תמיכה ברשימה" מבכירים, וקמפיין במטה.
          </div>
        </div>
      )}

      <div className="list-item" style={{ display: 'block' }}>
        <div className="spread">
          <b className="small">הרשת שלך</b>
          <span className="small">
            <span className="good">{allies.length} בעלי ברית</span> · <span className="bad">{rivals.length} יריבים</span>
          </span>
        </div>
        {topAllies.length > 0 && (
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            {topAllies.map((n) => (
              <Avatar key={n.id} spec={n.avatar} size={30} ring={n.partyId ? g.parties[n.partyId].color : undefined} />
            ))}
          </div>
        )}
        <div className="tiny muted" style={{ marginTop: 4, lineHeight: 1.7 }}>
          כל ח"כ ידידותי = קול בהצבעות. בכירים = מקום ברשימה. יו"ר ועדה = דיון בהצעות שלך. עיתונאים ידידותיים: כוח תקשורתי ×{press.toFixed(2)}.
          <br />
          סיכוי לשכנע ח"כ ניטרלי: ~{persuade}% (עולה עם משא ומתן ויחס).
        </div>
      </div>

      <div className="list-item" style={{ display: 'block' }}>
        <b className="small">מטבעות הכוח</b>
        <div className="tiny muted" style={{ lineHeight: 1.7 }}>
          🏅 מוניטין {Math.round(p.reputation)} – אמינות בעיני פוליטיקאים: פטורים, תיקים, משא ומתן. יורד בבגידות ובמעבר מפלגות.
          <br />⭐ הון פוליטי {Math.round(p.capital)} – מטבע לדילים: שכנוע מהיר, ועדת שרים, פגישות קואליציה.
          <br />📣 מוכרות {Math.round(p.fame)} – מכפיל לכל דבר ציבורי: מנדטים, פריימריז, השפעת עמדות.
        </div>
      </div>
    </div>
  );
}

export function CaucusSheet() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  return (
    <Sheet title="🧩 שדולות בכנסת" sub="קבוצות ח״כים חוצות-סיעות סביב נושא">
      <p className="small muted" style={{ marginTop: 0 }}>
        חברי השדולה מקבלים יחס חם יותר, ובהצבעות על חוקים בנושא השדולה הם נוטים יותר לתמוך בך. כנס שדולה מעלה את הנושא לסדר היום.
      </p>
      {g.caucuses.map((c) => (
        <div key={c.id} className="card">
          <div className="spread">
            <b>{c.name}</b>
            <button className="btn sm" disabled={g.player.ap < 1 || g.flags[`cauMeet_${c.id}`] === g.week} onClick={() => toast(act((s) => caucusMeeting(s, c.id)), 'good')}>
              כנס ⏱1
            </button>
          </div>
          <div className="row wrap" style={{ gap: 4, marginTop: 8 }}>
            {c.members.map((id) => g.npcs[id] && <Avatar key={id} spec={g.npcs[id].avatar} size={28} ring={g.npcs[id].partyId ? g.parties[g.npcs[id].partyId!].color : undefined} />)}
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>{c.members.length} חברים מ-{new Set(c.members.map((id) => g.npcs[id]?.partyId)).size} סיעות</div>
        </div>
      ))}
      <div className="section-label">להקים שדולה חדשה (⏱2)</div>
      {ISSUES.map((i) => {
        const blocked = caucusBlocked(g, i.id as IssueId);
        return (
          <button
            key={i.id}
            className="list-item"
            disabled={!!blocked}
            onClick={() => {
              const c = act((s) => foundCaucus(s, i.id));
              toast(`${c.name} הוקמה עם ${c.members.length} חברים`, 'good');
            }}
          >
            <span style={{ fontSize: 20 }}>{i.icon}</span>
            <div className="grow">
              <b className="small">{i.name}</b>
              <div className="tiny muted">{blocked ?? i.blurb}</div>
            </div>
            <span className="tiny muted">בולטות {Math.round(g.issues[i.id])}</span>
          </button>
        );
      })}
    </Sheet>
  );
}
