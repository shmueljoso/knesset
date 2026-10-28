// כרטיסי שיתוף: תמונה מעוצבת (PNG) של ליל הבחירות או של סוף הקריירה, לשליחה בוואטסאפ.
// מצוירת ב-canvas בתוך המכשיר – בלי שרת. באנדרואיד נפתח חלון השיתוף, בדפדפן שיתוף או הורדה.
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { GameState } from './engine';
import { careerScore } from './engine/systems/score';
import { ENDINGS, computeLegacy } from './engine/systems/legacy';
import { isNative } from './platform';
import { careerTitle } from './ui/labels';

const W = 1080;
const H = 1350;
const GOLD = '#e8c37a';
const FONT = 'Heebo, Arial, sans-serif';

async function canvas(): Promise<[HTMLCanvasElement, CanvasRenderingContext2D]> {
  await Promise.all(['400', '700', '800'].map((w) => document.fonts?.load(`${w} 40px Heebo`).catch(() => undefined)));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#13233b');
  bg.addColorStop(1, '#070d18');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  x.direction = 'rtl';
  x.textAlign = 'right';
  x.textBaseline = 'alphabetic';
  // מסגרת וכותרת עליונה
  x.strokeStyle = 'rgba(232,195,122,0.35)';
  x.lineWidth = 3;
  x.strokeRect(36, 36, W - 72, H - 72);
  text(x, '🏛️ המשכן', W - 90, 130, 44, 800, GOLD);
  return [c, x];
}

function text(x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number, weight = 400, color = '#fff', align: CanvasTextAlign = 'right', maxW?: number) {
  x.font = `${weight} ${size}px ${FONT}`;
  x.fillStyle = color;
  x.textAlign = align;
  x.fillText(s, px, py, maxW);
}

function footer(x: CanvasRenderingContext2D, g: GameState) {
  text(x, `${g.player.name} · ${careerTitle(g)} · שבוע ${g.week + 1}`, W - 90, H - 90, 30, 400, '#93a1b8', 'right', W - 180);
  text(x, 'סימולטור קריירה פוליטית', 90, H - 90, 30, 700, GOLD, 'left');
}

function round(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number) {
  x.beginPath();
  x.roundRect(px, py, w, h, r);
  x.fill();
}

/** תמונת ליל הבחירות: פס המנדטים ורשימת המפלגות */
export async function electionCard(g: GameState): Promise<HTMLCanvasElement | null> {
  const e = g.lastElection;
  if (!e) return null;
  const [c, x] = await canvas();
  text(x, `תוצאות הבחירות לכנסת ה-${e.knesset}`, W - 90, 220, 64, 800);
  const rows = Object.entries(e.seats)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ p: g.parties[id], n }))
    .filter((r) => r.p)
    .sort((a, b) => b.n - a.n);
  // פס 120 מנדטים
  let px = W - 90;
  const bw = W - 180;
  for (const r of rows) {
    const w = (r.n / 120) * bw;
    x.fillStyle = r.p.color;
    x.fillRect(px - w, 270, w, 56);
    px -= w;
  }
  x.fillStyle = GOLD;
  x.fillRect(W - 90 - (61 / 120) * bw - 2, 256, 4, 84);
  text(x, '61', W - 90 - (61 / 120) * bw, 248, 26, 700, GOLD, 'center');
  // רשימת המפלגות
  const list = rows.slice(0, 13);
  list.forEach((r, i) => {
    const y = 410 + i * 58;
    const mine = r.p.id === g.player.partyId;
    if (mine) {
      x.fillStyle = 'rgba(232,195,122,0.14)';
      round(x, 80, y - 42, W - 160, 56, 14);
    }
    x.fillStyle = r.p.color;
    x.beginPath();
    x.arc(W - 112, y - 14, 14, 0, Math.PI * 2);
    x.fill();
    text(x, r.p.name, W - 145, y, 36, mine ? 800 : 400, '#fff', 'right', 720);
    text(x, String(r.n), 110, y, 40, 800, mine ? GOLD : '#fff', 'left');
  });
  // מה קרה לך
  const pm = g.coalition.pmId === 'player' ? g.player.name : g.npcs[g.coalition.pmId]?.name;
  const me = e.playerElected ? '🎉 נבחרתי לכנסת!' : e.playerPosition ? `😔 המקום ה-${e.playerPosition} לא הספיק` : '';
  const y0 = 410 + list.length * 58 + 40;
  if (me) text(x, me, W - 90, Math.min(y0, H - 230), 44, 800, e.playerElected ? '#4ade80' : '#f87171');
  if (pm && !g.negotiation) text(x, `ראש הממשלה: ${pm}`, W - 90, Math.min(y0 + 62, H - 168), 34, 400, '#c9d2e0', 'right', W - 180);
  footer(x, g);
  return c;
}

