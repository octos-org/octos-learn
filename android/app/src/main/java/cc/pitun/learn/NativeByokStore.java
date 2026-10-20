package cc.pitun.learn;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** API 26-compatible, owner-scoped storage for keys entered on THIS device.
 * No migration from the legacy shared TTS preferences and no plaintext fallback. */
final class NativeByokStore {
    private static final String ALIAS = "octos.learn.byok.local.v1";
    private final SharedPreferences preferences;
    private String owner = "";
    private String prefix = "";

    NativeByokStore(Context context) { this(context, "octos-byok-local-v1"); }
    NativeByokStore(Context context, String preferencesName) {
        preferences = context.getApplicationContext().getSharedPreferences(preferencesName, Context.MODE_PRIVATE);
    }
    static void requireCapability(String capability) {
        if (!"tts".equals(capability) && !"asr".equals(capability) && !"admission".equals(capability)) throw new IllegalArgumentException("Unknown capability");
    }
    synchronized void bind(String origin, String profile) throws Exception {
        if (profile == null || !profile.matches("[A-Za-z0-9][A-Za-z0-9_-]{0,127}")) throw new IllegalArgumentException("Invalid account");
        String next = digest(origin + "\0" + profile) + ":";
        String previous = preferences.getString("scope", "");
        if (!previous.isEmpty() && !previous.equals(next)) clear();
        owner = profile; prefix = next;
        if (!preferences.edit().putString("scope", next).commit()) throw new IllegalStateException("Cannot bind local keys");
    }
    synchronized void clear() {
        String previous = preferences.getString("scope", prefix);
        if (!previous.isEmpty()) {
            SharedPreferences.Editor edit = preferences.edit().remove("scope");
            for (String key : preferences.getAll().keySet()) if (key.startsWith(previous)) edit.remove(key);
            if (!edit.commit()) throw new IllegalStateException("Cannot remove local keys");
        }
        owner = ""; prefix = "";
    }
    synchronized void remove(String capability) {
        requireCapability(capability); requireOwner();
        if (!preferences.edit().remove(prefix + capability).commit()) throw new IllegalStateException("Cannot remove local key");
    }
    synchronized void save(String capability, JSONObject config) throws Exception {
        requireCapability(capability); requireOwner();
        String key = config.getString("key").trim();
        if (key.isEmpty()) { remove(capability); return; }
        if (key.length() > 8192 || key.contains("\r") || key.contains("\n")) throw new IllegalArgumentException("Invalid key");
        String provider = config.getString("provider");
        if (!("admission".equals(capability) ? "typesafe" : "volcano").equals(provider)) throw new IllegalArgumentException("Unsupported provider");
        JSONObject record = new JSONObject().put("key", key).put("provider", provider)
                .put("params", config.getJSONObject("params")).put("credential_revision", digest(key)).put("pending", true);
        write(capability, record);
    }
    synchronized JSONObject reconcile(JSONObject envelope) throws Exception {
        requireOwner();
        if (!owner.equals(envelope.getString("profile_id"))) throw new IllegalArgumentException("Account changed");
        JSONObject server = envelope.getJSONObject("services");
        JSONObject output = new JSONObject();
        for (String capability : new String[] { "tts", "asr", "admission" }) {
            JSONObject remote = server.optJSONObject(capability);
            JSONObject local;
            try { local = read(capability); }
            catch (Exception unavailable) {
                // Keep damaged ciphertext for recovery; allow explicit re-entry.
                // Never pretend the server key exists locally or fall back to plaintext.
                if (remote != null) output.put(capability, new JSONObject(remote.toString())
                        .put("local_credential", false).put("local_storage_error", true).put("account_synced", true));
                continue;
            }
            if (local != null && local.optBoolean("pending")) {
                if (remote != null && local.getString("credential_revision").equals(remote.optString("credential_revision"))
                        && local.getString("provider").equals(remote.optString("provider"))
                        && sameParameters(local.getJSONObject("params"), remote.getJSONObject("params"))) {
                    local.put("pending", false); local.put("params", remote.getJSONObject("params")); write(capability, local);
                } else {
                    output.put(capability, new JSONObject().put("provider", local.getString("provider")).put("params", local.getJSONObject("params"))
                            .put("has_credential", true).put("local_credential", true).put("account_synced", false).put("enabled", true)
                            .put("credential_revision", local.getString("credential_revision")).put("revision", "local:" + local.getString("credential_revision"))
                            .put("execution_target", "client").put("account_revision", remote == null ? JSONObject.NULL : remote.opt("revision")));
                    continue;
                }
            }
            if (remote == null || !remote.optBoolean("has_credential")) {
                if (local != null) remove(capability);
                if (remote != null) output.put(capability, new JSONObject(remote.toString()).put("local_credential", false).put("account_synced", true));
                continue;
            }
            boolean ready = local != null && local.getString("credential_revision").equals(remote.optString("credential_revision"));
            if (ready && !local.getJSONObject("params").toString().equals(remote.getJSONObject("params").toString())) { local.put("params", remote.getJSONObject("params")); write(capability, local); }
            output.put(capability, new JSONObject(remote.toString()).put("local_credential", ready).put("account_synced", true));
        }
        return new JSONObject().put("profile_id", owner).put("services", output);
    }
    synchronized String key(String capability, JSONObject config) throws Exception {
        requireCapability(capability); requireOwner();
        JSONObject stored = read(capability);
        if (stored == null || !stored.getString("provider").equals(config.getString("provider"))) throw new IllegalStateException("Enter your key on this TV");
        if (!stored.getString("credential_revision").equals(config.optString("credential_revision"))) throw new IllegalStateException("Local key changed");
        return stored.getString("key");
    }
    private static boolean sameParameters(JSONObject left, JSONObject right) throws Exception {
        if (left.length() != right.length()) return false;
        for (java.util.Iterator<String> it = left.keys(); it.hasNext();) {
            String name = it.next();
            if (!left.get(name).equals(right.opt(name))) return false;
        }
        return true;
    }
    private void requireOwner() { if (prefix.isEmpty()) throw new IllegalStateException("No active account"); }
    private JSONObject read(String capability) throws Exception {
        String encrypted = preferences.getString(prefix + capability, null);
        if (encrypted == null) return null;
        String[] parts = encrypted.split("\\.", 2);
        if (parts.length != 2) throw new IllegalStateException("Invalid encrypted key");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        cipher.updateAAD(prefix.getBytes(StandardCharsets.UTF_8));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
    }
    private void write(String capability, JSONObject record) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey()); cipher.updateAAD(prefix.getBytes(StandardCharsets.UTF_8));
        String encrypted = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "."
                + Base64.encodeToString(cipher.doFinal(record.toString().getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        if (!preferences.edit().putString(prefix + capability, encrypted).commit()) throw new IllegalStateException("Cannot save encrypted key");
    }
    private SecretKey encryptionKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        SecretKey key = (SecretKey) store.getKey(ALIAS, null);
        if (key != null) return key;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    static String digest(String value) throws Exception {
        byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder text = new StringBuilder();
        for (byte item : bytes) text.append(String.format(java.util.Locale.ROOT, "%02x", item & 0xff));
        return text.toString();
    }
}
