package com.ezh.diary;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;

public class EzhApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();

        if (!Python.isStarted()) {
            Python.start(new AndroidPlatform(this));
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                NotificationChannel ch = new NotificationChannel(
                    "ezh_default",
                    "Напоминания",
                    NotificationManager.IMPORTANCE_DEFAULT
                );
                ch.setDescription("Напоминания о парах и событиях");
                nm.createNotificationChannel(ch);
            }
        }
    }
}
