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
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;


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

    private static boolean isServerStarting = false;
    private static final Object SERVER_START_LOCK = new Object();

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
        s.setUserAgentString(s.getUserAgentString() + " EzhAndroid/" + BuildConfig.VERSION_NAME);
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

                hintBrokenAsset(url, String.valueOf(error.getDescription()));
            }

            /**
             * 404/500 от локального Flask приходит именно сюда: onReceivedError
             * вызывается только на сетевые сбои, поэтому подсказка про
             * vendor-ассеты раньше не срабатывала ни разу — как раз в случае
             * «белого экрана», для которого она и писалась.
             */
            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request,
                                            WebResourceResponse response) {
                String url = request.getUrl() != null ? request.getUrl().toString() : "?";
                int status = response != null ? response.getStatusCode() : -1;
                Log.e(TAG, "WebView HTTP " + status + ": " + url);
                if (status >= 400) {
                    hintBrokenAsset(url, "HTTP " + status);
                }
            }

            private void hintBrokenAsset(String url, String detail) {
                if (url == null) return;
                boolean broken = url.contains("/static/vendor/")
                        || url.contains("bootstrap")
                        || url.contains("chart")
                        || url.contains("/static/fonts/");
                if (!broken) return;
                runOnUiThread(() -> {
                    if (splashStatus != null && splashStatus.getVisibility() == View.VISIBLE) {
                        splashStatus.setText(
                            "Не загрузились vendor-ассеты (" + url + ", " + detail + ").\n" +
                            "Запустите scripts/fetch_vendor_assets.py и пересоберите APK.");
                    }
                });
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
            public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
                // Без этого WebView показывает системный диалог с заголовком
                // «Подтвердите действие на http://127.0.0.1».
                new MaterialAlertDialogBuilder(MainActivity.this)
                        .setTitle("Подтверждение")
                        .setMessage(message == null ? "" : message)
                        .setPositiveButton("Да", (dialog, which) -> result.confirm())
                        .setNegativeButton("Отмена", (dialog, which) -> result.cancel())
                        .setOnCancelListener(dialog -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
                new MaterialAlertDialogBuilder(MainActivity.this)
                        .setTitle("Сообщение")
                        .setMessage(message == null ? "" : message)
                        .setPositiveButton("ОК", (dialog, which) -> result.confirm())
                        .setOnCancelListener(dialog -> result.cancel())
                        .show();
                return true;
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
                startServer();
            } else {
                Log.d(TAG, "Server is already running");
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

    private void startServer() {
        // Гонка: поворот экрана пересоздаёт Activity, два потока могут
        // одновременно пройти проверку и стартовать два сервера на порту
        // 5000 → Address already in use. Синхронизируемся.
        synchronized (SERVER_START_LOCK) {
            if (isServerStarting) return;
            isServerStarting = true;
        }

        new Thread(() -> {
            try {
                runOnUiThread(() -> splashStatus.setText("Запуск сервера..."));
                EzhServer.start(getApplicationContext());
            } catch (final Throwable e) {
                Log.e(TAG, "Server failed", e);
                StringWriter sw = new StringWriter();
                e.printStackTrace(new PrintWriter(sw));
                Throwable rc = e;
                while (rc.getCause() != null) rc = rc.getCause();
                final String rootMsg = rc.toString();
                runOnUiThread(() -> {
                    if (splashStatus != null)
                        splashStatus.setText("ОШИБКА СЕРВЕРА:\n" + rootMsg);
                });
                synchronized (SERVER_START_LOCK) {
                    isServerStarting = false;
                }
            }
        }, "ezh-server").start();
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
