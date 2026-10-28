import type { CapacitorConfig } from '@capacitor/cli';

// הגדרות האפליקציה לאנדרואיד. אחרי כל שינוי כאן: npm run android:sync
const config: CapacitorConfig = {
  appId: 'com.shmueljoso.hamishkan',
  appName: 'המשכן',
  webDir: 'dist',
  backgroundColor: '#0c1626',
  plugins: {
    SystemBars: {
      // Capacitor מזריק משתני CSS ‏--safe-area-inset-* כדי שהממשק לא ייכנס מתחת לשורת המצב
      insetsHandling: 'css',
      style: 'DARK',
    },
  },
};

export default config;
