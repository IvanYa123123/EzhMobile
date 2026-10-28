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
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

import com.chaquo.python.Python;

import java.io.File;
import java.io.PrintWriter;
import java.io.StringWriter;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "Ezh";
    private static final int PORT = 5000;

    private static final String APP_HOST_1 = "127.0.0.1";
    private static final String APP_HOST_2 = "localhost";
    private static final String APP_HOST_3 = "appassets.androidplatform.net";

    private WebView webView;
    private View splash;
    private TextView splashStatus;
    private EzhBridge bridge;
    private WebViewAssetLoader assetLoader;

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

        // WebViewAssetLoader: index.html и статика идут из assets.
        // Мы добавляем два хэндлера: /assets/ (читает APK) и /static/ (читает filesDir).
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/",
                        new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/static/",
                        new WebViewAssetLoader.InternalStoragePathHandler(
                                this, new File(getFilesDir(), "static")))
                .build();

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
        // ALWAYS_ALLOW нужно, чтобы https://appassets.local мог делать fetch на http://127.0.0.1
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
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                // /api/ всегда идёт на 127.0.0.1:5000, не через asset loader
                String host = request.getUrl().getHost();
                if (host != null && (host.equals(APP_HOST_1) || host.equals(APP_HOST_2))) {
                    return null;
                }
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

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
                if (request.isForMainFrame()) {
                    Log.e(TAG, "WebView main-frame error: " + error.getDescription());
                    runOnUiThread(() -> {
                        if (splashStatus != null) {
                            splashStatus.setText("Ошибка загрузки: " + error.getDescription());
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
                request.grant(request.getResources());
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

        // 1) Сразу показываем UI из assets — не ждём Python
        webView.setVisibility(View.INVISIBLE);
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");

        // 2) Параллельно стартуем Python
        startPythonServer();
    }

    private boolean handleExternalUrl(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        if (scheme == null) return false;

        if (scheme.equals("http") || scheme.equals("https")) {
            String host = uri.getHost();
            if (host != null && (host.equals(APP_HOST_1)
                    || host.equals(APP_HOST_2)
                    || host.equals(APP_HOST_3))) {
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

    private void startPythonServer() {
        final File dataDir = getFilesDir();
        new Thread(() -> {
            try {
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
            }
        }, "py-server").start();
    }
}
