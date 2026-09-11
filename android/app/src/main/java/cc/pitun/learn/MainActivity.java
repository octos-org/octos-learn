package cc.pitun.learn;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.webkit.WebViewAssetLoader;

import java.util.ArrayList;
import java.util.List;

public final class MainActivity extends Activity {
    private static final String TRUSTED_HOST = "learn.pitun.cc";
    private static final String START_URL = "https://" + TRUSTED_HOST + "/";
    private static final int MEDIA_PERMISSION_REQUEST = 1001;

    private WebView webView;
    private NativeInkOverlayView nativeInkOverlay;
    private NativeInkBridge nativeInkBridge;
    private NativeAudioBridge nativeAudioBridge;
    private PermissionRequest pendingWebPermission;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        enterImmersiveMode();

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(17, 16, 14));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        nativeInkOverlay = new NativeInkOverlayView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        root.addView(nativeInkOverlay, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);

        configureWebView();
        if (savedInstanceState == null) {
            webView.loadUrl(START_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);

        nativeInkBridge = new NativeInkBridge(webView, nativeInkOverlay);
        webView.addJavascriptInterface(nativeInkBridge, "OctosNativeInk");
        nativeAudioBridge = new NativeAudioBridge(this, webView);
        webView.addJavascriptInterface(nativeAudioBridge, "OctosNativeAudio");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, false);

        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(TRUSTED_HOST)
                .setHttpAllowed(false)
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new LocalFirstWebViewClient(assetLoader));
        webView.setWebChromeClient(new TrustedWebChromeClient());
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        if (nativeInkBridge != null) nativeInkBridge.onMotionEvent(event);
        // The WebView still receives the event so toolbar controls and non-ink
        // gestures remain ordinary DOM input. OLL suppresses only the duplicate
        // drawing event while native ink capture is active.
        return super.dispatchTouchEvent(event);
    }

    private final class LocalFirstWebViewClient extends WebViewClient {
        private final WebViewAssetLoader assetLoader;

        LocalFirstWebViewClient(WebViewAssetLoader assetLoader) {
            this.assetLoader = assetLoader;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(
                WebView view,
                WebResourceRequest request
        ) {
            Uri url = request.getUrl();
            if (!isTrustedHttps(url) || !"GET".equalsIgnoreCase(request.getMethod())) {
                return null;
            }

            String path = url.getPath() == null ? "/" : url.getPath();
            if (isRemoteServicePath(path)) return null;

            // BrowserRouter routes such as /login and /settings do not exist
            // as physical files. Serve the packaged entry point for them. Do
            // this before consulting AssetsPathHandler: some Android 8 vendor
            // WebViews treat the empty asset path for "/" as an invalid HTTP
            // response instead of reporting it as missing.
            if (path.equals("/") || !lastPathSegmentHasExtension(path)) {
                WebResourceResponse entryPoint = assetLoader.shouldInterceptRequest(
                        Uri.parse("https://" + TRUSTED_HOST + "/index.html")
                );
                return entryPoint == null
                        ? null
                        : applyKnownMimeType(entryPoint, "/index.html");
            }

            WebResourceResponse local = assetLoader.shouldInterceptRequest(url);
            return local == null ? null : applyKnownMimeType(local, path);
        }

        @Override
        public void onReceivedError(
                WebView view,
                WebResourceRequest request,
                WebResourceError error
        ) {
            super.onReceivedError(view, request, error);
            if (!request.isForMainFrame()) return;
            Toast.makeText(
                    MainActivity.this,
                    "Octos Learn 加载失败（" + error.getErrorCode() + "）："
                            + error.getDescription(),
                    Toast.LENGTH_LONG
            ).show();
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (isTrustedHttps(request.getUrl())) return false;
            Toast.makeText(
                    MainActivity.this,
                    "为安全起见，Octos Learn 只允许打开 learn.pitun.cc",
                    Toast.LENGTH_LONG
            ).show();
            return true;
        }
    }

    private static WebResourceResponse applyKnownMimeType(
            WebResourceResponse response,
            String path
    ) {
        if (path.endsWith(".html")) {
            response.setMimeType("text/html");
            response.setEncoding("UTF-8");
        } else if (path.endsWith(".mjs") || path.endsWith(".js")) {
            response.setMimeType("application/javascript");
        } else if (path.endsWith(".wasm")) {
            response.setMimeType("application/wasm");
        } else if (path.endsWith(".onnx")) {
            response.setMimeType("application/octet-stream");
        }
        return response;
    }

    private final class TrustedWebChromeClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> handleWebPermissionRequest(request));
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (request == pendingWebPermission) pendingWebPermission = null;
        }
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        if (!isTrustedHttps(request.getOrigin())) {
            request.deny();
            return;
        }

        List<String> androidPermissions = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                    && checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                androidPermissions.add(Manifest.permission.RECORD_AUDIO);
            } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                    && checkSelfPermission(Manifest.permission.CAMERA)
                    != PackageManager.PERMISSION_GRANTED) {
                androidPermissions.add(Manifest.permission.CAMERA);
            }
        }

        if (androidPermissions.isEmpty()) {
            grantTrustedResources(request);
            return;
        }

        if (pendingWebPermission != null) pendingWebPermission.deny();
        pendingWebPermission = request;
        requestPermissions(
                androidPermissions.toArray(new String[0]),
                MEDIA_PERMISSION_REQUEST
        );
    }

    private void grantTrustedResources(PermissionRequest request) {
        List<String> granted = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                    && checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                    == PackageManager.PERMISSION_GRANTED) {
                granted.add(resource);
            } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                    && checkSelfPermission(Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED) {
                granted.add(resource);
            }
        }
        if (granted.isEmpty()) request.deny();
        else request.grant(granted.toArray(new String[0]));
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            @NonNull String[] permissions,
            @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != MEDIA_PERMISSION_REQUEST || pendingWebPermission == null) return;
        PermissionRequest request = pendingWebPermission;
        pendingWebPermission = null;
        grantTrustedResources(request);
    }

    private static boolean isTrustedHttps(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme())
                && TRUSTED_HOST.equalsIgnoreCase(uri.getHost());
    }

    private static boolean isRemoteServicePath(String path) {
        return path.equals("/health")
                || path.startsWith("/api/")
                || path.startsWith("/private-asr/");
    }

    private static boolean lastPathSegmentHasExtension(String path) {
        String segment = path.substring(path.lastIndexOf('/') + 1);
        return segment.contains(".");
    }

    @Override
    protected void onResume() {
        super.onResume();
        enterImmersiveMode();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else moveTaskToBack(true);
    }

    @Override
    protected void onDestroy() {
        if (pendingWebPermission != null) pendingWebPermission.deny();
        if (nativeAudioBridge != null) nativeAudioBridge.release();
        webView.stopLoading();
        webView.destroy();
        super.onDestroy();
    }

    private void enterImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }
}
