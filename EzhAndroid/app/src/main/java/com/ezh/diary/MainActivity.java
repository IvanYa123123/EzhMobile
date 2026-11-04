package com.ezh.diary;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import com.chaquo.python.Python;

import java.io.File;
import java.io.IOException;
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

    private static boolean isPythonStarting = false;
    private static final Object PY_START_LOCK = new Object();

    private ValueCallback<Uri[]> pendingFileCallback;
    private ActivityResultLauncher<Intent> fileChooserLauncher;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webView);
        splash = findViewById(R.id.splash);
        splashStatus = findViewById(R.id.splashStatus);

        fileChooserLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (pendingFileCallback == null) return;
                    Uri[] uris = null;
                    if (result.getResultCode() == Activity.RESULT_OK
                            && result.getData() != null) {
                        Intent data = result.getData();
                        if (data.getDataString() != null) {
                            uris = new Uri[]{Uri.parse(data.getDataString())};
                        } else if (data.getClipData() != null) {
                            int count = data.getClipData().getItemCount();
                            uris = new Uri[count];
                            for (int i = 0; i < count; i++) {
                                uris[i] = data.getClipData().getItemAt(i).getUri();
                            }
                        }
                    }
                    pendingFileCallback.onReceiveValue(uris);
                    pendingFileCallback = null;
                });

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " EzhAndroid/0.7");
        webView.setBackgroundColor(Color.WHITE);

        bridge = new EzhBridge(this);
        webView.addJavascriptInterface(bridge, "EzhNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                splash.animate().alpha(0f).setDuration(200).withEndAction(() -> {
                    splash.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                }).start();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        WebResourceError error) {
                String url = request.getUrl() != null ? request.getUrl().toString() : "?";
                Log.e(TAG, "WebView error: " + url + " — " + error.getDescription());

                if (request.isForMainFrame()) {
                    runOnUiThread(() -> {
                        if (splashStatus != null) {
                            splashStatus.setText("Ошибка загрузки: " + error.getDescription());
                        }
                    });
                    return;
                }

                // 404 на vendor-файлы — главная причина «белого экрана»
                // по BUILD.md (bootstrap.min.css / chart.umd.min.js).
                // Подсвечиваем в сплэше, чтобы пользователь сразу видел
                // причину, а не смотрел на пустой календарь.
                if (url.contains("/static/vendor/") || url.contains("bootstrap") || url.contains("chart")) {
                    runOnUiThread(() -> {
                        if (splashStatus != null && splashStatus.getVisibility() == View.VISIBLE) {
                            splashStatus.setText(
                                "Не загрузились vendor-ассеты (" + url + ").\n" +
                                "Запустите scripts/fetch_vendor_assets.py и пересоберите APK.");
                        }
                    });
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleExternalUrl(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleExternalUrl(Uri.parse(url));
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // Грантим только локальному origin. Если пользователь
                // случайно перешёл по внешней ссылке внутри WebView,
                // камера/микрофон стороннему сайту не достанутся.
                final Uri origin = request.getOrigin();
                if (origin == null || origin.getHost() == null) {
                    request.deny();
                    return;
                }
                final String host = origin.getHost().toLowerCase();
                if (host.equals("127.0.0.1") || host.equals("localhost")) {
                    request.grant(request.getResources());
                } else {
                    request.deny();
                }
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage msg) {
                Log.d(TAG, "JS: " + msg.message() + " @" + msg.lineNumber());
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
                pendingFileCallback = cb;
                try {
                    fileChooserLauncher.launch(params.createIntent());
                    return true;
                } catch (Exception e) {
                    Log.e(TAG, "onShowFileChooser error", e);
                    pendingFileCallback = null;
                    return false;
                }
            }
        });

        setupBackDispatcher();

        new Thread(() -> {
            if (!isServerRunning()) {
                startPythonServer();
            } else {
                Log.d(TAG, "Python server is already running");
            }
            pollServerAndLoad();
        }).start();
    }

    private boolean isServerRunning() {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", PORT), 200);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private void startPythonServer() {
        // Гонка: поворот экрана пересоздаёт Activity, два потока могут
        // одновременно пройти проверку и стартовать два waitress на
        // порту 5000 → Address already in use. Синхронизируемся.
        synchronized (PY_START_LOCK) {
            if (isPythonStarting) return;
            isPythonStarting = true;
        }

        final File dataDir = getFilesDir();
        new Thread(() -> {
            try {
                runOnUiThread(() -> splashStatus.setText("Запуск Python-сервера..."));
                Python py = Python.getInstance();
                py.getModule("android_server")
                  .callAttr("start_server", dataDir.getAbsolutePath());
            } catch (final Exception e) {
                Log.e(TAG, "Python server failed", e);
                StringWriter sw = new StringWriter();
                e.printStackTrace(new PrintWriter(sw));
                Throwable rc = e;
                while (rc.getCause() != null) rc = rc.getCause();
                final String rootMsg = rc.toString();
                runOnUiThread(() -> {
                    if (splashStatus != null)
                        splashStatus.setText("ОШИБКА PYTHON:\n" + rootMsg);
                });
            } finally {
                // В нормальном режиме waitress.serve() не возвращает
                // управление — finally не выполнится, isPythonStarting
                // останется true и защитит от повторного старта.
                // Если сервер упал или вернулся (что для serve() — аномалия),
                // сбрасываем флаг под тем же локом.
                synchronized (PY_START_LOCK) {
                    isPythonStarting = false;
                }
            }
        }, "py-server").start();
    }

    private void pollServerAndLoad() {
        // 200 × 300 мс = 60 с. На холодном старте Chaquopy + waitress
        // на старом устройстве 24 с может не хватить — увеличили до 60.
        for (int i = 0; i < 200; i++) {
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
                    if (step > 5 && splashStatus != null)
                        splashStatus.setText("Почти готово…");
                });
                try {
                    Thread.sleep(300);
                } catch (InterruptedException e) {
                    return;
                }
            }
        }
        runOnUiThread(() -> {
            if (splashStatus != null)
                splashStatus.setText("Сервер не запустился за 60 секунд.");
        });
    }

    private boolean handleExternalUrl(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        if (scheme == null) return false;

        if (scheme.equals("http") || scheme.equals("https")) {
            String host = uri.getHost();
            if (host != null && (host.equals("127.0.0.1") || host.equals("localhost"))) {
                return false;
            }
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "Cannot open external url: " + uri, e);
        }
        return true;
    }

    private void setupBackDispatcher() {
        OnBackPressedCallback cb = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView == null) {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    return;
                }
                webView.evaluateJavascript(
                        "window.ezhOnBackPressed ? window.ezhOnBackPressed() : false",
                        value -> {
                            if (!"true".equals(value)) {
                                if (webView.canGoBack()) webView.goBack();
                                else {
                                    setEnabled(false);
                                    getOnBackPressedDispatcher().onBackPressed();
                                }
                            }
                        });
            }
        };
        getOnBackPressedDispatcher().addCallback(this, cb);
    }
}
