package cc.pitun.learn;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Downloads and plays lesson narration without routing audio through WebView. */
final class NativeTtsBridge {
    private static final String ENDPOINT = "https://openspeech.bytedance.com/api/v1/tts";
    private static final int MAX_CACHE_FILES = 64;
    private static final String PREFERENCES_NAME = "octos_native_tts";
    private static final String CONFIG_PREFERENCE = "encrypted_config";
    private static final String KEY_ALIAS = "octos_native_tts_config_key";

    private final WebView webView;
    private final File cacheDirectory;
    private final SharedPreferences preferences;
    private final ExecutorService executor = Executors.newFixedThreadPool(2);
    private final ConcurrentHashMap<String, CompletableFuture<File>> downloads =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Boolean> cancelled = new ConcurrentHashMap<>();

    private MediaPlayer player;
    private String currentRequestId;
    private volatile TtsConfig config;
    private volatile boolean released;

    NativeTtsBridge(WebView webView) {
        this.webView = webView;
        this.cacheDirectory = new File(webView.getContext().getCacheDir(), "octos-native-tts");
        this.preferences = webView.getContext().getApplicationContext()
                .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
        this.config = loadConfig();
        //noinspection ResultOfMethodCallIgnored
        this.cacheDirectory.mkdirs();
    }

    @JavascriptInterface
    public boolean isConfigured() {
        return config != null;
    }

    @JavascriptInterface
    public String configure(String rawConfig) {
        try {
            JSONObject payload = new JSONObject(rawConfig == null ? "{}" : rawConfig);
            if (payload.optInt("version", -1) != 1) {
                return result(false, "TTS 配置版本不受支持");
            }
            if (!payload.optBoolean("enabled", false)) {
                clearConfig();
                return result(true, null);
            }
            TtsConfig next = new TtsConfig(
                    required(payload, "app_id"),
                    required(payload, "access_token"),
                    required(payload, "cluster"),
                    required(payload, "voice_type")
            );
            String encrypted = encrypt(next.toJson().toString());
            if (!preferences.edit().putString(CONFIG_PREFERENCE, encrypted).commit()) {
                return result(false, "无法保存 TTS 配置");
            }
            config = next;
            return result(true, null);
        } catch (Exception error) {
            return result(false, rootMessage(error));
        }
    }

    @JavascriptInterface
    public String prefetch(String requestId, String text) {
        return request(requestId, text, false);
    }

    @JavascriptInterface
    public String play(String requestId, String text) {
        return request(requestId, text, true);
    }

    private String request(String requestId, String text, boolean playWhenReady) {
        final TtsConfig activeConfig = config;
        if (activeConfig == null) return result(false, "尚未从服务端取得火山 TTS 配置");
        if (released) return result(false, "TTS 已关闭");
        final String normalized = text == null ? "" : text.trim();
        if (requestId == null || requestId.trim().isEmpty() || normalized.isEmpty()) {
            return result(false, "TTS 请求缺少文本或请求编号");
        }
        cancelled.remove(requestId);
        final String cacheKey = sha256(activeConfig.voiceType + "\u0000" + normalized);
        final File cached = new File(cacheDirectory, cacheKey + ".mp3");
        CompletableFuture<File> download;
        if (cached.isFile() && cached.length() > 0) {
            download = CompletableFuture.completedFuture(cached);
        } else {
            download = downloads.computeIfAbsent(cacheKey, ignored ->
                    CompletableFuture.supplyAsync(
                            () -> synthesize(normalized, cached, activeConfig),
                            executor
                    ).whenComplete((file, error) -> downloads.remove(cacheKey)));
        }
        download.whenComplete((file, error) -> {
            if (released || cancelled.containsKey(requestId)) return;
            if (error != null || file == null || !file.isFile()) {
                emit(requestId, "error", rootMessage(error));
                return;
            }
            if (playWhenReady) webView.post(() -> beginPlayback(requestId, file));
            else emit(requestId, "ready", null);
        });
        return result(true, null);
    }

