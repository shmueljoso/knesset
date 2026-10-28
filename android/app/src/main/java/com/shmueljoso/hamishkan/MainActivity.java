package com.shmueljoso.hamishkan;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * המסך היחיד של האפליקציה. BridgeActivity של Capacitor פותח WebView שמריץ את המשחק
 * (הקבצים מ-dist, שהועתקו ל-assets/public ב-"npx cap sync").
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // פלאגינים מקומיים (שלא הגיעו מ-npm) נרשמים כאן, לפני super.onCreate
        registerPlugin(HamishkanNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
