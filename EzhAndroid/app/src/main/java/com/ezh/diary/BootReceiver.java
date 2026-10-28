package com.ezh.diary;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import org.json.JSONObject;

import java.util.Map;

/**
 * Перезапускает планировщик уведомлений после перезагрузки.
 *
 * AlarmManager очищается при ребуте — все PendingIntent теряются.
 * EzhBridge при планировании кладёт в SharedPreferences спецификацию
 * каждого уведомления под ключом "spec:<id>". Здесь мы эти
 * спецификации читаем обратно и заново ставим алярмы — без поднятия
 * Python и без ожидания открытия приложения.
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "EzhBoot";
    private static final String PREFS_NAME = "ezh_notifications";
    private static final String KEY_SPEC_PREFIX = "spec:";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            return;
        }

        final Context app = ctx.getApplicationContext();
        final SharedPreferences prefs = app.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        final AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        boolean exactAllowed = true;
        if (Build.VERSION.SDK_INT >= 31) {
            try { exactAllowed = am.canScheduleExactAlarms(); }
            catch (Exception ignored) { exactAllowed = false; }
        }

        final long now = System.currentTimeMillis();
        final Map<String, ?> all = prefs.getAll();

        for (Map.Entry<String, ?> e : all.entrySet()) {
            final String key = e.getKey();
            if (!key.startsWith(KEY_SPEC_PREFIX)) continue;
            final Object v = e.getValue();
            if (!(v instanceof String)) continue;

            try {
                final JSONObject spec = new JSONObject((String) v);
                final String id = spec.optString("id", null);
                final String title = spec.optString("title", "");
                final String body = spec.optString("body", "");
                final long triggerAtMs = spec.optLong("triggerAtMs", 0L);

                if (id == null || id.isEmpty() || triggerAtMs <= now) {
                    prefs.edit().remove(key).apply();
                    continue;
                }

                final Intent alarmIntent = new Intent(app, NotificationReceiver.class);
                alarmIntent.putExtra("id", id);
                alarmIntent.putExtra("title", title);
                alarmIntent.putExtra("body", body);
                alarmIntent.setAction("com.ezh.diary.NOTIFY_" + id);

                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
                final PendingIntent pi = PendingIntent.getBroadcast(
                        app, id.hashCode(), alarmIntent, flags);

                if (Build.VERSION.SDK_INT >= 31 && !exactAllowed) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                } else if (Build.VERSION.SDK_INT >= 23) {
                    try {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                    } catch (SecurityException se) {
                        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                    }
                } else {
                    am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                }
            } catch (Exception ex) {
                Log.w(TAG, "Не удалось восстановить уведомление " + key, ex);
            }
        }
    }
}
