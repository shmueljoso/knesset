import { useMemo } from 'react';
import { shortDateLabel } from '../engine/calendar';
import { isCoalition } from '../engine/systems/government';
import { pollSeats } from '../engine/systems/opinion';
import type { GameState, Ideology, NewsItem } from '../engine/types';
import { SECTORS, SECTOR_NAMES, leanAlignment } from '../engine/util';
import { useGame } from '../store';
import { Meter } from './common';

interface Paper {
  name: string;
  icon: string;
  lean: Partial<Ideology>;
  blurb: string;
}

const PAPERS: Paper[] = [
  { name: 'ידיעות המשכן', icon: '📰', lean: {}, blurb: 'העיתון הנפוץ. כותרות גדולות, הרבה רכילות.' },
  { name: 'הארץ שלנו', icon: '🗞️', lean: { judiciary: -60, religion: -60, security: -40 }, blurb: 'ליברלי, ביקורתי כלפי הימין.' },
  { name: 'ישראל בבוקר', icon: '📯', lean: { security: 60, judiciary: 50, religion: 30 }, blurb: 'ימני, ביקורתי כלפי השמאל ובג"ץ.' },
];

/** ההטיה של עיתון כלפי מי שהידיעה עליו */
function slant(g: GameState, n: NewsItem, paper: Paper): number {
  if (!Object.keys(paper.lean).length) return 0;
  const subject: Ideology | null = n.aboutPlayer ? g.player.ideology : n.npcId && g.npcs[n.npcId] ? g.npcs[n.npcId].ideology : null;
  return subject ? leanAlignment(subject, paper.lean) : 0;
}

function spin(headline: string, tone: NewsItem['tone'], s: number): string {
  if (s > 0.35) return tone === 'bad' ? `${headline} – אבל התמונה מורכבת יותר` : tone === 'good' ? `הישג: ${headline}` : headline;
  if (s < -0.2) return tone === 'good' ? `למרות הספין: ${headline}` : tone === 'bad' ? `סקנדל: ${headline}` : `${headline}. שאלות קשות נשארות`;
  return headline;
}

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
  return out.slice(0, 4);
}

export function PapersView() {
  const g = useGame();
  const recent = g.news.slice(0, 6);
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
      {PAPERS.map((paper) => (
        <div key={paper.name} className="card" style={{ marginTop: 10 }}>
          <div className="spread">
            <h3>
              {paper.icon} {paper.name}
            </h3>
            <span className="tiny muted">{paper.blurb}</span>
          </div>
          {recent.slice(0, 4).map((n) => (
            <div key={n.id} className="small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', fontWeight: n.aboutPlayer ? 700 : 400 }}>
              <span className="tiny faint">{shortDateLabel(g, n.week)} · </span>
              {spin(n.headline, n.tone, slant(g, n, paper))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export function PollsView() {
  const g = useGame();
  const thr = g.rules.threshold;
  const hist = g.pollHistory;
  const back = hist[Math.max(0, hist.length - 5)]?.polls ?? {};
  const rows = Object.values(g.parties).sort((a, b) => b.poll - a.poll);
  const coal = rows.filter((p) => isCoalition(g, p.id)).reduce((a, p) => a + pollSeats(p.poll, thr), 0);
  // מי מתאים לראשות הממשלה: יו"רי ארבע המפלגות הגדולות
  const pmPoll = useMemo(() => {
    const leaders = rows.slice(0, 4).map((p) => {
      const isMe = p.leaderId === 'player';
      const n = g.npcs[p.leaderId];
      const score = p.poll * 1.4 + (isMe ? g.player.fame * 0.35 + (g.player.reputation - 50) * 0.2 : (n?.influence ?? 40) * 0.3) + (g.coalition.pmId === p.leaderId ? 6 : 0);
      return { name: isMe ? `${g.player.name} (את/ה)` : n?.name ?? p.name, party: p.short, score: Math.max(1, score), color: p.color };
    });
    const total = leaders.reduce((a, x) => a + x.score, 0) + 15;
    return leaders.map((x) => ({ ...x, pct: Math.round((x.score / total) * 100) })).sort((a, b) => b.pct - a.pct);
  }, [g, rows]);
  return (
    <>
      <div className="card" data-testid="polls-view">
        <div className="spread">
          <h3>📊 סקר המנדטים</h3>
          <span className="small gold">קואליציה {coal} · אופוזיציה {120 - coal}</span>
        </div>
        {rows.map((p) => {
          const seats = pollSeats(p.poll, thr);
          const was = back[p.id] !== undefined ? pollSeats(back[p.id], thr) : seats;
          const d = seats - was;
          return (
            <div key={p.id} className="row small" style={{ gap: 8, padding: '4px 0', opacity: seats ? 1 : 0.6, fontWeight: p.id === g.player.partyId ? 800 : 400 }}>
              <span className="party-dot" style={{ background: p.color }} />
              <span className="grow">{p.name}</span>
              {d !== 0 && <span className={d > 0 ? 'good' : 'bad'}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>}
              <b style={{ width: 70, textAlign: 'end' }}>{seats || `${p.poll.toFixed(1)}% ⚠️`}</b>
            </div>
          );
        })}
        <p className="tiny faint" style={{ margin: '6px 0 0' }}>▲▼ = שינוי בחודש האחרון. ⚠️ = מתחת לאחוז החסימה ({thr}%).</p>
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        <h3>👑 מי מתאים יותר לראשות הממשלה?</h3>
        {pmPoll.map((x) => (
          <Meter key={x.name} label={`${x.name} · ${x.party}`} value={x.pct} color={x.color} suffix="%" />
        ))}
        <p className="tiny faint" style={{ margin: '6px 0 0' }}>השאר: "אף אחד מהם" / "לא יודע".</p>
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        <h3>🧭 איך רואים אותך במגזרים</h3>
        {SECTORS.map((sec) => (
          <Meter key={sec} label={SECTOR_NAMES[sec]} value={Math.round(g.player.approval[sec])} color={g.player.approval[sec] >= 55 ? '#4ade80' : g.player.approval[sec] <= 40 ? '#f87171' : '#94a3b8'} />
        ))}
      </div>
    </>
  );
}
