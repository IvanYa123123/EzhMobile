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
    private EzhBridge bridge;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webView);
        splash = findViewById(R.id.splash);
        splashStatus = findViewById(R.id.splashStatus);

        ActivityCompat.requestPermissions(this,
                new String[]{
                        android.Manifest.permission.POST_NOTIFICATIONS,
                        android.Manifest.permission.SCHEDULE_EXACT_ALARM
                }, 1);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " EzhAndroid/0.62");
        webView.setBackgroundColor(Color.WHITE);

        bridge = new EzhBridge(this);
        webView.addJavascriptInterface(bridge, "EzhNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                splash.animate().alpha(0f).setDuration(250).withEndAction(() -> {
                    splash.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                }).start();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    Log.e(TAG, "WebView main-frame error: " + error.getDescription());
                    runOnUiThread(() -> {
                        if (splashStatus != null) {
                            splashStatus.setText("Ошибка загрузки: " + error.getDescription());
                        }
                    });
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                request.grant(request.getResources());
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage msg) {
                Log.d(TAG, "JS: " + msg.message() + " @" + msg.lineNumber());
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
                runOnUiThread(() -> splashStatus.setText("Запуск Python-сервера..."));
                Python py = Python.getInstance();
                py.getModule("android_server").callAttr("start_server", dataDir.getAbsolutePath());
            } catch (final Exception e) {
                Log.e(TAG, "Python server failed", e);
                StringWriter sw = new StringWriter();
                e.printStackTrace(new PrintWriter(sw));
                Throwable rootCause = e;
                while (rootCause.getCause() != null) rootCause = rootCause.getCause();
                final String rootMsg = rootCause.toString();
                runOnUiThread(() -> splashStatus.setText("ОШИБКА PYTHON:\n" + rootMsg));
            }
        }, "py-server").start();
    }

    private void pollServerAndLoad() {
        new Thread(() -> {
            for (int i = 0; i < 80; i++) {
                try {
                    Socket sock = new Socket();
                    sock.connect(new InetSocketAddress("127.0.0.1", PORT), 200);
                    sock.close();
                    runOnUiThread(() -> {
                        webView.setVisibility(View.VISIBLE);
                        webView.loadUrl("http://127.0.0.1:" + PORT + "/");
                    });
                    return;
                } catch (Exception ignored) {
                    final int step = i;
                    runOnUiThread(() -> {
                        if (step > 5) splashStatus.setText("Почти готово…");
                    });
                    try { Thread.sleep(300); } catch (InterruptedException e) { return; }
                }
            }
            runOnUiThread(() -> splashStatus.setText("Сервер не запустился за 24 секунды."));
        }).start();
    }

    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript("window.ezhOnBackPressed ? window.ezhOnBackPressed() : false", value -> {
                if (!"true".equals(value)) {
                    if (webView.canGoBack()) webView.goBack();
                    else super.onBackPressed();
                }
            });
        } else {
            super.onBackPressed();
        }
    }
}
