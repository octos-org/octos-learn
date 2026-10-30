import { useLocale } from "@/i18n/use-locale";
import { tr } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Mic, Play, Plug, Square, XCircle } from "lucide-react";
import { directJson, markVerified, ServiceError, serviceFailure, synthesizeDirect, transcribeDirect, validateService } from "@/byok/providers";
import { getServiceForTest, serviceRequest, type Capability, type ClientService } from "@/byok/services";
import { useTestVoiceCapture } from "@/home/voice/use-test-voice-capture";
import { playAudioBlob, unlockAudio } from "@/home/voice/audio-playback";

type TestState = "idle" | "testing" | "success" | "failed";
const buttonClass = "inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm text-muted hover:text-text-strong hover:border-accent/30 disabled:opacity-30 transition";
export function VoiceServiceTest({ capability, draft, disabled }: { capability: Capability; draft: Omit<ClientService, "key">; disabled: boolean }) {
  useLocale();
  const [state, setState] = useState<TestState>("idle");
  const [message, setMessage] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const capture = useTestVoiceCapture();
  const [recording, setRecording] = useState(false);
  const active = useRef<ReturnType<typeof serviceRequest> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stopCapture = capture.stop;
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const stop = () => {
      controller.current?.abort();
      active.current?.dispose(); active.current = null;
      clearTimeout(timer.current); clearTimeout(deadline.current); void stopCapture();
      setState("idle"); setMessage(""); setAudio(null); setRecording(false);
    };
    // serviceRequest aborts automatically on identity / relevant configuration changes.
    window.addEventListener("octos:client-services-reset", stop);
    const changed = (event: Event) => { if ((event as CustomEvent).detail === capability) stop(); };
    window.addEventListener("octos:client-service-changed", changed);
    return () => {
      controller.current?.abort(); active.current?.dispose(); clearTimeout(timer.current); clearTimeout(deadline.current); void stopCapture();
      window.removeEventListener("octos:client-services-reset", stop);
      window.removeEventListener("octos:client-service-changed", changed);
    };
  }, [capability, stopCapture]);
  function finish(request: ReturnType<typeof serviceRequest>) {
    request.dispose();
    if (active.current === request) { active.current = null; clearTimeout(timer.current); clearTimeout(deadline.current); }
  }
  function fail(error: unknown, request: ReturnType<typeof serviceRequest>) {
    if (!request.signal.aborted) { setRecording(false); setState("failed"); setMessage(serviceFailure(capability, error, false).message); }
    finish(request);
  }
  async function test() {
    unlockAudio();
    controller.current?.abort();
    const nextController = new AbortController();
    // serviceRequest may initialize the identity scope and notify reset listeners.
    // Publish this test's controller only after that reset so it cannot cancel itself.
    const request = serviceRequest(nextController.signal, capability);
    controller.current = nextController;
    active.current = request; setState("testing"); setMessage(""); setAudio(null); setRecording(false);
    deadline.current = setTimeout(() => {
      if (active.current !== request) return;
      controller.current?.abort(); finish(request); void capture.stop();
      setRecording(false); setState("failed"); setMessage(tr("Test timed out. Check your connection and try again."));
    }, 60_000);
    try {
      const saved = await getServiceForTest(capability, request.signal, draft.revision === "draft" ? undefined : draft.revision);
      if (!saved || (!saved.key && !saved.has_credential) || saved.local_credential === false) throw new ServiceError("unconfigured", tr("Add your API key in API Keys first."));
      if (draft.revision !== "draft" && saved.revision !== draft.revision) throw new ServiceError("network_error", tr("Configuration changed. Reload Voice before testing."));
      if (request.signal.aborted) return;
      const config: ClientService = { ...saved, ...draft, enabled: true, key: saved.key };
      validateService(capability, config);
      if (capability === "asr") {
        setMessage(tr("Preparing microphone… Allow access if your browser asks."));
        let claimed = false;
        const ok = await capture.start(wav => {
          if (claimed || request.signal.aborted) return;
          claimed = true; clearTimeout(timer.current); void capture.stop();
          setRecording(false); setMessage(tr("Recognizing…"));
          void transcribeDirect(wav, request.signal, config).then(result => {
            if (!request.signal.aborted) { setState("success"); setMessage(result.transcript || tr("No speech detected. Try a short sentence again.")); }
            finish(request);
          }).catch(error => fail(error, request));
        });
        if (request.signal.aborted) return;
        if (!ok) throw new ServiceError("environment_unsupported", capture.getError?.() || tr("Microphone initialization failed. Check the audio runtime and your device permissions, then retry."));
        if (!claimed && active.current === request) {
          setRecording(true); setMessage(capture.manualAvailable ? tr("Microphone is on. Say a sentence, then pause, or choose Finish and recognize.") : tr("Microphone is on. Say a sentence, then pause to recognize."));
          timer.current = setTimeout(() => {
            const input = capture.getInputState();
            controller.current?.abort(); finish(request); void capture.stop(); setRecording(false); setState("idle");
            setMessage(!capture.manualAvailable ? tr("No completed speech segment was received. Check your device input and try speaking a short sentence again.") : input.samples === 0 ? tr("No microphone audio reached the recorder. Check your browser's selected input device and try again.") : input.peak < 0.001 ? tr("Recording stopped: the microphone input was silent or very quiet. Check the selected input device and speak closer to it.") : tr("Recording stopped without detecting the end of a sentence. Try again and choose Finish and recognize after speaking. No recognition request was sent."));
          }, 20_000);
        }
        return;
      }
      if (capability === "tts") {
        const blob = await synthesizeDirect(tr("这是你的课堂旁白。"), request.signal, config);
        if (request.signal.aborted) return;
        setAudio(blob);
        const played = await playAudioBlob(blob, () => {}, request.signal);
        if (!request.signal.aborted) { setState("success"); setMessage(played ? tr("Voice synthesized and played successfully.") : tr("Audio is ready. Use Play sample to listen.")); }
      } else {
        const response = await directJson("admission", config, { model: config.params.model, state: tr("学习勾股定理"), questions: { learning: { type: "noul", instructions: tr("这是一项学习请求。") } } }, request.signal);
        const result = JSON.parse(response.body) as { answers?: { learning?: { noul?: number } } };
        if (typeof result.answers?.learning?.noul !== "number") throw new ServiceError("network_error", tr("Invalid Jev response."));
        if (!request.signal.aborted) { markVerified(capability, config); setState("success"); setMessage(tr("Jev connected successfully.")); }
      }
      finish(request);
    } catch (error) { fail(error, request); }
  }
  function cancel() { controller.current?.abort(); if (active.current) finish(active.current); void capture.stop(); setRecording(false); setState("idle"); setMessage(tr("Test canceled.")); }
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={disabled && state !== "testing"} onClick={() => void (state === "testing" ? cancel() : test())} className={buttonClass}>
        {state === "testing" ? <Square size={14} /> : capability === "asr" ? <Mic size={14} /> : <Plug size={14} />}
        {state === "testing" ? tr("Stop test") : capability === "tts" ? tr("Test voice") : capability === "asr" ? tr("Test microphone") : tr("Test connection")}
      </button>
      {recording && capture.manualAvailable && <button type="button" disabled={!capture.canFinish} className={buttonClass} onClick={capture.finish}>{tr("Finish and recognize")}</button>}
      {audio && <button type="button" disabled={state === "testing"} className={buttonClass} onClick={() => { unlockAudio(); void playAudioBlob(audio, () => {}, controller.current?.signal); }}><Play size={14} />{tr("Play sample")}</button>}
      {state === "testing" && !recording && <Loader2 size={14} className="animate-spin text-accent" aria-label={tr("Testing")} />}
    </div>
    {recording && <div className="space-y-2 text-xs text-muted">
      <div className="flex items-center gap-2"><Mic size={14} className="text-accent" /><span>{capture.speechDetected ? tr("Speech detected — pause or finish to recognize.") : tr("Listening — speak now.")}</span></div>
      {capture.manualAvailable && <label className="flex items-center gap-3">{tr("Microphone input level")}<meter aria-label={tr("Microphone input level")} className="h-3 flex-1" min={0} max={1} value={capture.inputLevel} /></label>}
      {capture.manualAvailable && !capture.hasFrames && <p>{tr("Waiting for microphone audio…")}</p>}
    </div>}
    {message && <p role={state === "failed" ? "alert" : "status"} className={`flex items-start gap-2 text-xs leading-5 ${state === "failed" ? "text-red-400" : "text-muted"}`}>
      {state === "failed" ? <XCircle size={14} className="mt-0.5 shrink-0" /> : state === "success" ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-green-400" /> : null}{message}
    </p>}
  </div>;
}
