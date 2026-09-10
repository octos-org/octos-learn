package cc.pitun.learn;

import android.graphics.RectF;
import android.view.MotionEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Bridges Android's uncoalesced MotionEvent history into the OLL ink runtime. */
final class NativeInkBridge {
    private final WebView webView;
    private final NativeInkOverlayView overlay;
    private final RectF inkBoundsPx = new RectF();

    private boolean enabled;
    private float cssPixelRatio = 1f;
    private int activeMotionPointerId = -1;
    private int activeStrokeId = -1;
    private int nextStrokeId = 1;

    NativeInkBridge(WebView webView, NativeInkOverlayView overlay) {
        this.webView = webView;
        this.overlay = overlay;
    }

    @JavascriptInterface
    public void configure(
            boolean captureEnabled,
            double leftCss,
            double topCss,
            double rightCss,
            double bottomCss,
            double devicePixelRatio,
            String color,
            double widthCss
    ) {
        webView.post(() -> {
            cssPixelRatio = (float) Math.max(0.1, Math.min(8, devicePixelRatio));
            inkBoundsPx.set(
                    (float) leftCss * cssPixelRatio,
                    (float) topCss * cssPixelRatio,
                    (float) rightCss * cssPixelRatio,
                    (float) bottomCss * cssPixelRatio
            );
            enabled = captureEnabled;
            overlay.configure(color, (float) widthCss * cssPixelRatio);
            if (!enabled) {
                activeMotionPointerId = -1;
                activeStrokeId = -1;
                overlay.clearAll();
            }
        });
    }

    @JavascriptInterface
    public void acknowledge(int pointerId) {
        webView.post(() -> overlay.clear(pointerId));
    }

    @JavascriptInterface
    public void cancel(int pointerId) {
        webView.post(() -> {
            if (pointerId == activeStrokeId) {
                activeMotionPointerId = -1;
                activeStrokeId = -1;
            }
            overlay.clear(pointerId);
        });
    }

    void onMotionEvent(MotionEvent event) {
        if (!enabled) return;
        final int action = event.getActionMasked();

        if (action == MotionEvent.ACTION_DOWN) {
            final int index = event.getActionIndex();
            if (event.getToolType(index) == MotionEvent.TOOL_TYPE_MOUSE) return;
            final float x = event.getX(index);
            final float y = event.getY(index);
            if (!inkBoundsPx.contains(x, y)) return;
            activeMotionPointerId = event.getPointerId(index);
            activeStrokeId = nextStrokeId++;
            if (nextStrokeId == Integer.MAX_VALUE) nextStrokeId = 1;
            overlay.begin(activeStrokeId, x, y);
            emit("down", event, index, false);
            return;
        }

        if (activeMotionPointerId < 0 || activeStrokeId < 0) return;
        final int index = event.findPointerIndex(activeMotionPointerId);
        if (index < 0) return;

        if (action == MotionEvent.ACTION_MOVE) {
            emit("move", event, index, true);
        } else if (action == MotionEvent.ACTION_UP) {
            emit("up", event, index, true);
            // Keep native ink visible until JavaScript commits and acknowledges it.
            activeMotionPointerId = -1;
            activeStrokeId = -1;
        } else if (action == MotionEvent.ACTION_CANCEL) {
            emit("cancel", event, index, false);
            overlay.clear(activeStrokeId);
            activeMotionPointerId = -1;
            activeStrokeId = -1;
        }
    }

    private void emit(String action, MotionEvent event, int pointerIndex, boolean includeHistory) {
        try {
            final int strokeId = activeStrokeId;
            final JSONArray points = new JSONArray();
            if (includeHistory) {
                for (int history = 0; history < event.getHistorySize(); history++) {
                    final float x = event.getHistoricalX(pointerIndex, history);
                    final float y = event.getHistoricalY(pointerIndex, history);
                    addPoint(
                            points,
                            x,
                            y,
                            event.getHistoricalPressure(pointerIndex, history),
                            event.getHistoricalEventTime(history)
                    );
                    overlay.append(strokeId, x, y);
                }
            }

            final float x = event.getX(pointerIndex);
            final float y = event.getY(pointerIndex);
            addPoint(points, x, y, event.getPressure(pointerIndex), event.getEventTime());
            if (!"down".equals(action)) overlay.append(strokeId, x, y);

            final JSONObject batch = new JSONObject();
            batch.put("action", action);
            batch.put("pointerId", strokeId);
            batch.put("pointerType", pointerType(event.getToolType(pointerIndex)));
            batch.put("points", points);
            final String script = "window.__octosNativeInkBatch&&window.__octosNativeInkBatch("
                    + batch + ");";
            webView.evaluateJavascript(script, null);
        } catch (JSONException ignored) {
            overlay.clearAll();
            activeMotionPointerId = -1;
            activeStrokeId = -1;
        }
    }

    private void addPoint(JSONArray points, float xPx, float yPx, float pressure, long time) throws JSONException {
        final JSONObject point = new JSONObject();
        point.put("x", xPx / cssPixelRatio);
        point.put("y", yPx / cssPixelRatio);
        point.put("pressure", Float.isFinite(pressure) ? pressure : 0.5f);
        point.put("time", time);
        points.put(point);
    }

    private static String pointerType(int toolType) {
        if (toolType == MotionEvent.TOOL_TYPE_STYLUS || toolType == MotionEvent.TOOL_TYPE_ERASER) {
            return "pen";
        }
        if (toolType == MotionEvent.TOOL_TYPE_MOUSE) return "mouse";
        return "touch";
    }
}
