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
});
