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

/** Fixed supplier endpoints, using keys entered and encrypted on this device.
 * Saved keys are never returned to JavaScript. */
final class NativeByokBridge {
    private final WebView webView;
    private final NativeByokStore store;
    private final ExecutorService executor = Executors.newFixedThreadPool(3);
    private final ConcurrentHashMap<String, Request> active = new ConcurrentHashMap<>();
    private volatile boolean released;
    private String boundScope = "";
    private static final int MAX_BYTES = 12 * 1024 * 1024;
    private static final class Request {
        volatile boolean cancelled;
        volatile HttpURLConnection connection;
    }
    NativeByokBridge(WebView view) { webView = view; store = new NativeByokStore(view.getContext()); }
    @JavascriptInterface
    public synchronized String bindScope(String origin, String profile) {
        try {
            java.net.URI uri = java.net.URI.create(origin);
            if (!"https".equals(uri.getScheme()) || !"learn.pitun.cc".equalsIgnoreCase(uri.getHost()) || uri.getUserInfo() != null) return "{\"ok\":false}";
            String scope = origin + "\0" + profile;
            if (!boundScope.equals(scope)) for (String id : active.keySet()) cancel(id);
            store.bind(uri.getScheme() + "://" + uri.getAuthority(), profile);
            boundScope = scope; return "{\"ok\":true}";
        } catch (Exception ignored) { return "{\"ok\":false}"; }
    }
    @JavascriptInterface
    public String reconcile(String metadata) {
        try { return store.reconcile(new JSONObject(metadata)).toString(); }
        catch (Exception ignored) { return "{\"error\":true}"; }
    }
    @JavascriptInterface
    public String saveCredential(String capability, String config) {
        try { store.save(capability, new JSONObject(config)); return "{\"ok\":true}"; }
        catch (Exception ignored) { return "{\"ok\":false}"; }
    }
    @JavascriptInterface
    public String removeCredential(String capability) {
        try { store.remove(capability); return "{\"ok\":true}"; }
        catch (Exception ignored) { return "{\"ok\":false}"; }
    }
    @JavascriptInterface
    public synchronized String clearCredentials() {
        for (String id : active.keySet()) cancel(id);
        try { store.clear(); boundScope = ""; return "{\"ok\":true}"; }
        catch (Exception ignored) { return "{\"ok\":false}"; }
    }
    private static String endpoint(String capability) {
        if ("tts".equals(capability)) return "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
        if ("asr".equals(capability)) return "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
        if ("admission".equals(capability)) return "https://api.typesafe.ai/v1/systemone";
        throw new IllegalArgumentException("Unknown capability");
    }
    private static boolean allowedHeader(String key, boolean jev) {
        if ("Content-Type".equals(key)) return true;
        if (jev) return "Authorization".equals(key);
        return "X-Api-Key".equals(key)
                || "X-Api-Resource-Id".equals(key) || "X-Api-Request-Id".equals(key)
                || "X-Api-Sequence".equals(key);
    }
    @JavascriptInterface
    public synchronized String request(String id, String capability, String rawConfig, String body) {
        try {
            if (released || id == null || id.length() > 100 || body == null
                    || body.length() > MAX_BYTES || rawConfig == null || rawConfig.length() > 32768
                    || active.size() >= 6) return "{\"ok\":false}";
            final String url = endpoint(capability);
            JSONObject config = new JSONObject(rawConfig);
            NativeByokStore.requireCapability(capability);
            if (!("admission".equals(capability) ? "typesafe" : "volcano").equals(config.getString("provider"))) return "{\"ok\":false}";
            JSONObject params = config.getJSONObject("params");
            // A draft test can use a just-entered key without persisting it.
            // Normal requests contain only metadata; the key stays native.
            String key = config.optString("key").trim();
            if (key.isEmpty()) key = store.key(capability, config);
            if (key.isEmpty() || key.length() > 8192 || key.contains("\r") || key.contains("\n")) return "{\"ok\":false}";
            final JSONObject headers = new JSONObject().put("Content-Type", "application/json");
            if ("admission".equals(capability)) headers.put("Authorization", "Bearer " + key);
            else {
                if ((params.has("auth_mode") && !"api-key".equals(params.getString("auth_mode"))) || params.has("app_id")) return "{\"ok\":false}";
                headers.put("X-Api-Key", key).put("X-Api-Resource-Id", params.getString("resource_id"))
                        .put("X-Api-Request-Id", java.util.UUID.randomUUID().toString());
                if ("asr".equals(capability)) headers.put("X-Api-Sequence", "-1");
            }
            for (Iterator<String> it = headers.keys(); it.hasNext();) {
                String header = it.next();
                String value = headers.getString(header);
                if (!allowedHeader(header, "admission".equals(capability))
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
