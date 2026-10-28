package com.shmueljoso.hamishkan;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * ווידג'ט למסך הבית: המפלגה שלך, הסקר האחרון והבחירות הבאות.
 *
 * איך זה עובד:
 *  1. המשחק (JS) קורא ל-HamishkanNative.updateWidget בסוף כל שבוע במשחק.
 *  2. הפלאגין שומר את הטקסטים ב-SharedPreferences וקורא ל-updateAll.
 *  3. כאן בונים RemoteViews (תצוגה ש"נשלחת" למסך הבית – אפליקציה אחרת) מהקובץ res/layout/widget_hamishkan.xml.
 * לחיצה על הווידג'ט פותחת את המשחק דרך הקישור hamishkan://continue.
 * ההגדרות (גודל, תצוגה מקדימה) ב-res/xml/widget_info.xml, והרישום ב-AndroidManifest.xml.
 */
public class HamishkanWidget extends AppWidgetProvider {
    static final String PREFS = "hamishkan_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, build(context));
        }
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, HamishkanWidget.class));
        if (ids.length > 0) {
            new HamishkanWidget().onUpdate(context, manager, ids);
        }
    }

    static RemoteViews build(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_hamishkan);
        String title = p.getString("title", "");
        v.setTextViewText(R.id.widget_title, title.isEmpty() ? context.getString(R.string.widget_empty_title) : title);
        v.setTextViewText(R.id.widget_line1, p.getString("line1", context.getString(R.string.widget_empty_line)));
        v.setTextViewText(R.id.widget_line2, p.getString("line2", ""));
        v.setTextViewText(R.id.widget_line3, p.getString("line3", ""));

        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("hamishkan://continue"), context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.widget_root, pi);
        return v;
    }
}
