import { useMemo, useState } from 'react';
import type { GameState } from '../engine/types';
import { foundForecast } from '../engine/systems/figures';
import { cancellables, playerRoles, resignRole, type Role } from '../engine/systems/resign';
import {
  SWAY_COST, courtDefector, courtDefectorBlocked, courtDefectorChance, defectGroup, oustBlocked, oustChance, oustLeader, oustTarget,
  urgeFound, urgeFoundBlocked, urgeFoundChance, urgeMerge, urgeMergeBlocked, urgeMergeChance,
} from '../engine/systems/sway';
import { useGame, useStore } from '../store';
import { PartyTag, Sheet } from './common';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function RoleRow({ r }: { r: Role }) {
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const [armed, setArmed] = useState(false);
  return (
    <div className="card" data-testid={`role-${r.id.split(':')[0]}`}>
      <div className="spread" style={{ alignItems: 'flex-start', gap: 8 }}>
        <div className="grow">
          <b>
            {r.icon} {r.title}
          </b>
          <div className="tiny muted">{r.blocked ?? r.effect}</div>
        </div>
        {armed ? (
          <button
            className="btn sm danger"
            onClick={() => {
              const res = act((s) => resignRole(s, r.id));
              toast(res.text, res.ok ? 'neutral' : 'bad');
              setArmed(false);
            }}
          >
            בטוח?
          </button>
        ) : (
          <button className={`btn sm ${r.danger ? 'danger' : ''}`} disabled={!!r.blocked} onClick={() => setArmed(true)}>
            {r.id.startsWith('bill:') || r.id.startsWith('project:') ? 'ביטול' : 'לעזוב'}
          </button>
        )}
      </div>
    </div>
  );
}

