import { Fragment, useMemo, useState } from 'react';
import { BACKGROUNDS } from '../engine/data/backgrounds';
import { PARTY_DEFS, INITIAL_COALITION } from '../engine/data/parties';
import { SKILL_NAMES } from '../engine/ops';
import { earlyStart, modToPartyDefs, validateMod, type ModFile } from '../engine/mods';
import { SCENARIOS } from '../engine/data/scenarios';
import { figurePool } from '../engine/newGame';
import { MEDIA_PACK } from '../engine/systems/media';
import type { AvatarSpec, BackgroundId, Drama, Gender, Ideology, ScenarioId } from '../engine/types';
import { AXES, AXIS_NAMES, ideologyDistance } from '../engine/util';
import { useStore } from '../store';
import { Avatar } from './Avatar';

const NAMES_M = ['דניאל כהן', 'יונתן לוי', 'עומר אברהם', 'איתי ברק', 'אליאב שגב'];
const NAMES_F = ['נועה כהן', 'מאיה לוי', 'שירה אברהם', 'תמר ברק', 'הדר שגב'];

const COVERS: { id: AvatarSpec['cover']; label: string }[] = [
  { id: 'none', label: 'ללא' },
  { id: 'kippah', label: 'כיפה סרוגה' },
  { id: 'kippah-black', label: 'כיפה שחורה' },
  { id: 'hat', label: 'כובע' },
  { id: 'hijab', label: 'חיג׳אב' },
];

