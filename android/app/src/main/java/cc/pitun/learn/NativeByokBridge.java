package cc.pitun.learn;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Fixed provider endpoints only. All credentials are caller-owned session
 * snapshots; no platform token, disk persistence, redirects or arbitrary URL. */
final class NativeByokBridge {
    private final WebView webView;
    private final ExecutorService executor = Executors.newFixedThreadPool(3);
    private final ConcurrentHashMap<String, Request> active = new ConcurrentHashMap<>();
    private volatile boolean released;
    private static final int MAX_BYTES = 12 * 1024 * 1024;
    private static final class Request {
        volatile boolean cancelled;
        volatile HttpURLConnection connection;
    }
    NativeByokBridge(WebView view) { webView = view; }
    private static String endpoint(String capability) {
        if ("tts".equals(capability)) return "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
        if ("asr".equals(capability)) return "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
        if ("admission".equals(capability)) return "https://api.typesafe.ai/v1/systemone";
        throw new IllegalArgumentException("Unknown capability");
    }
    private static boolean allowedHeader(String key, boolean jev) {
        if ("Content-Type".equals(key)) return true;
        if (jev) return "Authorization".equals(key);
        return "X-Api-Key".equals(key) || "X-Api-App-Key".equals(key)
                || "X-Api-App-Id".equals(key) || "X-Api-Access-Key".equals(key)
                || "X-Api-Resource-Id".equals(key) || "X-Api-Request-Id".equals(key)
                || "X-Api-Sequence".equals(key);
    }
    @JavascriptInterface
    public String request(String id, String capability, String rawHeaders, String body) {
        try {
            if (released || id == null || id.length() > 100 || body == null
                    || body.length() > MAX_BYTES || rawHeaders == null || rawHeaders.length() > 16384
                    || active.size() >= 6) return "{\"ok\":false}";
            final String url = endpoint(capability);
            final JSONObject headers = new JSONObject(rawHeaders);
            for (Iterator<String> it = headers.keys(); it.hasNext();) {
                String key = it.next();
                String value = headers.getString(key);
                if (!allowedHeader(key, "admission".equals(capability))
                        || value.contains("\n") || value.contains("\r")) return "{\"ok\":false}";
            }
            final Request request = new Request();
            if (active.putIfAbsent(id, request) != null) return "{\"ok\":false}";
            try { executor.execute(() -> execute(id, capability, url, headers, body, request)); }
            catch (RuntimeException error) { active.remove(id, request); return "{\"ok\":false}"; }
            return "{\"ok\":true}";
        } catch (Exception ignored) { return "{\"ok\":false}"; }
    }
    private void execute(String id, String capability, String url, JSONObject headers, String body, Request request) {
        JSONObject result = new JSONObject();
        try {
            result.put("id", id);
            if (request.cancelled || released) return;
            HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
            request.connection = connection;
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout("admission".equals(capability) ? 2000 : 10000);
            connection.setReadTimeout("admission".equals(capability) ? 2000 : 30000);
            connection.setRequestMethod("POST"); connection.setDoOutput(true);
            for (Iterator<String> it = headers.keys(); it.hasNext();) {
                String key = it.next(); connection.setRequestProperty(key, headers.getString(key));
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            if (request.cancelled || released) return;
            try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            int status = connection.getResponseCode();
            result.put("status", status);
            String code = connection.getHeaderField("X-Api-Status-Code");
            if (code != null && code.matches("[0-9]{7,8}")) result.put("code", code);
            // Never surface raw upstream error bodies: they may echo credentials.
            if (status >= 200 && status < 300) {
                try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192]; int size;
                    while ((size = input.read(buffer)) != -1) {
                        if (request.cancelled || released) return;
                        if (output.size() + size > MAX_BYTES) throw new IllegalStateException("Response too large");
                        output.write(buffer, 0, size);
                    }
                    result.put("body", new String(output.toByteArray(), StandardCharsets.UTF_8));
                }
            } else result.put("body", "");
        } catch (Exception ignored) {
            try { result.put("error", true); } catch (Exception ignoredAgain) { return; }
        } finally {
            if (request.connection != null) request.connection.disconnect();
            active.remove(id, request);
        }
        if (request.cancelled || released) return;
        String script = "window.__octosNativeByokEvent && window.__octosNativeByokEvent("
                + JSONObject.quote(result.toString()) + ");";
        webView.post(() -> { if (!released && !request.cancelled) webView.evaluateJavascript(script, null); });
    }
    @JavascriptInterface
    public void cancel(String id) {
        Request request = active.remove(id);
        if (request == null) return;
        request.cancelled = true;
        if (request.connection != null) request.connection.disconnect();
    }
    void release() {
        released = true;
        for (String id : active.keySet()) cancel(id);
        executor.shutdownNow();
    }
}
