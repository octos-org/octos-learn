export type ImpulseMode = "peak" | "short";
export interface ImpulseMeter {
  peak: number;
  recentPeak: number;
  status: "off" | "warming" | "quiet" | "below" | "background" | "checking" | "long" | "hit" | "listening";
}
export const EMPTY_IMPULSE_METER: ImpulseMeter = { peak: 0, recentPeak: 0, status: "off" };

export class ImpulseCapture {
  private generation = 0;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;

  setThreshold(threshold: number): void { this.node?.port.postMessage({ threshold }); }
  setMode(mode: ImpulseMode): void { this.node?.port.postMessage({ mode }); }

  async start(threshold: number, onLevel: (level: ImpulseMeter) => void, onImpulse: (time: number, mode: ImpulseMode) => void, onEnded: () => void, mode: ImpulseMode = "peak"): Promise<boolean> {
    this.stop();
    const generation = this.generation;
    try {
      // Resume during the click gesture, before waiting for microphone access.
      const context = new AudioContext();
      this.context = context;
      await context.resume();
      if (generation !== this.generation) return false;
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      } });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return false; }
      this.stream = stream;
      stream.getTracks().forEach(track => track.addEventListener("ended", () => {
        if (generation === this.generation) { this.stop(); onEnded(); }
      }, { once: true }));
      await context.audioWorklet.addModule(new URL("./impulse-processor.js", import.meta.url).href);
      if (generation !== this.generation) return false;
      const node = new AudioWorkletNode(context, "octos-impulse");
      this.node = node;
      this.setThreshold(threshold);
      this.setMode(mode);
      node.port.onmessage = event => {
        if (generation !== this.generation) return;
        if (event.data.type === "level") onLevel({ peak: event.data.peak, recentPeak: event.data.recentPeak, status: event.data.status });
        if (event.data.type === "impulse") {
          onImpulse(performance.now() - (context.currentTime - event.data.time) * 1000, event.data.mode);
        }
      };
      this.source = context.createMediaStreamSource(stream);
      this.source.connect(node);
      node.connect(context.destination);
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.stop();
      throw error;
    }
  }

  stop(): void {
    this.generation++;
    if (this.node) { this.node.port.onmessage = null; this.node.disconnect(); this.node.port.close(); }
    this.node = null;
    this.source?.disconnect(); this.source = null;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    void this.context?.close().catch(() => undefined); this.context = null;
  }
}
