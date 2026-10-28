package com.shmueljoso.hamishkan;

import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.StatFs;

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
}
