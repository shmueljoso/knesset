import { useCallback, useEffect, useState } from 'react';
import { migrate } from '../engine/migrate';
import { KIND_LABEL, looksLikeSave, type SaveKind, type SaveMeta } from '../saves';
import { deviceInfo, exportGame, isNative, pickFile, saves, type DeviceInfo } from '../platform';
import { useStore } from '../store';
import { Sheet } from './common';
import { AppSettingsSheet } from './AppSettings';
import { CloudSaves } from './Online';

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק'`;
  const h = Math.round(m / 60);
  if (h < 24) return `לפני ${h} שע'`;
  const d = Math.round(h / 24);
  return d === 1 ? 'אתמול' : `לפני ${d} ימים`;
}

const ORDER: SaveKind[] = ['manual', 'auto', 'year', 'safety'];

/** שמירות וגיבויים: שמירה ידנית, טעינה, שינוי שם, מחיקה, ייצוא וייבוא */
export function SavesSheet({ onClose }: { onClose?: () => void }) {
  const game = useStore((s) => s.game);
  const screen = useStore((s) => s.screen);
  const loadGame = useStore((s) => s.loadGame);
  const toast = useStore((s) => s.toast);
  const closeAll = useStore((s) => s.closeAll);
  const inGame = screen === 'game' && !!game;
  const [list, setList] = useState<SaveMeta[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [filter, setFilter] = useState<SaveKind | 'all'>('all');
  const [settings, setSettings] = useState(false);

  const refresh = useCallback(() => {
    void saves.list().then(setList);
  }, []);
  useEffect(() => {
    refresh();
    void deviceInfo().then(setInfo);
  }, [refresh]);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    try {
      const msg = await fn();
      if (msg) toast(msg, 'good');
    } catch (e) {
      toast(`משהו השתבש: ${(e as Error).message ?? e}`, 'bad');
    } finally {
      setBusy(false);
      setArmed(null);
      refresh();
    }
  };

  const open = (id: string) =>
    run(async () => {
      const g = await saves.load(id);
      if (!g) throw new Error('השמירה פגומה');
      loadGame(g);
      closeAll();
      onClose?.();
      return `נטען: ${g.player.name}, שבוע ${g.week + 1}`;
    });

  const importFile = () =>
    run(async () => {
      const text = await pickFile();
      if (!text) return;
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('הקובץ אינו שמירה תקינה');
      }
      if (!looksLikeSave(data)) throw new Error('הקובץ אינו שמירה של המשכן');
      const g = migrate(data);
      await saves.save(g, 'manual', `${g.player.name} · מיובא`);
      return 'הקובץ יובא לרשימת השמירות. לחצ/י "טעינה" כדי לשחק בו.';
    });

  const shown = (list ?? []).filter((m) => filter === 'all' || m.kind === filter);
  const counts = Object.fromEntries(ORDER.map((k) => [k, (list ?? []).filter((m) => m.kind === k).length])) as Record<SaveKind, number>;
  const totalKb = Math.round((list ?? []).reduce((a, m) => a + m.bytes, 0) / 1024);

  return (
    <Sheet title="💾 שמירות וגיבויים" sub="כל השמירות נשארות במכשיר" onClose={onClose}>
      <div className="card small" data-testid="saves-info">
        <div>✅ המשחק נשמר מיד אחרי כל פעולה.</div>
        <div>🔁 גיבוי אוטומטי בכל סוף שבוע (8 אחרונים), גיבוי שנתי לכל שנה במשחק, וגיבוי ביטחון לפני מחיקה או טעינה.</div>
        <div className="muted" style={{ marginTop: 4 }}>
          {isNative() ? 'באנדרואיד הגיבויים נשמרים כקבצים בתיקיית האפליקציה.' : 'בדפדפן הגיבויים נשמרים במסד הנתונים של הדפדפן.'} כדי שהם ישרדו גם מחיקת האפליקציה – ייצא/י לקובץ.
        </div>
        {info && (
          <div className="tiny faint" style={{ marginTop: 6 }}>
            גרסה {info.appVersion}
            {info.build !== 'web' ? ` (${info.build})` : ''} · {info.os}
            {info.model ? ` · ${info.model}` : ''}
            {info.freeMb ? ` · ${(info.freeMb / 1024).toFixed(1)}GB פנויים` : ''} · גיבויים: {totalKb}KB
          </div>
        )}
      </div>

      {inGame && (
        <div className="card" style={{ marginTop: 10 }}>
          <b className="small">שמירה חדשה</b>
          <div className="row" style={{ marginTop: 6 }}>
            <input className="text-input grow" placeholder={`${game!.player.name} · שבוע ${game!.week + 1}`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} data-testid="save-name" />
            <button className="btn primary" disabled={busy} onClick={() => run(async () => { await saves.save(game!, 'manual', name); setName(''); return 'נשמר!'; })} data-testid="save-now">
              שמירה
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        {inGame && (
          <button className="btn grow" disabled={busy} onClick={() => run(() => exportGame(game!))} data-testid="export">
            📤 ייצוא לקובץ
          </button>
        )}
        <button className="btn grow" disabled={busy} onClick={importFile} data-testid="import">
          📥 ייבוא מקובץ
        </button>
      </div>

      <CloudSaves onLoaded={onClose} />

      <div className="section-label">📱 במכשיר</div>

      <div className="filter-row" style={{ marginTop: 12 }}>
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
          הכול ({list?.length ?? 0})
        </button>
        {ORDER.filter((k) => counts[k]).map((k) => (
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {KIND_LABEL[k]} ({counts[k]})
          </button>
        ))}
      </div>

      {list === null && <p className="small muted">טוען…</p>}
      {list?.length === 0 && <p className="small muted">עדיין אין שמירות. הגיבוי הראשון ייווצר בסוף השבוע הקרוב.</p>}
      <div className="col" style={{ marginTop: 8 }} data-testid="saves-list">
        {shown.map((m) => (
          <div key={m.id} className="card save-row">
            <div className="spread">
              <b className="ellipsis">{m.name}</b>
              <span className={`chip ${m.kind === 'manual' ? 'gold' : ''}`}>{KIND_LABEL[m.kind]}</span>
            </div>
            <div className="tiny muted">
              {m.player} · {m.date} · שבוע {m.week + 1} · {ago(m.savedAt)} · {Math.max(1, Math.round(m.bytes / 1024))}KB
            </div>
            {renaming?.id === m.id ? (
              <div className="row" style={{ marginTop: 8 }}>
                <input className="text-input grow" value={renaming.name} maxLength={40} autoFocus onChange={(e) => setRenaming({ id: m.id, name: e.target.value })} />
                <button className="btn sm primary" onClick={() => run(async () => { await saves.rename(m.id, renaming.name); setRenaming(null); return 'השם עודכן'; })}>
                  אישור
                </button>
                <button className="btn sm ghost" onClick={() => setRenaming(null)}>
                  ביטול
                </button>
              </div>
            ) : (
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                {armed === `load:${m.id}` ? (
                  <button className="btn sm primary grow" disabled={busy} onClick={() => open(m.id)} data-testid="confirm-load">
                    {inGame ? 'לטעון? המשחק הנוכחי יגובה' : 'לטעון'}
                  </button>
                ) : (
                  <button className="btn sm grow" disabled={busy} onClick={() => (inGame ? setArmed(`load:${m.id}`) : open(m.id))} data-testid="load">
                    ▶️ טעינה
                  </button>
                )}
                <button className="btn sm ghost" disabled={busy} onClick={() => setRenaming({ id: m.id, name: m.name })} aria-label="שינוי שם">
                  ✏️
                </button>
                {armed === `del:${m.id}` ? (
                  <button className="btn sm danger" disabled={busy} onClick={() => run(async () => { await saves.remove(m.id); return 'נמחק'; })}>
                    למחוק?
                  </button>
                ) : (
                  <button className="btn sm ghost" disabled={busy} onClick={() => setArmed(`del:${m.id}`)} aria-label="מחיקה">
                    🗑️
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {inGame && (
        <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => setSettings(true)} data-testid="open-settings">
          ⚙️ הגדרות האפליקציה – צלילים, רטט, התראות
        </button>
      )}
      {settings && <AppSettingsSheet onClose={() => setSettings(false)} />}
    </Sheet>
  );
}
