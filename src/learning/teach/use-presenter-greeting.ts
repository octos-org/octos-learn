// A presenter character saying hello when it is picked: one of its prepared
// lines, in its own voice.

import { useCallback, useEffect, useRef, useState } from "react";

import { getLocale } from "@/i18n";
import { greetingLocale, loadGreetingsManifest, nextGreeting, type Greeting, type GreetingsManifest } from "./presenter-greetings";
import { PRESENTER_AVATARS, type PresenterCharacterId } from "./presenters";

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
/** How long the line stays after its clip ends. */
const AFTER_MS = 1200;

/** A character's next line, its clip fetched ahead so a pick can start it inside the click. */
interface Prepared { greeting: Greeting; clip: Promise<string> | null; ready: string | null }

async function loadClip(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("clip_unavailable");
  return URL.createObjectURL(await response.blob());
}

export function usePresenterGreeting() {
  const [current, setCurrent] = useState<PresenterGreeting | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const currentId = useRef(0);
  const manifest = useRef<GreetingsManifest | null>(null);
  const prepared = useRef(new Map<PresenterCharacterId, Prepared>());
  const lastLine = useRef(new Map<PresenterCharacterId, string>());
  const urls = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prepare = useCallback((avatar: PresenterCharacterId) => {
    const greeting = nextGreeting(avatar, greetingLocale(getLocale()), manifest.current, lastLine.current.get(avatar) ?? null);
    const entry: Prepared = { greeting, clip: null, ready: null };
    if (greeting.clipUrl) {
      entry.clip = loadClip(greeting.clipUrl);
      entry.clip.then((url) => { urls.current.push(url); entry.ready = url; }, () => undefined);
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
      audio.current?.pause();
      for (const url of owned) URL.revokeObjectURL(url);
    };
  }, [prepare]);

  const clearAfter = useCallback((id: number, after: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCurrent((greeting) => (greeting?.id === id ? null : greeting)), after);
  }, []);

  const play = useCallback((greeting: Omit<PresenterGreeting, "state">, url: string) => {
    const player = new Audio(url);
    audio.current = player;
    player.onended = () => clearAfter(greeting.id, AFTER_MS);
    player.play().then(
      () => { if (currentId.current === greeting.id) setCurrent({ ...greeting, state: "playing" }); else player.pause(); },
      () => { if (currentId.current !== greeting.id) return; setCurrent({ ...greeting, state: "silent" }); clearAfter(greeting.id, SILENT_MS); },
    );
  }, [clearAfter]);

  const greet = useCallback((avatar: PresenterCharacterId) => {
    if (timer.current) clearTimeout(timer.current);
    audio.current?.pause();
    const id = ++currentId.current;
    if (!prepared.current.has(avatar)) prepare(avatar);
    const next = prepared.current.get(avatar)!;
    const greeting = { id, avatar, text: next.greeting.text };
    lastLine.current.set(avatar, greeting.text);
    prepare(avatar);
    setCurrent({ ...greeting, state: next.clip ? "loading" : "silent" });
    if (next.ready) { play(greeting, next.ready); return; }
    if (!next.clip) { clearAfter(id, SILENT_MS); return; }
    // Picked before its clip arrived: play it as soon as it does.
    next.clip.then(
      (url) => { if (currentId.current === id) play(greeting, url); },
      () => { if (currentId.current !== id) return; setCurrent({ ...greeting, state: "silent" }); clearAfter(id, SILENT_MS); },
    );
  }, [prepare, play, clearAfter]);

  return { current, greet };
}
