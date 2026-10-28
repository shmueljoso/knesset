import { useState } from 'react';
import type { GameState } from '../engine';
import { electionCard, legacyCard, shareCanvas } from '../shareCard';
import { useStore } from '../store';

/** כפתור "שיתוף כתמונה" – ליל הבחירות או סוף הקריירה */
export function ShareButton({ g, kind }: { g: GameState; kind: 'election' | 'legacy' }) {
  const toast = useStore((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const share = async () => {
    setBusy(true);
    try {
      const c = kind === 'election' ? await electionCard(g) : await legacyCard(g);
      if (!c) return;
      const caption = kind === 'election' ? `ליל הבחירות לכנסת ה-${g.lastElection?.knesset} – המשכן` : `${g.player.name}: סוף הקריירה במשכן`;
      const msg = await shareCanvas(c, kind === 'election' ? `hamishkan-elections-${g.lastElection?.knesset}` : 'hamishkan-legacy', caption);
      if (msg === 'התמונה הורדה') toast(msg, 'good');
    } catch (e) {
      toast((e as Error).message || 'השיתוף נכשל', 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="btn block" disabled={busy} onClick={() => void share()} data-testid={`share-${kind}`}>
      {busy ? 'מכין תמונה…' : '📤 שיתוף כתמונה'}
    </button>
  );
}
