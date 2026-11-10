/* global AudioWorkletProcessor, registerProcessor, currentTime, sampleRate */
// Runs on audio blocks, so a short click cannot fall between video frames.
class ImpulseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.threshold = 0.008;
    this.mode = "peak";
    this.floor = 0.0002;
    this.active = null;
    this.lastImpulse = -1;
    this.lastMeter = -1;
    this.previous = 0;
    this.filtered = 0;
    this.started = null;
    this.windowPeak = 0;
    this.windowRms = 0;
    this.heldPeak = 0;
    this.decision = null;
    this.decisionAt = -1;
    this.port.onmessage = event => {
      const threshold = Number(event.data.threshold);
      if (Number.isFinite(threshold)) this.threshold = Math.min(0.4, Math.max(0.001, threshold));
      if (["peak", "short"].includes(event.data.mode) && event.data.mode !== this.mode) {
        this.mode = event.data.mode;
        this.active = null;
      }
    };
  }

  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!samples?.length) return true;
    let peak = 0;
    let energy = 0;
    for (const value of samples) {
      // Remove low frequency rumble; this is an impulse heuristic, not VAD.
      this.filtered = value - this.previous + 0.95 * this.filtered;
      this.previous = value;
      peak = Math.max(peak, Math.abs(this.filtered));
      energy += this.filtered * this.filtered;
    }
    const rms = Math.sqrt(energy / samples.length);
    const end = currentTime + samples.length / sampleRate;
    this.started ??= currentTime;
    const warming = currentTime - this.started < 0.25;
    this.windowPeak = Math.max(this.windowPeak, peak);
    this.windowRms = Math.max(this.windowRms, rms);
    if (warming) {
      this.floor = Math.max(0.000001, this.floor + (rms - this.floor) * 0.08);
    } else if (!this.active && peak >= this.threshold && rms > this.floor * 2.2 && currentTime - this.lastImpulse > 0.35) {
      this.active = { start: currentTime, lastLoud: end, cutoff: Math.max(this.floor * 1.8, rms * 0.25), rejected: false };
      // Loose mode verifies capture and onset without waiting for room echoes
      // to decay. It is deliberately not a sound-class recognition result.
      if (this.mode === "peak") {
        this.port.postMessage({ type: "impulse", time: currentTime, mode: this.mode });
        this.lastImpulse = end; this.decision = "hit"; this.decisionAt = end;
      }
    }
    if (this.active) {
      if (rms >= this.active.cutoff) this.active.lastLoud = end;
      const quiet = end - this.active.lastLoud >= 0.012;
      const duration = this.active.lastLoud - this.active.start;
      if (quiet) {
        if (this.mode === "short" && !this.active.rejected && duration <= 0.18) {
          this.port.postMessage({ type: "impulse", time: this.active.start, mode: this.mode });
          this.lastImpulse = end; this.decision = "hit"; this.decisionAt = end;
        }
        this.active = null;
      } else if (end - this.active.start > 0.18) {
        // Stay latched until silence; don't reinterpret the tail of a long
        // sound as a fresh short sound when it eventually ends.
        this.active.rejected = true;
        if (this.mode === "short") { this.decision = "long"; this.decisionAt = end; }
      }
    } else if (!warming) {
      this.floor = Math.max(0.000001, this.floor + (rms - this.floor) * 0.015);
    }
    if (currentTime - this.lastMeter >= 0.05) {
      // Aggregate every audio block, rather than sampling one block each tick.
      // Keep a decaying peak so a 5 ms snap remains visible to the user.
      this.heldPeak = Math.max(this.windowPeak, this.heldPeak * 0.92);
      const status = warming ? "warming" : end - this.decisionAt < 0.8 && this.decision ? this.decision
        : this.active ? "checking" : this.windowPeak < 0.00001 ? "quiet"
        : this.windowPeak < this.threshold ? "below" : this.windowRms <= this.floor * 2.2 ? "background" : "listening";
      this.port.postMessage({ type: "level", peak: this.windowPeak, recentPeak: this.heldPeak, status });
      this.lastMeter = currentTime; this.windowPeak = 0; this.windowRms = 0;
    }
    // Output remains silent: microphone audio is never played back or stored.
    return true;
  }
}
registerProcessor("octos-impulse", ImpulseProcessor);
