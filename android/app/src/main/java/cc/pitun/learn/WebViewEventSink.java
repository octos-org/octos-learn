package cc.pitun.learn;

import android.webkit.WebView;
import org.json.JSONObject;

/** Existing Web host adapter. Native services no longer know about JavaScript. */
final class WebViewEventSink implements NativeEventSink {
    private final WebView view;
    WebViewEventSink(WebView view) { this.view = view; }
    @Override public void post(Runnable task) { view.post(task); }
    @Override public void emit(String channel, JSONObject payload) {
        final String script;
        if ("ink".equals(channel)) {
            script = "window.__octosNativeInkBatch&&window.__octosNativeInkBatch(" + payload + ");";
        } else if ("audio".equals(channel)) {
            script = "window.dispatchEvent(new CustomEvent('octos-native-audio',{detail:" + payload + "}));";
        } else { throw new IllegalArgumentException("Unknown native event channel"); }
        view.post(() -> view.evaluateJavascript(script, null));
    }
}
