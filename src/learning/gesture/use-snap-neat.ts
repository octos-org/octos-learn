import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { tr } from "@/i18n";
import type { InkRuntime } from "../oll/oll-ink-runtime";
import type { HandwritingGestureTarget } from "../handwriting/board-handwriting-input";
import { explainAssistFailure } from "../teach/teach-assist";
import { GestureTrialTracker, readTrialHand } from "./gesture-trial";
import { ImpulseCapture } from "./impulse-capture";
import { neatenSelectedInk, SNAP_HAND_THRESHOLD, SNAP_SOUND_THRESHOLD } from "./snap-neat";

const SNAP_RECOIL_MS = 250;

export function useSnapNeat({ viewportRef, inkRef, sessionId, available, selected, selectionRevision }: {
  viewportRef: RefObject<HTMLDivElement | null>;
  inkRef: RefObject<InkRuntime | null>;
  sessionId?: string;
  available: boolean;
  selected: boolean;
  selectionRevision: number;
}) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const micRef = useRef(new ImpulseCapture());
  const tracker = useRef(new GestureTrialTracker());
  const taskRef = useRef<{ cancelled: boolean } | null>(null);
  const pointers = useRef(new Set<number>());
  const scopeRef = useRef<object | null>(null);
  const entry = useRef({ time: Infinity, revision: -1, aimed: false, preparedAt: -Infinity, ownsClutch: false });
  const micRequest = useRef<object | null>(null);
  const micReady = useRef(false);
  const consented = useRef(false);
  const needsRelease = useRef(false);
  const [knownPermission, setKnownPermission] = useState(false);
  const [mic, setMic] = useState<"idle" | "starting" | "ready" | "blocked">("idle");
  const [aimed, setAimed] = useState(false);
  const [handReady, setHandReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const resetAim = useCallback(() => {
    tracker.current.reset();
    entry.current = { time: Infinity, revision: -1, aimed: false, preparedAt: -Infinity, ownsClutch: false };
    setAimed(false);
    setHandReady(false);
  }, []);

  const stopMic = useCallback(() => {
    micRequest.current = null;
    micReady.current = false;
    micRef.current.stop();
    setMic("idle");
  }, []);

  useEffect(() => {
    let active = true;
    void navigator.permissions?.query({ name: "microphone" as PermissionName }).then(permission => {
      if (active && permission.state === "granted") setKnownPermission(true);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useLayoutEffect(() => {
    scopeRef.current = available && sessionId ? {} : null;
    return () => {
      scopeRef.current = null;
      if (taskRef.current) taskRef.current.cancelled = true;
      taskRef.current = null;
      needsRelease.current = false;
      stopMic();
      resetAim();
      setBusy(false);
      setNotice("");
    };
  }, [available, sessionId, resetAim, stopMic]);

  useLayoutEffect(() => {
    resetAim();
    if (!selected) stopMic();
    else if (!taskRef.current) setNotice("");
  }, [selected, selectionRevision, resetAim, stopMic]);

  useEffect(() => {
    const activePointers = pointers.current;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || inkRef.current?.state.mode !== "select"
        || !(event.target instanceof Node) || !viewportRef.current?.contains(event.target)) return;
      activePointers.add(event.pointerId);
      // The editor temporarily previews the original ink during a selection drag.
      if (taskRef.current) taskRef.current.cancelled = true;
      resetAim();
      setNotice("");
    };
    const onRelease = (event: PointerEvent) => { activePointers.delete(event.pointerId); };
    const onBlur = () => { activePointers.clear(); resetAim(); };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onRelease, true);
    window.addEventListener("pointercancel", onRelease, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onRelease, true);
      window.removeEventListener("pointercancel", onRelease, true);
      window.removeEventListener("blur", onBlur);
      activePointers.clear();
    };
  }, [inkRef, viewportRef, sessionId, resetAim]);

  const trigger = useCallback(() => {
    const ink = inkRef.current;
    const scope = scopeRef.current;
    if (!scope || !ink || !sessionId || ink.state.mode !== "select" || !ink.state.selected_count
      || ink.state.selection_revision !== entry.current.revision || pointers.current.size
      || taskRef.current || needsRelease.current || document.hidden) return;
    if ([...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].some(element => element.getBoundingClientRect().width > 0)) return;
    const task = { cancelled: false };
    needsRelease.current = true;
    taskRef.current = task;
    setBusy(true);
    setHandReady(false);
    setNotice("");
    const isCurrent = () => !task.cancelled && scopeRef.current === scope && inkRef.current === ink && !document.hidden;
    void neatenSelectedInk(ink, sessionId, isCurrent).then(() => {
      if (isCurrent()) setNotice(tr("公式整理好了。点撤销可恢复原手写。"));
    }, error => {
      if (isCurrent()) setNotice(explainAssistFailure(error));
    }).finally(() => {
      if (taskRef.current === task) { taskRef.current = null; setBusy(false); }
    });
  }, [inkRef, sessionId]);

  const requestMic = useCallback(async () => {
    if (!scopeRef.current || !selected || micRequest.current || micReady.current) return;
    const request = {};
    micRequest.current = request;
    setMic("starting");
    try {
      const ready = await micRef.current.start(SNAP_SOUND_THRESHOLD, () => undefined, time => {
        const target = entry.current;
        if (micRequest.current !== request || !micReady.current || taskRef.current || pointers.current.size
          || time < target.time || (!target.aimed && time - target.preparedAt > SNAP_RECOIL_MS)) return;
        if (tracker.current.sound(time)) trigger();
      }, () => {
        if (micRequest.current !== request) return;
        micRequest.current = null;
        micReady.current = false;
        setMic("blocked");
      }, "peak");
      if (ready && micRequest.current === request) {
        consented.current = true;
        micReady.current = true;
        setMic("ready");
      }
    } catch {
      if (micRequest.current !== request) return;
      micRequest.current = null;
      setMic("blocked");
    }
  }, [selected, trigger]);

  useEffect(() => {
    if (aimed && mic === "idle" && (knownPermission || consented.current)) void requestMic();
  }, [aimed, mic, knownPermission, requestMic]);

  const onGesture: HandwritingGestureTarget = (frame, gesture, captured) => {
    const ink = inkRef.current?.state;
    if (!frame || !gesture || !available || !selected || captured || pointers.current.size
      || ink?.mode !== "select" || !ink.selected_count || ink.selection_revision !== selectionRevision) {
      if (entry.current.time !== Infinity) resetAim();
      return false;
    }
    const viewport = viewportRef.current?.getBoundingClientRect();
    const zone = zoneRef.current?.getBoundingClientRect();
    const x = (viewport?.left ?? 0) + (gesture.cursor?.x ?? -Infinity);
    const y = (viewport?.top ?? 0) + (gesture.cursor?.y ?? -Infinity);
    const inside = Boolean(viewport && zone && zone.width > 0 && zone.height > 0
      && x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom);
    const target = entry.current;
    const clutch = gesture.penDown || gesture.phase === "pending" || gesture.phase === "holding";
    // A clutch that starts here never sends a late down when it crosses the edge.
    target.ownsClutch = clutch && (inside || target.ownsClutch
      || frame.timeMs - target.preparedAt <= SNAP_RECOIL_MS);
    if (inside !== target.aimed) {
      target.aimed = inside;
      setAimed(inside);
      if (inside) {
        tracker.current.reset();
        target.time = frame.timeMs;
        target.revision = selectionRevision;
        target.preparedAt = -Infinity;
      } else {
        setHandReady(false);
      }
    }
    if (!inside) {
      if (frame.timeMs - target.preparedAt > SNAP_RECOIL_MS) tracker.current.reset();
      if (needsRelease.current && !taskRef.current) {
        const { pose } = readTrialHand(frame, SNAP_HAND_THRESHOLD);
        if (pose !== "lost" && pose !== "middle-pinch") needsRelease.current = false;
      }
      return target.ownsClutch;
    }
    if (micReady.current && !taskRef.current) {
      const result = tracker.current.update(frame, SNAP_HAND_THRESHOLD);
      if (needsRelease.current) {
        if (result.reading.pose !== "lost" && result.reading.pose !== "middle-pinch") {
          needsRelease.current = false;
          tracker.current.reset();
        }
      } else {
        if (result.ready) target.preparedAt = frame.timeMs;
        setHandReady(result.ready);
        if (result.matched) trigger();
      }
    }
    return true;
  };

  const needsMic = mic === "blocked" || (mic === "idle" && !knownPermission && !consented.current);
  const status = busy ? tr("正在整理公式…")
    : mic === "starting" ? tr("正在开启麦克风…")
    : aimed ? (handReady ? tr("准备好了，打一个响指。") : tr("拇指靠近中指，再打响指。"))
    : tr("把隔空光标移到这里");
  return { zoneRef, onGesture, requestMic, needsMic, aimed, handReady, busy, status, notice };
}
