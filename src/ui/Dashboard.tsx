import { inSession, SESSION_NAMES, sessionOf, shortDateLabel } from '../engine/calendar';
import { SKILL_NAMES } from '../engine/ops';
import { isCoalition } from '../engine/systems/government';
import { WORLD_NAMES, pollSeats } from '../engine/systems/opinion';
import type { Skill, WorldKey } from '../engine/types';
import { AXES, AXIS_NAMES, SECTORS, SECTOR_NAMES } from '../engine/util';
import { useGame, useStore } from '../store';
import { Hemicycle, HemicycleLegend, LineChart } from './Charts';
import { Meter } from './common';
import { g2 } from './labels';
import { NextWeekButton } from './MapView';
import { GovernmentCard } from './Government';
import { IssuesCard } from './Issues';
import { SCANDAL_STAGES } from '../engine/systems/scandals';
import { MissionsCard, PowerCard } from './PowerMap';

const LADDER: { rank: string; label: string }[] = [
  { rank: 'activist', label: 'פעיל' },
  { rank: 'aide', label: 'עוזר' },
  { rank: 'candidate', label: 'מועמד' },
  { rank: 'mk', label: 'ח"כ' },
  { rank: 'chair', label: 'יו"ר ועדה' },
  { rank: 'minister', label: 'שר' },
  { rank: 'pm', label: 'רה"מ' },
];
const RANK_IDX: Record<string, number> = { citizen: -1, activist: 0, aide: 1, candidate: 2, mk: 3, chair: 4, minister: 5 };