    @JavascriptInterface
    public void cancel(String requestId) {
        if (requestId != null) cancelled.put(requestId, true);
        webView.post(() -> {
            if (requestId != null && requestId.equals(currentRequestId)) {
                stopPlayer("stopped");
            }
        });
    }

    @JavascriptInterface
    public void stop() {
        webView.post(() -> stopPlayer("stopped"));
    }

    void release() {
        released = true;
        webView.post(() -> stopPlayer(null));
        executor.shutdownNow();
        downloads.clear();
        cancelled.clear();
    }

    private File synthesize(String text, File destination, TtsConfig activeConfig) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(ENDPOINT).openConnection();
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(45_000);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Authorization",
                    "Bearer;" + activeConfig.accessToken);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");

            JSONObject body = new JSONObject();
            body.put("app", new JSONObject()
                    .put("appid", activeConfig.appId)
                    .put("token", activeConfig.accessToken)
                    .put("cluster", activeConfig.cluster));
            body.put("user", new JSONObject().put("uid", "octos-android-demo"));
            body.put("audio", new JSONObject()
                    .put("voice_type", activeConfig.voiceType)
                    .put("encoding", "mp3")
                    .put("speed_ratio", 1.0));
            body.put("request", new JSONObject()
                    .put("reqid", UUID.randomUUID().toString())
                    .put("text", ensureTerminal(text))
                    .put("operation", "query")
                    .put("text_type", "plain"));
            byte[] requestBytes = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.getOutputStream().write(requestBytes);

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IllegalStateException("火山 TTS HTTP " + status);
            }
            JSONObject response = new JSONObject(readUtf8(connection.getInputStream()));
            if (response.optInt("code", -1) != 3000) {
                String message = response.optString("message", "火山 TTS 合成失败");
                throw new IllegalStateException(message);
            }
            String audio = response.optString("data", "");
            byte[] bytes = Base64.decode(audio, Base64.DEFAULT);
            if (bytes.length == 0) throw new IllegalStateException("火山 TTS 返回空音频");
            File partial = new File(destination.getAbsolutePath() + ".part");
            try (FileOutputStream output = new FileOutputStream(partial)) {
                output.write(bytes);
            }
            if (!partial.renameTo(destination)) {
                throw new IllegalStateException("无法保存 TTS 音频缓存");
            }
            trimCache();
            return destination;
        } catch (Exception error) {
            throw new IllegalStateException(rootMessage(error), error);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void beginPlayback(String requestId, File audio) {
        if (released || cancelled.containsKey(requestId)) return;
        stopPlayer(null);
        try {
            MediaPlayer next = new MediaPlayer();
            next.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
            next.setDataSource(audio.getAbsolutePath());
            next.setOnPreparedListener(prepared -> {
                if (player != prepared || cancelled.containsKey(requestId)) return;
                prepared.start();
                emit(requestId, "started", null);
            });
            next.setOnCompletionListener(completed -> {
                if (player != completed) return;
                stopPlayer(null);
                emit(requestId, "ended", null);
            });
            next.setOnErrorListener((failed, what, extra) -> {
                if (player != failed) return true;
                stopPlayer(null);
                emit(requestId, "error", "Android 音频播放失败（" + what + "/" + extra + "）");
                return true;
            });
            player = next;
            currentRequestId = requestId;
            next.prepareAsync();
        } catch (Exception error) {
            stopPlayer(null);
            emit(requestId, "error", rootMessage(error));
        }
    }

    private void stopPlayer(String eventType) {
        MediaPlayer current = player;
        String requestId = currentRequestId;
        player = null;
        currentRequestId = null;
        if (current != null) {
            current.setOnPreparedListener(null);
            current.setOnCompletionListener(null);
            current.setOnErrorListener(null);
            try {
                current.stop();
            } catch (IllegalStateException ignored) {
                // It may still be preparing.
            }
            current.release();
        }
        if (eventType != null && requestId != null) emit(requestId, eventType, null);
    }

    private void emit(String requestId, String type, String message) {
        try {
            JSONObject event = new JSONObject()
                    .put("requestId", requestId)
                    .put("type", type);
            if (message != null) event.put("message", message);
            String script = "window.__octosNativeTtsEvent&&window.__octosNativeTtsEvent("
                    + JSONObject.quote(event.toString()) + ");";
            webView.post(() -> webView.evaluateJavascript(script, null));
        } catch (Exception ignored) {
            // The WebView may already be closing.
        }
    }

    private void trimCache() {
        File[] files = cacheDirectory.listFiles((directory, name) -> name.endsWith(".mp3"));
        if (files == null || files.length <= MAX_CACHE_FILES) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (int index = 0; index < files.length - MAX_CACHE_FILES; index++) {
            //noinspection ResultOfMethodCallIgnored
            files[index].delete();
        }
    }

    private TtsConfig loadConfig() {
        String encrypted = preferences.getString(CONFIG_PREFERENCE, null);
        if (encrypted == null || encrypted.isEmpty()) return null;
        try {
            return TtsConfig.fromJson(new JSONObject(decrypt(encrypted)));
        } catch (Exception error) {
            preferences.edit().remove(CONFIG_PREFERENCE).apply();
            return null;
        }
    }

    private void clearConfig() {
        config = null;
        preferences.edit().remove(CONFIG_PREFERENCE).apply();
        webView.post(() -> stopPlayer("stopped"));
    }

    private String encrypt(String plaintext) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        String initializationVector = Base64.encodeToString(
                cipher.getIV(), Base64.NO_WRAP);
        String ciphertext = Base64.encodeToString(
                cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8)),
                Base64.NO_WRAP);
        return initializationVector + "." + ciphertext;
    }

    private String decrypt(String encrypted) throws Exception {
        String[] parts = encrypted.split("\\.", 2);
        if (parts.length != 2) throw new IllegalStateException("TTS 配置格式无效");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
                Cipher.DECRYPT_MODE,
                getOrCreateKey(),
                new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP))
        );
        return new String(
                cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)),
                StandardCharsets.UTF_8);
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        SecretKey existing = (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        if (existing != null) return existing;
        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return generator.generateKey();
    }

    private static String required(JSONObject payload, String name) {
        String value = payload.optString(name, "").trim();
        if (value.isEmpty()) throw new IllegalArgumentException("TTS 配置缺少 " + name);
        return value;
    }

    private static final class TtsConfig {
        final String appId;
        final String accessToken;
        final String cluster;
        final String voiceType;

        TtsConfig(String appId, String accessToken, String cluster, String voiceType) {
            this.appId = appId;
            this.accessToken = accessToken;
            this.cluster = cluster;
            this.voiceType = voiceType;
        }

        JSONObject toJson() throws Exception {
            return new JSONObject()
                    .put("app_id", appId)
                    .put("access_token", accessToken)
                    .put("cluster", cluster)
                    .put("voice_type", voiceType);
        }

        static TtsConfig fromJson(JSONObject payload) {
            return new TtsConfig(
                    required(payload, "app_id"),
                    required(payload, "access_token"),
                    required(payload, "cluster"),
                    required(payload, "voice_type")
            );
        }
    }

    private static String ensureTerminal(String text) {
        return text.matches(".*[。！？.!?]$") ? text : text + "。";
    }

    private static String readUtf8(InputStream input) throws Exception {
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8_192];
            int count;
            while ((count = source.read(buffer)) >= 0) output.write(buffer, 0, count);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte item : digest) result.append(String.format(Locale.ROOT, "%02x", item));
            return result.toString();
        } catch (Exception ignored) {
            return Integer.toHexString(value.hashCode());
        }
    }

    private static String rootMessage(Throwable error) {
        Throwable current = error;
        while (current != null && current.getCause() != null) current = current.getCause();
        String message = current == null ? null : current.getMessage();
        return message == null || message.trim().isEmpty() ? "火山 TTS 请求失败" : message;
    }

    private static String result(boolean ok, String error) {
        try {
            JSONObject result = new JSONObject().put("ok", ok);
            if (error != null) result.put("error", error);
            return result.toString();
        } catch (Exception ignored) {
            return "{\"ok\":false,\"error\":\"TTS bridge error\"}";
        }
    }
}
