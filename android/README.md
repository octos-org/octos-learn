# Android test APK

This wrapper targets Android 8.0 (API 26). It serves the Vite build from the
APK under the virtual HTTPS origin `https://learn.pitun.cc/`; `/api/`,
`/private-asr/`, WebSocket, and health traffic continue to use the live server.
The Android Vite mode reads `.env.android`, which deliberately enables the same
private-ASR and hosted-TTS services as the public web build.

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
