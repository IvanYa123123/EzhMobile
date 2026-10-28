package com.ezh.diary;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

import java.io.File;
import java.io.FileWriter;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

public class EzhBridge {
    private static final String PREFS_NAME = "ezh_notifications";
    private static final String KEY_IDS = "ids";
    private static final String KEY_SPEC_PREFIX = "spec:";

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

    // ============================================================
    //  Точные будильники (Android 12+). SCHEDULE_EXACT_ALARM —
    //  это special access, не runtime-разрешение. Его нельзя
    //  запросить через requestPermissions; нужен Settings-интент.
    // ============================================================

    @JavascriptInterface
    public boolean canScheduleExactAlarms() {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return false;
        try { return am.canScheduleExactAlarms(); }
        catch (Exception e) { return false; }
    }

    @JavascriptInterface
    public void requestExactAlarmPermission() {
        if (Build.VERSION.SDK_INT < 31) return;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null && am.canScheduleExactAlarms()) return;
        try {
            Intent intent = new Intent(
                    Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:" + ctx.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Exception ignored) {}
    }

    // ============================================================
    //  ПЛАНИРОВАНИЕ УВЕДОМЛЕНИЙ
    // ============================================================

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

            boolean exactAllowed = true;
            if (Build.VERSION.SDK_INT >= 31) {
                try { exactAllowed = am.canScheduleExactAlarms(); }
                catch (Exception e) { exactAllowed = false; }
            }

            if (!exactAllowed) {
                // Fallback: неточный, но всё равно будит устройство.
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

            Set<String> ids = new HashSet<>(loadIds());
            ids.add(id);
            saveIds(ids);

            // Спецификация — для восстановления после ребута.
            JSONObject spec = new JSONObject();
            spec.put("id", id);
            spec.put("title", title);
            spec.put("body", body != null ? body : "");
            spec.put("triggerAtMs", triggerAtMs);
            ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
               .edit()
               .putString(KEY_SPEC_PREFIX + id, spec.toString())
               .apply();
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

            ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
               .edit()
               .remove(KEY_SPEC_PREFIX + id)
               .apply();
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void cancelAllNotifications() {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Set<String> ids = new HashSet<>(loadIds());
        for (String id : ids) cancelNotification(id);
        saveIds(new HashSet<>());

        SharedPreferences.Editor editor = prefs.edit();
        for (String key : new HashSet<>(prefs.getAll().keySet())) {
            if (key.startsWith(KEY_SPEC_PREFIX)) editor.remove(key);
        }
        editor.remove(KEY_IDS).apply();
    }

    @JavascriptInterface
    public void openApp() {}

    // ============================================================
    //  СОХРАНЕНИЕ ФАЙЛА (для .ics и других текстовых артефактов)
    //  На Android 10+ — через MediaStore.Downloads, без permission.
    // ============================================================

    @JavascriptInterface
    public String saveFileFromText(String filename, String mimeType, String text) {
        if (filename == null || text == null) return null;
        if (mimeType == null || mimeType.isEmpty()) mimeType = "application/octet-stream";

        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH,
                        Environment.DIRECTORY_DOWNLOADS);
                Uri uri = ctx.getContentResolver()
                        .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) return null;
                OutputStream os = ctx.getContentResolver().openOutputStream(uri);
                if (os == null) return null;
                os.write(text.getBytes(StandardCharsets.UTF_8));
                os.close();
                return uri.toString();
            }
        } catch (Exception ignored) {}

        // Fallback: приватная директория приложения (без разрешений,
        // файл виден только через Files app не всегда — но хоть как-то).
        try {
            File dir = ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) dir = ctx.getFilesDir();
            dir.mkdirs();
            File f = new File(dir, filename);
            try (FileWriter fw = new FileWriter(f)) { fw.write(text); }
            return f.getAbsolutePath();
        } catch (Exception e) {
            return null;
        }
    }

    private Set<String> loadIds() {
        return ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getStringSet(KEY_IDS, new HashSet<>());
    }

    private void saveIds(Set<String> ids) {
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
           .edit()
           .putStringSet(KEY_IDS, ids)
           .apply();
    }
}
