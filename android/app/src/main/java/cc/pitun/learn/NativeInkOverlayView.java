package cc.pitun.learn;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

/**
 * Hardware-accelerated transient ink shown while a pointer is down.
 *
 * The durable stroke is owned by the web whiteboard. This view only removes
 * WebView/JavaScript scheduling from the live pen-to-pixel path; it is cleared
 * after the whiteboard acknowledges the committed stroke.
 */
final class NativeInkOverlayView extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path activePath = new Path();
    private int activePointerId = -1;
    private boolean hasPath;

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
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeJoin(Paint.Join.ROUND);
        paint.setColor(Color.rgb(23, 107, 98));
        paint.setStrokeWidth(4f);
    }

    void configure(String color, float widthPx) {
        try {
            paint.setColor(Color.parseColor(color));
        } catch (IllegalArgumentException ignored) {
            paint.setColor(Color.rgb(23, 107, 98));
        }
        paint.setStrokeWidth(Math.max(1f, widthPx));
    }

    void begin(int pointerId, float x, float y) {
        activePointerId = pointerId;
        activePath.reset();
        activePath.moveTo(x, y);
        // A zero-length segment makes a tap visible with round line caps.
        activePath.lineTo(x + 0.01f, y);
        hasPath = true;
        setVisibility(View.VISIBLE);
        invalidateSegment(x, y, x, y);
    }

    void append(int pointerId, float x, float y) {
        if (!hasPath || pointerId != activePointerId) return;
        final float previousX = lastX;
        final float previousY = lastY;
        activePath.lineTo(x, y);
        invalidateSegment(previousX, previousY, x, y);
    }

    void clear(int pointerId) {
        if (pointerId != activePointerId) return;
        activePointerId = -1;
        hasPath = false;
        activePath.reset();
        setVisibility(View.INVISIBLE);
    }

    void clearAll() {
        activePointerId = -1;
        hasPath = false;
        activePath.reset();
        setVisibility(View.INVISIBLE);
    }

    private float lastX;
    private float lastY;

    private void invalidateSegment(float fromX, float fromY, float toX, float toY) {
        lastX = toX;
        lastY = toY;
        final float padding = paint.getStrokeWidth() * 0.5f + 3f;
        final int left = (int) Math.floor(Math.min(fromX, toX) - padding);
        final int top = (int) Math.floor(Math.min(fromY, toY) - padding);
        final int right = (int) Math.ceil(Math.max(fromX, toX) + padding);
        final int bottom = (int) Math.ceil(Math.max(fromY, toY) + padding);
        invalidate(left, top, right, bottom);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (hasPath) canvas.drawPath(activePath, paint);
    }
}
