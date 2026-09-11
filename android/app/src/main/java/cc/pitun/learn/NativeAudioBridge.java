package cc.pitun.learn;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import io.agora.rtc2.ChannelMediaOptions;
import io.agora.rtc2.Constants;
import io.agora.rtc2.IRtcEngineEventHandler;
import io.agora.rtc2.RtcConnection;
import io.agora.rtc2.RtcEngine;
import io.agora.rtc2.RtcEngineConfig;
import io.agora.rtc2.audio.AudioTrackConfig;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.ArrayDeque;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Captures microphone audio outside WebView.
 *
 * Horion's Android 8 WebView can enumerate the USB microphone but its Chromium
 * audio source always fails with NotReadableError. AudioRecord uses Android's
 * audio HAL directly, selects the USB source when one is present, performs a
 * lightweight speech gate, and returns complete WAV utterances to JavaScript.
 */
final class NativeAudioBridge {
    private static final int[] SAMPLE_RATES = {16000, 48000, 44100};
    private static final int[] AUDIO_SOURCES = {
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            MediaRecorder.AudioSource.MIC,
            MediaRecorder.AudioSource.DEFAULT
    };
    private static final int PRE_ROLL_MS = 300;
    private static final int SPEECH_START_MS = 80;
    private static final int SPEECH_END_MS = 780;
    private static final int MIN_UTTERANCE_MS = 280;
    private static final int MAX_UTTERANCE_MS = 20000;

    private final Activity activity;
    private final WebView webView;
    private final AudioManager audioManager;
    private final Object captureLock = new Object();
    private final Object rtcLock = new Object();

    private volatile boolean captureRunning;
    private AudioRecord recorder;
    private Thread captureThread;
    private int activeSampleRate;
    private String activeDeviceName = "Android default input";
    private volatile RtcEngine rtcEngine;
    private volatile int rtcCustomTrackId = -1;
    private volatile boolean rtcJoined;
    private volatile boolean rtcListening;
    private volatile String rtcLastError;
    private volatile long rtcFramesPushed;

    NativeAudioBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.audioManager = (AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
    }

    @JavascriptInterface
    public String prepareForVoiceCapture() {
        // MODE_IN_COMMUNICATION makes some TV firmware reserve the USB source
        // for a non-existent telephony stack. Native capture works in normal mode.
        try {
            audioManager.setMode(AudioManager.MODE_NORMAL);
        } catch (RuntimeException ignored) {
            // Some vendor builds restrict audio-mode changes to system apps.
        }
        return describeInputDevices();
    }

