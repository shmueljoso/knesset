import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/heebo/400.css';
import '@fontsource/heebo/500.css';
import '@fontsource/heebo/700.css';
import '@fontsource/heebo/800.css';
import { App } from './App';
import { isNative } from './platform';
import { initNativeShell } from './nativeShell';
import { startOnline } from './online';
import './styles.css';

// באפליקציה הקבצים כבר ארוזים בתוך ה-APK – Service Worker רק היה מגיש גרסה ישנה אחרי עדכון
if (!isNative()) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => undefined);
}
initNativeShell();
startOnline();
document.documentElement.dataset.platform = isNative() ? 'native' : 'web';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
