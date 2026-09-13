import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bridge = readFileSync(
  "android/app/src/main/java/cc/pitun/learn/NativeAudioBridge.java",
  "utf8",
);
const gradle = readFileSync("android/app/build.gradle", "utf8");
const androidEnv = readFileSync(".env.android", "utf8");
const microphone = readFileSync("src/home/voice/microphone.ts", "utf8");
const privateAsr = readFileSync("src/home/voice/private-asr-client.ts", "utf8");
const voiceCapture = readFileSync("src/home/voice/use-voice-capture.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};
const androidAssets = readFileSync("scripts/prepare-android-assets.mjs", "utf8");
const viteConfig = readFileSync("vite.config.ts", "utf8");
const nativeRuntimeStub = readFileSync(
  "build/android-native-runtime-stub.ts",
  "utf8",
);

describe("Android native private-ASR audio pipeline", () => {
  it("enables the private ASR transport in Android production assets", () => {
    expect(androidEnv).toMatch(/^VITE_PRIVATE_ASR_ENABLED=true$/m);
    expect(androidEnv).toMatch(/^VITE_PUBLIC_DEPLOYMENT=true$/m);
    expect(androidEnv).toMatch(/^VITE_HOSTED_TTS_ENABLED=true$/m);
  });

  it("packages Agora's Android RTC runtime and publishes a custom track", () => {
    expect(gradle).toContain('implementation "io.agora.rtc:full-rtc-basic:4.5.2"');
    expect(bridge).toContain("createCustomAudioTrack(");
    expect(bridge).toContain("options.publishMicrophoneTrack = false");
    expect(bridge).toContain("options.publishCustomAudioTrack = true");
    expect(bridge).toContain("options.publishCustomAudioTrackId = trackId");
  });

  it("pushes AudioRecord PCM directly to Agora instead of crossing WebView", () => {
    expect(bridge).toContain("pushExternalAudioFrame(");
    expect(bridge).toContain("engine.getCurrentMonotonicTimeInMs()");
    expect(bridge).not.toContain('emitEvent("pcm"');
    expect(microphone).not.toContain("createMediaStreamDestination");
    expect(microphone).not.toContain("decodeNativePcm");
  });

  it("selects the native RTC path without loading browser Agora", () => {
    expect(privateAsr).toContain(
      "if (nativePrivateAsrAvailable()) return Promise.resolve()",
    );
    expect(privateAsr).toContain("this.joinNativeAgora(session)");
    expect(privateAsr).toContain("setNativePrivateAsrListening(listening)");
  });

  it("does not preload or package the browser VAD runtime in the APK", () => {
    const preload = voiceCapture.slice(
      voiceCapture.indexOf("export function preloadVoiceCaptureRuntime"),
      voiceCapture.indexOf("function runCallbackSafely"),
    );
    expect(preload.indexOf("nativeAudioCaptureAvailable()"))
      .toBeLessThan(preload.indexOf("VAD_RUNTIME_ASSETS.map"));
    expect(packageJson.scripts["prebuild:android"])
      .toBe("node scripts/prepare-android-assets.mjs");
    expect(androidAssets).toContain('join(root, "public", "vad")');
    expect(androidAssets).toContain("rmSync(vadAssets");
    expect(viteConfig).toContain(
      'mode === "android" && command === "build"',
    );
    expect(viteConfig).toContain('"@ricky0123/vad-web"');
    expect(viteConfig).toContain('"agora-rtc-sdk-ng"');
    expect(nativeRuntimeStub).toContain("Browser VAD is unavailable");
  });

  it("packages both physical-panel ARM ABIs without emulator-only x86 SDKs", () => {
    expect(gradle).toContain('abiFilters "armeabi-v7a", "arm64-v8a"');
    expect(gradle).not.toMatch(/abiFilters[^\n]*x86/);
  });
});
