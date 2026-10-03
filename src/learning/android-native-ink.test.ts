import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bridge = readFileSync(
  "android/app/src/main/java/cc/pitun/learn/NativeInkBridge.java",
  "utf8",
);
const overlay = readFileSync(
  "android/app/src/main/java/cc/pitun/learn/NativeInkOverlayView.java",
  "utf8",
);
const activity = readFileSync(
  "android/app/src/main/java/cc/pitun/learn/MainActivity.java",
  "utf8",
);
const ollRuntime = readFileSync(
  "node_modules/octos-lesson-language/dist/packages/ink-runtime/src/runtime.js",
  "utf8",
);

describe("Android native ink pipeline", () => {
  it("reads every historical MotionEvent sample before the current sample", () => {
    const historyLoop = bridge.indexOf("event.getHistorySize()");
    const historicalX = bridge.indexOf("event.getHistoricalX", historyLoop);
    const currentX = bridge.indexOf("event.getX(pointerIndex)", historicalX);

    expect(historyLoop).toBeGreaterThan(0);
    expect(historicalX).toBeGreaterThan(historyLoop);
    expect(currentX).toBeGreaterThan(historicalX);
    expect(bridge).toContain("event.getHistoricalEventTime(history)");
    expect(bridge).toContain("event.getHistoricalPressure(pointerIndex, history)");
  });

  it("rejects replayed and out-of-bounds Android driver samples", () => {
    // Replays from an earlier MotionEvent are dropped; samples that share one
    // timestamp inside a single batch are kept.
    expect(bridge).toContain("time < lastAcceptedEventTime || time <= previousEventTime");
    expect(bridge).toContain("previousEventTime = lastAcceptedEventTime");
    expect(bridge).toContain("final float edgeTolerance = 24f * cssPixelRatio");
    expect(bridge).toContain("addPointIfValid(");
    expect(bridge).toContain("if (appendOverlay) overlay.append(strokeId, xPx, yPx)");
  });

  it("renders live ink natively without consuming ordinary WebView input", () => {
    expect(activity).toContain('addJavascriptInterface(nativeInkBridge, "OctosNativeInk")');
    expect(activity).toContain("nativeInkBridge.onMotionEvent(event)");
    expect(activity).toContain("return super.dispatchTouchEvent(event)");
    expect(overlay).toContain("View.LAYER_TYPE_NONE");
    expect(overlay).toContain("setVisibility(View.INVISIBLE)");
    expect(overlay).toContain("setVisibility(View.VISIBLE)");
    expect(overlay).toContain("invalidate(left, top, right, bottom)");
    expect(overlay).toContain("canvas.drawPath(segment, stroke.paint)");
  });

  it("batches WebView delivery until pointer-up while retaining native live feedback", () => {
    const moveBranch = bridge.slice(
      bridge.indexOf("if (action == MotionEvent.ACTION_MOVE)"),
      bridge.indexOf("} else if (action == MotionEvent.ACTION_UP"),
    );
    const finish = bridge.slice(bridge.indexOf("private void finishActiveStroke()"));

    expect(moveBranch).toContain("collectPoints(event, index, true, pendingPoints, true)");
    expect(moveBranch).not.toContain("evaluateJavascript");
    expect(moveBranch).not.toContain("finishActiveStroke");
    expect(finish).toContain(
      'dispatchBatch("up", activeStrokeId, activePointerType, pendingPoints)',
    );
    expect(bridge).toContain("private JSONArray pendingPoints = new JSONArray()");
  });

  it("commits one smoothed stroke and clears the native overlay after the next paint", () => {
    expect(ollRuntime).toContain("handleNativeInkBatch(batch)");
    expect(ollRuntime).toContain("smoothedInkPathData(pathPoints)");
    expect(ollRuntime).toContain("Stroke.fromStroked(path");
    expect(ollRuntime).toContain("this.editor.dispatch(this.editor.image.addComponent(stroke))");
    expect(ollRuntime).toContain("bridge.acknowledge(pointerId)");
    expect(ollRuntime).toContain("hostWindow.requestAnimationFrame(acknowledge)");
  });

  it("uses per-stroke ids so a late acknowledgement cannot clear the next stroke", () => {
    expect(bridge).toContain("activeMotionPointerId");
    expect(bridge).toContain("activeStrokeId = nextStrokeId++");
    expect(bridge).toContain("overlay.begin(activeStrokeId");
    expect(bridge).toContain('batch.put("pointerId", strokeId)');
  });

  it("ends the stroke when the drawing pointer lifts before another contact", () => {
    const upBranch = bridge.slice(
      bridge.indexOf("} else if (action == MotionEvent.ACTION_UP"),
      bridge.indexOf("private void finishActiveStroke()"),
    );

    expect(upBranch).toContain("action == MotionEvent.ACTION_POINTER_UP");
    expect(upBranch).toContain("event.getActionIndex() == index");
    expect(upBranch).toContain("finishActiveStroke()");
    // A vanished drawing pointer commits instead of stranding the stroke.
    const lostPointer = bridge.slice(bridge.indexOf("if (index < 0) {"));
    expect(lostPointer.slice(0, lostPointer.indexOf("}"))).toContain(
      "finishActiveStroke()",
    );
  });

  it("keeps every unacknowledged stroke until the WebView draws its commit", () => {
    expect(overlay).toContain("Map<Integer, StrokePath> strokes");
    expect(overlay).toContain("strokes.put(pointerId, stroke)");
    expect(overlay).toContain("strokes.remove(pointerId)");
    // Starting a stroke must not discard the previous, still pending one.
    const begin = overlay.slice(
      overlay.indexOf("void begin("),
      overlay.indexOf("void append("),
    );
    expect(begin).not.toContain("strokes.clear()");
    expect(begin).not.toContain(".reset()");

    const acknowledge = bridge.slice(
      bridge.indexOf("public void acknowledge("),
      bridge.indexOf("public void cancel("),
    );
    expect(acknowledge).toContain("webView.postVisualStateCallback(");
    expect(acknowledge.indexOf("onComplete")).toBeLessThan(
      acknowledge.indexOf("overlay.clear(pointerId)"),
    );
  });

  it("limits live stroke rasterization to the newest path segment", () => {
    expect(overlay).toContain("POINTS_PER_SEGMENT = 32");
    expect(overlay).toContain("segments.add(path)");
    expect(overlay).toContain("path.moveTo(endX, endY)");
  });

  it("draws the same midpoint curve live that the whiteboard commits", () => {
    // ink-runtime smoothedInkPathData: L to the first midpoint, then one Q per
    // sample through the previous sample, then a straight tail.
    expect(overlay).toContain("path.quadTo(lastX, lastY, midX, midY)");
    expect(overlay).toContain("path.lineTo(midX, midY)");
    expect(overlay).toContain(
      "canvas.drawLine(stroke.endX, stroke.endY, stroke.lastX, stroke.lastY, stroke.paint)",
    );
  });

  it("never starts native ink on a control the whiteboard reports", () => {
    expect(bridge).toContain("public void setExclusionRects(String rectsJson)");
    expect(bridge).toContain("if (!inkBoundsPx.contains(x, y) || isExcluded(x, y)) return;");
    expect(ollRuntime).toContain("bridge.setExclusionRects?.(key)");
    expect(ollRuntime).toContain('typeof bridge.setExclusionRects !== "function"');
  });

  it("keeps the selected brush width identical in native preview and committed ink", () => {
    expect(ollRuntime).toContain("setPenWidth(width)");
    expect(ollRuntime).toContain("this.getTool(PenTool).setThickness");
    expect(ollRuntime).toContain("this.syncNativeInkCapture()");
    expect(bridge).toContain("overlay.configure(color, (float) widthCss * cssPixelRatio)");
  });
});
