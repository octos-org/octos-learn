// While a learner records: how loud the microphone hears them, and whether
// their words are being heard or turned into text, so they know it works.

import { tr } from "@/i18n";
import { Mic, MicOff } from "lucide-react";
import { useSyncExternalStore } from "react";

export interface MicState {
  /** Null while the microphone is starting. */
  listening: boolean | null;
  speaking: boolean;
  /** Finished sentences still being turned into text. */
  transcribing: number;
}

/** The microphone's input level from 0 to 1, updated at most ten times a second. */
export class InputLevel {
  private value = 0;
  private updatedAt = 0;
  private readonly listeners = new Set<() => void>();

  push(frame: Float32Array): void {
    const rms = Math.sqrt(frame.reduce((sum, sample) => sum + sample * sample, 0) / Math.max(1, frame.length));
    const now = performance.now();
    if (now - this.updatedAt < 100) return;
    this.updatedAt = now;
    // Speech sits around 0.02–0.1 RMS; the meter reads it as a third to full.
    this.value = Math.min(1, rms * 12);
    for (const listener of this.listeners) listener();
  }

  reset(): void {
    this.value = 0;
    this.updatedAt = 0;
    for (const listener of this.listeners) listener();
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly get = () => this.value;
}

export function MicStatus({ state, level }: { state: MicState; level: InputLevel }) {
  const value = useSyncExternalStore(level.subscribe, level.get);
  const status = state.listening === null ? tr("正在打开麦克风…")
    : !state.listening ? tr("麦克风没有打开")
      : state.speaking ? tr("正在听你说…")
        : state.transcribing ? tr("正在把你的话变成文字…")
          : tr("在听，开始说吧");
  const Icon = state.listening === false ? MicOff : Mic;
  return (
    <div className="teach-mic" data-speaking={state.speaking || undefined}>
      <Icon size={16} aria-hidden="true" />
      <meter aria-label={tr("麦克风音量")} min={0} max={1} value={state.listening ? value : 0} />
      <span role="status">{status}</span>
    </div>
  );
}
