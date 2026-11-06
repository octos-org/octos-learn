// A presenter character saying hello when it is picked: one of its prepared
// lines in its own voice, its mouth following the clip, with a nod and a smile.
// Characters that are not speaking keep their idle motion and blinks.

import { useCallback, useEffect, useRef, useState } from "react";

import { getLocale } from "@/i18n";
import { neutralFrame, type FaceFrame } from "../avatar/face-frame";
import { lipSyncFrame, type LipSyncTrack } from "../avatar/lip-sync";
import { preparePreviewAudio } from "../avatar/prepare-preview-audio";
import { greetingLocale, loadGreetingsManifest, nextGreeting, type Greeting, type GreetingsManifest } from "./presenter-greetings";
import { PRESENTER_AVATARS, type PresenterCharacterId } from "./presenters";

/** Each character's idle tempo (faster is livelier) and phase, so the four never move in step. */
const IDLE: Record<string, { tempo: number; phase: number; glance: number }> = {
  "star-fox": { tempo: 1.15, phase: 0, glance: 0.2 },
  "red-panda": { tempo: 0.85, phase: 1.7, glance: 0.14 },
  "white-rabbit": { tempo: 1.3, phase: 3.1, glance: 0.22 },
  "moon-cat": { tempo: 0.7, phase: 4.6, glance: 0.16 },
};
const smoothstep = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/**
 * A character at rest: a glance to one side now and then and a soft smile;
 * with `head`, also a breathing sway and the head turning with the glance.
 * Head motion re-warps the whole portrait every frame, so only the chosen
 * character moves its head. Untracked, so the painter adds its own blinks.
 */
export function idleFrame(avatar: string, now: number, head = true): FaceFrame {
  const { tempo, phase, glance } = IDLE[avatar] ?? IDLE["star-fox"]!;
  const t = (now / 1000) * tempo + phase;
  const breathe = Math.sin((2 * Math.PI * t) / 3.6), sway = Math.sin((2 * Math.PI * t) / 5.3 + 0.8);
  // Every 7 s: turn (0.6 s), hold (1.1 s), return (0.7 s); alternate sides.
  const cycle = t % 7, side = Math.floor(t / 7) % 2 ? 1 : -1;
  const look = cycle < 0.6 ? smoothstep(cycle / 0.6) : cycle < 1.7 ? 1 : smoothstep(1 - (cycle - 1.7) / 0.7);
  const yaw = side * glance * look;
  const smile = 0.12 + 0.08 * Math.max(0, Math.sin((2 * Math.PI * t) / 9));
  return {
    ...neutralFrame(now), tracked: false,
    channels: {
      mouthSmileLeft: smile, mouthSmileRight: smile,
      // Eyes lead the head a little in the direction of the glance.
      eyeLookOutLeft: side < 0 ? 0.35 * look : 0, eyeLookInRight: side < 0 ? 0.35 * look : 0,
      eyeLookInLeft: side > 0 ? 0.35 * look : 0, eyeLookOutRight: side > 0 ? 0.35 * look : 0,
    },
    rotation: head ? [0.03 * breathe, yaw, 0.035 * sway] : [0, 0, 0],
  };
}

export interface PresenterGreeting {
  /** Changes with every greeting. */
  id: number;
  avatar: PresenterCharacterId;
  text: string;
  /** "playing" while its clip plays; "silent" when the line has no clip or it cannot play. */
  state: "loading" | "playing" | "silent";
}

/** How long a greeting shows when there is no sound to follow. */
const SILENT_MS = 2600;
/** The nod at the start of a greeting. */
const NOD_MS = 650;

interface Clip { url: string; track: LipSyncTrack | null }
/** A character's next line, its clip fetched ahead so a pick can start it inside the click. */
interface Prepared { greeting: Greeting; clip: Promise<Clip> | null; ready: Clip | null }

interface Playing {
  id: number;
  avatar: PresenterCharacterId;
  startedAt: number;
  audio: HTMLAudioElement | null;
  track: LipSyncTrack | null;
  endedAt: number | null;
}

async function loadClip(url: string): Promise<Clip> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("clip_unavailable");
  const bytes = await response.arrayBuffer();
  // The mouth follows the clip's loudness; without it the character still nods and smiles.
  const track = await preparePreviewAudio(bytes, new AbortController().signal).catch(() => null);
  return { url: URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" })), track };
}

