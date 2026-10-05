package cc.pitun.learn;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Hardware-accelerated transient ink shown while a pointer is down.
 *
 * The durable stroke is owned by the web whiteboard. This view only removes
 * WebView/JavaScript scheduling from the live pen-to-pixel path. Each stroke
 * stays here until the whiteboard acknowledges it, so a new stroke never hides
 * an older one that the WebView has not drawn yet.
 */
final class NativeInkOverlayView extends View {
    /**
     * Android 8's OpenGL renderer rasterizes each stroked Path on the CPU and
     * caches the result as a texture. A Path that changes must be rasterized
     * again over its whole bounds, so one long live path costs more every
     * frame. Splitting a stroke into short segments keeps finished segments
     * cached and limits per-frame work to the latest one.
     */
    private static final int POINTS_PER_SEGMENT = 32;

    private final Map<Integer, StrokePath> strokes = new LinkedHashMap<>();
    private int activePointerId = -1;
    private int color = Color.rgb(23, 107, 98);
    private float widthPx = 4f;

    /**
     * One stroke, smoothed with quadratic curves through sample midpoints.
     * This is the curve the web whiteboard commits (ink-runtime
     * smoothedInkPathData); keep the two in step so the handoff is still.
     */
    private static final class StrokePath {
        final List<Path> segments = new ArrayList<>();
        final Paint paint;
        Path path = new Path();
        int segmentPoints;
        boolean curved;
        /** Newest sample; the curve ends at the midpoint before it. */
        float lastX;
        float lastY;
        /** Where the curve currently ends; a straight tail joins it to the newest sample. */
        float endX;
        float endY;

        StrokePath(Paint paint, float x, float y) {
            this.paint = paint;
            segments.add(path);
            path.moveTo(x, y);
            // A zero-length segment makes a tap visible with round line caps.
            path.lineTo(x + 0.01f, y);
            segmentPoints = 1;
            lastX = x;
            lastY = y;
            endX = x + 0.01f;
            endY = y;
        }

        void lineTo(float x, float y) {
            if (segmentPoints >= POINTS_PER_SEGMENT) {
                // Round caps make the shared endpoint join seamlessly.
                path = new Path();
                path.moveTo(endX, endY);
                segments.add(path);
                segmentPoints = 0;
            }
            final float midX = (lastX + x) * 0.5f;
            final float midY = (lastY + y) * 0.5f;
            if (curved) {
                path.quadTo(lastX, lastY, midX, midY);
            } else {
                path.lineTo(midX, midY);
                curved = true;
            }
            segmentPoints++;
            endX = midX;
            endY = midY;
            lastX = x;
            lastY = y;
        }
    }

    NativeInkOverlayView(Context context) {
        super(context);
        setWillNotDraw(false);
        setClickable(false);
        setFocusable(false);
        // Let the hardware-accelerated window compositor decide how to draw
        // this view. A forced full-screen 4K hardware layer permanently keeps
        // several large RGBA buffers alive on low-memory Android 8 panels.
        setLayerType(View.LAYER_TYPE_NONE, null);
        setVisibility(View.INVISIBLE);
    }

    void configure(String color, float widthPx) {
        try {
            this.color = Color.parseColor(color);
        } catch (IllegalArgumentException ignored) {
            this.color = Color.rgb(23, 107, 98);
        }
        this.widthPx = Math.max(1f, widthPx);
    }

    void begin(int pointerId, float x, float y) {
        // Pending strokes keep the paint they were drawn with; only the new
        // stroke picks up the current color and width.
        final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeJoin(Paint.Join.ROUND);
        paint.setColor(color);
        paint.setStrokeWidth(widthPx);
        final StrokePath stroke = new StrokePath(paint, x, y);
        strokes.put(pointerId, stroke);
        activePointerId = pointerId;
        setVisibility(View.VISIBLE);
        invalidateBounds(stroke, x, y, x, y);
    }

    void append(int pointerId, float x, float y) {
        final StrokePath stroke = pointerId == activePointerId ? strokes.get(pointerId) : null;
        if (stroke == null) return;
        // The new curve piece and tail stay within the old curve end, the
        // previous sample (the control point) and the new sample.
        final float left = Math.min(Math.min(stroke.endX, stroke.lastX), x);
        final float top = Math.min(Math.min(stroke.endY, stroke.lastY), y);
        final float right = Math.max(Math.max(stroke.endX, stroke.lastX), x);
        final float bottom = Math.max(Math.max(stroke.endY, stroke.lastY), y);
        stroke.lineTo(x, y);
        invalidateBounds(stroke, left, top, right, bottom);
    }

    void clear(int pointerId) {
        if (pointerId == activePointerId) activePointerId = -1;
        if (strokes.remove(pointerId) == null) return;
        if (strokes.isEmpty()) setVisibility(View.INVISIBLE);
        else invalidate();
    }

    void clearAll() {
        activePointerId = -1;
        strokes.clear();
        setVisibility(View.INVISIBLE);
    }

    private void invalidateBounds(
            StrokePath stroke,
            float minX,
            float minY,
            float maxX,
            float maxY
    ) {
        final float padding = stroke.paint.getStrokeWidth() * 0.5f + 3f;
        final int left = (int) Math.floor(minX - padding);
        final int top = (int) Math.floor(minY - padding);
        final int right = (int) Math.ceil(maxX + padding);
        final int bottom = (int) Math.ceil(maxY + padding);
        invalidate(left, top, right, bottom);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        for (StrokePath stroke : strokes.values()) {
            for (Path segment : stroke.segments) {
                canvas.drawPath(segment, stroke.paint);
            }
            canvas.drawLine(stroke.endX, stroke.endY, stroke.lastX, stroke.lastY, stroke.paint);
        }
    }
}
