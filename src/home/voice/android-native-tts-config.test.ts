import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bridge = readFileSync(
  "android/app/src/main/java/cc/pitun/learn/NativeTtsBridge.java",
  "utf8",
);
const gradle = readFileSync("android/app/build.gradle", "utf8");

describe("Android native TTS credential bootstrap", () => {
  it("does not compile the provider credential into BuildConfig", () => {
    expect(gradle).not.toContain("VOLC_TTS_APP_ID");
    expect(gradle).not.toContain("VOLC_TTS_ACCESS_TOKEN");
    expect(bridge).not.toContain("BuildConfig.VOLC_TTS");
  });

  it("accepts server configuration and encrypts it with Android Keystore", () => {
    expect(bridge).toContain("public String configure(String rawConfig)");
    expect(bridge).toContain('getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)');
    expect(bridge).toContain('KeyStore.getInstance("AndroidKeyStore")');
    expect(bridge).toContain('Cipher.getInstance("AES/GCM/NoPadding")');
    expect(bridge).toContain("preferences.edit().putString(CONFIG_PREFERENCE, encrypted).commit()");
  });
});
