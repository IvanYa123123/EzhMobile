package com.ezh.diary;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;

public class EzhApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();

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
