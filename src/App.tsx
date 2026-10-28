import { useState } from 'react';
import { useStore } from './store';
import { appIntentUrl } from './routes';
import { CreateScreen } from './ui/CreateScreen';
import { GameScreen, Toasts } from './ui/GameScreen';
import { ModEditor } from './ui/ModEditor';
import { TitleScreen } from './ui/TitleScreen';

export function App({ linkRoute = null }: { linkRoute?: string | null }) {
  const screen = useStore((s) => s.screen);
  // הגעת מקישור בכרום של אנדרואיד? אפשר לפתוח אותו באפליקציה
  const [appLink, setAppLink] = useState(() => (linkRoute && /Android/.test(navigator.userAgent) ? appIntentUrl(linkRoute) : null));
  return (
    <div className="app">
      {appLink && (
        <div className="open-in-app" data-testid="open-in-app">
          <a href={appLink} className="btn sm primary">📱 פתיחה באפליקציה</a>
          <button className="icon-btn" onClick={() => setAppLink(null)} aria-label="סגירה">✕</button>
        </div>
      )}
      {screen === 'title' && <TitleScreen />}
      {screen === 'create' && <CreateScreen />}
      {screen === 'game' && <GameScreen />}
      {screen === 'editor' && <ModEditor />}
      {/* במשחק ההודעות מוצגות בתוך מסך המשחק */}
      {screen !== 'game' && <Toasts />}
    </div>
  );
}
