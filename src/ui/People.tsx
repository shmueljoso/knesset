import { useMemo, useState } from 'react';
import { INTERACTIONS, interact, interactionBlocked } from '../engine';
import { LOCATIONS } from '../engine/data/locations';
import { isCoalition } from '../engine/systems/government';
import { TRAIT_INFO, attitudeColor, attitudeLabel, debtsWith } from '../engine/systems/relationships';
import type { Npc } from '../engine/types';
import { AXES, AXIS_NAMES } from '../engine/util';
import { useGame, useStore } from '../store';
import { Avatar } from './Avatar';
import { Meter, PartyTag, Sheet } from './common';
import { CATCHPHRASES, greeting } from '../engine/data/personality';
import { templateById } from '../engine/data/bills';
import { npcBenefits } from '../engine/systems/influence';

type Filter = 'notable' | 'mine' | 'coalition' | 'opposition' | 'allies' | 'rivals' | 'gov' | 'media' | 'all';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'notable', label: 'בולטים' },
  { id: 'mine', label: 'המפלגה שלי' },
  { id: 'allies', label: 'בעלי ברית' },
  { id: 'rivals', label: 'יריבים' },
  { id: 'gov', label: 'ממשלה' },
  { id: 'coalition', label: 'קואליציה' },
  { id: 'opposition', label: 'אופוזיציה' },
  { id: 'media', label: 'תקשורת ולובי' },
  { id: 'all', label: 'כולם' },
];

export function npcSubtitle(n: Npc) {
  if (n.title) return n.title;
  if (n.isMK) return 'חבר/ת כנסת';
  if (n.role === 'candidate') return 'מועמד/ת ברשימה';
  return '';
}

