// Packaged APK builds use NativeAudioBridge and NativeAudioBridge's Agora
// engine. These browser fallbacks remain available in ordinary web builds and
// in `vite --mode android` dev previews, but must not be parsed by Android 8's
// WebView or copied into the APK.

export const MicVAD = {
  async new(): Promise<never> {
    throw new Error("Browser VAD is unavailable in the packaged Android runtime");
  },
};

const browserAgoraUnavailable = {};
export default browserAgoraUnavailable;
