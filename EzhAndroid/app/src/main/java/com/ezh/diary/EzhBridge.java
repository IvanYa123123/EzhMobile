package com.ezh.diary;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

public class EzhBridge {
    private static final String PREFS_NAME = "ezh_notifications";
    private static final String KEY_IDS = "ids";

    private final MainActivity activity;
    private final Context ctx;

    public EzhBridge(MainActivity activity) {
        this.activity = activity;
        this.ctx = activity.getApplicationContext();
    }

    @JavascriptInterface
    public String getPlatformInfo() {
        JSONObject o = new JSONObject();
        try {
            o.put("platform", "android");
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("model", Build.MODEL);
            o.put("manufacturer", Build.MANUFACTURER);
            o.put("version", Build.VERSION.RELEASE);
        } catch (Exception ignored) {}
        return o.toString();
    }

    @JavascriptInterface
    public boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            return ctx.checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                    == PackageManager.PERMISSION_GRANTED;
        }
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    }

    @JavascriptInterface
    public void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            activity.runOnUiThread(() -> ActivityCompat.requestPermissions(
                    activity,
                    new String[]{"android.permission.POST_NOTIFICATIONS"},
                    1));
        }
    }

    @JavascriptInterface
    public void scheduleNotification(String id, String title, String body, long triggerAtMs) {
        if (id == null || title == null) return;
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            Intent intent = new Intent(ctx, NotificationReceiver.class);
            intent.putExtra("id", id);
            intent.putExtra("title", title);
            intent.putExtra("body", body);
            intent.setAction("com.ezh.diary.NOTIFY_" + id);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(ctx, id.hashCode(), intent, flags);

            if (Build.VERSION.SDK_INT >= 23) {
                try {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                } catch (SecurityException se) {
                    am.set(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                }
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
            }

            Set<String> ids = new HashSet<>(loadIds());
            ids.add(id);
            saveIds(ids);
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void cancelNotification(String id) {
        if (id == null) return;
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent intent = new Intent(ctx, NotificationReceiver.class);
            intent.setAction("com.ezh.diary.NOTIFY_" + id);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(ctx, id.hashCode(), intent, flags);
            am.cancel(pi);

            Set<String> ids = new HashSet<>(loadIds());
            ids.remove(id);
            saveIds(ids);
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void cancelAllNotifications() {
        Set<String> ids = loadIds();
        for (String id : ids) cancelNotification(id);
        saveIds(new HashSet<>());
    }

    @JavascriptInterface
    public void openApp() {}

    private Set<String> loadIds() {
        return ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getStringSet(KEY_IDS, new HashSet<>());
    }

    private void saveIds(Set<String> ids) {
        SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit();
        e.putStringSet(KEY_IDS, ids);
        e.apply();
    }
}
