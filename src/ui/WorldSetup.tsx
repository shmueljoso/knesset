import { useMemo, useState } from 'react';
import { BILL_TEMPLATES } from '../engine/data/bills';
import { ISSUES } from '../engine/data/issues';
import { WORLD_NAMES } from '../engine/systems/opinion';
import { SETUP_RULES, SETUP_TRANSFORMS, setupSummary, transformLabel, type StartSetup } from '../engine/systems/setup';
import type { IssueId, WorldKey } from '../engine/types';
import { AXES, AXIS_NAMES } from '../engine/util';
import { Sheet } from './common';

export interface SetupParty {
  id: string;
  name: string;
  color: string;
  poll: number;
}

type Tab = 'rules' | 'laws' | 'state' | 'polls';
const TABS: [Tab, string][] = [
  ['rules', '⚖️ כללים'],
  ['laws', '📜 חוקים בתוקף'],
  ['state', '🌍 מצב המדינה'],
  ['polls', '📈 סקרים'],
];
const CATS: [string, string][] = [
  ['economy', 'כלכלה'],
  ['welfare', 'רווחה'],
  ['religion', 'דת ומדינה'],
  ['society', 'חברה'],
  ['security', 'ביטחון'],
  ['governance', 'ממשל'],
  ['basic', 'חוקי יסוד'],
];
const PRESETS_KEY = 'hamishkan.setupPresets';

