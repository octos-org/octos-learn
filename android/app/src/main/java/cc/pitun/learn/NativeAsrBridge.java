package cc.pitun.learn;

import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

/** One utterance -> cloud ASR. No RTC worker, audio files, or credential export. */
final class NativeAsrBridge {
    private static final String ENDPOINT =
            "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
    private final WebView webView;
    private final NativeTtsBridge credentials;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicReference<Request> active = new AtomicReference<>();
    private volatile boolean released;

    private static final class Request {
        final String id;
        volatile boolean cancelled;
        volatile HttpURLConnection connection;
        Request(String id) { this.id = id; }
    }

    NativeAsrBridge(WebView webView, NativeTtsBridge credentials) {
        this.webView = webView;
        this.credentials = credentials;
    }

    @JavascriptInterface
    public boolean isConfigured() {
        return !released && credentials.isConfigured();
    }

    @JavascriptInterface
    public String transcribe(String requestId, String encodedWav) {
        String[] config = credentials.speechCredentials();
        if (released || config == null) return result(false, "尚未取得火山语音配置，请联网后重试。");
        if (requestId == null || requestId.length() > 100 || requestId.trim().isEmpty()
                || encodedWav == null || encodedWav.length() > 8_000_000) {
            return result(false, "语音数据无效或过长，请分成短句。");
        }
        Request request = new Request(requestId);
        if (!active.compareAndSet(null, request)) return result(false, "正在识别上一段语音，请稍后再说。");
        try {
            executor.execute(() -> recognize(request, encodedWav, config));
            return result(true, null);
        } catch (RuntimeException error) {
            active.compareAndSet(request, null);
            return result(false, "语音识别已关闭，请重新开启。");
        }
    }

    @JavascriptInterface
    public void cancel(String requestId) {
        Request request = active.get();
        if (request == null || !request.id.equals(requestId)) return;
        request.cancelled = true;
        HttpURLConnection connection = request.connection;
        if (connection != null) connection.disconnect();
        active.compareAndSet(request, null);
    }

    void release() {
        released = true;
        Request request = active.get();
        if (request != null) cancel(request.id);
        executor.shutdownNow();
    }

    private void recognize(Request request, String encodedWav, String[] config) {
        HttpURLConnection connection = null;
        String transcript = "";
        String error = null;
        try {
            byte[] bytes = Base64.decode(encodedWav, Base64.DEFAULT);
            validateWav(bytes);
            if (request.cancelled || released) return;
            connection = (HttpURLConnection) new URL(ENDPOINT).openConnection();
            request.connection = connection;
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(25_000);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("X-Api-App-Key", config[0]);
            connection.setRequestProperty("X-Api-Access-Key", config[1]);
            connection.setRequestProperty("X-Api-Resource-Id", "volc.bigasr.auc_turbo");
            connection.setRequestProperty("X-Api-Request-Id", UUID.randomUUID().toString());
            connection.setRequestProperty("X-Api-Sequence", "-1");
            JSONObject body = new JSONObject()
                    .put("user", new JSONObject().put("uid", "octos-android"))
                    .put("audio", new JSONObject().put("data", encodedWav))
                    .put("request", new JSONObject().put("model_name", "bigmodel")
                            .put("enable_itn", true).put("enable_punc", true));
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            if (request.cancelled || released) return;
            try (java.io.OutputStream output = connection.getOutputStream()) { output.write(payload); }
            int status = connection.getResponseCode();
            String code = connection.getHeaderField("X-Api-Status-Code");
            if (status == 401 || status == 403) {
                throw new IllegalStateException("火山 ASR 认证失败，请检查语音凭据及识别资源权限。");
            }
            if (status >= 200 && status < 300 && "20000003".equals(code)) {
                transcript = ""; // Silence: do not submit a question.
            } else {
                if (status < 200 || status >= 300 || !"20000000".equals(code)) {
                    String safeCode = code != null && code.matches("[0-9]{7,8}") ? code : "HTTP " + status;
                    throw new IllegalStateException("火山 ASR 识别失败（" + safeCode
                            + "），请检查 volc.bigasr.auc_turbo 权限。");
                }
                JSONObject response = new JSONObject(readUtf8(connection.getInputStream()));
                JSONObject recognition = response.optJSONObject("result");
                if (recognition == null || !(recognition.opt("text") instanceof String)) {
                    throw new IllegalStateException("火山 ASR 返回了无效识别结果。");
                }
                transcript = recognition.getString("text").trim();
            }
        } catch (IllegalStateException invalid) {
            error = invalid.getMessage();
        } catch (Exception ignored) {
            error = "云端语音识别连接失败或超时，请检查网络后重试。";
        } finally {
            if (connection != null) connection.disconnect();
            request.connection = null;
            active.compareAndSet(request, null);
        }
        if (!released && !request.cancelled) emit(request, transcript, error);
    }

    /** Both existing capture paths produce this canonical PCM WAV header. */
    private static void validateWav(byte[] wav) {
        if (wav.length < 46 || wav.length > 5_760_044) throw new IllegalStateException("语音数据为空或过长。");
        ByteBuffer b = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN);
        int rate = b.getInt(24);
        if (b.getInt(0) != 0x46464952 || b.getInt(4) != wav.length - 8
                || b.getInt(8) != 0x45564157 || b.getInt(12) != 0x20746d66
                || b.getInt(16) != 16 || b.getShort(20) != 1 || b.getShort(22) != 1
                || (rate != 16000 && rate != 44100 && rate != 48000)
                || b.getInt(28) != rate * 2 || b.getShort(32) != 2 || b.getShort(34) != 16
                || b.getInt(36) != 0x61746164 || b.getInt(40) != wav.length - 44
                || (wav.length - 44) % 2 != 0 || wav.length - 44 > rate * 2 * 60) {
            throw new IllegalStateException("语音格式无效，需要 60 秒以内的单声道 PCM WAV。");
        }
    }

    private static String readUtf8(InputStream stream) throws Exception {
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (output.size() + read > 1_000_000) throw new IllegalStateException("识别结果过大。");
                output.write(buffer, 0, read);
            }
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private void emit(Request request, String transcript, String error) {
        try {
            JSONObject event = new JSONObject().put("requestId", request.id)
                    .put("status", transcript.isEmpty() ? "no_speech" : "speech")
                    .put("transcript", transcript);
            if (error != null) event.put("error", error);
            String script = "window.__octosNativeAsrEvent&&window.__octosNativeAsrEvent("
                    + JSONObject.quote(event.toString()) + ");";
            webView.post(() -> {
                if (!released && !request.cancelled) webView.evaluateJavascript(script, null);
            });
        } catch (Exception ignored) { /* The WebView may already be closing. */ }
    }

    private static String result(boolean ok, String error) {
        try {
            JSONObject result = new JSONObject().put("ok", ok);
            if (error != null) result.put("error", error);
            return result.toString();
        } catch (Exception ignored) { return "{\"ok\":false}"; }
    }
}