/** כל התפקידים שלך ומה אפשר לעזוב או לבטל */
export function RolesSheet() {
  const g = useGame();
  const roles = playerRoles(g);
  const cancel = cancellables(g);
  return (
    <Sheet title="🚪 התפקידים שלי" sub="להתפטר, לפרוש או לבטל – ומה יקרה אחר כך">
      {roles.length === 0 && <div className="card small muted">אין לך כרגע תפקיד רשמי.</div>}
      <div className="col">
        {roles.map((r) => (
          <RoleRow key={r.id} r={r} />
        ))}
      </div>
      {cancel.length > 0 && (
        <>
          <div className="section-label">דברים שהתחלת</div>
          <div className="col">
            {cancel.map((r) => (
              <RoleRow key={r.id} r={r} />
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

type Tab = 'defect' | 'found' | 'merge' | 'oust';
const TABS: [Tab, string][] = [
  ['defect', '🧲 ערקים'],
  ['found', '🌱 מפלגה חדשה'],
  ['merge', '🤝 איחוד'],
  ['oust', '🗡️ הדחה'],
];

function Go({ cost, blocked, chance, onClick, testid }: { cost: number; blocked: string | null; chance: number; onClick: () => void; testid?: string }) {
  if (blocked)
    return (
      <span className="tiny muted" style={{ maxWidth: '45%', textAlign: 'end', flexShrink: 0 }} data-testid={testid ? `${testid}-blocked` : undefined}>
        🔒 {blocked}
      </span>
    );
  return (
    <button className="btn sm" style={{ flexShrink: 0 }} onClick={onClick} data-testid={testid}>
      ⏱1 · {cost} הון · {pct(chance)}
    </button>
  );
}

/** השפעה מאחורי הקלעים על אנשים ומפלגות אחרים */
export function SwaySheet() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const open = useStore((s) => s.open);
  const [tab, setTab] = useState<Tab>('defect');
  const run = (fn: (s: GameState) => { ok: boolean; text: string }) => {
    const r = act(fn);
    toast(r.text, r.ok ? 'good' : 'bad');
  };
  const parties = Object.values(g.parties).filter((p) => p.id !== g.player.partyId && (p.seats > 0 || p.poll > 1)).sort((a, b) => b.poll - a.poll);
  const [a, setA] = useState(parties[0]?.id ?? '');
  const [b, setB] = useState(parties[1]?.id ?? '');
  const leaders = new Set(Object.values(g.parties).map((p) => p.leaderId));

  const defectors = useMemo(
    () =>
      Object.values(g.npcs)
        .filter((n) => (n.isMK || (n.role === 'candidate' && n.notable)) && n.partyId && n.partyId !== g.player.partyId && !leaders.has(n.id) && !n.ministry)
        .map((n) => ({ n, c: courtDefectorChance(g, n.id) }))
        .sort((x, y) => y.c - x.c)
        .slice(0, 10),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [g],
  );
  const founders = useMemo(
    () =>
      Object.values(g.npcs)
        .filter((n) => (n.isMK || n.notable) && (n.role === 'mk' || n.role === 'candidate') && !leaders.has(n.id) && !n.ministry && n.partyId !== g.player.partyId)
        .map((n) => ({ n, f: foundForecast(g, n.id), c: urgeFoundChance(g, n.id) }))
        .sort((x, y) => y.f.pct - x.f.pct)
        .slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [g],
  );
  const pledged = Object.values(g.npcs).filter((n) => n.pledgedTo && n.pledgedTo === g.player.partyId);

  return (
    <Sheet title="🎭 מאחורי הקלעים" sub={`להזיז אחרים: ערקים, מפלגות חדשות, איחודים והדחות · הון פוליטי: ${g.player.capital}`}>
      <div className="filter-row">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} data-testid={`sway-${k}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'defect' && (
        <>
          <p className="tiny muted">
            ח"כ שמביא/ה איתו/ה שליש מהסיעה עובר/ת אליך מיד (פילוג חוקי). אחרת – מתחייב/ת לרוץ ברשימה שלך בבחירות הבאות.
          </p>
          {pledged.length > 0 && <div className="card small">🤝 התחייבו לרוץ איתך: {pledged.map((n) => n.name).join(', ')}</div>}
          <div className="col">
            {defectors.map(({ n, c }) => {
              const grp = defectGroup(g, n.id);
              return (
                <div key={n.id} className="card row" style={{ gap: 8 }}>
                  <div className="grow" onClick={() => open({ kind: 'npc', id: n.id })} style={{ cursor: 'pointer' }}>
                    <b>{n.name}</b> <PartyTag party={n.partyId ? g.parties[n.partyId] : null} short />
                    <div className="tiny muted">{grp.immediate ? `עובר/ת מיד${grp.group.length > 1 ? ` עם עוד ${grp.group.length - 1}` : ''}` : n.isMK ? `התחייבות לבחירות (לפילוג צריך ${grp.needed})` : 'מצטרף/ת לרשימה'}</div>
                  </div>
                  <Go cost={SWAY_COST.defect} blocked={courtDefectorBlocked(g, n.id)} chance={c} onClick={() => run((s) => courtDefector(s, n.id))} testid="court-defector" />
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'found' && (
        <>
          <p className="tiny muted">לשכנע דמות בולטת לפרוש ולהקים מפלגה – כדי לפצל את היריבים או לבנות שותפה עתידית.</p>
          <div className="col">
            {founders.map(({ n, f, c }) => (
              <div key={n.id} className="card row" style={{ gap: 8 }}>
                <div className="grow" onClick={() => open({ kind: 'npc', id: n.id })} style={{ cursor: 'pointer' }}>
                  <b>{n.name}</b> <PartyTag party={n.partyId ? g.parties[n.partyId] : null} short />
                  <div className="tiny muted">
                    בסקר "מה אם": {f.seats} מנדטים{f.takes[0] ? ` · לוקח/ת בעיקר מ${g.parties[f.takes[0].party]?.short}` : ''}
                  </div>
                </div>
                <Go cost={SWAY_COST.found} blocked={urgeFoundBlocked(g, n.id)} chance={c} onClick={() => run((s) => urgeFound(s, n.id))} testid="urge-found" />
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'merge' && (
        <div className="card">
          <p className="tiny muted" style={{ marginTop: 0 }}>לתווך בין שתי מפלגות אחרות. מפלגות קטנות מתחת לאחוז החסימה – הכי קל לשכנע.</p>
          <div className="row" style={{ gap: 8 }}>
            {[
              [a, setA],
              [b, setB],
            ].map(([val, set], i) => (
              <select key={i} className="text-input grow" value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} data-testid={`merge-pick-${i}`}>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.seats})
                  </option>
                ))}
              </select>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <Go cost={SWAY_COST.merge} blocked={a === b ? 'צריך שתי מפלגות שונות' : urgeMergeBlocked(g, a, b)} chance={urgeMergeChance(g, a, b)} onClick={() => run((s) => urgeMerge(s, a, b))} testid="urge-merge" />
          </div>
        </div>
      )}

      {tab === 'oust' && (
        <>
          <p className="tiny muted">לעודד מרד ביו"ר של מפלגה אחרת. יו"ר שמפסיד/ה בסקרים – פגיע/ה יותר. היורש/ת יזכור/תזכור לך את זה.</p>
          <div className="col">
            {parties
              .filter((p) => g.npcs[p.leaderId])
              .map((p) => {
                const ch = oustTarget(g, p.id);
                return (
                  <div key={p.id} className="card row" style={{ gap: 8 }}>
                    <div className="grow">
                      <b>{p.name}</b>
                      <div className="tiny muted">
                        {g.npcs[p.leaderId].name} ← {ch ? ch.name : 'אין יורש/ת'}
                      </div>
                    </div>
                    <Go cost={SWAY_COST.oust} blocked={oustBlocked(g, p.id)} chance={oustChance(g, p.id)} onClick={() => run((s) => oustLeader(s, p.id))} testid="oust" />
                  </div>
                );
              })}
          </div>
        </>
      )}
    </Sheet>
  );
}

/** בפרופיל של ח"כ: מהלכים ישירים עליו/ה */
export function NpcSwayCard({ id }: { id: string }) {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const n = g.npcs[id];
  if (!n || n.role === 'journalist' || n.role === 'lobbyist' || !n.partyId || n.partyId === g.player.partyId) return null;
  const run = (fn: (s: GameState) => { ok: boolean; text: string }) => {
    const r = act(fn);
    toast(r.text, r.ok ? 'good' : 'bad');
  };
  const grp = defectGroup(g, id);
  return (
    <div className="card small" data-testid="npc-sway">
      <b>🎭 מאחורי הקלעים</b>
      {n.pledgedTo === g.player.partyId && <div className="tiny good">התחייב/ה לרוץ איתך בבחירות הבאות</div>}
      <div className="col" style={{ marginTop: 6, gap: 6 }}>
        <div className="spread" style={{ gap: 8 }}>
          <span className="tiny">🧲 לשכנע לעבור אליך{g.player.partyId ? (grp.immediate ? ' (מיד)' : ' (לבחירות הבאות)') : ''}</span>
          <Go cost={SWAY_COST.defect} blocked={courtDefectorBlocked(g, id)} chance={courtDefectorChance(g, id)} onClick={() => run((s) => courtDefector(s, id))} />
        </div>
        <div className="spread" style={{ gap: 8 }}>
          <span className="tiny">🌱 לעודד להקים מפלגה</span>
          <Go cost={SWAY_COST.found} blocked={urgeFoundBlocked(g, id)} chance={urgeFoundChance(g, id)} onClick={() => run((s) => urgeFound(s, id))} />
        </div>
      </div>
    </div>
  );
}
