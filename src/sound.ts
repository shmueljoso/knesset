// צלילים מסונתזים (Web Audio) – בלי קבצי שמע, עובד גם אופליין ובדפדפן.
import { pref } from './prefs';

export type Sound = 'bell' | 'tick' | 'yes' | 'no' | 'win' | 'lose' | 'chime';

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (!pref('sound') || typeof window === 'undefined') return null;
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  try {
    ctx ??= new C();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** צליל בודד: תדר, משך, צורת גל ועוצמה, עם דעיכה */
function tone(a: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.15) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = a.currentTime + at;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function play(s: Sound) {
  const a = audio();
  if (!a) return;
  switch (s) {
    case 'bell': // פעמון המליאה: שלושה צלצולים עם צלילים עיליים
      for (let i = 0; i < 3; i++) {
        tone(a, 880, i * 0.32, 0.9, 'sine', 0.12);
        tone(a, 2200, i * 0.32, 0.4, 'sine', 0.04);
      }
      break;
    case 'tick':
      tone(a, 1400, 0, 0.03, 'square', 0.02);
      break;
    case 'yes':
      tone(a, 660, 0, 0.08, 'triangle', 0.06);
      break;
    case 'no':
      tone(a, 220, 0, 0.1, 'triangle', 0.06);
      break;
    case 'win': // אקורד עולה
      [523, 659, 784, 1046].forEach((f, i) => tone(a, f, i * 0.12, 0.7, 'triangle', 0.1));
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) => tone(a, f, i * 0.2, 0.6, 'sawtooth', 0.05));
      break;
    case 'chime':
      tone(a, 1046, 0, 0.5, 'sine', 0.08);
      tone(a, 1568, 0.08, 0.5, 'sine', 0.05);
      break;
  }
}
