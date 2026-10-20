package cc.pitun.learn;

import android.content.SharedPreferences;
import android.test.AndroidTestCase;
import org.json.JSONObject;

/** Real Android Keystore tests; run on API 26 and a recent API/device. */
public final class NativeByokStoreTest extends AndroidTestCase {
    private NativeByokStore store;
    private static final String ORIGIN = "https://learn.pitun.cc";
    private static final String KEY = "synthetic-own-tv-key";
    @Override protected void setUp() throws Exception {
        super.setUp();
        getContext().getSharedPreferences("octos-byok-local-test-v1", 0).edit().clear().commit();
        store = new NativeByokStore(getContext(), "octos-byok-local-test-v1"); store.bind(ORIGIN, "test-alice");
    }
    @Override protected void tearDown() throws Exception { store.clear(); super.tearDown(); }
    private JSONObject draft() throws Exception {
        return new JSONObject().put("provider", "volcano").put("key", KEY)
                .put("params", new JSONObject().put("auth_mode", "api-key").put("resource_id", "seed-tts-2.0").put("voice", "test-voice"));
    }
    private JSONObject server(String owner, String key) throws Exception {
        JSONObject services = new JSONObject();
        if (key != null) services.put("tts", new JSONObject().put("provider", "volcano").put("has_credential", true)
                .put("credential_revision", NativeByokStore.digest(key)).put("revision", "server-r1")
                .put("params", draft().getJSONObject("params")).put("enabled", true).put("execution_target", "client"));
        return new JSONObject().put("profile_id", owner).put("services", services);
    }
    public void testEncryptedPersistenceAndNoKeyExport() throws Exception {
        store.save("tts", draft());
        SharedPreferences prefs = getContext().getSharedPreferences("octos-byok-local-test-v1", 0);
        assertFalse(prefs.getAll().toString().contains(KEY));
        NativeByokStore restarted = new NativeByokStore(getContext(), "octos-byok-local-test-v1"); restarted.bind(ORIGIN, "test-alice");
        JSONObject output = restarted.reconcile(server("test-alice", KEY));
        assertFalse(output.toString().contains(KEY));
        JSONObject metadata = output.getJSONObject("services").getJSONObject("tts");
        assertTrue(metadata.getBoolean("local_credential")); assertTrue(metadata.getBoolean("account_synced"));
        assertEquals(KEY, restarted.key("tts", metadata));
    }
    public void testAccountOnlyKeyRequiresEntryOnThisDevice() throws Exception {
        JSONObject metadata = store.reconcile(server("test-alice", KEY)).getJSONObject("services").getJSONObject("tts");
        assertFalse(metadata.getBoolean("local_credential"));
        try { store.key("tts", metadata); fail("Must not download or invent a key"); } catch (IllegalStateException expected) { }
    }
    public void testFailedAccountSaveKeepsLocalKey() throws Exception {
        store.save("tts", draft());
        JSONObject metadata = store.reconcile(server("test-alice", null)).getJSONObject("services").getJSONObject("tts");
        assertTrue(metadata.getBoolean("local_credential")); assertFalse(metadata.getBoolean("account_synced"));
        assertEquals(KEY, store.key("tts", metadata)); assertTrue(metadata.isNull("account_revision"));
    }
    public void testAccountSwitchAfterRestartClearsPreviousKeys() throws Exception {
        store.save("tts", draft());
        NativeByokStore restarted = new NativeByokStore(getContext(), "octos-byok-local-test-v1"); restarted.bind(ORIGIN, "test-bob");
        restarted.bind(ORIGIN, "test-alice");
        assertFalse(restarted.reconcile(server("test-alice", KEY)).getJSONObject("services").getJSONObject("tts").getBoolean("local_credential"));
    }
    public void testLogoutAndRemoteDeletionClearConfirmedLocalCopy() throws Exception {
        store.save("tts", draft()); store.reconcile(server("test-alice", KEY));
        assertEquals(0, store.reconcile(server("test-alice", null)).getJSONObject("services").length());
        store.save("tts", draft()); store.clear(); store.bind(ORIGIN, "test-alice");
        assertFalse(store.reconcile(server("test-alice", KEY)).getJSONObject("services").getJSONObject("tts").getBoolean("local_credential"));
    }
    public void testRemoteReplacementDoesNotUseOldLocalKey() throws Exception {
        store.save("tts", draft()); store.reconcile(server("test-alice", KEY));
        JSONObject metadata = store.reconcile(server("test-alice", "synthetic-replaced-key")).getJSONObject("services").getJSONObject("tts");
        assertFalse(metadata.getBoolean("local_credential"));
        try { store.key("tts", metadata); fail("Stale key must not be sent"); } catch (IllegalStateException expected) { }
    }
    public void testCorruptionFailsClosedWithoutPlaintextFallback() throws Exception {
        store.save("tts", draft());
        SharedPreferences prefs = getContext().getSharedPreferences("octos-byok-local-test-v1", 0);
        String field = NativeByokStore.digest(ORIGIN + "\0test-alice") + ":tts";
        prefs.edit().putString(field, "corrupt.ciphertext").commit();
        JSONObject metadata = store.reconcile(server("test-alice", KEY)).getJSONObject("services").getJSONObject("tts");
        assertFalse(metadata.getBoolean("local_credential")); assertTrue(metadata.getBoolean("local_storage_error"));
        assertEquals("corrupt.ciphertext", prefs.getString(field, ""));
        store.save("tts", draft());
        assertTrue(store.reconcile(server("test-alice", KEY)).getJSONObject("services").getJSONObject("tts").getBoolean("local_credential"));
    }
}
