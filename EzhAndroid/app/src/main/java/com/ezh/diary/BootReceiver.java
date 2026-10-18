package com.ezh.diary;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;

/**
 * Перезапускает планировщик уведомлений после перезагрузки.
 * Планирование делает JS — здесь просто запускаем приложение,
 * чтобы оно при следующей загрузке страницы пересобрало список.
 * Без приложения это сделать нельзя, но мы можем хотя бы
 * отменить все «мёртвые» pending intents.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        // Ничего не планируем — просто подчищаем старые id,
        // чтобы EzhBridge не хранил мусор. Сами уведомления
        // пересоберёт JS при следующем открытии приложения.
        new Handler(Looper.getMainLooper()).post(() -> {
            ctx.getSharedPreferences("ezh_notifications", Context.MODE_PRIVATE)
               .edit().remove("ids").apply();
        });
    }
}
