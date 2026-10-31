# R8/ProGuard-правила для «Ежедневника СевГУ».
# minifyEnabled сейчас false, но файл нужен, чтобы включение
# минификации не сломало мост JS↔Java и Chaquopy.

# --- WebView JavaScript bridge ---
# Без этого R8 вырежет методы EzhBridge, помеченные @JavascriptInterface,
# и window.EzhNative.* перестанет существовать в WebView.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.ezh.diary.EzhBridge { *; }
-keepclassmembers class com.ezh.diary.EzhBridge {
    public *;
}

# --- BroadcastReceiver'ы ---
# На них ссылается AndroidManifest; AGP генерирует keep-правила,
# но фиксируем явно — они восстанавливают алярмы после ребута.
-keep class com.ezh.diary.NotificationReceiver { *; }
-keep class com.ezh.diary.BootReceiver { *; }

# --- Chaquopy ---
-dontwarn com.chaquo.python.**
-keep class com.chaquo.python.** { *; }
-keep class com.chaquo.python.android.** { *; }

# --- Python-модули вызываются рефлексией из Java (callAttr) ---
-keep class com.ezh.diary.EzhApplication { *; }
