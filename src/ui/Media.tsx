import { useState } from 'react';
import { shortDateLabel } from '../engine/calendar';
import { ISSUES } from '../engine/data/issues';
import { PAPERS, paperFront } from '../engine/systems/papers';
import { directElection } from '../engine/systems/regime';
import { latestSurvey, moodLines, surveyName } from '../engine/systems/surveys';
import type { GameState } from '../engine/types';
import { SECTORS, SECTOR_NAMES } from '../engine/util';
import { useGame } from '../store';
import { LineChart } from './Charts';
import { Meter, Sheet } from './common';

/** טור רכילות שבועי, נבנה ממצב המשחק */
function gossip(g: GameState): string[] {
  const out: string[] = [];
  const p = g.player;
  const party = p.partyId ? g.parties[p.partyId] : null;
  if (g.coalition.stability < 40) out.push('במסדרונות הכנסת כבר מהמרים: הממשלה לא תעבור את המושב.');
  else out.push('הממשלה נראית יציבה – מה שבפוליטיקה הישראלית אומר בעיקר שמשהו עוד יקרה.');
  if (party && party.leaderId !== 'player' && p.partyStanding > 60 && p.fame > 30) out.push(`בסביבת ${g.npcs[party.leaderId]?.name ?? 'היו"ר'} עוקבים בדאגה אחרי ${p.name}. "שאפתנות זה לא פשע", אומרים אצלו/ה.`);
  if (p.fame < 15) out.push(`${p.name}? רוב העיתונאים עוד צריכים לחפש בגוגל.`);
  if (p.consistency < 40) out.push(`הכתבים כבר מכינים תיקייה של "ציטוטים סותרים" של ${p.name}.`);
  const enemy = Object.values(g.npcs).filter((n) => n.notable && n.attitude <= -40).sort((a, b) => a.attitude - b.attitude)[0];
  if (enemy) out.push(`${enemy.name} סיפר/ה בשיחה סגורה מה הוא/היא באמת חושב/ת על ${p.name}. לא נצטט.`);
  const hype = Object.values(g.parties).filter((x) => (x.momentum ?? 0) >= 4)[0];
  if (hype) out.push(`${hype.name} בגל – אבל ותיקי המערכת זוכרים כמה גלים כאלה נשברו.`);
  const sv = latestSurvey(g);
  if (sv?.player && sv.player.favorable < sv.player.unfavorable) out.push(`ביועצים של ${p.name} מודאגים: יותר אנשים לא אוהבים מאשר אוהבים.`);
  return out.slice(0, 4);
}

