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
    private long lastAcceptedEventTime = Long.MIN_VALUE;
    private float lastAcceptedX;
    private float lastAcceptedY;
    private boolean hasAcceptedPoint;
    private JSONArray pendingPoints = new JSONArray();

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
                pendingPoints = new JSONArray();
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
            resetSampleFilter();
            pendingPoints = new JSONArray();
            overlay.begin(activeStrokeId, x, y);
            final JSONArray downPoints = new JSONArray();
            collectPoints(event, index, false, downPoints, false);
            dispatchBatch("down", activeStrokeId, pointerType(event.getToolType(index)), downPoints);
            return;
        }

        if (activeMotionPointerId < 0 || activeStrokeId < 0) return;
        final int index = event.findPointerIndex(activeMotionPointerId);
        if (index < 0) return;

        if (action == MotionEvent.ACTION_MOVE) {
            collectPoints(event, index, true, pendingPoints, true);
        } else if (action == MotionEvent.ACTION_UP) {
            collectPoints(event, index, true, pendingPoints, true);
            dispatchBatch(
                    "up",
                    activeStrokeId,
                    pointerType(event.getToolType(index)),
                    pendingPoints
            );
            pendingPoints = new JSONArray();
            // Keep native ink visible until JavaScript commits and acknowledges it.
            activeMotionPointerId = -1;
            activeStrokeId = -1;
        } else if (action == MotionEvent.ACTION_CANCEL) {
            dispatchBatch(
                    "cancel",
                    activeStrokeId,
                    pointerType(event.getToolType(index)),
                    new JSONArray()
            );
            pendingPoints = new JSONArray();
            overlay.clear(activeStrokeId);
            activeMotionPointerId = -1;
            activeStrokeId = -1;
        }
    }

    private void collectPoints(
            MotionEvent event,
            int pointerIndex,
            boolean includeHistory,
            JSONArray points,
            boolean appendOverlay
    ) {
        try {
            final int strokeId = activeStrokeId;
            if (includeHistory) {
                for (int history = 0; history < event.getHistorySize(); history++) {
                    final float x = event.getHistoricalX(pointerIndex, history);
                    final float y = event.getHistoricalY(pointerIndex, history);
                    addPointIfValid(
                            points,
                            strokeId,
                            x,
                            y,
                            event.getHistoricalPressure(pointerIndex, history),
                            event.getHistoricalEventTime(history),
                            appendOverlay
                    );
                }
            }

            final float x = event.getX(pointerIndex);
            final float y = event.getY(pointerIndex);
            addPointIfValid(
                    points,
                    strokeId,
                    x,
                    y,
                    event.getPressure(pointerIndex),
                    event.getEventTime(),
                    appendOverlay
            );
        } catch (JSONException ignored) {
            failActiveStroke();
        }
    }

    private void dispatchBatch(
            String action,
            int strokeId,
            String pointerType,
            JSONArray points
    ) {
        try {
            final JSONObject batch = new JSONObject();
            batch.put("action", action);
            batch.put("pointerId", strokeId);
            batch.put("pointerType", pointerType);
            batch.put("points", points);
            final String script = "window.__octosNativeInkBatch&&window.__octosNativeInkBatch("
                    + batch + ");";
            webView.evaluateJavascript(script, null);
        } catch (JSONException ignored) {
            failActiveStroke();
        }
    }

    private void failActiveStroke() {
        pendingPoints = new JSONArray();
        overlay.clearAll();
        activeMotionPointerId = -1;
        activeStrokeId = -1;
    }

    private void addPointIfValid(
            JSONArray points,
            int strokeId,
            float xPx,
            float yPx,
            float pressure,
            long time,
            boolean appendOverlay
    ) throws JSONException {
        if (!Float.isFinite(xPx) || !Float.isFinite(yPx)) return;

        // Some Android 8 meeting-panel drivers repeat samples from the previous
        // MotionEvent history. Appending those older positions again makes a live
        // stroke double back even though the pointer never changed direction.
        if (hasAcceptedPoint && time <= lastAcceptedEventTime) return;

        // Permit a small overrun at the whiteboard edge, but discard vendor-driver
        // sentinel coordinates (commonly 0,0) that would create a long diagonal.
        final float edgeTolerance = 24f * cssPixelRatio;
        if (xPx < inkBoundsPx.left - edgeTolerance
                || xPx > inkBoundsPx.right + edgeTolerance
                || yPx < inkBoundsPx.top - edgeTolerance
                || yPx > inkBoundsPx.bottom + edgeTolerance) {
            return;
        }

        if (hasAcceptedPoint
                && Math.abs(xPx - lastAcceptedX) < 0.01f
                && Math.abs(yPx - lastAcceptedY) < 0.01f) {
            lastAcceptedEventTime = time;
            return;
        }

        final JSONObject point = new JSONObject();
        point.put("x", xPx / cssPixelRatio);
        point.put("y", yPx / cssPixelRatio);
        point.put("pressure", Float.isFinite(pressure) ? pressure : 0.5f);
        point.put("time", time);
        points.put(point);
        if (appendOverlay) overlay.append(strokeId, xPx, yPx);
        lastAcceptedEventTime = time;
        lastAcceptedX = xPx;
        lastAcceptedY = yPx;
        hasAcceptedPoint = true;
    }

    private void resetSampleFilter() {
        lastAcceptedEventTime = Long.MIN_VALUE;
        lastAcceptedX = 0f;
        lastAcceptedY = 0f;
        hasAcceptedPoint = false;
    }

    private static String pointerType(int toolType) {
        if (toolType == MotionEvent.TOOL_TYPE_STYLUS || toolType == MotionEvent.TOOL_TYPE_ERASER) {
            return "pen";
        }
        if (toolType == MotionEvent.TOOL_TYPE_MOUSE) return "mouse";
        return "touch";
    }
}
