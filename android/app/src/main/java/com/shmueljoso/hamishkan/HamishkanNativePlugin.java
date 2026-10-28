package com.shmueljoso.hamishkan;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.StatFs;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * פלאגין נייטיב קטן – דוגמה לאיך קוד ג'אווה מדבר עם המשחק (JavaScript).
 *
 * בצד ה-JS (src/platform.ts) קוראים לו כך:
 *   const HamishkanNative = registerPlugin('HamishkanNative');
 *   const info = await HamishkanNative.getInfo();
 *
 * השם ב-@CapacitorPlugin חייב להיות זהה לשם ב-registerPlugin,
 * וכל מתודה שמסומנת ב-@PluginMethod נגישה מה-JS.
 * הפלאגין נרשם ב-MainActivity.onCreate.
 */
@CapacitorPlugin(name = "HamishkanNative")
public class HamishkanNativePlugin extends Plugin {

    /** פרטי האפליקציה והמכשיר: גרסה, אנדרואיד, דגם ומקום פנוי. מוצג במסך "שמירות וגיבויים". */
    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
            ret.put("appVersion", info.versionName);
            ret.put("build", String.valueOf(code));
        } catch (Exception e) {
            ret.put("appVersion", "?");
            ret.put("build", "?");
        }
        ret.put("os", "Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
        ret.put("model", Build.MANUFACTURER + " " + Build.MODEL);
        StatFs stat = new StatFs(getContext().getFilesDir().getAbsolutePath());
        ret.put("freeMb", stat.getAvailableBytes() / (1024 * 1024));
        call.resolve(ret);
    }

    /** המסך לא נכבה – בזמן הצבעה חיה או ליל בחירות. כל שינוי בחלון חייב לרוץ ב-UI thread. */
    @PluginMethod
    public void setKeepAwake(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            Window w = getActivity().getWindow();
            if (on) w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else w.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    /** מסך מלא: מסתיר את שורת המצב ואת סרגל הניווט. החלקה מהקצה מחזירה אותם לרגע. */
    @PluginMethod
    public void setImmersive(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            Window w = getActivity().getWindow();
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
            if (on) {
                c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                c.hide(WindowInsetsCompat.Type.systemBars());
            } else {
                c.show(WindowInsetsCompat.Type.systemBars());
            }
            call.resolve();
        });
    }

    /** הווידג'ט במסך הבית: שומרים את הטקסטים ומבקשים מהווידג'טים לצייר את עצמם מחדש. */
    @PluginMethod
    public void updateWidget(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences.Editor e = ctx.getSharedPreferences(HamishkanWidget.PREFS, Context.MODE_PRIVATE).edit();
        for (String key : new String[] { "title", "line1", "line2", "line3" }) {
            e.putString(key, call.getString(key, ""));
        }
        e.apply();
        HamishkanWidget.updateAll(ctx);
        call.resolve();
    }
}