    @JavascriptInterface
    public String startVoiceCapture() {
        synchronized (captureLock) {
            if (captureRunning && recorder != null) {
                return captureResult(true, null);
            }
            if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                return captureResult(false, "Android 麦克风权限未开启");
            }

            prepareForVoiceCapture();
            AudioDeviceInfo preferredDevice = preferredInputDevice();
            StringBuilder failures = new StringBuilder();
            for (int sampleRate : SAMPLE_RATES) {
                for (int source : AUDIO_SOURCES) {
                    AudioRecord candidate = null;
                    try {
                        candidate = createRecorder(sampleRate, source, preferredDevice);
                        candidate.startRecording();
                        if (candidate.getRecordingState()
                                != AudioRecord.RECORDSTATE_RECORDING) {
                            throw new IllegalStateException("recording state did not start");
                        }
                        recorder = candidate;
                        activeSampleRate = sampleRate;
                        activeDeviceName = preferredDevice == null
                                ? "Android default input"
                                : String.valueOf(preferredDevice.getProductName());
                        captureRunning = true;
                        final AudioRecord startedRecorder = candidate;
                        captureThread = new Thread(
                                () -> captureLoop(startedRecorder, sampleRate),
                                "octos-native-microphone"
                        );
                        captureThread.start();
                        return captureResult(true, null);
                    } catch (Exception error) {
                        if (candidate != null) {
                            try {
                                candidate.release();
                            } catch (RuntimeException ignored) {
                                // Try the next source/sample-rate combination.
                            }
                        }
                        if (failures.length() > 0) failures.append("; ");
                        failures.append(sampleRate).append("Hz/source-").append(source)
                                .append(": ").append(error.getClass().getSimpleName());
                    }
                }
            }
            recorder = null;
            captureRunning = false;
            return captureResult(false, "Android AudioRecord 无法启动（" + failures + "）");
        }
    }

    @JavascriptInterface
    public void stopVoiceCapture() {
        stopCapture(true);
    }

    /**
     * Joins the private-ASR Agora channel with a native custom audio track.
     *
     * The old WebView cannot publish an AudioRecord-backed synthetic WebAudio
     * track reliably. Keeping the RTC engine here means captured PCM travels
     * directly from Android's audio HAL into Agora without crossing the
     * JavaScript/UI thread.
     */
    @JavascriptInterface
    public String startPrivateAsr(
            String appId,
            String channel,
            String token,
            int uid
    ) {
        if (appId == null || appId.isEmpty()
                || channel == null || channel.isEmpty()
                || token == null || token.isEmpty()) {
            return rtcResult(false, "Agora 会话参数不完整", "invalid");
        }

        synchronized (rtcLock) {
            stopPrivateAsrLocked();
            CountDownLatch joined = new CountDownLatch(1);
            AtomicReference<String> joinFailure = new AtomicReference<>();
            try {
                IRtcEngineEventHandler handler = new IRtcEngineEventHandler() {
                    // Agora 4.x exposes the RtcConnection form. Keep the
                    // legacy callback too because vendor-resolved SDK builds
                    // have shipped both signatures.
                    public void onJoinChannelSuccess(RtcConnection connection, int elapsed) {
                        rtcJoined = true;
                        rtcLastError = null;
                        joined.countDown();
                    }

                    @Override
                    public void onJoinChannelSuccess(String joinedChannel, int joinedUid, int elapsed) {
                        rtcJoined = true;
                        rtcLastError = null;
                        joined.countDown();
                    }

                    @Override
                    public void onError(int errorCode) {
                        if (!rtcJoined) {
                            String message = "Agora 加入频道失败（错误码 " + errorCode + "）";
                            joinFailure.compareAndSet(null, message);
                            rtcLastError = message;
                            joined.countDown();
                        }
                    }

                    @Override
                    public void onConnectionStateChanged(int state, int reason) {
                        if (state == Constants.CONNECTION_STATE_FAILED) {
                            String message = "Agora 连接失败（原因 " + reason + "）";
                            rtcLastError = message;
                            if (!rtcJoined) {
                                joinFailure.compareAndSet(null, message);
                                joined.countDown();
                            } else {
                                emitEvent("private-asr-error", message, null);
                            }
                        }
                    }
                };
                RtcEngineConfig config = new RtcEngineConfig();
                config.mContext = activity.getApplicationContext();
                config.mAppId = appId;
                config.mEventHandler = handler;
                config.mChannelProfile = Constants.CHANNEL_PROFILE_LIVE_BROADCASTING;
                RtcEngine engine = RtcEngine.create(config);

                AudioTrackConfig trackConfig = new AudioTrackConfig();
                trackConfig.enableLocalPlayback = false;
                int trackId = engine.createCustomAudioTrack(
                        Constants.AudioTrackType.AUDIO_TRACK_MIXABLE,
                        trackConfig
                );
                if (trackId < 0) {
                    RtcEngine.destroy();
                    return rtcResult(
                            false,
                            "Agora 无法创建原生音频轨道（错误码 " + trackId + "）",
                            "track-error"
                    );
                }

                rtcEngine = engine;
                rtcCustomTrackId = trackId;
                rtcJoined = false;
                rtcListening = false;
                rtcLastError = null;
                rtcFramesPushed = 0;

                ChannelMediaOptions options = new ChannelMediaOptions();
                options.channelProfile = Constants.CHANNEL_PROFILE_LIVE_BROADCASTING;
                options.clientRoleType = Constants.CLIENT_ROLE_BROADCASTER;
                options.publishMicrophoneTrack = false;
                options.publishCustomAudioTrack = true;
                options.publishCustomAudioTrackId = trackId;
                options.autoSubscribeAudio = false;
                options.autoSubscribeVideo = false;
                int result = engine.joinChannel(token, channel, uid, options);
                if (result != 0) {
                    String message = "Agora 加入频道请求失败（错误码 " + result + "）";
                    rtcLastError = message;
                    stopPrivateAsrLocked();
                    return rtcResult(false, message, "join-error");
                }

                boolean callbackArrived = joined.await(10, TimeUnit.SECONDS);
                String error = joinFailure.get();
                if (!callbackArrived || !rtcJoined || error != null) {
                    String message = error != null
                            ? error
                            : "Agora 原生音频频道连接超时";
                    rtcLastError = message;
                    stopPrivateAsrLocked();
                    return rtcResult(false, message, "join-timeout");
                }
                return rtcResult(true, null, "joined");
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                rtcLastError = "Agora 原生音频连接被中断";
                stopPrivateAsrLocked();
                return rtcResult(false, rtcLastError, "interrupted");
            } catch (Exception error) {
                rtcLastError = "Agora 原生音频启动失败："
                        + error.getClass().getSimpleName() + ": " + error.getMessage();
                stopPrivateAsrLocked();
                return rtcResult(false, rtcLastError, "exception");
            }
        }
    }

    @JavascriptInterface
    public String setPrivateAsrListening(boolean listening) {
        synchronized (rtcLock) {
            if (rtcEngine == null || rtcCustomTrackId < 0 || !rtcJoined) {
                return rtcResult(false, "Agora 原生音频尚未连接", "disconnected");
            }
            rtcListening = listening;
            return rtcResult(true, null, listening ? "listening" : "muted");
        }
    }

    @JavascriptInterface
    public void stopPrivateAsr() {
        synchronized (rtcLock) {
            stopPrivateAsrLocked();
        }
    }

    @JavascriptInterface
    public String describePrivateAsr() {
        return rtcResult(rtcJoined, rtcLastError, rtcJoined ? "joined" : "disconnected");
    }

    @JavascriptInterface
    public String describeInputDevices() {
        JSONObject result = new JSONObject();
        JSONArray devices = new JSONArray();
        try {
            result.put(
                    "recordAudioPermission",
                    activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                            == PackageManager.PERMISSION_GRANTED
            );
            for (AudioDeviceInfo device : audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
                JSONObject item = new JSONObject();
                item.put("id", device.getId());
                item.put("type", deviceTypeName(device.getType()));
                item.put("product", String.valueOf(device.getProductName()));
                item.put("source", device.isSource());
                devices.put(item);
            }
            result.put("inputs", devices);
            result.put("nativeCapture", true);
            result.put("capturing", captureRunning);
            result.put("nativePrivateAsr", true);
            result.put("privateAsrJoined", rtcJoined);
            result.put("privateAsrListening", rtcListening);
            result.put("privateAsrFramesPushed", rtcFramesPushed);
            if (rtcLastError != null) result.put("privateAsrError", rtcLastError);
        } catch (Exception error) {
            try {
                result.put("error", error.getClass().getSimpleName());
            } catch (Exception ignored) {
                return "Android 音频设备读取失败";
            }
        }
        return result.toString();
    }

    void release() {
        stopCapture(true);
        stopPrivateAsr();
        try {
            audioManager.setMode(AudioManager.MODE_NORMAL);
        } catch (RuntimeException ignored) {
            // The activity is already leaving; there is nothing else to route.
        }
    }

    private AudioRecord createRecorder(
            int sampleRate,
            int source,
            AudioDeviceInfo preferredDevice
    ) {
        int minBytes = AudioRecord.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
        );
        if (minBytes <= 0) throw new IllegalArgumentException("unsupported audio format");
        int bufferBytes = Math.max(minBytes * 2, sampleRate / 2);
        AudioFormat format = new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(sampleRate)
                .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                .build();
        AudioRecord result = new AudioRecord.Builder()
                .setAudioSource(source)
                .setAudioFormat(format)
                .setBufferSizeInBytes(bufferBytes)
                .build();
        if (result.getState() != AudioRecord.STATE_INITIALIZED) {
            result.release();
            throw new IllegalStateException("AudioRecord was not initialized");
        }
        if (preferredDevice != null) result.setPreferredDevice(preferredDevice);
        return result;
    }

    private AudioDeviceInfo preferredInputDevice() {
        AudioDeviceInfo fallback = null;
        for (AudioDeviceInfo device : audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
            if (!device.isSource()) continue;
            if (device.getType() == AudioDeviceInfo.TYPE_USB_DEVICE
                    || device.getType() == AudioDeviceInfo.TYPE_USB_ACCESSORY
                    || device.getType() == AudioDeviceInfo.TYPE_WIRED_HEADSET) {
                return device;
            }
            if (fallback == null && device.getType() == AudioDeviceInfo.TYPE_BUILTIN_MIC) {
                fallback = device;
            }
        }
        return fallback;
    }

    private void captureLoop(AudioRecord activeRecorder, int sampleRate) {
        final int frameBytes = Math.max(320, sampleRate * 2 / 50); // about 20 ms
        final int preRollFrames = Math.max(1, PRE_ROLL_MS / 20);
        byte[] readBuffer = new byte[frameBytes];
        ArrayDeque<byte[]> preRoll = new ArrayDeque<>();
        ByteArrayOutputStream utterance = null;
        double noiseFloor = 100.0;
        int loudMs = 0;
        int quietMs = 0;
        int utteranceMs = 0;

        try {
            while (captureRunning && activeRecorder == recorder) {
                int read = activeRecorder.read(readBuffer, 0, readBuffer.length);
                if (read <= 0) {
                    if (read == AudioRecord.ERROR_DEAD_OBJECT) {
                        throw new IllegalStateException("Audio input disconnected");
                    }
                    continue;
                }
                int frameMs = Math.max(1, read * 1000 / (sampleRate * 2));
                byte[] frame = new byte[read];
                System.arraycopy(readBuffer, 0, frame, 0, read);
                double rms = pcmRms(frame);

                pushPrivateAsrFrame(frame, sampleRate);

                if (utterance == null) {
                    preRoll.addLast(frame);
                    while (preRoll.size() > preRollFrames) preRoll.removeFirst();
                    double startThreshold = Math.max(320.0, noiseFloor * 3.0);
                    if (rms >= startThreshold) {
                        loudMs += frameMs;
                    } else {
                        loudMs = 0;
                        noiseFloor = Math.min(2200.0, noiseFloor * 0.98 + rms * 0.02);
                    }
                    if (loudMs >= SPEECH_START_MS) {
                        utterance = new ByteArrayOutputStream(sampleRate * 4);
                        for (byte[] buffered : preRoll) {
                            utterance.write(buffered, 0, buffered.length);
                            utteranceMs += buffered.length * 1000 / (sampleRate * 2);
                        }
                        preRoll.clear();
                        quietMs = 0;
                        emitEvent("speech-start", null, null);
                    }
                    continue;
                }

                utterance.write(frame, 0, frame.length);
                utteranceMs += frameMs;
                double continueThreshold = Math.max(220.0, noiseFloor * 1.8);
                quietMs = rms >= continueThreshold ? 0 : quietMs + frameMs;
                if (quietMs >= SPEECH_END_MS || utteranceMs >= MAX_UTTERANCE_MS) {
                    if (utteranceMs >= MIN_UTTERANCE_MS) {
                        emitWav(utterance.toByteArray(), sampleRate);
                    } else {
                        emitEvent("misfire", null, null);
                    }
                    utterance = null;
                    utteranceMs = 0;
                    quietMs = 0;
                    loudMs = 0;
                }
            }
            if (utterance != null && utteranceMs >= MIN_UTTERANCE_MS) {
                emitWav(utterance.toByteArray(), sampleRate);
            }
        } catch (Exception error) {
            if (captureRunning) {
                emitEvent(
                        "error",
                        "Android 原生麦克风读取失败：" + error.getMessage(),
                        null
                );
            }
        } finally {
            synchronized (captureLock) {
                if (activeRecorder == recorder) {
                    try {
                        if (activeRecorder.getRecordingState()
                                == AudioRecord.RECORDSTATE_RECORDING) {
                            activeRecorder.stop();
                        }
                    } catch (RuntimeException ignored) {
                        // The device may have been unplugged while read() was active.
                    }
                    activeRecorder.release();
                    recorder = null;
                    captureRunning = false;
                    captureThread = null;
                }
            }
        }
    }

    private void emitWav(byte[] pcm, int sampleRate) {
        byte[] wav = wavFromPcm(pcm, sampleRate);
        emitEvent("utterance", null, Base64.encodeToString(wav, Base64.NO_WRAP));
    }

    private void emitEvent(String type, String message, String wavBase64) {
        try {
            JSONObject detail = new JSONObject();
            detail.put("type", type);
            detail.put("sampleRate", activeSampleRate);
            detail.put("device", activeDeviceName);
            if (message != null) detail.put("message", message);
            if (wavBase64 != null) detail.put("wavBase64", wavBase64);
            final String script = "window.dispatchEvent(new CustomEvent('octos-native-audio',"
                    + "{detail:" + detail + "}));";
            webView.post(() -> webView.evaluateJavascript(script, null));
        } catch (Exception ignored) {
            // A later capture can still succeed; do not kill the audio thread.
        }
    }

    private void pushPrivateAsrFrame(byte[] pcm, int sampleRate) {
        RtcEngine engine = rtcEngine;
        int trackId = rtcCustomTrackId;
        if (engine == null || trackId < 0 || !rtcJoined || !rtcListening) return;
        int result;
        try {
            result = engine.pushExternalAudioFrame(
                    pcm,
                    engine.getCurrentMonotonicTimeInMs(),
                    sampleRate,
                    1,
                    Constants.BytesPerSample.TWO_BYTES_PER_SAMPLE,
                    trackId
            );
        } catch (RuntimeException error) {
            result = -1;
            rtcLastError = "Agora 原生音频推送异常：" + error.getMessage();
        }
        if (result == 0) {
            rtcFramesPushed++;
            return;
        }
        // Avoid flooding the WebView with one error per 20 ms frame. The first
        // failure is enough to make the real broken layer visible to the user.
        if (rtcFramesPushed == 0) {
            String message = rtcLastError != null
                    ? rtcLastError
                    : "Agora 原生音频推送失败（错误码 " + result + "）";
            rtcLastError = message;
            emitEvent("private-asr-error", message, null);
        }
    }

    private void stopPrivateAsrLocked() {
        rtcListening = false;
        rtcJoined = false;
        RtcEngine engine = rtcEngine;
        int trackId = rtcCustomTrackId;
        rtcEngine = null;
        rtcCustomTrackId = -1;
        if (engine == null) return;
        try {
            engine.leaveChannel();
        } catch (RuntimeException ignored) {
            // Teardown must remain safe after a failed or partial join.
        }
        if (trackId >= 0) {
            try {
                engine.destroyCustomAudioTrack(trackId);
            } catch (RuntimeException ignored) {
                // A failed engine may already have released its custom track.
            }
        }
        try {
            RtcEngine.destroy();
        } catch (RuntimeException ignored) {
            // Activity shutdown should never be blocked by SDK cleanup.
        }
    }

    private String rtcResult(boolean ok, String error, String state) {
        try {
            JSONObject result = new JSONObject();
            result.put("ok", ok);
            result.put("state", state);
            result.put("joined", rtcJoined);
            result.put("listening", rtcListening);
            result.put("framesPushed", rtcFramesPushed);
            if (error != null) result.put("error", error);
            return result.toString();
        } catch (Exception ignored) {
            return ok ? "{\"ok\":true}" : "{\"ok\":false}";
        }
    }

    private void stopCapture(boolean waitForThread) {
        Thread thread;
        AudioRecord activeRecorder;
        synchronized (captureLock) {
            captureRunning = false;
            thread = captureThread;
            activeRecorder = recorder;
        }
        if (activeRecorder != null) {
            try {
                activeRecorder.stop();
            } catch (RuntimeException ignored) {
                // It may already have stopped after an input disconnect.
            }
        }
        if (waitForThread && thread != null && thread != Thread.currentThread()) {
            try {
                thread.join(800);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private String captureResult(boolean ok, String error) {
        try {
            JSONObject result = new JSONObject();
            result.put("ok", ok);
            result.put("nativeCapture", true);
            result.put("sampleRate", activeSampleRate);
            result.put("device", activeDeviceName);
            if (error != null) result.put("error", error);
            return result.toString();
        } catch (Exception ignored) {
            return ok ? "{\"ok\":true}" : "{\"ok\":false}";
        }
    }

    private static double pcmRms(byte[] pcm) {
        if (pcm.length < 2) return 0.0;
        double sum = 0.0;
        int samples = pcm.length / 2;
        for (int i = 0; i + 1 < pcm.length; i += 2) {
            short sample = (short) ((pcm[i] & 0xff) | (pcm[i + 1] << 8));
            sum += (double) sample * sample;
        }
        return Math.sqrt(sum / samples);
    }

    private static byte[] wavFromPcm(byte[] pcm, int sampleRate) {
        byte[] wav = new byte[44 + pcm.length];
        putAscii(wav, 0, "RIFF");
        putIntLe(wav, 4, 36 + pcm.length);
        putAscii(wav, 8, "WAVE");
        putAscii(wav, 12, "fmt ");
        putIntLe(wav, 16, 16);
        putShortLe(wav, 20, 1);
        putShortLe(wav, 22, 1);
        putIntLe(wav, 24, sampleRate);
        putIntLe(wav, 28, sampleRate * 2);
        putShortLe(wav, 32, 2);
        putShortLe(wav, 34, 16);
        putAscii(wav, 36, "data");
        putIntLe(wav, 40, pcm.length);
        System.arraycopy(pcm, 0, wav, 44, pcm.length);
        return wav;
    }

    private static void putAscii(byte[] target, int offset, String value) {
        for (int i = 0; i < value.length(); i++) target[offset + i] = (byte) value.charAt(i);
    }

    private static void putShortLe(byte[] target, int offset, int value) {
        target[offset] = (byte) value;
        target[offset + 1] = (byte) (value >>> 8);
    }

    private static void putIntLe(byte[] target, int offset, int value) {
        target[offset] = (byte) value;
        target[offset + 1] = (byte) (value >>> 8);
        target[offset + 2] = (byte) (value >>> 16);
        target[offset + 3] = (byte) (value >>> 24);
    }

    private static String deviceTypeName(int type) {
        switch (type) {
            case AudioDeviceInfo.TYPE_BUILTIN_MIC:
                return "builtin-mic";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
                return "wired-headset";
            case AudioDeviceInfo.TYPE_USB_DEVICE:
                return "usb-device";
            case AudioDeviceInfo.TYPE_USB_ACCESSORY:
                return "usb-accessory";
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
                return "bluetooth-sco";
            case AudioDeviceInfo.TYPE_TELEPHONY:
                return "telephony";
            case AudioDeviceInfo.TYPE_BUS:
                return "bus";
            default:
                return "type-" + type;
        }
    }
}
