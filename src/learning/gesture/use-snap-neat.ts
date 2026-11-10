import { useEffect, useRef, useState, type RefObject } from "react";
import { tr } from "@/i18n";
import type { InkRuntime } from "../oll/oll-ink-runtime";
import { HandwritingCapture, type HandwritingCaptureState } from "../handwriting/handwriting-capture";
import { explainAssistFailure } from "../teach/teach-assist";
import { GestureTrialTracker } from "./gesture-trial";
import { ImpulseCapture } from "./impulse-capture";
import { neatenSelectedInk, SNAP_HAND_THRESHOLD, SNAP_SOUND_THRESHOLD } from "./snap-neat";

export function useSnapNeat({ inkRef, sessionId, available, playing, selected, selectionRevision }: {
  inkRef: RefObject<InkRuntime | null>;
  sessionId?: string;
  available: boolean;
  playing: boolean;
  selected: boolean;
  selectionRevision: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const micRef = useRef(new ImpulseCapture());
  const cameraRef = useRef<HandwritingCapture | null>(null);
  const trackerRef = useRef(new GestureTrialTracker());
  const taskRef = useRef<{ cancelled: boolean } | null>(null);
  const needsReleaseRef = useRef(false);
  const scopeRef = useRef<object | null>(null);
  const triggerRef = useRef<() => void>(() => undefined);
  const [enabled, setEnabled] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [cameraState, setCameraState] = useState<HandwritingCaptureState>("idle");
  const [handReady, setHandReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const stop = () => {
    scopeRef.current = null;
    if (taskRef.current) taskRef.current.cancelled = true;
    taskRef.current = null;
    micRef.current.stop(); cameraRef.current?.stop(); trackerRef.current.reset();
    setEnabled(false); setMicReady(false); setHandReady(false); setBusy(false); setNotice("");
  };

  useEffect(() => {
    const scope = {};
    scopeRef.current = scope;
    const mic = micRef.current;
    const tracker = trackerRef.current;
    const clear = () => {
      if (scopeRef.current === scope) scopeRef.current = null;
      if (taskRef.current) taskRef.current.cancelled = true;
      taskRef.current = null;
      mic.stop(); cameraRef.current?.stop(); tracker.reset();
      setEnabled(false); setMicReady(false); setBusy(false); setHandReady(false); setNotice("");
    };
    if (!available || playing) clear();
    const hidden = () => { if (document.hidden) clear(); };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", clear);
    return () => {
      document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", clear);
      clear();
    };
  }, [available, playing, sessionId]);

  useEffect(() => {
    triggerRef.current = () => {
      const ink = inkRef.current;
      const scope = scopeRef.current;
      if (!scope || !ink || !sessionId || !available || playing || !selected || taskRef.current || needsReleaseRef.current || document.hidden) return;
      if ([...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].some(element => element.getBoundingClientRect().width > 0)) return;
      const task = { cancelled: false };
      needsReleaseRef.current = true;
      taskRef.current = task;
      setBusy(true); setNotice(tr("响指收到，正在整理选中的公式…"));
      const isCurrent = () => !task.cancelled && scopeRef.current === scope && inkRef.current === ink && !document.hidden;
      void neatenSelectedInk(ink, sessionId, isCurrent).then(() => {
        if (isCurrent()) setNotice(tr("公式整理好了。点撤销可恢复原手写。"));
      }, error => {
        if (isCurrent()) setNotice(explainAssistFailure(error));
      }).finally(() => {
        if (taskRef.current === task) { taskRef.current = null; setBusy(false); }
      });
    };
  }, [inkRef, sessionId, available, playing, selected]);

  useEffect(() => {
    trackerRef.current.reset(); needsReleaseRef.current = false; setHandReady(false);
    if (!taskRef.current) setNotice("");
  }, [selectionRevision]);
  const armed = enabled && micReady && available && !playing && selected;
  useEffect(() => {
    const tracker = trackerRef.current;
    tracker.reset(); setHandReady(false);
    if (!armed || !videoRef.current) return;
    let active = true;
    const camera = new HandwritingCapture(videoRef.current, {
      onState: state => { if (active) setCameraState(state); },
      onError: () => {
        if (!active) return;
        setHandReady(false); tracker.reset(); setCameraState("idle");
        setNotice(tr("响指手型识别未能启动，请关闭彩蛋后重试。"));
      },
      onFrame: frame => {
        if (!active || taskRef.current) return;
        const result = tracker.update(frame, SNAP_HAND_THRESHOLD);
        if (needsReleaseRef.current) {
          if (result.reading.pose !== "middle-pinch") { needsReleaseRef.current = false; tracker.reset(); }
          setHandReady(false); return;
        }
        setHandReady(result.ready);
        if (result.matched) triggerRef.current();
      },
    });
    cameraRef.current = camera;
    void camera.start();
    return () => { active = false; camera.stop(); if (cameraRef.current === camera) cameraRef.current = null; tracker.reset(); };
  }, [armed, sessionId]);

  const start = async () => {
    if (!available || playing) return;
    const scope = scopeRef.current = {};
    setEnabled(true); setNotice("");
    try {
      const ready = await micRef.current.start(SNAP_SOUND_THRESHOLD, () => undefined, time => {
        if (scopeRef.current !== scope || !cameraRef.current || taskRef.current) return;
        if (trackerRef.current.sound(time)) triggerRef.current();
      }, () => {
        if (scopeRef.current === scope) { stop(); setNotice(tr("麦克风已断开，请重新开启响指整理。")); }
      }, "peak");
      if (ready && scopeRef.current === scope) setMicReady(true);
    } catch {
      if (scopeRef.current === scope) { stop(); setNotice(tr("请允许麦克风访问，才能使用响指整理。")); }
    }
  };
  const status = busy ? tr("正在整理公式…") : !enabled ? tr("选中手写公式，再打响指，原地变整齐。")
    : !micReady ? tr("正在开启麦克风…") : !selected ? tr("彩蛋已开启，先框选手写公式。")
    : cameraState === "loading" || cameraState === "starting" ? tr("正在准备响指手型识别…")
    : handReady ? tr("准备好了，打一个响指。") : tr("已选中公式，让拇指与中指靠近，再打响指。");
  return { enabled, busy, status, notice, armed, videoRef, handReady, start, stop };
}
