import { useMemo, useState } from 'react';
import { BACKGROUNDS } from '../engine/data/backgrounds';
import { PARTY_DEFS, INITIAL_COALITION } from '../engine/data/parties';
import { SKILL_NAMES } from '../engine/ops';
import type { AvatarSpec, BackgroundId, Gender, Ideology, ScenarioId } from '../engine/types';
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
  const [scenario, setScenario] = useState<ScenarioId>('grassroots');
  const [background, setBackground] = useState<BackgroundId>('aide');
  const [gender, setGender] = useState<Gender>('f');
  const [name, setName] = useState(NAMES_F[Math.floor(Math.random() * 5)]);
  const [avatar, setAvatar] = useState<Omit<AvatarSpec, 'gender'>>({ seed: Math.floor(Math.random() * 1e9), cover: 'none', beard: false, glasses: false, age: 38 });
  const [ideology, setIdeology] = useState<Ideology>({ econ: 0, security: 20, religion: -20, judiciary: 0 });
  const [partyId, setPartyId] = useState<string | null>(null);

  const parties = useMemo(
    () => [...PARTY_DEFS].sort((a, b) => ideologyDistance(a.ideology, ideology) - ideologyDistance(b.ideology, ideology)),
    [ideology],
  );
  const needsParty = scenario === 'freshman' || background === 'aide';
  const steps = ['תרחיש', 'רקע', 'זהות', 'עמדות', 'מפלגה'];
  const canNext = step !== 2 || name.trim().length >= 2;
  const canStart = !needsParty || !!partyId;

  const start = () =>
    newGame({ name: name.trim(), gender, background, ideology, partyId, scenario, avatar });

  return (
    <div className="scroll">
      <div className="page" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}>
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

        {step === 0 && (
          <>
            <h2>איך מתחילים?</h2>
            <p className="muted small">אפשר לטפס מלמטה או לקפוץ ישר למים.</p>
            <button className={`pick ${scenario === 'grassroots' ? 'on' : ''}`} onClick={() => setScenario('grassroots')}>
              <h3>🌱 מהשטח</h3>
              <p className="small muted" style={{ margin: '4px 0 0' }}>
                מחוץ לכנסת, שנה לפני הבחירות. בונים שם, נכנסים לרשימה, נלחמים על מקום ריאלי – ומקווים להיבחר.
              </p>
            </button>
            <button className={`pick ${scenario === 'freshman' ? 'on' : ''}`} onClick={() => setScenario('freshman')}>
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
            <p className="muted small">ממוין לפי קרבה לעמדות שלך. {needsParty ? 'בתרחיש הזה חייבים מפלגה.' : 'אפשר גם להתחיל בלי – ולהקים מפלגה בהמשך.'}</p>
            {!needsParty && (
              <button className={`pick ${partyId === null ? 'on' : ''}`} onClick={() => setPartyId(null)}>
                <h3>🚶 ללא מפלגה (בינתיים)</h3>
              </button>
            )}
            {parties.map((p) => {
              const fit = Math.round((1 - ideologyDistance(p.ideology, ideology)) * 100);
              return (
                <button key={p.id} className={`pick ${partyId === p.id ? 'on' : ''}`} onClick={() => setPartyId(p.id)}>
                  <div className="spread">
                    <h3 className="row" style={{ gap: 8 }}>
                      <span className="party-dot" style={{ background: p.color }} />
                      {p.name}
                    </h3>
                    <span className="small muted">{p.seats} מנדטים</span>
                  </div>
                  <p className="small muted" style={{ margin: '4px 0 6px' }}>
                    {p.blurb}
                  </p>
                  <div className="chips">
                    <span className={`chip ${fit > 75 ? 'good' : fit < 55 ? 'bad' : ''}`}>התאמה {fit}%</span>
                    <span className="chip">{INITIAL_COALITION.includes(p.id) ? 'קואליציה' : 'אופוזיציה'}</span>
                    <span className="chip">{p.primaries ? 'פריימריז' : 'רשימה ממונה'}</span>
                  </div>
                </button>
              );
            })}
          </>
        )}

        <div style={{ height: 90 }} />
      </div>
      <div style={{ position: 'sticky', bottom: 0, padding: '12px 16px calc(14px + env(safe-area-inset-bottom))', background: 'linear-gradient(0deg, var(--bg) 70%, transparent)' }}>
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
