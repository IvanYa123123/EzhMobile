package com.ezh.diary;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;

import com.chaquo.python.Python;

import java.io.File;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.InetSocketAddress;
import java.net.Socket;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "Ezh";
    private static final int PORT = 5000;

    private WebView webView;
    private View splash;
    private TextView splashStatus;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        splash = findViewById(R.id.splash);
        splashStatus = findViewById(R.id.splashStatus);

        ActivityCompat.requestPermissions(this, new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 1);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " EzhAndroid/1.1.0");

        webView.setBackgroundColor(Color.WHITE);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                splash.animate().alpha(0f).setDuration(250).withEndAction(() -> {
                    splash.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                }).start();
            }
            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                Log.e(TAG, "WebView error: " + err.getDescription());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) { request.grant(request.getResources()); }
            @Override
            public boolean onConsoleMessage(ConsoleMessage msg) {
                Log.d(TAG, msg.message() + " @" + msg.lineNumber());
                return true;
            }
        });

        startPythonServer();
        pollServerAndLoad();
    }

    private void startPythonServer() {
        final File dataDir = getFilesDir();
        new Thread(() -> {
            try {
                runOnUiThread(() -> splashStatus.setText("Запуск Python сервера..."));
                Python py = Python.getInstance();
                py.getModule("android_server").callAttr("start_server", dataDir.getAbsolutePath());
            } catch (final Exception e) {
                Log.e(TAG, "Python server failed", e);
                StringWriter sw = new StringWriter();
                PrintWriter pw = new PrintWriter(sw);
                e.printStackTrace(pw);
                Throwable rootCause = e;
                while (rootCause.getCause() != null) rootCause = rootCause.getCause();
                final String rootMsg = rootCause.toString();
                runOnUiThread(() -> {
                    String msg = "ОШИБКА PYTHON:\n" + rootMsg;
                    if (msg.length() > 400) msg = msg.substring(0, 400) + "...";
                    splashStatus.setText(msg);
                });
            }
        }, "py-server").start();
    }

    private void pollServerAndLoad() {
        new Thread(() -> {
            for (int i = 0; i < 60; i++) {
                try {
                    Socket sock = new Socket();
                    sock.connect(new InetSocketAddress("127.0.0.1", PORT), 200);
                    sock.close();
                    runOnUiThread(this::loadWebView);
                    return;
                } catch (Exception ignored) {
                    final int step = i;
                    runOnUiThread(() -> { if (step > 5) splashStatus.setText("Почти готово…"); });
                    try { Thread.sleep(300); } catch (InterruptedException e) { return; }
                }
            }
            runOnUiThread(() -> {
                if (splashStatus.getText().toString().contains("Почти готово")) {
                    splashStatus.setText("Сервер не отвечает. Перезапустите приложение.");
                }
            });
        }, "py-poller").start();
    }

    private void loadWebView() {
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl("http://127.0.0.1:" + PORT + "/");
    }

    @Override
    public void onBackPressed() {
        if (webView != null) {
            // Отправляем событие в JS. Если он вернет "true", значит он обработал кнопку (закрыл модалку/вкладку).
            webView.evaluateJavascript("window.ezhOnBackPressed ? window.ezhOnBackPressed() : false", value -> {
                if (!"true".equals(value)) {
                    if (webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        super.onBackPressed();
                    }
                }
            });
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (webView != null) { webView.destroy(); webView = null; }
    }
}
