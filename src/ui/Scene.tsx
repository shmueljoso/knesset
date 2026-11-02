// "במה" גרפית לאירועים: אולפן טלוויזיה לראיון, במות עימות, מסדרון הכנסת לציד קולות, הפגנה, בית משפט,
// מבזק ומליאה. רק תצוגה – בלי שינוי מצב. האנימציות נעצרות ב-prefers-reduced-motion.
import type { CSSProperties, ReactNode } from 'react';
import type { GameEvent } from '../engine/data/events';
import type { Ctx } from '../engine/ops';
import { fill } from '../engine/ops';
import { outletName } from '../engine/systems/media';
import { ISSUES } from '../engine/data/issues';
import type { AvatarSpec, GameState, Npc } from '../engine/types';
import { Avatar } from './Avatar';

export type SceneKind = 'studio' | 'debate' | 'corridor' | 'backroom' | 'protest' | 'court' | 'breaking' | 'plenum';

const BY_ICON: Record<string, SceneKind> = {
  '📺': 'studio', '🎙️': 'studio',
  '⚖️': 'court', '🧑‍⚖️': 'court',
  '🪧': 'protest', '📣': 'protest', '🔥': 'protest', '✊': 'protest', '⛺': 'protest', '🕯️': 'protest',
  '🚨': 'breaking', '🚔': 'breaking', '🚓': 'breaking', '🪖': 'breaking', '📉': 'breaking', '🚀': 'breaking',
  '🗳️': 'plenum', '📜': 'plenum', '🏛️': 'plenum', '✂️': 'plenum', '🪑': 'plenum',
  '🤝': 'backroom', '💼': 'backroom', '🔑': 'backroom', '🤐': 'backroom', '🕵️': 'backroom', '💰': 'backroom', '🫱': 'backroom',
  '⚔️': 'breaking', '🗞️': 'breaking', '🧱': 'corridor',
};

export function sceneFor(ev: GameEvent): SceneKind | null {
  if (ev.id === 'deb_round') return 'debate';
  if (ev.id === 'whip_round') return 'corridor';
  if (ev.id.startsWith('iv_')) return 'studio';
  if (BY_ICON[ev.icon]) return BY_ICON[ev.icon];
  if (ev.issue) return 'protest';
  return null;
}

const ring = (g: GameState, n: Npc | null | undefined) => (n?.partyId ? g.parties[n.partyId]?.color : undefined) ?? '#64748b';

