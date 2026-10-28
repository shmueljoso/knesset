import { useCallback, useEffect, useState } from 'react';
import type { GameState } from '../engine';
import { careerScore } from '../engine/systems/score';
import {
  CURRENT_SLOT, account, deleteCloud, downloadGame, fetchBoard, flushPending, listCloud, localRecords, publishScore, serverConfigured, uploadGame, useOnline, weeklyChallenge,
  type BoardKind, type BoardRow, type CloudSaveMeta,
} from '../online';
import { useStore } from '../store';
import { Meter, Sheet } from './common';

function ago(iso: string | number): string {
  const ms = typeof iso === 'number' ? iso : Date.parse(iso);
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק'`;
  const h = Math.round(m / 60);
  if (h < 24) return `לפני ${h} שע'`;
  return `לפני ${Math.round(h / 24)} ימים`;
}

function useBusy() {
  const toast = useStore((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    try {
      const msg = await fn();
      if (msg) toast(msg, 'good');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** שורת מצב קטנה: מחובר/ת, ממתין לסנכרון, אופליין */
export function OnlineBadge() {
  const { status, profile, online, pending } = useOnline();
  if (status === 'unconfigured') return null;
  const label = !online ? '📴 אופליין' : status === 'signedIn' ? `☁️ ${profile?.display_name ?? 'מחובר/ת'}` : '☁️ התחברות';
  return (
    <span className={`chip ${status === 'signedIn' && online ? 'good' : ''}`} data-testid="online-badge">
      {label}
      {pending ? ` · ${pending} ממתינים` : ''}
    </span>
  );
}

// ---------------------------------------------------------------- חשבון

export function AccountSheet({ onClose }: { onClose?: () => void }) {
  const { status, user, profile, online, lastSync, syncError, pending } = useOnline();
  const game = useStore((s) => s.game);
  const { busy, run } = useBusy();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [delArmed, setDelArmed] = useState(0);

  if (status === 'unconfigured') {
    return (
      <Sheet title="☁️ חשבון וסנכרון" onClose={onClose}>
        <div className="card small" data-testid="online-unconfigured">
          <b>השרת המקוון עוד לא הוגדר.</b>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            המשחק עובד מלא גם בלי – כולל שמירות וגיבויים במכשיר. כדי להפעיל חשבונות, שמירה בענן וטבלת שיאים צריך להקים פרויקט חינמי ב-Supabase ולהזין את הכתובת והמפתח (המדריך: docs/ONLINE.md).
          </p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="☁️ חשבון וסנכרון" sub={online ? 'מחובר/ת לאינטרנט' : 'אין חיבור – הכול נשמר במכשיר ויישלח כשהחיבור יחזור'} onClose={onClose}>
      {status === 'loading' && <p className="small muted">טוען…</p>}

      {status === 'signedOut' && (
        <div className="card" data-testid="auth-form">
          <div className="filter-row">
            <button className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>
              התחברות
            </button>
            <button className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>
              הרשמה
            </button>
          </div>
          <div className="col" style={{ marginTop: 10 }}>
            <input className="text-input" type="email" inputMode="email" autoComplete="email" placeholder="אימייל" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" data-testid="auth-email" />
            <input className="text-input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="סיסמה (לפחות 6 תווים)" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" data-testid="auth-password" />
            <button
              className="btn primary"
              disabled={busy || !email.includes('@') || password.length < 6 || !online}
              data-testid="auth-submit"
              onClick={() =>
                run(async () => {
                  if (mode === 'in') {
                    await account.signIn(email, password);
                    return 'התחברת!';
                  }
                  const r = await account.signUp(email, password);
                  return r === 'confirm-email' ? 'נשלח אליך אימייל לאישור. אחרי האישור – התחבר/י.' : 'החשבון נוצר!';
                })
              }
            >
              {mode === 'in' ? 'התחברות' : 'יצירת חשבון'}
            </button>
            <button className="btn ghost" disabled={busy || !online} onClick={() => run(async () => { await account.guest(); return 'נכנסת כאורח/ת. אפשר לשדרג לחשבון מלא בהמשך.'; })} data-testid="auth-guest">
              👤 המשך כאורח/ת
            </button>
            {mode === 'in' && (
              <button className="btn ghost sm" disabled={busy || !email.includes('@')} onClick={() => run(async () => { await account.reset(email); return 'אם יש חשבון – נשלח קישור לאיפוס.'; })}>
                שכחתי סיסמה
              </button>
            )}
          </div>
          <p className="tiny faint" style={{ margin: '8px 0 0' }}>החשבון משמש רק לשמירה בענן ולטבלת השיאים. אפשר למחוק אותו בכל רגע.</p>
        </div>
      )}

      {status === 'signedIn' && (
        <>
          <div className="card" data-testid="account-info">
            <div className="spread">
              <b>{profile?.display_name ?? 'בלי שם עדיין'}</b>
              <span className="chip">{user?.anonymous ? 'אורח/ת' : user?.email}</span>
            </div>
            {!profile && <p className="small gold" style={{ margin: '6px 0' }}>בחר/י שם שיופיע בטבלת השיאים:</p>}
            <div className="row" style={{ marginTop: 8 }}>
              <input className="text-input grow" placeholder={profile?.display_name ?? 'שם תצוגה (2–24 תווים)'} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} data-testid="display-name" />
              <button className="btn" disabled={busy || name.trim().length < 2} onClick={() => run(async () => { await account.setName(name); setName(''); return 'השם נשמר'; })} data-testid="save-name-btn">
                שמירה
              </button>
            </div>
          </div>
          <div className="card small">
            <b>🔄 סנכרון</b>
            <div className="muted">{lastSync ? `גיבוי אחרון לענן: ${ago(lastSync)}` : 'עוד לא גובה לענן'}{pending ? ` · ${pending} פריטים ממתינים לחיבור` : ''}</div>
            {syncError && <div className="bad tiny">{syncError}</div>}
            <div className="tiny faint">המשחק עולה לענן אוטומטית בסוף שבוע (לכל היותר פעם ב-5 דקות) וכשהאפליקציה יוצאת לרקע.</div>
            <div className="row" style={{ marginTop: 8, gap: 8 }}>
              {game && (
                <button className="btn grow" disabled={busy || !online} onClick={() => run(async () => { await uploadGame(game); await flushPending(); return 'הועלה לענן'; })} data-testid="sync-now">
                  ☁️ סנכרון עכשיו
                </button>
              )}
              <button className="btn ghost" disabled={busy} onClick={() => run(async () => { await account.signOut(); return 'התנתקת'; })}>
                התנתקות
              </button>
            </div>
          </div>
          <div className="card small">
            <b className="bad">מחיקת חשבון</b>
            <div className="muted">מוחק את החשבון, את השמירות בענן ואת השיאים שלך. השמירות במכשיר נשארות.</div>
            <button
              className="btn danger sm"
              style={{ marginTop: 8 }}
              disabled={busy}
              onClick={() => {
                if (delArmed < 2) setDelArmed(delArmed + 1);
                else void run(async () => { await account.deleteAccount(); setDelArmed(0); return 'החשבון נמחק'; });
              }}
            >
              {delArmed === 0 ? 'מחיקת החשבון' : delArmed === 1 ? 'בטוח/ה? זה סופי' : 'לחיצה אחרונה – למחוק'}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- שמירות בענן (בתוך מסך השמירות)

export function CloudSaves({ onLoaded }: { onLoaded?: () => void }) {
  const { status, online } = useOnline();
  const game = useStore((s) => s.game);
  const screen = useStore((s) => s.screen);
  const loadGame = useStore((s) => s.loadGame);
  const open = useStore((s) => s.open);
  const closeAll = useStore((s) => s.closeAll);
  const { busy, run } = useBusy();
  const [list, setList] = useState<CloudSaveMeta[] | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const refresh = useCallback(() => {
    if (status === 'signedIn' && online) listCloud().then(setList, () => setList([]));
  }, [status, online]);
  useEffect(refresh, [refresh]);

  if (status === 'unconfigured') return null;
  const inGame = screen === 'game' && !!game;
  return (
    <>
      <div className="section-label">☁️ בענן</div>
      {status !== 'signedIn' ? (
        <div className="card small">
          השמירות בענן עוברות בין הטלפון, הטאבלט והמחשב.{' '}
          {screen === 'game' ? (
            <button className="btn sm" onClick={() => open({ kind: 'account' })}>
              התחברות
            </button>
          ) : (
            <span className="muted">התחבר/י במסך הפתיחה.</span>
          )}
        </div>
      ) : !online ? (
        <div className="card small muted">אין חיבור לאינטרנט. השמירות במכשיר זמינות למטה.</div>
      ) : (
        <div className="col" data-testid="cloud-list">
          {inGame && (
            <button className="btn" disabled={busy} onClick={() => run(async () => { await uploadGame(game!, `m-${Date.now().toString(36)}`, `${game!.player.name} · שבוע ${game!.week + 1}`); refresh(); return 'נשמר בענן'; })} data-testid="cloud-save">
              ☁️ שמירה חדשה בענן
            </button>
          )}
          {list === null && <span className="small muted">טוען…</span>}
          {list?.length === 0 && <span className="small muted">אין עדיין שמירות בענן.</span>}
          {list?.map((m) => (
            <div key={m.slot} className="card save-row">
              <div className="spread">
                <b className="ellipsis">{m.name}</b>
                <span className="chip">{m.slot === CURRENT_SLOT ? 'אוטומטי' : 'ענן'}</span>
              </div>
              <div className="tiny muted">
                {m.player} · שבוע {m.week + 1} · {ago(m.updated_at)} · {Math.max(1, Math.round(m.bytes / 1024))}KB
              </div>
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                <button
                  className={`btn sm grow ${armed === m.slot ? 'primary' : ''}`}
                  disabled={busy}
                  onClick={() => {
                    if (inGame && armed !== m.slot) return setArmed(m.slot);
                    void run(async () => {
                      const g = await downloadGame(m.slot);
                      loadGame(g);
                      closeAll();
                      onLoaded?.();
                      return `נטען מהענן: ${g.player.name}`;
                    });
                  }}
                  data-testid="cloud-load"
                >
                  {armed === m.slot ? 'לטעון? המשחק הנוכחי יגובה' : '⬇️ טעינה'}
                </button>
                <button className="btn sm ghost" disabled={busy} aria-label="מחיקה מהענן" onClick={() => run(async () => { await deleteCloud(m.slot); refresh(); return 'נמחק מהענן'; })}>
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- ניקוד

export function ScoreCard({ g }: { g: GameState }) {
  const b = careerScore(g);
  return (
    <div className="card" data-testid="score-card">
      <div className="spread">
        <b>🏆 ניקוד מנורמל</b>
        <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--gold)' }}>{b.total}</span>
      </div>
      <div className="tiny faint" style={{ marginBottom: 6 }}>
        מתוך 1000 · פסגה: {b.peakLabel} · {b.years} שנים · מכפיל קושי ×{b.mult}
      </div>
      <Meter label="פסגה (35%)" value={b.peak} color="var(--gold)" />
      <Meter label="השפעה (25%)" value={b.impact} color="var(--accent)" />
      <Meter label="המדינה (20%)" value={b.country} color="var(--good)" />
      <Meter label="ציבור (20%)" value={b.standing} color="#a78bfa" />
      {b.notes.length > 0 && <div className="tiny bad" style={{ marginTop: 6 }}>{b.notes.join(' · ')}</div>}
      <div className="tiny faint" style={{ marginTop: 6 }}>ההשפעה נמדדת ביחס לזמן: בקריירה ארוכה צריך יותר חוקים. משחק שנערך בכלים המתקדמים לא נכנס לטבלה הכללית.</div>
    </div>
  );
}

/** בסוף הקריירה: פרסום בטבלה (או לתור, אם אין חיבור) */
export function PublishScore({ g, onLogin }: { g: GameState; onLogin?: () => void }) {
  const { status } = useOnline();
  const open = useStore((s) => s.open);
  const { busy, run } = useBusy();
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="col" style={{ marginTop: 8 }}>
      <button
        className="btn"
        disabled={busy || !!done}
        data-testid="publish-score"
        onClick={() =>
          run(async () => {
            const r = await publishScore(g);
            const msg = r === 'sent' ? 'פורסם בטבלת השיאים!' : status === 'signedIn' ? 'אין חיבור – יפורסם אוטומטית כשיחזור.' : 'נשמר בשיאים שלך. התחבר/י כדי לפרסם בטבלה.';
            setDone(msg);
            return msg;
          })
        }
      >
        {done ?? '📤 פרסום בטבלת השיאים'}
      </button>
      {status === 'signedOut' && !done && (
        <button className="btn ghost sm" onClick={() => (onLogin ? onLogin() : open({ kind: 'account' }))}>
          התחברות כדי לפרסם
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- טבלת שיאים

const TABS: [BoardKind, string][] = [
  ['all', 'כללי'],
  ['challenge', 'אתגר השבוע'],
  ['fastest', 'הכי מהר לרה"מ'],
  ['mine', 'שלי'],
];

export function LeaderboardSheet({ onClose }: { onClose?: () => void }) {
  const { status, online, user } = useOnline();
  const game = useStore((s) => s.game);
  const screen = useStore((s) => s.screen);
  const [tab, setTab] = useState<BoardKind>('all');
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const ch = weeklyChallenge();
  const canFetch = status !== 'unconfigured' && online && (tab !== 'mine' || status === 'signedIn');

  useEffect(() => {
    setRows(null);
    setErr(null);
    if (!canFetch) return;
    fetchBoard(tab, { challenge: ch.id }).then(setRows, (e: Error) => setErr(e.message));
  }, [tab, canFetch, ch.id]);

  const local = localRecords();
  return (
    <Sheet title="🏆 טבלת השיאים" sub="ניקוד מנורמל 0–1000: פסגה, השפעה, מצב המדינה וציבור" onClose={onClose}>
      {screen === 'game' && game && <ScoreCard g={game} />}
      {screen === 'game' && game && (
        <div style={{ marginTop: 8 }}>
          <PublishScore g={game} />
        </div>
      )}
      <div className="filter-row" style={{ marginTop: 12 }}>
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} data-testid={`board-${k}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'challenge' && <div className="tiny muted" style={{ marginTop: 4 }}>{ch.title} – כולם מקבלים את אותו עולם. מתחילים מהמסך הראשי.</div>}
      {tab === 'fastest' && <div className="tiny muted" style={{ marginTop: 4 }}>מספר השבועות מתחילת המשחק עד ראשות הממשלה.</div>}

      {status === 'unconfigured' && <div className="card small muted" style={{ marginTop: 8 }}>הטבלה המקוונת לא הוגדרה בשרת. השיאים שלך במכשיר מוצגים למטה.</div>}
      {status !== 'unconfigured' && !online && <div className="card small muted" style={{ marginTop: 8 }}>📴 אין חיבור – מוצגים השיאים שנשמרו במכשיר.</div>}
      {tab === 'mine' && status === 'signedOut' && <div className="card small muted" style={{ marginTop: 8 }}>התחבר/י כדי לראות את השיאים שפרסמת.</div>}
      {err && <div className="card small bad" style={{ marginTop: 8 }}>{err}</div>}

      {canFetch && (
        <div className="col board" style={{ marginTop: 8 }} data-testid="board-rows">
          {rows === null && !err && <span className="small muted">טוען…</span>}
          {rows?.length === 0 && <span className="small muted">עוד אין תוצאות כאן. תהיה/י הראשון/ה!</span>}
          {rows?.map((r, i) => (
            <button key={`${r.user_id}-${r.career_id}`} className={`list-item board-row ${r.user_id === user?.id ? 'me' : ''}`} onClick={() => setOpenRow(openRow === r.career_id ? null : r.career_id)}>
              <span className="rank">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
              <div className="grow">
                <div className="spread">
                  <b className="ellipsis">{r.display_name}</b>
                  <b className="gold">{tab === 'fastest' ? `${r.pm_week} שב'` : r.total}</b>
                </div>
                <div className="tiny muted ellipsis">
                  {r.player_name} · {r.peak_label} · {r.years} שנים · {r.ending}
                </div>
                {openRow === r.career_id && (
                  <div className="tiny" style={{ marginTop: 4 }}>
                    פסגה {r.peak} · השפעה {r.impact} · מדינה {r.country} · ציבור {r.standing} · {r.laws} חוקים · {r.scenario === 'grassroots' ? 'מהשטח' : 'ח"כ טרי'}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {(tab === 'mine' || !canFetch) && local.length > 0 && (
        <>
          <div className="section-label">📱 השיאים שלי במכשיר</div>
          <div className="col" data-testid="local-records">
            {local.slice(0, 10).map((r) => (
              <div key={r.career_id} className="card save-row">
                <div className="spread">
                  <b>{r.player_name}</b>
                  <b className="gold">{r.total}</b>
                </div>
                <div className="tiny muted">
                  {r.peak_label} · {r.years} שנים · {r.ending}
                  {r.challenge ? ` · ${r.challenge}` : ''}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {!serverConfigured() && <p className="tiny faint">להפעלת הטבלה המקוונת: docs/ONLINE.md</p>}
    </Sheet>
  );
}
