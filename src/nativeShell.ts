// חיבור לאירועי המערכת של אנדרואיד: כפתור "חזור" ויציאה לרקע.
import { App } from '@capacitor/app';
import { applyImmersive, autoBackup, isNative, updateWidget } from './platform';
import { cloudAutoSync, flushPending } from './online';
import { askNotifyPermission, cancelComeback, onNotificationTap, scheduleReminders } from './notify';
import { openRoute, parseRoute } from './routes';
import { widgetData } from './appInfo';
import { useStore } from './store';

/** כפתור החזור של אנדרואיד: סוגר חלון → חוזר למפה → למסך הפתיחה → יוצא מהאפליקציה */
export function handleBack(): 'closed' | 'tab' | 'title' | 'blocked' | 'exit' {
  const st = useStore.getState();
  if (st.screen === 'game') {
    const g = st.game;
    // אירוע, הצבעה חיה או ליל בחירות – צריך לבחור, לא לברוח
    if (g && (g.eventQueue.length || g.liveVote || g.flags.showElection || g.flags.showPresident || g.gameOver)) {
      st.toast('קודם צריך להחליט 🙂', 'neutral');
      return 'blocked';
    }
    if (st.showReport) {
      st.setShowReport(false);
      return 'closed';
    }
    if (st.panels.length) {
      st.close();
      return 'closed';
    }
    if (st.tab !== 'map') {
      st.setTab('map');
      return 'tab';
    }
  }
  if (st.screen !== 'title') {
    st.setScreen('title');
    return 'title';
  }
  return 'exit';
}

export function initNativeShell() {
  if (!isNative()) return;
  void App.addListener('backButton', () => {
    if (handleBack() === 'exit') void App.minimizeApp();
  });
  // יציאה לרקע: גיבוי (לכל היותר פעם ב-3 דקות), כי מערכת ההפעלה עלולה לסגור את האפליקציה; ותזכורות
  void App.addListener('pause', () => {
    const g = useStore.getState().game ?? null;
    autoBackup(g, { minGapMs: 3 * 60_000 });
    cloudAutoSync(g);
    void scheduleReminders(g);
  });
  // חזרה לאפליקציה: שולחים מה שחיכה לחיבור, והתזכורת כבר לא נחוצה
  void App.addListener('resume', () => {
    void flushPending();
    cancelComeback();
    applyImmersive();
  });

  // קישורים: קיצורי דרך, הווידג'ט, "פתח באפליקציה" מהאתר
  void App.addListener('appUrlOpen', ({ url }) => {
    const r = parseRoute(url);
    if (r) void openRoute(r);
  });
  void App.getLaunchUrl().then((l) => {
    const r = l?.url ? parseRoute(l.url) : null;
    if (r) void openRoute(r);
  });
  onNotificationTap((route) => void openRoute(route));
  applyImmersive();
  cancelComeback();

  // הווידג'ט מתעדכן בכל שבוע במשחק; בכניסה הראשונה למשחק – בקשת הרשאה להתראות
  useStore.subscribe((st, prev) => {
    if (st.game && (st.game.week !== prev.game?.week || st.game.player.name !== prev.game?.player.name)) updateWidget(widgetData(st.game));
    if (st.screen === 'game' && prev.screen !== 'game') void askNotifyPermission();
  });
}
