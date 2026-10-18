-keep class com.ezh.diary.EzhBridge { *; }
-keep class com.ezh.diary.NotificationReceiver { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