export function PapersView() {
  const g = useGame();
  const [only, setOnly] = useState<string | null>(null);
  return (
    <>
      <div className="card small" data-testid="gossip">
        <b>🕵️ הטור של "מקורב לעניין"</b>
        {gossip(g).map((l, i) => (
          <p key={i} className="muted" style={{ margin: '6px 0 0' }}>
            • {l}
          </p>
        ))}
      </div>
      <div className="filter-row" style={{ marginTop: 10 }}>
        <button className={only === null ? 'on' : ''} onClick={() => setOnly(null)}>
          כל העיתונים
        </button>
        {PAPERS.map((p) => (
          <button key={p.id} className={only === p.id ? 'on' : ''} onClick={() => setOnly(p.id)}>
            {p.icon} {p.name}
          </button>
        ))}
      </div>
      {PAPERS.filter((p) => !only || p.id === only).map((paper) => (
        <div key={paper.id} className="card" style={{ marginTop: 10 }} data-testid={`paper-${paper.id}`}>
          <div className="spread">
            <h3>
              {paper.icon} {paper.name}
            </h3>
            <span className="tiny muted">{paper.blurb}</span>
          </div>
          {paperFront(g, paper).map((n, i) => (
            <div key={i} className="small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', fontWeight: n.mine || (n.own && i === 0) ? 700 : 400 }}>
              {n.own && <span className="tiny gold">בלעדי · </span>}
              {n.text}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/** הסקר המלא: מנדטים, מדד ההתאמה, ראש בראש, כיוון המדינה, סוגיות, ההפתעה, ואת/ה */
export function PollsView() {
  const g = useGame();
  const sv = latestSurvey(g);
  const thr = g.rules.threshold;
  if (!sv) return <p className="muted small">הסקר הראשון יתפרסם בשבוע הבא.</p>;
  const prev = g.surveys.length > 1 ? g.surveys[g.surveys.length - 2] : null;
  const rows = Object.values(g.parties)
    .filter((p) => sv.pct[p.id] !== undefined)
    .sort((a, b) => (sv.seats[b.id] ?? 0) - (sv.seats[a.id] ?? 0) || sv.pct[b.id] - sv.pct[a.id]);
  const name = (id: string) => (id === 'player' ? `${g.player.name} (את/ה)` : surveyName(g, id));
  const partyOf = (id: string) => g.parties[(id === 'player' ? g.player.partyId : g.npcs[id]?.partyId) ?? ''];
  const direct = directElection(g);
  const fitIds = sv.pmFit.slice(0, 3).map((x) => x.id);
  const fitSeries = fitIds.map((id) => ({
    name: (id === 'player' ? g.player.name : surveyName(g, id)).split(' ')[0],
    color: partyOf(id)?.color ?? '#94a3b8',
    bold: id === 'player',
    values: g.surveys.map((x) => x.pmFit.find((f) => f.id === id)?.pct ?? 0),
  }));
  const mood = moodLines(g);
  return (
    <>
      <div className="card" data-testid="polls-view">
        <div className="spread">
          <h3>📊 סקר {sv.pollster}</h3>
          <span className="tiny muted">
            {shortDateLabel(g, sv.week)} · {sv.sample} נשאלים · ±{sv.margin}%
          </span>
        </div>
        <div className="spread small" style={{ margin: '4px 0 8px' }}>
          <span className="gold">קואליציה {sv.blocs.coalition} · אופוזיציה {sv.blocs.opposition}</span>
          {sv.blocs.coalition >= 61 ? <span className="good">לממשלה יש רוב</span> : <span className="bad">לממשלה אין רוב</span>}
        </div>
        {rows.map((p) => {
          const seats = sv.seats[p.id] ?? 0;
          const was = prev?.seats[p.id];
          const d = was === undefined ? 0 : seats - was;
          return (
            <div key={p.id} className="row small" style={{ gap: 8, padding: '4px 0', opacity: seats ? 1 : 0.6, fontWeight: p.id === g.player.partyId ? 800 : 400 }}>
              <span className="party-dot" style={{ background: p.color }} />
              <span className="grow">{p.name}</span>
              {d !== 0 && <span className={d > 0 ? 'good' : 'bad'}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>}
              <b style={{ width: 70, textAlign: 'end' }}>{seats || `${sv.pct[p.id].toFixed(1)}% ⚠️`}</b>
            </div>
          );
        })}
        <p className="tiny faint" style={{ margin: '6px 0 0' }}>▲▼ = מול הסקר הקודם. ⚠️ = מתחת לאחוז החסימה ({thr}%). לכל מכון יש נטייה קטנה משלו.</p>
      </div>

      {(sv.surprise || sv.loser) && (
        <div className="card" style={{ marginTop: 10 }} data-testid="poll-surprise">
          <h3>🎆 ההפתעה של הבחירות</h3>
          {sv.surprise && (
            <p className="small good" style={{ margin: '6px 0 0' }}>
              ▲ {g.parties[sv.surprise.party]?.name}: +{sv.surprise.d} מנדטים בחודשיים. אפקט העגלה – מי שעולה מושך עוד קולות.
            </p>
          )}
          {sv.loser && (
            <p className="small bad" style={{ margin: '6px 0 0' }}>
              ▼ {g.parties[sv.loser.party]?.name}: {sv.loser.d} מנדטים בחודשיים.
            </p>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 10 }} data-testid="pm-fit">
        <h3>👑 מי מתאים/ה יותר לראשות הממשלה?</h3>
        {sv.pmFit.map((x) => {
          const was = prev?.pmFit.find((f) => f.id === x.id)?.pct;
          const d = was === undefined ? 0 : x.pct - was;
          return <Meter key={x.id} label={`${x.id === 'player' ? 'את/ה' : surveyName(g, x.id)}${d ? ` ${d > 0 ? '▲' : '▼'}${Math.abs(d)}` : ''}`} value={x.pct} color={partyOf(x.id)?.color} suffix="%" />;
        })}
        <Meter label="אף אחד" value={sv.pmNone} color="#64748b" suffix="%" />
        {g.surveys.length >= 3 && <LineChart series={fitSeries} xLabels={g.surveys.map((x) => shortDateLabel(g, x.week))} yMax={60} unit="%" height={130} />}
        <p className="tiny faint" style={{ margin: '6px 0 0' }}>
          {sv.pmFit.map((x) => `${x.id === 'player' ? 'את/ה' : surveyName(g, x.id)} – ${partyOf(x.id)?.short ?? ''}`).join(' · ')}.{' '}
          {direct ? 'בבחירה ישירה המדד הזה קובע כמעט הכול במרוץ לראשות הממשלה.' : 'מועמד/ת חזק/ה מהמפלגה שלו/ה מושך/ת אותה למעלה ("אפקט המנהיג").'}
        </p>
      </div>

      {sv.h2h.b && (
        <div className="card" style={{ marginTop: 10 }} data-testid="h2h">
          <h3>{direct ? (g.rules.presidential ? '🏛️ אם הבחירות לראשות המדינה היו היום' : '🗳️ אם הבחירה הישירה לראשות הממשלה הייתה היום') : '🥊 ראש בראש'}</h3>
          <Meter label={name(sv.h2h.a)} value={sv.h2h.pa} color={partyOf(sv.h2h.a)?.color} suffix="%" />
          <Meter label={name(sv.h2h.b)} value={sv.h2h.pb} color={partyOf(sv.h2h.b)?.color} suffix="%" />
          <p className="tiny faint" style={{ margin: '4px 0 0' }}>מתלבטים: {100 - sv.h2h.pa - sv.h2h.pb}%</p>
        </div>
      )}

      <div className="card" style={{ marginTop: 10 }}>
        <h3>🧭 המדינה והממשלה</h3>
        <Meter label="המדינה בכיוון הנכון" value={sv.rightTrack} color={sv.rightTrack >= 50 ? '#4ade80' : '#f87171'} suffix="%" />
        <Meter label="מרוצים מהממשלה" value={sv.govApproval} color={sv.govApproval >= 45 ? '#4ade80' : '#f87171'} suffix="%" />
        <div className="small muted" style={{ margin: '10px 0 4px' }}>מה הכי מטריד אותך?</div>
        {sv.topIssues.map((x) => {
          const def = ISSUES.find((i) => i.id === x.id)!;
          return <Meter key={x.id} label={`${def.icon} ${def.name}`} value={x.pct} color="var(--gold)" suffix="%" />;
        })}
        {mood.length > 0 && (
          <div style={{ marginTop: 8 }} data-testid="mood">
            <div className="small muted">🌡️ רוח הציבור</div>
            {mood.map((l) => (
              <div key={l} className="small">
                • {l}
              </div>
            ))}
          </div>
        )}
        <p className="tiny faint" style={{ margin: '6px 0 0' }}>כשהציבור כועס על הממשלה, השותפות לחוצות. רוח הציבור (מלחמה, יוקר, משבר אמון) מזיזה מנדטים בין המחנות.</p>
      </div>

      {(sv.billQ || sv.presidentQ) && (
        <div className="card" style={{ marginTop: 10 }}>
          {sv.billQ && (
            <>
              <h3>❓ האם את/ה תומך/ת ב"{sv.billQ.title}"?</h3>
              <Meter label="בעד" value={sv.billQ.yes} color="#4ade80" suffix="%" />
              <Meter label="נגד" value={sv.billQ.no} color="#f87171" suffix="%" />
            </>
          )}
          {sv.presidentQ && (
            <div data-testid="president-q" style={{ marginTop: sv.billQ ? 10 : 0 }}>
              <h3>🏛️ מי ראוי/ה להיות הנשיא/ה הבא/ה?</h3>
              {sv.presidentQ.map((x) => (
                <Meter key={x.id} label={surveyName(g, x.id)} value={x.pct} color={partyOf(x.id)?.color} suffix="%" />
              ))}
              <p className="tiny faint" style={{ margin: '4px 0 0' }}>הח"כים בוחרים – אבל הלחץ הציבורי משפיע על ההצבעה.</p>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 10 }}>
        <h3>🪞 איך רואים אותך</h3>
        {sv.player ? (
          <>
            <Meter label="מכירים אותך" value={sv.player.known} color="#94a3b8" suffix="%" />
            <Meter label="דעה חיובית" value={sv.player.favorable} color="#4ade80" suffix="%" />
            <Meter label="דעה שלילית" value={sv.player.unfavorable} color="#f87171" suffix="%" />
          </>
        ) : (
          <p className="small muted">עדיין לא מספיק מכירים אותך כדי לשאול עליך.</p>
        )}
        <div className="small muted" style={{ margin: '10px 0 4px' }}>במגזרים</div>
        {SECTORS.map((sec) => (
          <Meter key={sec} label={SECTOR_NAMES[sec]} value={Math.round(g.player.approval[sec])} color={g.player.approval[sec] >= 55 ? '#4ade80' : g.player.approval[sec] <= 40 ? '#f87171' : '#94a3b8'} />
        ))}
      </div>
    </>
  );
}

export function PollsSheet() {
  const g = useGame();
  const sv = latestSurvey(g);
  return (
    <Sheet title="📊 הסקר המלא" sub={sv ? `${sv.pollster} · סקר חדש כל שבועיים` : undefined}>
      <PollsView />
    </Sheet>
  );
}
