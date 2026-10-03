import { useEffect, useState } from 'react';
import { SCENARIOS } from '../engine/data/scenarios';
import { emptyMod, validateMod, type ModFile, type ModParty } from '../engine/mods';
import { AXES, AXIS_NAMES } from '../engine/util';
import { useStore } from '../store';

const DRAFT_KEY = 'hamishkan.modDraft';

function loadDraft(): ModFile | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as ModFile) : null;
  } catch {
    return null;
  }
}

function saveDraft(m: ModFile) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(m));
  } catch {
    /* אחסון לא זמין */
  }
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function ModEditor() {
  const setScreen = useStore((s) => s.setScreen);
  const pendingMod = useStore((s) => s.pendingMod);
  const setPendingMod = useStore((s) => s.setPendingMod);
  const [mod, setMod] = useState<ModFile>(() => clone(pendingMod ?? loadDraft() ?? emptyMod()));
  const [open, setOpen] = useState<number | null>(0);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => saveDraft(mod), [mod]);

  const { errors } = validateMod(mod);
  const seats = mod.parties.reduce((a, p) => a + (p.seats || 0), 0);
  const coal = mod.parties.filter((p) => mod.coalition?.includes(p.id)).reduce((a, p) => a + (p.seats || 0), 0);

  const update = (patch: Partial<ModFile>) => setMod({ ...mod, ...patch });
  const updateParty = (i: number, patch: Partial<ModParty>) => {
    const parties = mod.parties.map((p, j) => (j === i ? { ...p, ...patch } : p));
    // שינוי מזהה – לעדכן גם את רשימת הקואליציה
    const oldId = mod.parties[i].id;
    const coalition = patch.id && patch.id !== oldId ? (mod.coalition ?? []).map((c) => (c === oldId ? patch.id! : c)) : mod.coalition;
    setMod({ ...mod, parties, coalition });
  };
  const addParty = () => {
    let n = mod.parties.length + 1;
    while (mod.parties.some((p) => p.id === `party_${n}`)) n++;
    setMod({ ...mod, parties: [...mod.parties, { id: `party_${n}`, name: `מפלגה חדשה ${n}`, color: '#64748b', ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 }, seats: 0, members: [] }] });
    setOpen(mod.parties.length);
  };
  const removeParty = (i: number) => {
    const id = mod.parties[i].id;
    setMod({ ...mod, parties: mod.parties.filter((_, j) => j !== i), coalition: (mod.coalition ?? []).filter((c) => c !== id) });
    setOpen(null);
  };
  const toggleCoalition = (id: string) => {
    const c = mod.coalition ?? [];
    update({ coalition: c.includes(id) ? c.filter((x) => x !== id) : [...c, id] });
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(mod, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${mod.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setMod(JSON.parse(await file.text()) as ModFile);
      setLoadErr('');
      setOpen(null);
    } catch {
      setLoadErr('הקובץ אינו JSON תקין');
    }
  };
  const play = () => {
    setPendingMod(clone(mod));
    setScreen('create');
  };

  return (
    <div className="scroll">
      <div className="page" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <button className="btn ghost sm" onClick={() => setScreen(pendingMod ? 'create' : 'title')}>
            → חזרה
          </button>
          <h2>🛠️ עורך כנסת</h2>
        </div>

        <div className="card">
          <label className="small muted">שם ההרכב</label>
          <input className="text-input" value={mod.name} onChange={(e) => update({ name: e.target.value })} />
          <div className="row" style={{ marginTop: 8, gap: 8 }}>
            <label className="grow small muted">
              כנסת מס׳
              <input className="text-input" type="number" min={1} value={mod.knesset ?? ''} onChange={(e) => update({ knesset: e.target.value ? Number(e.target.value) : undefined })} />
            </label>
            <label className="grow small muted">
              תאריך התחלה
              <input className="text-input" type="date" value={mod.startDate ?? ''} onChange={(e) => update({ startDate: e.target.value || undefined })} />
            </label>
          </div>
          <div className="row" style={{ marginTop: 8, gap: 8 }}>
            <label className="grow small muted">
              בחירות בעוד (שבועות)
              <input className="text-input" type="number" min={1} max={260} value={mod.electionInWeeks ?? ''} onChange={(e) => update({ electionInWeeks: e.target.value ? Number(e.target.value) : undefined })} />
            </label>
            <label className="small row" style={{ gap: 6, marginTop: 18 }}>
              <input type="checkbox" checked={!!mod.listsClosed} onChange={(e) => update({ listsClosed: e.target.checked || undefined })} />
              הרשימות נסגרו
            </label>
          </div>
          <label className="small muted" style={{ display: 'block', marginTop: 8 }}>
            תיאור (מופיע במסך הבחירה)
            <textarea className="text-input" rows={2} value={mod.description ?? ''} onChange={(e) => update({ description: e.target.value || undefined })} />
          </label>
        </div>

        <div className="card" style={{ position: 'sticky', top: 0, zIndex: 3 }}>
          <div className="spread small">
            <span>
              מושבים: <b className={seats === 120 ? 'good' : 'bad'}>{seats}/120</b>
            </span>
            <span>
              קואליציה: <b className={coal >= 61 ? 'good' : 'warn'}>{coal}</b> {coal < 61 ? '(פחות מ-61)' : ''}
            </span>
          </div>
          {errors.length > 0 ? (
            <div style={{ marginTop: 6 }}>
              {errors.slice(0, 4).map((e, i) => (
                <div key={i} className="tiny bad">
                  ⚠️ {e}
                </div>
              ))}
            </div>
          ) : (
            <div className="tiny good" style={{ marginTop: 6 }}>✓ הקובץ תקין</div>
          )}
        </div>

        <div className="section-label">מפלגות ({mod.parties.length})</div>
        {mod.parties.map((p, i) => (
          <div key={i} className="card" style={{ borderInlineStart: `4px solid ${p.color}` }}>
            <button className="spread" style={{ width: '100%', textAlign: 'start' }} onClick={() => setOpen(open === i ? null : i)}>
              <b>
                {p.name || '(ללא שם)'} {mod.coalition?.includes(p.id) && <span className="chip gold">קואליציה</span>}
              </b>
              <span className="small muted">
                {p.seats} מנד׳{p.polls !== undefined ? ` · ${p.polls}%` : ''} {open === i ? '▲' : '▼'}
              </span>
            </button>
            {open === i && (
              <div className="col" style={{ marginTop: 10 }}>
                <div className="row" style={{ gap: 8 }}>
                  <input className="text-input grow" placeholder="שם המפלגה" value={p.name} onChange={(e) => updateParty(i, { name: e.target.value })} />
                  <input type="color" value={p.color} onChange={(e) => updateParty(i, { color: e.target.value })} style={{ width: 48, height: 44, border: 'none', background: 'none' }} aria-label="צבע" />
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <input className="text-input grow" placeholder="שם קצר" value={p.short ?? ''} onChange={(e) => updateParty(i, { short: e.target.value || undefined })} />
                  <input className="text-input grow" placeholder="מזהה (אותיות לטיניות)" value={p.id} dir="ltr" onChange={(e) => updateParty(i, { id: e.target.value.replace(/[^a-z0-9_-]/gi, '') })} />
                </div>
                <div className="spread">
                  <span className="small">מושבים בכנסת</span>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn sm" onClick={() => updateParty(i, { seats: Math.max(0, p.seats - 1) })}>−</button>
                    <input aria-label="מושבים" className="text-input" type="number" min={0} max={120} value={p.seats} onChange={(e) => updateParty(i, { seats: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })} style={{ width: 70, textAlign: 'center' }} />
                    <button className="btn sm" onClick={() => updateParty(i, { seats: Math.min(120, p.seats + 1) })}>+</button>
                  </div>
                </div>
                <div className="spread">
                  <span className="small">סקרים (%) – ריק = לפי המושבים</span>
                  <input aria-label="סקרים" className="text-input" type="number" min={0} max={100} step={0.1} value={p.polls ?? ''} onChange={(e) => updateParty(i, { polls: e.target.value === '' ? undefined : Number(e.target.value) })} style={{ width: 90, textAlign: 'center' }} />
                </div>
                {AXES.map((ax) => (
                  <div key={ax}>
                    <div className="spread tiny muted">
                      <span>{AXIS_NAMES[ax][2]}</span>
                      <b style={{ color: 'var(--text)' }}>
                        {AXIS_NAMES[ax][0]}: {p.ideology[ax]}
                      </b>
                      <span>{AXIS_NAMES[ax][1]}</span>
                    </div>
                    <input type="range" min={-100} max={100} value={p.ideology[ax]} style={{ direction: 'ltr' }} onChange={(e) => updateParty(i, { ideology: { ...p.ideology, [ax]: Number(e.target.value) } })} />
                  </div>
                ))}
                <div className="row wrap" style={{ gap: 14 }}>
                  <label className="small row" style={{ gap: 6 }}>
                    <input type="checkbox" checked={!!mod.coalition?.includes(p.id)} onChange={() => toggleCoalition(p.id)} />
                    בקואליציה
                  </label>
                  <label className="small row" style={{ gap: 6 }}>
                    <input type="checkbox" checked={!!p.primaries} onChange={(e) => updateParty(i, { primaries: e.target.checked })} />
                    פריימריז
                  </label>
                </div>
                <label className="small muted">
                  רשימת המועמדים – שם בכל שורה, לפי הסדר (הראשון = יו"ר). השאר ייווצרו אוטומטית.
                  <textarea
                    className="text-input"
                    rows={5}
                    value={(p.members ?? []).join('\n')}
                    onChange={(e) => updateParty(i, { members: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })}
                  />
                </label>
                <button className="btn danger sm" onClick={() => removeParty(i)}>
                  מחיקת המפלגה
                </button>
              </div>
            )}
          </div>
        ))}
        <button className="btn block" style={{ marginTop: 10 }} onClick={addParty}>
          ➕ הוספת מפלגה
        </button>

        <div className="section-label">קבצים ותרחישים</div>
        <div className="col">
          <div className="filter-row">
            {SCENARIOS.map((sc) => (
              <button key={sc.id} onClick={() => { setMod(clone(sc.mod)); setOpen(null); }}>
                {sc.icon} להתחיל מ: {sc.mod.name.replace(/\s*\(.*\)/, '')}
              </button>
            ))}
            <button onClick={() => { setMod(emptyMod()); setOpen(0); }}>📄 דף חדש</button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <label className="btn grow">
              📂 טעינת קובץ
              <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => loadFile(e.target.files?.[0])} />
            </label>
            <button className="btn grow" onClick={download}>
              💾 הורדת JSON
            </button>
          </div>
          {loadErr && <div className="tiny bad">{loadErr}</div>}
        </div>

        <div style={{ height: 80 }} />
      </div>
      <div style={{ position: 'sticky', bottom: 0, padding: '12px 16px calc(14px + env(safe-area-inset-bottom))', background: 'linear-gradient(0deg, var(--bg) 70%, transparent)' }}>
        <button className="btn primary block" disabled={errors.length > 0} onClick={play}>
          {errors.length ? 'יש לתקן את השגיאות כדי לשחק' : '🏛️ לשחק עם הכנסת הזו'}
        </button>
      </div>
    </div>
  );
}