/** תמונת סוף הקריירה: המורשת והניקוד */
export async function legacyCard(g: GameState): Promise<HTMLCanvasElement> {
  const [c, x] = await canvas();
  const end = ENDINGS[g.gameOver ?? 'retired'] ?? ENDINGS.retired;
  const L = computeLegacy(g);
  const b = careerScore(g);
  text(x, g.player.name, W - 90, 250, 80, 800, '#fff', 'right', W - 180);
  text(x, `🏁 ${end.title}`, W - 90, 320, 38, 700, '#c9d2e0', 'right', W - 180);
  // ציון גדול
  x.fillStyle = 'rgba(232,195,122,0.10)';
  round(x, 90, 380, W - 180, 330, 30);
  text(x, 'המורשת', W / 2, 450, 34, 400, '#93a1b8', 'center');
  text(x, L.title, W / 2, 540, 64, 800, GOLD, 'center', W - 240);
  text(x, `${b.total}`, W / 2, 660, 110, 800, '#fff', 'center');
  text(x, 'מתוך 1000', W / 2 + 190, 660, 30, 400, '#93a1b8', 'center');
  // מספרים
  const stats: [string, string][] = [
    [String(b.years), 'שנים'],
    [String(b.laws), 'חוקים'],
    [b.peakLabel, 'פסגה'],
  ];
  stats.forEach(([v, l], i) => {
    const cx = W - 90 - (W - 180) / 6 - i * ((W - 180) / 3);
    text(x, v, cx, 840, 54, 800, '#fff', 'center', (W - 180) / 3 - 20);
    text(x, l, cx, 890, 30, 400, '#93a1b8', 'center');
  });
  // תגיות
  let ty = L.tags.length ? 990 : 930;
  let tx = W - 90;
  for (const t of L.tags.slice(0, 6)) {
    x.font = `700 30px ${FONT}`;
    const w = x.measureText(t).width + 44;
    if (tx - w < 90) {
      tx = W - 90;
      ty += 70;
    }
    if (ty > H - 180) break;
    x.fillStyle = 'rgba(232,195,122,0.18)';
    round(x, tx - w, ty - 40, w, 54, 27);
    text(x, t, tx - 22, ty - 3, 30, 700, GOLD);
    tx -= w + 14;
  }
  // החוקים שלי
  const laws = L.laws.slice(-4).reverse();
  if (laws.length && ty < H - 300) {
    let ly = ty + (L.tags.length ? 100 : 0);
    text(x, '📜 החוקים שלי', W - 90, ly, 34, 700, '#c9d2e0');
    for (const l of laws) {
      ly += 52;
      if (ly > H - 150) break;
      text(x, `• ${l.title}`, W - 110, ly, 30, 400, '#fff', 'right', W - 200);
    }
  }
  footer(x, g);
  return c;
}

/** שליחה: באנדרואיד – חלון השיתוף; בדפדפן – שיתוף אם אפשר, אחרת הורדה */
export async function shareCanvas(c: HTMLCanvasElement, name: string, caption: string): Promise<string> {
  const file = `${name}.png`;
  if (isNative()) {
    const data = c.toDataURL('image/png').split(',')[1];
    const res = await Filesystem.writeFile({ path: file, data, directory: Directory.Cache });
    await Share.share({ title: 'המשכן', text: caption, files: [res.uri], dialogTitle: 'שיתוף' });
    return 'נפתח חלון השיתוף';
  }
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('לא הצלחתי ליצור תמונה');
  const f = new File([blob], file, { type: 'image/png' });
  if (navigator.canShare?.({ files: [f] })) {
    await navigator.share({ files: [f], text: caption }).catch(() => undefined);
    return 'שותף';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file;
  a.click();
  URL.revokeObjectURL(a.href);
  return 'התמונה הורדה';
}
