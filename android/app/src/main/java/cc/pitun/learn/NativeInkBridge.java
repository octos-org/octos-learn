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
    /** Board controls in CSS px (left, top, right, bottom per control). */
    private float[] exclusionRectsCss = new float[0];

    private boolean enabled;
    private float cssPixelRatio = 1f;
    private int activeMotionPointerId = -1;
    private int activeStrokeId = -1;
    private String activePointerType = "touch";
    private int nextStrokeId = 1;
    private long nextVisualStateRequestId = 1;
    private long lastAcceptedEventTime = Long.MIN_VALUE;
    private long previousEventTime = Long.MIN_VALUE;
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

    /**
     * Controls over the board, as a JSON array of flattened CSS-px rectangles.
     * A touch that starts on one belongs to the WebView, never to native ink.
     */
    @JavascriptInterface
    public void setExclusionRects(String rectsJson) {
        float[] rects;
        try {
            final JSONArray values = new JSONArray(rectsJson);
            rects = new float[values.length() - values.length() % 4];
            for (int i = 0; i < rects.length; i++) rects[i] = (float) values.getDouble(i);
        } catch (JSONException ignored) {
            rects = new float[0];
        }
        final float[] parsed = rects;
        webView.post(() -> exclusionRectsCss = parsed);
    }

    @JavascriptInterface
    public void acknowledge(int pointerId) {
        // JavaScript acknowledges after the committed SVG is in the DOM, but
        // that is not yet a drawn WebView frame. Clear the native copy only
        // once the WebView draws that DOM state, so the stroke never blinks
        // out between the two layers.
        webView.post(() -> webView.postVisualStateCallback(
                nextVisualStateRequestId++,
                new WebView.VisualStateCallback() {
                    @Override
                    public void onComplete(long requestId) {
                        overlay.clear(pointerId);
                    }
                }
        ));
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
            if (!inkBoundsPx.contains(x, y) || isExcluded(x, y)) return;
            activeMotionPointerId = event.getPointerId(index);
            activeStrokeId = nextStrokeId++;
            if (nextStrokeId == Integer.MAX_VALUE) nextStrokeId = 1;
            activePointerType = pointerType(event.getToolType(index));
            resetSampleFilter();
            pendingPoints = new JSONArray();
            overlay.begin(activeStrokeId, x, y);
            final JSONArray downPoints = new JSONArray();
            collectPoints(event, index, false, downPoints, false);
            dispatchBatch("down", activeStrokeId, activePointerType, downPoints);
            return;
        }

        if (activeMotionPointerId < 0 || activeStrokeId < 0) return;
        final int index = event.findPointerIndex(activeMotionPointerId);

        if (action == MotionEvent.ACTION_CANCEL) {
            dispatchBatch("cancel", activeStrokeId, activePointerType, new JSONArray());
            pendingPoints = new JSONArray();
            overlay.clear(activeStrokeId);
            activeMotionPointerId = -1;
            activeStrokeId = -1;
            return;
        }

        if (index < 0) {
            // The drawing pointer left without an event of its own. Commit what
            // was drawn instead of leaving it stranded in the overlay.
            finishActiveStroke();
            return;
        }

        if (action == MotionEvent.ACTION_MOVE) {
            collectPoints(event, index, true, pendingPoints, true);
        } else if (action == MotionEvent.ACTION_UP
                || (action == MotionEvent.ACTION_POINTER_UP
                && event.getActionIndex() == index)) {
            // A palm or second finger can stay down after the drawing pointer
            // lifts; its ACTION_POINTER_UP ends the stroke like ACTION_UP.
            collectPoints(event, index, true, pendingPoints, true);
            finishActiveStroke();
        }
    }

    private boolean isExcluded(float xPx, float yPx) {
        final float x = xPx / cssPixelRatio;
        final float y = yPx / cssPixelRatio;
        final float[] rects = exclusionRectsCss;
        for (int i = 0; i + 3 < rects.length; i += 4) {
            if (x >= rects[i] && x < rects[i + 2] && y >= rects[i + 1] && y < rects[i + 3]) {
                return true;
            }
        }
        return false;
    }

    private void finishActiveStroke() {
        dispatchBatch("up", activeStrokeId, activePointerType, pendingPoints);
        pendingPoints = new JSONArray();
        // Keep native ink visible until JavaScript commits and acknowledges it.
        activeMotionPointerId = -1;
        activeStrokeId = -1;
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
            previousEventTime = lastAcceptedEventTime;
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
        // Other drivers stamp several samples of one batch with the same time;
        // those are new positions, so equal times pass within one MotionEvent.
        if (hasAcceptedPoint
                && (time < lastAcceptedEventTime || time <= previousEventTime)) {
            return;
        }

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
        previousEventTime = Long.MIN_VALUE;
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