export function CreateScreen() {
  const newGame = useStore((s) => s.newGame);
  const setScreen = useStore((s) => s.setScreen);
  const [step, setStep] = useState(0);
  const [scenario, setScenario] = useState<ScenarioId>(() => useStore.getState().pendingChallenge?.scenario ?? 'grassroots');
  const [background, setBackground] = useState<BackgroundId>('aide');
  const [gender, setGender] = useState<Gender>('f');
  const [name, setName] = useState(NAMES_F[Math.floor(Math.random() * 5)]);
  const [avatar, setAvatar] = useState<Omit<AvatarSpec, 'gender'>>({ seed: Math.floor(Math.random() * 1e9), cover: 'none', beard: false, glasses: false, age: 38 });
  const [ideology, setIdeology] = useState<Ideology>({ econ: 0, security: 20, religion: -20, judiciary: 0 });
  const [partyId, setPartyId] = useState<string | null>(null);
  const pendingMod = useStore((st) => st.pendingMod);
  const challenge = useStore((st) => st.pendingChallenge);
  const setPendingChallenge = useStore((st) => st.setPendingChallenge);
  const setPendingMod = useStore((st) => st.setPendingMod);
  const [mod, setMod] = useState<ModFile | null>(pendingMod);
  const [modErr, setModErr] = useState<string[]>([]);
  const [early, setEarly] = useState(false);
  const [drama, setDrama] = useState<Drama>('normal');
  const [asLeader, setAsLeader] = useState(false);
  // לשחק כדמות קיימת: אותו seed בתצוגה ובמשחק, כדי שהשמות והמקומות ברשימה יהיו זהים
  const [figSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [figureId, setFigureId] = useState<string | null>(null);
  const [journalistId, setJournalistId] = useState<string | null>(null);
  const [showFigures, setShowFigures] = useState(false);

  const seedFor = challenge?.seed ?? figSeed;
  const pool = useMemo(() => (step === 4 && showFigures ? figurePool({ mod: challenge ? null : mod, seed: seedFor, scenario: challenge?.scenario ?? scenario }) : null), [step, showFigures, mod, seedFor, scenario, challenge]);
  const figure = figureId && partyId ? pool?.[partyId]?.find((f) => f.id === figureId) ?? null : null;
  const parties = useMemo(
    () => [...(mod ? modToPartyDefs(mod) : PARTY_DEFS)].sort((a, b) => ideologyDistance(a.ideology, ideology) - ideologyDistance(b.ideology, ideology)),
    [ideology, mod],
  );
  const coalitionIds = mod ? mod.coalition ?? [] : INITIAL_COALITION;
  const loadMod = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { mod: m, errors } = validateMod(JSON.parse(await file.text()));
      setModErr(errors);
      setMod(m);
      setPartyId(null);
    } catch {
      setModErr(['הקובץ אינו JSON תקין']);
    }
  };
  const needsParty = scenario === 'freshman' || background === 'aide';
  const steps = ['תרחיש', 'רקע', 'זהות', 'עמדות', 'מפלגה'];
  const canNext = step !== 2 || name.trim().length >= 2;
  const canStart = !needsParty || !!partyId;

  const start = () => {
    // אתגר השבוע: אותו עולם לכולם – seed ותרחיש קבועים, בלי מוד, דרמה רגילה
    const asFigure = figure ? { npcId: figure.id } : journalistId ? { journalist: journalistId } : undefined;
    const who = figure ? { name: figure.name, gender: figure.gender } : { name: name.trim(), gender };
    if (challenge) {
      newGame({ ...who, background, ideology, partyId, scenario: challenge.scenario, avatar, mod: null, drama: 'normal', seed: challenge.seed, challenge: challenge.id, asFigure });
      setPendingChallenge(null);
      return;
    }
    const m = mod && early && mod.listsClosed ? earlyStart(mod) : mod;
    // דמות קיימת: אותו עולם בדיוק כמו בתצוגה (בלי "4 חודשים קודם", שמשנה את הרשימות)
    newGame({ ...who, background: journalistId ? 'journalist' : background, ideology, partyId, scenario, avatar, mod: figure ? mod : m, drama, asLeader: !figure && scenario === 'freshman' && asLeader, seed: figure ? figSeed : undefined, asFigure });
  };

  return (
    <div className="scroll">
      <div className="page" style={{ paddingTop: 'calc(var(--sat) + 16px)' }}>
        <div className="spread" style={{ marginBottom: 14 }}>
          <button className="btn ghost sm" onClick={() => (step ? setStep(step - 1) : setScreen('title'))}>
            → חזרה
          </button>
          <div className="step-dots">
            {steps.map((_, i) => (
              <i key={i} className={i <= step ? 'on' : ''} />
            ))}
          </div>
          <span className="small muted">{steps[step]}</span>
        </div>

        {challenge && (
          <div className="card small" style={{ borderColor: 'var(--gold)', marginBottom: 12 }} data-testid="challenge-banner">
            <b className="gold">🎯 {challenge.title}</b>
            <div className="muted">כל השחקנים מקבלים את אותו עולם ואותן הפתעות. התרחיש קבוע; את הדמות בוחרים חופשי. התוצאה נכנסת לטבלת האתגר.</div>
          </div>
        )}
        {step === 0 && (
          <>
            <h2>איך מתחילים?</h2>
            <p className="muted small">אפשר לטפס מלמטה או לקפוץ ישר למים.</p>
            <button className={`pick ${scenario === 'grassroots' ? 'on' : ''}`} disabled={!!challenge && challenge.scenario !== 'grassroots'} onClick={() => setScenario('grassroots')}>
              <h3>🌱 מהשטח</h3>
              <p className="small muted" style={{ margin: '4px 0 0' }}>
                מחוץ לכנסת, שנה לפני הבחירות. בונים שם, נכנסים לרשימה, נלחמים על מקום ריאלי – ומקווים להיבחר.
              </p>
            </button>
            <button className={`pick ${scenario === 'freshman' ? 'on' : ''}`} disabled={!!challenge && challenge.scenario !== 'freshman'} onClick={() => setScenario('freshman')}>
              <h3>🏛️ ח"כ טרי</h3>
              <p className="small muted" style={{ margin: '4px 0 0' }}>
                נבחרת זה עתה כאחרון/ה ברשימה. ועדות, הצעות חוק ומאבקי כוח – מהיום הראשון.
              </p>
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h2>מאיפה באת?</h2>
            <p className="muted small">הרקע קובע מיומנויות, מוכרות, כסף וקשרים.</p>
            {BACKGROUNDS.map((b) => (
              <button key={b.id} className={`pick ${background === b.id ? 'on' : ''}`} onClick={() => setBackground(b.id)}>
                <div className="spread">
                  <h3>
                    {b.icon} {b.name[gender]}
                  </h3>
                  <span className="cost">{b.money} אלף ₪</span>
                </div>
                <p className="small muted" style={{ margin: '4px 0 6px' }}>
                  {b.desc}
                </p>
                <div className="chips">
                  {Object.entries(b.skills).map(([k, v]) => (
                    <span key={k} className="chip gold">
                      {SKILL_NAMES[k as keyof typeof SKILL_NAMES]} {v}
                    </span>
                  ))}
                  <span className="chip">מוכרות {b.fame}</span>
                  <span className="chip">מוניטין {b.reputation}</span>
                </div>
              </button>
            ))}
            {background === 'aide' && scenario === 'grassroots' && <p className="small gold">כעוזר/ת תוכל/י לנסח הצעות חוק בשם הח"כ שמעסיק/ה אותך.</p>}
          </>
        )}

        {step === 2 && (
          <>
            <h2>מי את/ה?</h2>
            <div className="card small" style={{ marginTop: 10 }} data-testid="journalist-pick">
              <div className="spread">
                <b>🎤 עיתונאי/ת מוכר/ת שנכנס/ת לפוליטיקה</b>
                {journalistId && (
                  <button className="btn sm ghost" onClick={() => setJournalistId(null)}>
                    ביטול
                  </button>
                )}
              </div>
              <div className="muted tiny">כמו יאיר לפיד, מרב מיכאלי או ינון מגל: מגיעים עם מוכרות גבוהה וקהל – ומתחילים מבחוץ.</div>
              <div className="filter-row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                {MEDIA_PACK.journalists.map((j) => (
                  <button
                    key={j.id}
                    className={journalistId === j.id ? 'on' : ''}
                    onClick={() => {
                      setJournalistId(j.id);
                      setName(j.name);
                      setGender(j.gender);
                      setBackground('journalist');
                      setFigureId(null);
                    }}
                  >
                    {j.name} · {j.outlet}
                  </button>
                ))}
              </div>
            </div>
            <div className="row" style={{ margin: '14px 0' }}>
              <Avatar spec={{ ...avatar, gender }} size={96} ring="var(--gold)" />
              <div className="col grow">
                <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מלא" maxLength={24} />
                <div className="seg">
                  <button className={gender === 'f' ? 'on' : ''} onClick={() => { setGender('f'); setName(NAMES_F[Math.floor(Math.random() * 5)]); setAvatar({ ...avatar, beard: false }); }}>
                    פנייה בנקבה
                  </button>
                  <button className={gender === 'm' ? 'on' : ''} onClick={() => { setGender('m'); setName(NAMES_M[Math.floor(Math.random() * 5)]); }}>
                    פנייה בזכר
                  </button>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="spread">
                <span className="small muted">מראה</span>
                <button className="btn sm" onClick={() => setAvatar({ ...avatar, seed: Math.floor(Math.random() * 1e9) })}>
                  🎲 פנים אחרות
                </button>
              </div>
              <div className="filter-row" style={{ marginTop: 10 }}>
                {COVERS.map((c) => (
                  <button key={c.id} className={avatar.cover === c.id ? 'on' : ''} onClick={() => setAvatar({ ...avatar, cover: c.id })}>
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="filter-row" style={{ marginTop: 8 }}>
                <button className={avatar.glasses ? 'on' : ''} onClick={() => setAvatar({ ...avatar, glasses: !avatar.glasses })}>
                  משקפיים
                </button>
                {gender === 'm' && (
                  <button className={avatar.beard ? 'on' : ''} onClick={() => setAvatar({ ...avatar, beard: !avatar.beard })}>
                    זקן
                  </button>
                )}
              </div>
              <label className="small muted" style={{ display: 'block', marginTop: 10 }}>
                גיל: {avatar.age}
                <input type="range" min={28} max={72} value={avatar.age} onChange={(e) => setAvatar({ ...avatar, age: +e.target.value })} />
              </label>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>במה את/ה מאמין/ה?</h2>
            <p className="muted small">העמדות קובעות אילו מגזרים יאהבו אותך, ומה ייחשב "זגזוג".</p>
            {AXES.map((ax) => (
              <div key={ax} className="card">
                <div className="spread">
                  <h3>{AXIS_NAMES[ax][0]}</h3>
                  <span className="small gold">{ideology[ax] > 15 ? AXIS_NAMES[ax][2] : ideology[ax] < -15 ? AXIS_NAMES[ax][1] : 'מרכז'}</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={ideology[ax]}
                  onChange={(e) => setIdeology({ ...ideology, [ax]: +e.target.value })}
                  style={{ direction: 'ltr' }}
                />
                <div className="spread tiny muted">
                  <span>{AXIS_NAMES[ax][2]}</span>
                  <span>{AXIS_NAMES[ax][1]}</span>
                </div>
              </div>
            ))}
          </>
        )}

        {step === 4 && (
          <>
            <h2>באיזו מפלגה?</h2>
            <div className="card small" style={{ marginBottom: 10, display: challenge ? 'none' : undefined }}>
              <div className="small muted" style={{ marginBottom: 6 }}>איזו כנסת?</div>
              <div className="filter-row">
                <button className={!mod ? 'on' : ''} onClick={() => { setMod(null); setPartyId(null); }}>
                  🎭 בדיוני
                </button>
                {SCENARIOS.map((sc) => (
                  <button key={sc.id} className={mod === sc.mod ? 'on' : ''} onClick={() => { setMod(sc.mod); setModErr([]); setPartyId(null); }}>
                    {sc.icon} {sc.mod.name.replace(/\s*\(.*\)/, '')}
                  </button>
                ))}
                <label className={`btn sm ${mod && !SCENARIOS.some((x) => x.mod === mod) ? 'on' : ''}`} style={{ flex: 'none' }}>
                  📂 מקובץ
                  <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => loadMod(e.target.files?.[0])} />
                </label>
                <button onClick={() => { setPendingMod(mod); setScreen('editor'); }}>🛠️ עורך</button>
              </div>
              {mod && (
                <div style={{ marginTop: 10 }}>
                  <b>{mod.name}</b>
                  {mod.description && <p className="small" style={{ margin: '4px 0' }}>{mod.description}</p>}
                  <div className="tiny muted">
                    {mod.startDate && `מתחיל ב-${new Date(mod.startDate).toLocaleDateString('he-IL')}`}
                    {mod.electionInWeeks && ` · בחירות בעוד ${mod.electionInWeeks} שבועות`}
                    {mod.listsClosed && ' · הרשימות כבר נסגרו'}
                    {mod.afterElection && ' · מתחילים למחרת הבחירות, בהרכבת ממשלה'}
                  </div>
                  {mod.source && <div className="tiny faint" style={{ marginTop: 4 }}>מקור: {mod.source}{mod.asOf ? ` (נכון ל-${mod.asOf})` : ''}</div>}
                  {mod.realPeople && <div className="tiny faint">התכונות, היחסים והאירועים במשחק בדיוניים.</div>}
                  {mod.listsClosed && (
                    <label className="row small" style={{ gap: 6, marginTop: 8 }}>
                      <input type="checkbox" checked={early} onChange={(e) => setEarly(e.target.checked)} />
                      להתחיל 4 חודשים קודם – הרשימות פתוחות, אפשר איחודים (מה-אם)
                    </label>
                  )}
                </div>
              )}
              <div className="small muted" style={{ margin: '10px 0 6px' }}>רמת דרמה (טלטלות, מפלגות חדשות, משברים)</div>
              <div className="filter-row">
                {([['calm', '🌤️ רגוע'], ['normal', '⛅ רגיל'], ['wild', '🌪️ פרוע']] as [Drama, string][]).map(([id, label]) => (
                  <button key={id} className={drama === id ? 'on' : ''} onClick={() => setDrama(id)}>
                    {label}
                  </button>
                ))}
              </div>
              {modErr.map((e, i) => (
                <div key={i} className="tiny bad">{e}</div>
              ))}
            </div>
            {scenario === 'freshman' && (
              <label className="card row small" style={{ gap: 8, marginBottom: 10, borderColor: asLeader ? 'var(--gold)' : undefined }} data-testid="as-leader">
                <input type="checkbox" checked={asLeader} onChange={(e) => setAsLeader(e.target.checked)} />
                <span>
                  <b>👑 לשחק כיו"ר המפלגה</b> – במקום ראש הרשימה הנוכחי/ת.{mod?.afterElection ? ' אם תוכל/י להגיע ל-61, המנדט להרכבת הממשלה יהיה שלך.' : ''}
                </span>
              </label>
            )}
            <p className="muted small">ממוין לפי קרבה לעמדות שלך. {needsParty ? 'בתרחיש הזה חייבים מפלגה.' : 'אפשר גם להתחיל בלי – ולהקים מפלגה בהמשך.'}</p>
            {!needsParty && (
              <button className={`pick ${partyId === null ? 'on' : ''}`} onClick={() => setPartyId(null)}>
                <h3>🚶 ללא מפלגה (בינתיים)</h3>
              </button>
            )}
            {parties.map((p) => {
              const fit = Math.round((1 - ideologyDistance(p.ideology, ideology)) * 100);
              return (
                <Fragment key={p.id}>
                <button className={`pick ${partyId === p.id ? 'on' : ''}`} onClick={() => { setPartyId(p.id); setFigureId(null); }}>
                  <div className="spread">
                    <h3 className="row" style={{ gap: 8 }}>
                      <span className="party-dot" style={{ background: p.color }} />
                      {p.name}
                    </h3>
                    <span className="small muted">
                      {p.seats} מנדטים
                      {mod?.parties.find((x) => x.id === p.id)?.polls !== undefined && ` · סקרים ${Math.round(((mod!.parties.find((x) => x.id === p.id)!.polls ?? 0) * 120) / 100)}`}
                    </span>
                  </div>
                  <p className="small muted" style={{ margin: '4px 0 6px' }}>
                    {p.blurb}
                  </p>
                  <div className="chips">
                    <span className={`chip ${fit > 75 ? 'good' : fit < 55 ? 'bad' : ''}`}>התאמה {fit}%</span>
                    <span className="chip">{coalitionIds.includes(p.id) ? 'קואליציה' : 'אופוזיציה'}</span>
                    <span className="chip">{p.primaries ? 'פריימריז' : 'רשימה ממונה'}</span>
                  </div>
                </button>
                {partyId === p.id && !journalistId && (
                  <div className="card small" style={{ marginTop: 6, marginBottom: 12, borderColor: figure ? 'var(--gold)' : undefined }} data-testid="figure-pick">
                    <div className="spread">
                      <b>👤 לשחק כדמות מהרשימה?</b>
                      <button className="btn sm ghost" onClick={() => { setShowFigures(!showFigures); if (showFigures) setFigureId(null); }} data-testid="figure-toggle">
                        {showFigures ? 'דמות חדשה' : 'בחירת דמות'}
                      </button>
                    </div>
                    {!showFigures && <div className="tiny muted">אפשר להיכנס לנעליים של כל ח"כ או מועמד/ת – גם היו"ר.</div>}
                    {showFigures && pool?.[p.id] && (
                      <div className="filter-row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                        {pool[p.id].map((f) => (
                          <button key={f.id} className={figureId === f.id ? 'on' : ''} onClick={() => setFigureId(f.id)} data-testid="figure-option">
                            {f.leader ? '👑 ' : ''}
                            {f.pos}. {f.name}
                            {f.isMK ? '' : ' (מועמד/ת)'}
                          </button>
                        ))}
                      </div>
                    )}
                    {figure && <div className="tiny gold" style={{ marginTop: 6 }}>תשחק/י בתור {figure.name} – עם המקום ברשימה, המושב והעמדות שלו/ה.{figure.leader ? ' כולל ראשות המפלגה.' : ''}</div>}
                  </div>
                )}
                </Fragment>
              );
            })}
          </>
        )}

        <div style={{ height: 90 }} />
      </div>
      <div style={{ position: 'sticky', bottom: 0, padding: '12px 16px calc(14px + var(--sab))', background: 'linear-gradient(0deg, var(--bg) 70%, transparent)' }}>
        {step < 4 ? (
          <button className="btn primary block" disabled={!canNext} onClick={() => setStep(step + 1)}>
            המשך ←
          </button>
        ) : (
          <button className="btn primary block" disabled={!canStart} onClick={start}>
            {canStart ? 'יוצאים לדרך 🏛️' : 'בחר/י מפלגה'}
          </button>
        )}
      </div>
    </div>
  );
}
