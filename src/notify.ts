// התראות מקומיות (אנדרואיד): נקבעות כשהאפליקציה יוצאת לרקע, ומתבטלות כשחוזרים.
// בלי שרת ובלי אינטרנט – הכול במכשיר.
import { LocalNotifications } from '@capacitor/local-notifications';
import type { GameState } from './engine';
import { isNative } from './platform';
import { pref } from './prefs';
import { nextChallengeAt, reminderText } from './appInfo';
import { weeklyChallenge } from './online';

const COMEBACK = 1;
const CHALLENGE = 2;
const ASKED = 'hamishkan.notifyAsked';

/** בקשת הרשאה (אנדרואיד 13+) – פעם אחת, כשנכנסים למשחק */
export async function askNotifyPermission() {
  if (!isNative() || !pref('notify')) return;
  try {
    if (localStorage.getItem(ASKED)) return;
    localStorage.setItem(ASKED, '1');
    const p = await LocalNotifications.checkPermissions();
    if (p.display === 'prompt' || p.display === 'prompt-with-rationale') await LocalNotifications.requestPermissions();
  } catch {
    /* אין הרשאה – פשוט בלי התראות */
  }
}

/** מתזמנים מחדש: תזכורת לחזור בעוד יומיים + אתגר השבוע הבא */
export async function scheduleReminders(g: GameState | null) {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: COMEBACK }, { id: CHALLENGE }] });
    if (!pref('notify')) return;
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    const list = [];
    if (g && !g.gameOver) {
      const r = reminderText(g);
      list.push({ id: COMEBACK, title: r.title, body: r.body, schedule: { at: new Date(Date.now() + 2 * 864e5), allowWhileIdle: false }, extra: { route: 'continue' } });
    }
    const at = nextChallengeAt(new Date());
    const ch = weeklyChallenge(new Date(at.getTime() + 3600_000));
    list.push({ id: CHALLENGE, title: `🎯 ${ch.title}`, body: 'אתגר חדש: כולם מתחילים מאותו עולם. מי יגיע הכי רחוק?', schedule: { at }, extra: { route: 'challenge' } });
    await LocalNotifications.schedule({ notifications: list });
  } catch {
    /* לא קריטי */
  }
}

/** חזרה לאפליקציה: התזכורת כבר לא רלוונטית */
export function cancelComeback() {
  if (!isNative()) return;
  void LocalNotifications.cancel({ notifications: [{ id: COMEBACK }] }).catch(() => undefined);
}

/** לחיצה על התראה → מעבר למסך המתאים */
export function onNotificationTap(cb: (route: string) => void) {
  if (!isNative()) return;
  void LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const route = (a.notification.extra as { route?: string } | undefined)?.route;
    if (route) cb(route);
  });
}