export function Dashboard() {
  const g = useGame();
  const open = useStore((s) => s.open);
  const p = g.player;
  const idx = g.coalition.pmId === 'player' ? 6 : RANK_IDX[p.rank];
  const toElection = g.electionWeek - g.week;
  const toPrimaries = g.primariesWeek - g.week;

  const latest = g.pollHistory[g.pollHistory.length - 1]?.polls ?? {};
  const top = Object.values(g.parties)
    .filter((x) => (latest[x.id] ?? 0) > 0.5)
    .sort((a, b) => (latest[b.id] ?? 0) - (latest[a.id] ?? 0))
    .slice(0, 5);
  if (p.partyId && !top.some((x) => x.id === p.partyId)) top.push(g.parties[p.partyId]);
  const hist = g.pollHistory.slice(-30);
  const series = top.map((party) => ({
    name: party.short,
    color: party.color,
    bold: party.id === p.partyId,
    values: hist.map((h) => ((h.polls[party.id] ?? 0) / 100) * 120),
  }));
  const ph = g.playerHistory.slice(-30);

  let goal = '';
  if (!p.partyId && !p.isMK) goal = 'הצטרף/י למפלגה או הקם/י אחת – במטה המפלגה.';
  else if (!p.isMK && !p.wantsList && toPrimaries > 0) goal = `הגש/י מועמדות לרשימה במטה המפלגה (הרשימות נסגרות בעוד ${toPrimaries} שבועות).`;
  else if (!p.isMK && p.wantsList && toPrimaries > 0) goal = 'בנה/י תמיכה לקראת הרכבת הרשימה: כנסי מתפקדים, קמפיין, ותמיכת ח"כים בכירים.';
  else if (!p.isMK) goal = `הבחירות בעוד ${toElection} שבועות. כל נקודת תדמית חשובה.`;
  else if (g.negotiation) goal = 'משא ומתן קואליציוני בעיצומו – פתח/י אותו מהמפה.';
  else if (g.coalition.pmId === 'player') goal = 'לשמור על הקואליציה, להעביר את סעיפי ההסכם ואת התקציב – ולשרוד עד הבחירות.';
  else if (p.ministry) goal = 'להשיק תכניות דגל, להעלות את ביצועי המשרד – ולבנות בסיס לראשות המפלגה.';
  else if (!g.bills.some((b) => b.sponsor === 'player')) goal = 'הגש/י הצעת חוק ראשונה – באגף הלשכות.';
  else if (!p.achievements.includes('first_law')) goal = 'העבר/י חוק בשלוש קריאות. גייס/י תומכים לפני כל הצבעה.';
  else if (g.player.partyId && g.parties[g.player.partyId].leaderId === 'player') goal = 'כיו"ר מפלגה: להגדיל את המפלגה בסקרים – הגדולה בגוש מקבלת את המנדט להרכיב ממשלה.';
  else goal = 'בנה/י כוח: ראשות ועדה, תיק בממשלה, ובסוף – התמודדות על ראשות המפלגה (במטה).';

  return (
    <div className="scroll">
      <div className="page">
        <div className="card">
          <div className="card-title">
            <h3>🧭 המסלול שלך</h3>
            <span className="small muted">{SESSION_NAMES[sessionOf(g)]}</span>
          </div>
          <div className="row" style={{ gap: 4 }}>
            {LADDER.map((l, i) => (
              <div key={l.rank} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: 6, borderRadius: 4, background: i <= idx ? 'var(--gold)' : 'var(--line)' }} />
                <div className="tiny" style={{ marginTop: 4, color: i === idx ? 'var(--gold)' : 'var(--muted)', fontWeight: i === idx ? 800 : 400 }}>
                  {l.label}
                </div>
              </div>
            ))}
          </div>
          <p className="small" style={{ margin: '12px 0 0' }}>
            🎯 <b>היעד הבא:</b> {goal}
          </p>
          <div className="chips" style={{ marginTop: 10 }}>
            <span className="chip gold">בחירות בעוד {toElection} שבועות</span>
            {toPrimaries > 0 && <span className="chip">סגירת רשימות בעוד {toPrimaries} שבועות</span>}
            {p.listPosition && <span className="chip good">מקום {p.listPosition} ברשימה</span>}
            {p.defector && <span className="chip bad">פורש – מוגבל בכנסת הזו</span>}
            {!inSession(g) && <span className="chip">פגרה – אין הצבעות</span>}
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <h3>🏛️ הכנסת ה-{g.knesset}</h3>
            <span className="small muted">יציבות קואליציה {Math.round(g.coalition.stability)}</span>
          </div>
          <Hemicycle onSeat={(id) => open({ kind: 'npc', id })} />
          <HemicycleLegend />
          <div style={{ marginTop: 10 }}>
            <Meter label="יציבות הקואליציה" value={g.coalition.stability} color={g.coalition.stability < 30 ? 'var(--bad)' : g.coalition.stability < 50 ? 'var(--warn)' : 'var(--good)'} />
          </div>
          <p className="tiny muted" style={{ margin: '8px 0 0' }}>
            ★ = קואליציה. {p.partyId ? (isCoalition(g, p.partyId) ? 'המפלגה שלך בקואליציה.' : 'המפלגה שלך באופוזיציה.') : ''}
          </p>
        </div>

        {g.scandal && (
          <div className="card" style={{ borderColor: 'var(--bad)' }}>
            <h3>🚨 פרשת {g.scandal.source}</h3>
            <p className="small" style={{ margin: '6px 0' }}>
              שלב {g.scandal.stage}/5: <b>{SCANDAL_STAGES[g.scandal.stage]}</b>
            </p>
            <Meter label="חום התיק" value={g.scandal.heat} color="var(--bad)" />
            <p className="tiny muted" style={{ margin: '6px 0 0' }}>שיתוף פעולה מקרר את התיק. אחרי כתב אישום – משפט. הרשעה מסיימת את הקריירה.</p>
          </div>
        )}

        <MissionsCard />

        <PowerCard />

        <IssuesCard />

        <GovernmentCard />

        <div className="card">
          <div className="card-title">
            <h3>📈 סקרים (מנדטים)</h3>
            {p.partyId && <span className="small gold">{g.parties[p.partyId].short}: {pollSeats(g.parties[p.partyId].poll)}</span>}
          </div>
          <LineChart series={series} xLabels={hist.map((h) => shortDateLabel(g, h.week))} yMax={40} />
          <p className="tiny faint" style={{ margin: '6px 0 0' }}>מתחת ל-3.25% (כ-4 מנדטים) – הרשימה לא נכנסת לכנסת.</p>
        </div>

        <div className="card">
          <div className="card-title">
            <h3>🪞 התדמית שלך</h3>
            <span className="small muted">מוכרות {Math.round(p.fame)}</span>
          </div>
          {SECTORS.map((sec) => (
            <Meter key={sec} label={SECTOR_NAMES[sec]} value={p.approval[sec]} color={p.approval[sec] >= 55 ? 'var(--good)' : p.approval[sec] < 45 ? 'var(--bad)' : 'var(--muted)'} />
          ))}
          <div style={{ height: 8 }} />
          <Meter label="עקביות" value={p.consistency} color="var(--gold)" />
          <Meter label="מעמד במפלגה" value={p.partyStanding} color="var(--gold)" />
          {ph.length > 2 && (
            <div style={{ marginTop: 12 }}>
              <LineChart
                height={130}
                yMax={100}
                xLabels={ph.map((h) => shortDateLabel(g, h.week))}
                series={[
                  { name: 'מוכרות', color: '#5aa9ff', values: ph.map((h) => h.fame) },
                  { name: 'תדמית', color: '#e8c37a', values: ph.map((h) => h.approval) },
                  { name: 'מוניטין', color: '#c084fc', values: ph.map((h) => h.reputation) },
                ]}
              />
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">
            <h3>🇮🇱 מצב המדינה</h3>
          </div>
          {(Object.keys(g.world) as WorldKey[]).map((k) => (
            <Meter key={k} label={WORLD_NAMES[k]} value={g.world[k]} color={g.world[k] >= 55 ? 'var(--good)' : g.world[k] < 40 ? 'var(--bad)' : 'var(--warn)'} />
          ))}
          {g.effects.length > 0 && (
            <p className="tiny muted" style={{ margin: '8px 0 0' }}>
              השפעות פעילות: {[...new Set(g.effects.map((e) => e.source))].filter((x) => x !== 'event').join(' · ') || 'אירועים אחרונים'}
            </p>
          )}
        </div>

        <div className="card">
          <div className="card-title">
            <h3>🧾 חובות וטובות</h3>
            <span className="small muted">{p.debts.length}</span>
          </div>
          {p.debts.length === 0 && <p className="small muted" style={{ margin: 0 }}>אף אחד לא חייב לך, ואתה לא חייב לאף אחד. עדיין.</p>}
          {p.debts.map((d) => (
            <button key={d.id} className="list-item" onClick={() => open({ kind: 'npc', id: d.npcId })}>
              <span style={{ fontSize: 20 }}>{d.dir === 'owes_player' ? '🟢' : '🔴'}</span>
              <div className="grow">
                <b className="small">{g.npcs[d.npcId]?.name}</b>
                <div className="tiny muted">
                  {d.dir === 'owes_player' ? 'חייב לך' : 'אתה חייב'} · {d.reason}
                </div>
              </div>
              <span className="tiny faint">לפני {g.week - d.week} ש׳</span>
            </button>
          ))}
        </div>

        <div className="card">
          <div className="card-title">
            <h3>🎓 מיומנויות</h3>
          </div>
          {(Object.keys(p.skills) as Skill[]).map((k) => (
            <Meter key={k} label={SKILL_NAMES[k]} value={p.skills[k]} color="#5aa9ff" />
          ))}
        </div>

        <div className="card">
          <div className="card-title">
            <h3>🧭 {g2(g, 'העמדות שלך', 'העמדות שלך')}</h3>
          </div>
          {AXES.map((ax) => (
            <div key={ax} style={{ marginBottom: 12 }}>
              <div className="spread tiny muted">
                <span>{AXIS_NAMES[ax][2]}</span>
                <b style={{ color: 'var(--text)' }}>{AXIS_NAMES[ax][0]}</b>
                <span>{AXIS_NAMES[ax][1]}</span>
              </div>
              <div className="axis" style={{ marginTop: 5, direction: 'rtl' }}>
                <span className="mark" style={{ right: `${(100 - p.ideology[ax]) / 2}%`, transform: 'translateX(50%)' }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          <NextWeekButton block />
        </div>
      </div>
    </div>
  );
}