/** נקודות התקדמות (שאלה/סבב n מתוך 3) */
function Steps({ n, of = 3 }: { n: number; of?: number }) {
  return (
    <div className="sc-steps" aria-label={`שלב ${n} מתוך ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <i key={i} className={i < n - 1 ? 'done' : i === n - 1 ? 'now' : ''} />
      ))}
    </div>
  );
}

function Person({ spec, color, label, style, size = 54 }: { spec: AvatarSpec; color: string; label: string; style?: CSSProperties; size?: number }) {
  return (
    <div className="sc-person" style={style}>
      <Avatar spec={spec} size={size} ring={color} />
      <span className="sc-name" style={{ borderColor: color }}>
        {label}
      </span>
    </div>
  );
}

function Frame({ kind, children, label }: { kind: SceneKind; children: ReactNode; label: string }) {
  return (
    <div className={`scene sc-${kind}`} role="img" aria-label={label} data-testid={`scene-${kind}`}>
      {children}
    </div>
  );
}

export function Scene({ g, ev, ctx }: { g: GameState; ev: GameEvent; ctx: Ctx }) {
  const kind = sceneFor(ev);
  if (!kind) return null;
  const p = g.player;
  const me = p.partyId ? g.parties[p.partyId]?.color ?? '#e8c37a' : '#e8c37a';
  const npc = ctx.npc ? g.npcs[ctx.npc] : null;
  const first = (n: { name: string }) => n.name.split(' ')[0];
  const title = fill(g, ev.title, ctx);

  switch (kind) {
    case 'studio': {
      const host = g.npcs[String(g.flags.ivHost ?? '')] ?? (npc && npc.role === 'journalist' ? npc : null);
      const channel = host?.outlet ? outletName(g, host.outlet) : 'ערוץ המשכן';
      const n = Number(ctx.n ?? g.flags.ivStep ?? 0);
      const score = Number(g.flags.ivScore ?? 0);
      return (
        <Frame kind="studio" label={`אולפן ${channel}`}>
          <div className="sc-beam a" />
          <div className="sc-beam b" />
          <div className="sc-screen">
            <span>{channel}</span>
          </div>
          <div className="sc-live">● שידור חי</div>
          {n > 0 && <Steps n={n} />}
          {host && <Person spec={host.avatar} color="#5aa9ff" label={first(host)} style={{ insetInlineEnd: '14%' }} />}
          <Person spec={p.avatar} color={me} label={first(p)} style={{ insetInlineStart: '14%' }} />
          <div className="sc-desk" />
          {n > 0 && (
            <div className="sc-meter" title="תגובת הצופים">
              <span>הצופים</span>
              <b style={{ width: `${50 + Math.max(-3, Math.min(3, score)) * 15}%` }} />
            </div>
          )}
          <div className="sc-lower">
            <b>{channel}</b>
            <span className="sc-ticker">
              <span>{title} · {p.name} באולפן · {title}</span>
            </span>
          </div>
        </Frame>
      );
    }
    case 'debate': {
      const opp = npc;
      const n = Number(ctx.n ?? 1);
      const score = Number(g.flags.debScore ?? 0);
      return (
        <Frame kind="debate" label="עימות טלוויזיוני">
          <div className="sc-beam a" />
          <div className="sc-beam b" />
          <div className="sc-vs">VS</div>
          <Steps n={n} />
          <div className="sc-podium" style={{ insetInlineStart: '8%', borderColor: me }}>
            <Person spec={p.avatar} color={me} label={first(p)} style={{ position: 'static' }} size={50} />
          </div>
          {opp && (
            <div className="sc-podium" style={{ insetInlineEnd: '8%', borderColor: ring(g, opp) }}>
              <Person spec={opp.avatar} color={ring(g, opp)} label={first(opp)} style={{ position: 'static' }} size={50} />
            </div>
          )}
          <div className="sc-tug" title="מי מוביל/ה">
            <b style={{ width: `${50 + Math.max(-3, Math.min(3, score)) * 16}%`, background: me }} />
          </div>
          <div className="sc-lower">
            <b>עימות</b>
            <span className="sc-ticker">
              <span>{ctx.issueName ? `הנושא: ${ctx.issueName}` : title} · סבב {n} מתוך 3</span>
            </span>
          </div>
        </Frame>
      );
    }
    case 'corridor':
      return (
        <Frame kind="corridor" label="מסדרון הכנסת">
          <div className="sc-doors">
            {Array.from({ length: 5 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          {ev.id === 'whip_round' && <Steps n={Number(ctx.n ?? 1)} />}
          <Person spec={p.avatar} color={me} label={first(p)} style={{ insetInlineStart: '18%' }} />
          {npc && <Person spec={npc.avatar} color={ring(g, npc)} label={first(npc)} style={{ insetInlineEnd: '18%' }} />}
          {ev.id === 'whip_round' && (
            <div className="sc-paper">
              📄 {ctx.billTitle}
              <b>✍️ {Number(g.flags.whipGot ?? 0)} התחייבו</b>
            </div>
          )}
        </Frame>
      );
    case 'backroom':
      return (
        <Frame kind="backroom" label="חדר סגור">
          <div className="sc-lamp" />
          <div className="sc-table" />
          <Person spec={p.avatar} color={me} label={first(p)} style={{ insetInlineStart: '16%' }} />
          {npc && <Person spec={npc.avatar} color={ring(g, npc)} label={first(npc)} style={{ insetInlineEnd: '16%' }} />}
          <div className="sc-tag">🤫 מחוץ לפרוטוקול</div>
        </Frame>
      );
    case 'protest': {
      const issue = ev.issue ? ISSUES.find((i) => i.id === ev.issue) : null;
      const sign = issue ? `${issue.icon} ${issue.name}` : title;
      return (
        <Frame kind="protest" label="הפגנה">
          <div className="sc-sky" />
          <div className="sc-signs">
            <span>{sign}</span>
            <span>!!!</span>
            <span>{sign}</span>
          </div>
          <div className="sc-crowd">
            {Array.from({ length: 22 }, (_, i) => (
              <i key={i} style={{ animationDelay: `${(i % 7) * 0.13}s`, height: 18 + ((i * 7) % 11) }} />
            ))}
          </div>
          {npc && <Person spec={npc.avatar} color={ring(g, npc)} label={first(npc)} style={{ insetInlineEnd: '10%', top: 10 }} size={44} />}
        </Frame>
      );
    }
    case 'court':
      return (
        <Frame kind="court" label="בית המשפט העליון">
          <div className="sc-pediment" />
          <div className="sc-columns">
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          <div className="sc-scale">⚖️</div>
          <div className="sc-lower">
            <b>בג"ץ</b>
            <span className="sc-ticker">
              <span>{title}</span>
            </span>
          </div>
        </Frame>
      );
    case 'breaking':
      return (
        <Frame kind="breaking" label="מבזק">
          <div className="sc-siren" />
          <div className="sc-big">{ev.icon}</div>
          {npc && <Person spec={npc.avatar} color={ring(g, npc)} label={first(npc)} style={{ insetInlineEnd: '10%' }} size={48} />}
          <div className="sc-lower red">
            <b>מבזק</b>
            <span className="sc-ticker">
              <span>{title} · {title}</span>
            </span>
          </div>
        </Frame>
      );
    case 'plenum':
      return (
        <Frame kind="plenum" label="מליאת הכנסת">
          <div className="sc-hemi">
            {Array.from({ length: 30 }, (_, i) => {
              const a = Math.PI * (i / 29);
              const r = i % 2 ? 42 : 30;
              const party = Object.values(g.parties).filter((x) => x.seats > 0)[i % Math.max(1, Object.values(g.parties).filter((x) => x.seats > 0).length)];
              return <i key={i} style={{ left: `${50 - Math.cos(a) * r}%`, bottom: `${8 + Math.sin(a) * r * 1.6}%`, background: party?.color ?? '#64748b' }} />;
            })}
          </div>
          <div className="sc-menorah">🕎</div>
          {npc && <Person spec={npc.avatar} color={ring(g, npc)} label={first(npc)} style={{ insetInlineEnd: '6%', top: 8 }} size={42} />}
        </Frame>
      );
  }
}
