package cc.pitun.learn;

import org.json.JSONObject;

/** Host transport for native services; implementations own thread and UI dispatch. */
interface NativeEventSink {
    void post(Runnable task);
    void emit(String channel, JSONObject payload);
}
