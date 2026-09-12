# Android test APK

This wrapper targets Android 8.0 (API 26). It serves the Vite build from the
APK under the virtual HTTPS origin `https://learn.pitun.cc/`; `/api/`,
`/private-asr/`, WebSocket, and health traffic continue to use the live server.
The Android Vite mode reads `.env.android`, which deliberately enables the same
private-ASR and hosted-TTS services as the public web build.

## Direct Android narration TTS

The APK does not contain the Volcengine App ID or access token. After the user
is authenticated, the packaged web app fetches `/api/learn/tts/native-config`
over the trusted HTTPS origin and hands the response to the native bridge. The
bridge encrypts the configuration with an app-owned Android Keystore AES key
before saving it to private preferences. A temporary refresh failure keeps the
last valid encrypted configuration; an explicit disabled response clears it.

The hosted-TTS service remains the source of truth for `VOLC_TTS_APPID`,
`VOLC_TTS_TOKEN`, `VOLC_TTS_CLUSTER`, and `VOLC_TTS_VOICE`. The native config
endpoint requires the same authenticated Octos session as synthesis, sends
`Cache-Control: no-store`, and is enabled only for profiles using the platform
voice while platform TTS is enabled.

The native bridge shares in-flight downloads, prefetches the next narration,
keeps a bounded 64-clip cache, and applies 15-second connect / 45-second read
timeouts. Cancelling or advancing a lesson also stops native playback.

## Build

```bash
pnpm build:apk:debug
```

The APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install or replace it over ADB:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Useful device diagnostics:

```bash
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell getprop ro.product.cpu.abi
adb shell dumpsys webviewupdate
```

The debug APK enables WebView inspection. With the display connected over ADB,
open `chrome://inspect/#devices` on a development computer to inspect console
errors and network requests.
