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
const ollPatch = readFileSync(
  "patches/octos-lesson-language@0.1.0-rc.1.patch",
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
    expect(bridge).toContain("time <= lastAcceptedEventTime");
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
    expect(overlay).toContain("canvas.drawPath(activePath, paint)");
  });

  it("batches WebView delivery until pointer-up while retaining native live feedback", () => {
    const moveBranch = bridge.slice(
      bridge.indexOf("if (action == MotionEvent.ACTION_MOVE)"),
      bridge.indexOf("} else if (action == MotionEvent.ACTION_UP)"),
    );
    const upBranch = bridge.slice(
      bridge.indexOf("} else if (action == MotionEvent.ACTION_UP)"),
      bridge.indexOf("} else if (action == MotionEvent.ACTION_CANCEL)"),
    );

    expect(moveBranch).toContain("collectPoints(event, index, true, pendingPoints, true)");
    expect(moveBranch).not.toContain("evaluateJavascript");
    expect(upBranch).toContain("dispatchBatch(");
    expect(upBranch).toContain('"up",');
    expect(bridge).toContain("private JSONArray pendingPoints = new JSONArray()");
  });

  it("commits one polyline and clears the native overlay after the next paint", () => {
    expect(ollPatch).toContain("handleNativeInkBatch(batch)");
    expect(ollPatch).toContain('index === 0 ? "M" : "L"');
    expect(ollPatch).toContain("Stroke.fromStroked(path");
    expect(ollPatch).toContain("this.editor.dispatch(this.editor.image.addComponent(stroke))");
    expect(ollPatch).toContain("bridge.acknowledge(pointerId)");
    expect(ollPatch).toContain("hostWindow.requestAnimationFrame(acknowledge)");
  });

  it("uses per-stroke ids so a late acknowledgement cannot clear the next stroke", () => {
    expect(bridge).toContain("activeMotionPointerId");
    expect(bridge).toContain("activeStrokeId = nextStrokeId++");
    expect(bridge).toContain("overlay.begin(activeStrokeId");
    expect(bridge).toContain('batch.put("pointerId", strokeId)');
  });

  it("keeps the selected brush width identical in native preview and committed ink", () => {
    expect(ollPatch).toContain("setPenWidth(width)");
    expect(ollPatch).toContain("this.getTool(PenTool).setThickness");
    expect(ollPatch).toContain("this.syncNativeInkCapture()");
    expect(bridge).toContain("overlay.configure(color, (float) widthCss * cssPixelRatio)");
  });
});
