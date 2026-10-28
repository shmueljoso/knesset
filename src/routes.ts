// מעבר ישיר למסך מבחוץ: קיצורי דרך באייקון, הווידג'ט, התראות, וקישורי שיתוף.
// באפליקציה: hamishkan://continue · hamishkan://challenge · hamishkan://board · hamishkan://s/<קוד>
// באתר: ‎#go=challenge · ‎#s=<קוד>
import { validateMod, type ModFile } from './engine/mods';
import { fetchShared, weeklyChallenge } from './online';
import { useStore } from './store';

/** מפרק קישור לנתיב פנימי: 'continue', 'challenge', 'board', 's/<קוד>' */
export function parseRoute(url: string): string | null {
  const app = /^hamishkan:\/\/\/?([^?#]+)/.exec(url);
  if (app) return app[1].replace(/\/$/, '');
  const hash = /#(?:.*&)?(s|go)=([A-Za-z0-9_-]+)/.exec(url);
  if (hash) return hash[1] === 's' ? `s/${hash[2]}` : hash[2];
  return null;
}

export async function openRoute(route: string) {
  const st = useStore.getState();
  // באמצע משחק עם אירוע פתוח – לא קופצים החוצה
  const g = st.game;
  const busy = st.screen === 'game' && g && (g.eventQueue.length || g.liveVote || g.flags.showElection || g.flags.showPresident);
  if (route === 'continue') {
    if (st.screen !== 'game' && !st.continueGame()) st.setScreen('title');
    return;
  }
  if (busy) {
    st.toast('קודם צריך לסיים את ההחלטה שעל המסך', 'neutral');
    return;
  }
  if (route === 'challenge') {
    const ch = weeklyChallenge();
    st.setPendingMod(null);
    st.setPendingChallenge({ id: ch.id, seed: ch.seed, scenario: ch.scenario, title: ch.title });
    st.setScreen('create');
    return;
  }
  if (route === 'board' || route === 'saves' || route === 'settings') {
    st.setScreen('title');
    st.setTitleSheet(route);
    return;
  }
  const share = /^s\/([A-Za-z0-9]{4,16})$/.exec(route);
  if (share) {
    try {
      const r = await fetchShared(share[1]);
      const { mod, errors } = validateMod(r.data);
      st.setPendingChallenge(null);
      if (mod && !errors.length) {
        st.setPendingMod(mod);
        st.setScreen('create');
        st.toast(`📩 נפתחה כנסת ששיתפו איתך: ${r.title || mod.name}`, 'good');
      } else {
        st.setPendingMod(r.data as ModFile);
        st.setScreen('editor');
        st.toast('הכנסת ששותפה צריכה תיקונים לפני שמשחקים', 'neutral');
      }
    } catch (e) {
      st.toast((e as Error).message, 'bad');
    }
  }
}

/** קישור intent:// שפותח את האפליקציה בכרום של אנדרואיד (אם היא מותקנת) */
export const appIntentUrl = (route: string) => `intent://${route}#Intent;scheme=hamishkan;package=com.shmueljoso.hamishkan;end`;

/** באתר: קישור עם #s=... או #go=... – פותחים ומנקים את הכתובת. מחזיר את הנתיב (לכפתור "פתח באפליקציה") */
export function openRouteFromLocation(): string | null {
  if (typeof location === 'undefined') return null;
  const r = parseRoute(location.href);
  if (!r) return null;
  history.replaceState(null, '', location.pathname + location.search);
  void openRoute(r);
  return r;
}
