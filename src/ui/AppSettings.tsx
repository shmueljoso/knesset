import { useState } from 'react';
import { usePrefs, type Prefs } from '../prefs';
import { applyImmersive, isNative } from '../platform';
import { apiUrl, setServerUrl, useOnline } from '../online';
import { scheduleReminders, askNotifyPermission } from '../notify';
import { play } from '../sound';
import { useStore } from '../store';
import { Sheet } from './common';

const ROWS: [keyof Prefs, string, string, boolean][] = [
  ['notify', '🔔 התראות', 'אתגר השבוע החדש, ותזכורת כשמשהו מחכה לך במשחק', true],
  ['sound', '🔊 צלילים', 'פעמון המליאה, ספירת הקולות וליל הבחירות', false],
  ['haptics', '📳 רטט', 'בכל קול בהצבעה צמודה ובתוצאות', true],
  ['keepAwake', '☀️ המסך לא נכבה', 'בזמן הצבעה חיה וליל הבחירות', false],
  ['immersive', '⛶ מסך מלא', 'בלי שורת המצב וסרגל הניווט (החלקה מהקצה מחזירה אותם)', true],
];

/** הגדרות האפליקציה במכשיר הזה (לא חלק מהמשחק) */
export function AppSettingsSheet({ onClose }: { onClose: () => void }) {
  const prefs = usePrefs();
  const toast = useStore((s) => s.toast);
  const game = useStore((s) => s.game);
  const status = useOnline((s) => s.status);
  const [url, setUrl] = useState(apiUrl());
  const [busy, setBusy] = useState(false);
  const native = isNative();

  const toggle = (k: keyof Prefs, v: boolean) => {
    prefs.setPref(k, v);
    if (k === 'immersive') applyImmersive(v);
    if (k === 'sound' && v) play('chime');
    if (k === 'notify') {
      if (v) {
        try {
          localStorage.removeItem('hamishkan.notifyAsked');
        } catch {
          /* ignore */
        }
        void askNotifyPermission();
      }
      void scheduleReminders(v ? game : null);
    }
  };

  const saveUrl = async () => {
    setBusy(true);
    try {
      const ok = await setServerUrl(url);
      toast(ok ? '✅ מחובר לשרת' : url ? 'השרת לא עונה – בדוק/י את הכתובת' : 'חזרה לכתובת ברירת המחדל', ok ? 'good' : 'neutral');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="⚙️ הגדרות" sub="ההגדרות של המכשיר הזה" onClose={onClose}>
      <div className="col">
        {ROWS.filter(([, , , nativeOnly]) => native || !nativeOnly).map(([k, label, hint]) => (
          <label key={k} className="card row" style={{ gap: 10, cursor: 'pointer' }} data-testid={`pref-${k}`}>
            <div className="grow">
              <b>{label}</b>
              <div className="tiny muted">{hint}</div>
            </div>
            <input type="checkbox" checked={prefs[k]} onChange={(e) => toggle(k, e.target.checked)} />
          </label>
        ))}
      </div>

      <div className="section-label">☁️ שרת (חשבון, שמירות בענן ושיאים)</div>
      <div className="card">
        <div className="tiny muted" style={{ marginBottom: 6 }}>
          {status === 'unconfigured' ? 'לא מחובר. ' : '✅ מחובר. '}
          {native ? 'הכתובת של האתר ב-Cloudflare, למשל https://hamishkan.שם.workers.dev' : 'באתר ב-Cloudflare זה עובד לבד. אפשר להזין כתובת אחרת לבדיקות.'}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input className="text-input grow" dir="ltr" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} data-testid="server-url" />
          <button className="btn sm" disabled={busy} onClick={() => void saveUrl()}>
            {busy ? '…' : 'שמירה'}
          </button>
        </div>
      </div>

      {native && (
        <>
          <div className="section-label">📱 עוד באפליקציה</div>
          <div className="card small muted">
            <div>🏠 <b>ווידג'ט:</b> לחיצה ארוכה על מסך הבית ← ווידג'טים ← המשכן. מראה את הסקר והבחירות הבאות.</div>
            <div style={{ marginTop: 6 }}>⚡ <b>קיצורי דרך:</b> לחיצה ארוכה על האייקון – המשך משחק, אתגר השבוע, שיאים.</div>
            <div style={{ marginTop: 6 }}>📤 <b>שיתוף:</b> בליל הבחירות ובסוף הקריירה יש כפתור לשליחת תמונה.</div>
          </div>
        </>
      )}
    </Sheet>
  );
}
