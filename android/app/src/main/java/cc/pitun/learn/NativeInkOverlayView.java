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
        setLayerType(View.LAYER_TYPE_HARDWARE, null);
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
        invalidate();
    }

    void append(int pointerId, float x, float y) {
        if (!hasPath || pointerId != activePointerId) return;
        activePath.lineTo(x, y);
        invalidate();
    }

    void clear(int pointerId) {
        if (pointerId != activePointerId) return;
        activePointerId = -1;
        hasPath = false;
        activePath.reset();
        invalidate();
    }

    void clearAll() {
        activePointerId = -1;
        hasPath = false;
        activePath.reset();
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (hasPath) canvas.drawPath(activePath, paint);
    }
}