export function usePresenterGreeting() {
  const [current, setCurrent] = useState<PresenterGreeting | null>(null);
  const playing = useRef<Playing | null>(null);
  const manifest = useRef<GreetingsManifest | null>(null);
  const prepared = useRef(new Map<PresenterCharacterId, Prepared>());
  const lastLine = useRef(new Map<PresenterCharacterId, string>());
  const urls = useRef<string[]>([]);
  const counter = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prepare = useCallback((avatar: PresenterCharacterId) => {
    const greeting = nextGreeting(avatar, greetingLocale(getLocale()), manifest.current, lastLine.current.get(avatar) ?? null);
    const entry: Prepared = { greeting, clip: null, ready: null };
    if (greeting.clipUrl) {
      entry.clip = loadClip(greeting.clipUrl);
      entry.clip.then((clip) => { urls.current.push(clip.url); entry.ready = clip; }, () => undefined);
    }
    prepared.current.set(avatar, entry);
  }, []);

  useEffect(() => {
    let active = true;
    const owned = urls.current;
    void loadGreetingsManifest().then((loaded) => {
      if (!active) return;
      manifest.current = loaded;
      for (const avatar of PRESENTER_AVATARS) prepare(avatar.id);
    });
    return () => {
      active = false;
      if (timer.current) clearTimeout(timer.current);
      playing.current?.audio?.pause();
      playing.current = null;
      for (const url of owned) URL.revokeObjectURL(url);
    };
  }, [prepare]);

  const finish = useCallback((id: number, after: number) => {
    if (timer.current) clearTimeout(timer.current);
    if (playing.current?.id === id) playing.current.endedAt = performance.now();
    // The smile settles for a moment after the words end.
    timer.current = setTimeout(() => {
      if (playing.current?.id !== id) return;
      playing.current = null;
      setCurrent((greeting) => (greeting?.id === id ? null : greeting));
    }, after);
  }, []);

  const play = useCallback((state: Playing, text: string, clip: Clip) => {
    const audio = new Audio(clip.url);
    state.audio = audio; state.track = clip.track;
    audio.onended = () => finish(state.id, 500);
    audio.play().then(
      () => { if (playing.current?.id === state.id) setCurrent({ id: state.id, avatar: state.avatar, text, state: "playing" }); else audio.pause(); },
      () => { if (playing.current?.id !== state.id) return; state.audio = null; setCurrent({ id: state.id, avatar: state.avatar, text, state: "silent" }); finish(state.id, SILENT_MS); },
    );
  }, [finish]);

  const greet = useCallback((avatar: PresenterCharacterId) => {
    if (timer.current) clearTimeout(timer.current);
    playing.current?.audio?.pause();
    const id = ++counter.current;
    const state: Playing = { id, avatar, startedAt: performance.now(), audio: null, track: null, endedAt: null };
    playing.current = state;
    if (!prepared.current.has(avatar)) prepare(avatar);
    const next = prepared.current.get(avatar)!;
    const { text } = next.greeting;
    lastLine.current.set(avatar, text);
    prepare(avatar);
    setCurrent({ id, avatar, text, state: next.clip ? "loading" : "silent" });
    if (next.ready) { play(state, text, next.ready); return; }
    if (!next.clip) { finish(id, SILENT_MS); return; }
    // Picked before its clip arrived: play it as soon as it does.
    next.clip.then(
      (clip) => { if (playing.current?.id === id) play(state, text, clip); },
      () => { if (playing.current?.id !== id) return; setCurrent({ id, avatar, text, state: "silent" }); finish(id, SILENT_MS); },
    );
  }, [prepare, play, finish]);

  /** The face to draw for a character at this moment: its idle motion, and its greeting when it is the one speaking. */
  const frame = useCallback((avatar: string, now: number, chosen: boolean): FaceFrame => {
    const idle = idleFrame(avatar, now, chosen);
    const greeting = playing.current;
    if (!greeting || greeting.avatar !== avatar) return idle;
    const since = now - greeting.startedAt;
    const nod = since > 0 && since < NOD_MS ? Math.sin((since / NOD_MS) * Math.PI) : 0;
    const settling = greeting.endedAt === null ? 1 : Math.max(0, 1 - (now - greeting.endedAt) / 500);
    const smile = Math.min(1, Math.max(0, since) / 200) * settling * 0.55;
    const audio = greeting.audio;
    const mouth = audio && greeting.track && !audio.paused ? lipSyncFrame(greeting.track, audio.currentTime * 1000, true).channels : {};
    // Facing the learner while it speaks: the idle glance fades out.
    const facing = 1 - settling;
    return {
      ...idle,
      channels: { ...idle.channels, ...mouth, mouthSmileLeft: Math.max(smile, idle.channels.mouthSmileLeft ?? 0), mouthSmileRight: Math.max(smile, idle.channels.mouthSmileRight ?? 0),
        cheekSquintLeft: smile * 0.4, cheekSquintRight: smile * 0.4, browInnerUp: 0.15 * settling + 0.3 * nod,
        eyeLookOutLeft: (idle.channels.eyeLookOutLeft ?? 0) * facing, eyeLookInRight: (idle.channels.eyeLookInRight ?? 0) * facing,
        eyeLookInLeft: (idle.channels.eyeLookInLeft ?? 0) * facing, eyeLookOutRight: (idle.channels.eyeLookOutRight ?? 0) * facing },
      // A small nod, then a slight friendly tilt while speaking.
      rotation: [idle.rotation[0] + 0.12 * nod, idle.rotation[1] * facing, idle.rotation[2] - 0.05 * settling * Math.min(1, Math.max(0, since) / 400)],
    };
  }, []);

  return { current, greet, frame };
}
