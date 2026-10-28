// חיבור לאירועי המערכת של אנדרואיד: כפתור "חזור" ויציאה לרקע.
import { App } from '@capacitor/app';
import { autoBackup, isNative } from './platform';
import { cloudAutoSync, flushPending } from './online';
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
  // יציאה לרקע: גיבוי (לכל היותר פעם ב-3 דקות), כי מערכת ההפעלה עלולה לסגור את האפליקציה
  void App.addListener('pause', () => {
    autoBackup(useStore.getState().game, { minGapMs: 3 * 60_000 });
    cloudAutoSync(useStore.getState().game);
  });
  // חזרה לאפליקציה: שולחים מה שחיכה לחיבור
  void App.addListener('resume', () => void flushPending());
}