export function PeopleView() {
  const g = useGame();
  const open = useStore((s) => s.open);
  const [filter, setFilter] = useState<Filter>('notable');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(40);

  const list = useMemo(() => {
    let arr = Object.values(g.npcs).filter((n) => n.isMK || n.role === 'journalist' || n.role === 'lobbyist' || (n.role === 'candidate' && n.partyId === g.player.partyId));
    const f: Record<Filter, (n: Npc) => boolean> = {
      notable: (n) => n.notable || !!n.title || n.id === g.player.employerId,
      mine: (n) => !!g.player.partyId && n.partyId === g.player.partyId,
      allies: (n) => n.attitude >= 35,
      rivals: (n) => n.attitude <= -20,
      gov: (n) => !!n.ministry && n.ministry !== 'speaker',
      coalition: (n) => n.isMK && isCoalition(g, n.partyId),
      opposition: (n) => n.isMK && !isCoalition(g, n.partyId),
      media: (n) => n.role === 'journalist' || n.role === 'lobbyist',
      all: () => true,
    };
    arr = arr.filter(f[filter]);
    if (q.trim()) arr = arr.filter((n) => n.name.includes(q.trim()) || (n.partyId && g.parties[n.partyId].name.includes(q.trim())));
    return arr.sort((a, b) => (b.id === g.player.employerId ? 1 : 0) - (a.id === g.player.employerId ? 1 : 0) || (b.title ? 1 : 0) - (a.title ? 1 : 0) || b.influence - a.influence);
  }, [g, filter, q]);

  return (
    <div className="scroll">
      <div className="page">
        <input className="search" placeholder="חיפוש לפי שם או מפלגה…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="filter-row" style={{ margin: '10px 0' }}>
          {FILTERS.map((f) => (
            <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => { setFilter(f.id); setLimit(40); }}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="small muted" style={{ marginBottom: 8 }}>{list.length} אנשים</div>
        {list.slice(0, limit).map((n) => (
          <button key={n.id} className="list-item" onClick={() => open({ kind: 'npc', id: n.id })}>
            <Avatar spec={n.avatar} size={44} ring={n.partyId ? g.parties[n.partyId].color : '#64748b'} />
            <div className="grow">
              <b className="ellipsis" style={{ display: 'block' }}>
                {n.name} {n.id === g.player.employerId && <span className="chip gold">הבוס</span>}
              </b>
              <div className="tiny muted ellipsis">
                {n.partyId ? g.parties[n.partyId].short : ''}
                {npcSubtitle(n) ? ` · ${npcSubtitle(n)}` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'end' }}>
              <b style={{ color: attitudeColor(n.attitude) }}>
                {n.attitude > 0 ? '+' : ''}
                {n.attitude}
              </b>
              <div className="tiny faint">{attitudeLabel(n.attitude)}</div>
            </div>
          </button>
        ))}
        {list.length > limit && (
          <button className="btn block" style={{ marginTop: 10 }} onClick={() => setLimit(limit + 40)}>
            עוד…
          </button>
        )}
      </div>
    </div>
  );
}

export function NpcSheet({ id }: { id: string }) {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const n = g.npcs[id];
  if (!n) return null;
  const party = n.partyId ? g.parties[n.partyId] : null;
  const present = (g.presence[g.player.location] ?? []).includes(n.id);
  const where = (Object.entries(g.presence) as [keyof typeof LOCATIONS, string[]][]).find(([, ids]) => ids.includes(n.id))?.[0];
  const debts = debtsWith(g, n.id);
  const hidden = n.traits.length - n.knownTraits.length;
  const chairOf = g.committees.find((c) => c.chairId === n.id);
  const pledged = g.bills.filter((b) => n.pledges.includes(b.id));

  return (
    <Sheet
      title={n.name}
      sub={
        <span className="row" style={{ gap: 8, display: 'inline-flex', flexWrap: 'wrap' }}>
          <PartyTag party={party} />
          {npcSubtitle(n) && <span>· {npcSubtitle(n)}</span>}
        </span>
      }
      icon={<Avatar spec={n.avatar} size={56} ring={party?.color ?? '#64748b'} />}
    >
      <div className="card" style={{ borderInlineStart: `4px solid ${party?.color ?? 'var(--line)'}` }}>
        <div className="small">
          💬 "{greeting(n.attitude)} {n.knownTraits.length ? CATCHPHRASES[n.knownTraits[0]][n.id.length % 3] : ''}"
        </div>
        <div className="tiny muted" style={{ marginTop: 6 }}>
          {n.bio} {chairOf && `יו"ר ${chairOf.name}.`}
        </div>
        {n.agenda && (
          <div className="tiny" style={{ marginTop: 6 }}>
            📌 הנושא שלו/ה: <b>{templateById(n.agenda).title}</b> · שאפתנות {n.ambition >= 70 ? 'גבוהה' : n.ambition >= 40 ? 'בינונית' : 'נמוכה'}
          </div>
        )}
      </div>
      {n.memory?.length > 0 && (
        <>
          <div className="section-label">זוכר/ת עליך</div>
          <div className="card">
            {[...n.memory].reverse().map((m, i) => (
              <div key={i} className="small" style={{ padding: '3px 0' }}>
                {m.d > 0 ? '🟢' : m.d < 0 ? '🔴' : '⚪'} {m.text} <span className="tiny faint">· שבוע {m.week + 1}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="section-label">מה הוא/היא יכול/ה לעשות בשבילך</div>
      <div className="card">
        {npcBenefits(g, n).map((b, i) => (
          <div key={i} className="small" style={{ padding: '3px 0', opacity: b.active ? 1 : 0.6 }}>
            {b.active ? '✅' : '▫️'} {b.text}
          </div>
        ))}
      </div>
      <div className="card">
        <div className="spread" style={{ marginBottom: 8 }}>
          <b style={{ color: attitudeColor(n.attitude) }}>
            {attitudeLabel(n.attitude)} ({n.attitude > 0 ? '+' : ''}
            {n.attitude})
          </b>
          <span className="small muted">{present ? '📍 נמצא כאן עכשיו' : where ? `📍 השבוע ב${LOCATIONS[where].name}` : 'לא בכנסת השבוע'}</span>
        </div>
        <Meter label="אמון" value={n.trust} color="var(--gold)" />
        <Meter label="השפעה" value={n.influence} color="#c084fc" />
        <div className="chips" style={{ marginTop: 10 }}>
          {n.knownTraits.map((t) => (
            <span key={t} className="chip gold" title={TRAIT_INFO[t].desc}>
              {TRAIT_INFO[t].name}
            </span>
          ))}
          {hidden > 0 && <span className="chip">❓ {hidden} תכונות לא ידועות</span>}
          {debts.map((d) => (
            <span key={d.id} className={`chip ${d.dir === 'owes_player' ? 'good' : 'bad'}`}>
              {d.dir === 'owes_player' ? 'חייב לך טובה' : 'אתה חייב לו'}
            </span>
          ))}
          {pledged.map((b) => (
            <span key={b.id} className="chip good">התחייב: {b.title}</span>
          ))}
        </div>
        {n.knownTraits.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {n.knownTraits.map((t) => (
              <div key={t} className="tiny muted">
                <b>{TRAIT_INFO[t].name}:</b> {TRAIT_INFO[t].desc}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section-label">עמדות (● הוא · ◆ את/ה)</div>
      <div className="card">
        {AXES.map((ax) => (
          <div key={ax} style={{ marginBottom: 10 }}>
            <div className="spread tiny muted">
              <span>{AXIS_NAMES[ax][2]}</span>
              <b style={{ color: 'var(--text)' }}>{AXIS_NAMES[ax][0]}</b>
              <span>{AXIS_NAMES[ax][1]}</span>
            </div>
            <div className="axis" style={{ marginTop: 5 }}>
              <span className="mark" style={{ right: `${(100 - n.ideology[ax]) / 2}%`, transform: 'translateX(50%)', background: party?.color ?? '#fff' }} />
              <span className="mark" style={{ right: `${(100 - g.player.ideology[ax]) / 2}%`, transform: 'translateX(50%) rotate(45deg)', width: 9, height: 9, top: -1, background: 'var(--gold)' }} />
            </div>
          </div>
        ))}
      </div>

      <div className="section-label">אינטראקציה</div>
      {INTERACTIONS.map((it) => {
        const blocked = interactionBlocked(g, n, it);
        return (
          <button
            key={it.id}
            className="list-item action-item"
            disabled={!!blocked}
            onClick={() => {
              const r = act((s) => interact(s, n.id, it.id));
              toast(r.text, r.good ? 'good' : 'bad');
            }}
          >
            <span className="a-ico">{it.icon}</span>
            <div className="grow">
              <div className="spread">
                <b>{it.label}</b>
                <span className="cost">
                  ⏱{it.ap}
                  {it.capital ? ` · הון ${it.capital}` : ''}
                </span>
              </div>
              <div className="small muted">{blocked ?? it.desc}</div>
            </div>
          </button>
        );
      })}
    </Sheet>
  );
}
