# Android test APK

This wrapper targets Android 8.0 (API 26). It serves the Vite build from the
APK under the virtual HTTPS origin `https://learn.pitun.cc/`; `/api/`,
`/private-asr/`, WebSocket, and health traffic continue to use the live server.
The Android Vite mode reads `.env.android`, which deliberately enables the same
private-ASR and hosted-TTS services as the public web build.

## Direct Android narration TTS

The APK can synthesize lesson narration directly with Volcengine and play the
downloaded MP3 through Android `MediaPlayer`, without sending the audio through
the old System WebView. Put these values in the ignored
`android/local.properties` file before building:

```properties
octos.tts.appId=YOUR_APP_ID
octos.tts.accessToken=YOUR_ACCESS_TOKEN
octos.tts.cluster=volcano_tts
octos.tts.voiceType=zh_female_xiaohe_uranus_bigtts
```

The same values can instead be supplied as
`OCTOS_ANDROID_TTS_APP_ID`, `OCTOS_ANDROID_TTS_ACCESS_TOKEN`,
`OCTOS_ANDROID_TTS_CLUSTER`, and `OCTOS_ANDROID_TTS_VOICE_TYPE` environment
variables. Gradle writes them into `BuildConfig`, so they are intentionally
recoverable from this demo APK. Do not distribute that APK outside the demo
device. When the values are absent, the web layer keeps using the existing
hosted TTS route.

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