function loadPresets(): Record<string, StartSetup> {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function Slider({ label, value, set, min = 0, max = 100, def, testid }: { label: string; value: number | undefined; set: (v: number | undefined) => void; min?: number; max?: number; def: number; testid?: string }) {
  const on = value !== undefined;
  return (
    <div className="spread small" style={{ gap: 8, padding: '4px 0' }}>
      <span style={{ width: 110, flexShrink: 0, opacity: on ? 1 : 0.6 }}>{label}</span>
      <input type="range" min={min} max={max} value={value ?? def} onChange={(e) => set(Number(e.target.value))} style={{ flex: 1 }} data-testid={testid} />
      <b style={{ width: 34, textAlign: 'end', opacity: on ? 1 : 0.5 }}>{Math.round(value ?? def)}</b>
      <button className="icon-btn" style={{ visibility: on ? 'visible' : 'hidden', width: 26, height: 26 }} onClick={() => set(undefined)} aria-label="ברירת מחדל">
        ↺
      </button>
    </div>
  );
}

/** עולם מותאם אישית: מה נכון בפתיחת המשחק. אחרי הפתיחה – נעול */
export function WorldSetupSheet({ setup, onChange, onClose, parties }: { setup: StartSetup; onChange: (s: StartSetup) => void; onClose: () => void; parties: SetupParty[] }) {
  const [tab, setTab] = useState<Tab>('rules');
  const [q, setQ] = useState('');
  const [presets, setPresets] = useState(loadPresets);
  const [presetName, setPresetName] = useState('');
  const up = (patch: Partial<StartSetup>) => onChange({ ...setup, ...patch });
  const laws = setup.laws ?? [];
  const templates = useMemo(() => BILL_TEMPLATES.filter((t) => !t.hidden && !t.radical && (!q.trim() || t.title.includes(q.trim()) || t.summary.includes(q.trim()))), [q]);
  const pollSum = parties.reduce((a, p) => a + (setup.polls?.[p.id] ?? 0), 0);
  const fixedCount = Object.keys(setup.polls ?? {}).length;
  const setMap = <K extends 'world' | 'issues' | 'mood' | 'polls'>(key: K, k: string, v: number | undefined) => {
    const m = { ...((setup[key] as Record<string, number> | undefined) ?? {}) };
    if (v === undefined) delete m[k];
    else m[k] = v;
    up({ [key]: Object.keys(m).length ? m : undefined } as Partial<StartSetup>);
  };
  const toggleLaw = (id: string, scope?: 1 | 2 | 3) => {
    const has = laws.find((l) => l.id === id);
    if (scope) up({ laws: has ? laws.map((l) => (l.id === id ? { id, scope } : l)) : [...laws, { id, scope }] });
    else up({ laws: has ? laws.filter((l) => l.id !== id) : [...laws, { id, scope: 2 }] });
  };
  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const next = { ...presets, [name]: setup };
    setPresets(next);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      /* לא קריטי */
    }
    setPresetName('');
  };

  return (
    <Sheet title="🧪 עולם מותאם אישית" sub="מה נכון ביום הראשון. אחרי שהמשחק מתחיל – אי אפשר לשנות" onClose={onClose}>
      <div className="filter-row">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} data-testid={`setup-${k}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'rules' && (
        <div className="col">
          {SETUP_RULES.map((r) => (
            <label key={r.key} className="card row small" style={{ gap: 8, cursor: 'pointer' }} data-testid={`rule-${r.key}`}>
              <input type="checkbox" checked={!!setup.rules?.[r.key]} onChange={(e) => up({ rules: { ...setup.rules, [r.key]: e.target.checked } })} />
              <span className="grow">
                <b>{r.label}</b>
                <div className="tiny muted">{r.desc}</div>
              </span>
            </label>
          ))}
          <div className="card small">
            <Slider label="📊 אחוז החסימה" value={setup.rules?.threshold} def={3.25} min={0} max={10} set={(v) => up({ rules: { ...setup.rules, threshold: v } })} />
          </div>
          <div className="section-label">🌋 מהפכות שכבר קרו</div>
          <div className="filter-row" style={{ flexWrap: 'wrap' }}>
            {SETUP_TRANSFORMS.map((t) => {
              const on = setup.transforms?.includes(t);
              return (
                <button key={t} className={on ? 'on' : ''} onClick={() => up({ transforms: on ? setup.transforms!.filter((x) => x !== t) : [...(setup.transforms ?? []), t] })}>
                  {transformLabel(t)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'laws' && (
        <>
          <div className="filter-row">
            <button className={laws.some((l) => l.id === 'yeshiva') ? 'on' : ''} onClick={() => up({ laws: [...laws.filter((l) => l.id !== 'draft' && l.id !== 'yeshiva'), ...(laws.some((l) => l.id === 'yeshiva') ? [] : [{ id: 'yeshiva', scope: 2 as const }])] })} data-testid="preset-exemption">
              📖 פטור לבני ישיבות
            </button>
            <button className={laws.some((l) => l.id === 'draft') ? 'on' : ''} onClick={() => up({ laws: [...laws.filter((l) => l.id !== 'draft' && l.id !== 'yeshiva'), ...(laws.some((l) => l.id === 'draft') ? [] : [{ id: 'draft', scope: 2 as const }])] })}>
              🪖 חוק גיוס
            </button>
          </div>
          <input className="text-input" placeholder="🔍 חיפוש חוק" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: '8px 0' }} />
          {CATS.map(([cat, name]) => {
            const list = templates.filter((t) => t.category === cat);
            if (!list.length) return null;
            return (
              <div key={cat}>
                <div className="section-label">{name}</div>
                <div className="card">
                  {list.map((t) => {
                    const l = laws.find((x) => x.id === t.id);
                    return (
                      <div key={t.id} className="spread small" style={{ padding: '4px 0', gap: 8 }}>
                        <label className="row grow" style={{ gap: 6, cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!l} onChange={() => toggleLaw(t.id)} data-testid={`law-${t.id}`} />
                          <span>
                            {t.icon} {t.title}
                          </span>
                        </label>
                        {l && (
                          <select className="text-input" style={{ width: 'auto', padding: '2px 6px' }} value={l.scope} onChange={(e) => toggleLaw(t.id, Number(e.target.value) as 1 | 2 | 3)}>
                            {t.scopes.map((sc, i) => (
                              <option key={i} value={i + 1}>
                                {sc}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}

      {tab === 'state' && (
        <>
          <div className="section-label">🌍 מצב המדינה (0 = משבר, 100 = מצוין)</div>
          <div className="card">
            {(Object.keys(WORLD_NAMES) as WorldKey[]).map((k) => (
              <Slider key={k} label={WORLD_NAMES[k]} value={setup.world?.[k]} def={50} set={(v) => setMap('world', k, v)} testid={`world-${k}`} />
            ))}
          </div>
          <div className="section-label">🔥 סוגיות בוערות (כמה הציבור עסוק בהן)</div>
          <div className="card">
            {ISSUES.map((i) => (
              <Slider key={i.id} label={`${i.icon} ${i.name}`} value={setup.issues?.[i.id as IssueId]} def={i.base} set={(v) => setMap('issues', i.id, v)} />
            ))}
          </div>
          <div className="section-label">🧭 רוח הציבור (מינוס = שמאלה/חילוני, פלוס = ימינה/דתי)</div>
          <div className="card">
            {AXES.map((a) => (
              <Slider key={a} label={`${AXIS_NAMES[a][1]} ↔ ${AXIS_NAMES[a][2]}`} value={setup.mood?.[a]} def={0} min={-50} max={50} set={(v) => setMap('mood', a, v)} />
            ))}
          </div>
        </>
      )}

      {tab === 'polls' && (
        <>
          <p className="tiny muted">אחוז תמיכה בפתיחה. מפלגות שלא נגעת בהן מתחלקות ביתרה. המושבים בכנסת לא משתנים עד הבחירות.</p>
          <div className="card">
            {parties.map((p) => (
              <Slider key={p.id} label={p.name} value={setup.polls?.[p.id]} def={Math.round(p.poll * 10) / 10} max={50} set={(v) => setMap('polls', p.id, v)} testid={`poll-${p.id}`} />
            ))}
          </div>
          {fixedCount > 0 && <div className={`tiny ${pollSum > 100 ? 'bad' : 'muted'}`}>נקבעו {fixedCount} מפלגות: {Math.round(pollSum)}% {pollSum > 100 ? '– יותר מ-100%!' : `· ${Math.round(100 - pollSum)}% לשאר`}</div>}
        </>
      )}

      <div className="section-label">🔒 נעילה ותבניות</div>
      <label className="card row small" style={{ gap: 8 }}>
        <input type="checkbox" checked={setup.locked !== false} onChange={(e) => up({ locked: e.target.checked })} data-testid="setup-lock" />
        <span>לנעול: אי אפשר לערוך מספרים (מוניטין, סקרים, מצב המדינה) בכלים המתקדמים במהלך המשחק</span>
      </label>
      <div className="card small">
        <div className="row" style={{ gap: 6 }}>
          <input className="text-input grow" placeholder="שם לתבנית (למשל: ישראל 2030)" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
          <button className="btn sm" disabled={!presetName.trim()} onClick={savePreset}>
            💾 שמירה
          </button>
        </div>
        {Object.keys(presets).length > 0 && (
          <div className="filter-row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
            {Object.entries(presets).map(([name, ps]) => (
              <button key={name} onClick={() => onChange(ps)}>
                📂 {name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn ghost grow" onClick={() => onChange({})}>
          איפוס
        </button>
        <button className="btn primary grow" onClick={onClose} data-testid="setup-done">
          ✓ סיום ({setupSummary(setup).length})
        </button>
      </div>
    </Sheet>
  );
}
