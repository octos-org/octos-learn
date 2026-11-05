// While a learner watches their lesson, the order strip of the card playing:
// the sentence being said and the action just done are lit, so the learner
// can check each part of what they recorded. A sentence plays from there
// when clicked.

import { tr } from "@/i18n";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cardSequence } from "./card-script";
import type { CompiledLesson } from "./compile-recording";
import type { LessonCard } from "./lesson-cards";
import type { LearnerRecording } from "./recording";
import { ICONS } from "./sequence-bar";
import type { OllLessonRuntimeController } from "../oll/use-oll-lesson-runtime";

const FOLDED_KEY = "octos-learn:watch-sequence-folded";

const beatKeyOf = (beatId: string) => beatId.slice(beatId.lastIndexOf(":beat:") + ":beat:".length);

function readFolded(): boolean {
  try { return localStorage.getItem(FOLDED_KEY) === "1"; } catch { return false; }
}

export interface WatchSequenceProps {
  recording: LearnerRecording;
  compiled: CompiledLesson;
  cards: LessonCard[];
  runtime: OllLessonRuntimeController | null;
  /** Before playing from a sentence, e.g. so narration may start on this click. */
  onJump?: () => void;
}

export function WatchSequence({ recording, compiled, cards, runtime, onJump }: WatchSequenceProps) {
  const [folded, setFolded] = useState(readFolded);
  // The action just done stays lit until the next one, within its card.
  const [done, setDone] = useState<{ card: string; id: string } | null>(null);
  const track = useRef<HTMLOListElement>(null);

  const beatId = runtime?.currentBeatId;
  const beat = beatId ? compiled.beatSpeech?.[beatKeyOf(beatId)] : undefined;
  const playingCard = beat?.card ?? cards[0]?.key;
  const card = recording.cards.find((candidate) => candidate.key === playingCard);
  const sequence = card ? cardSequence(card) : undefined;
  const speaking = beat && runtime?.activeSpeech ? `sentence:${beat.sentences?.[0] ?? -1}` : undefined;

  const operation = runtime?.currentOperation;
  const startedOver = Boolean(runtime && runtime.cursor === 0);
  useEffect(() => {
    if (startedOver) { setDone(null); return; }
    if (operation?.type !== "action.apply" || !operation.action || !beat) return;
    const place = operation.action.action_id.slice(operation.action.action_id.lastIndexOf(":action:") + ":action:".length);
    const source = compiled.actionSources?.[place];
    const card = beat.card;
    if (source) setDone((previous) => (previous?.card === card && previous.id === source ? previous : { card, id: source }));
  }, [operation, compiled, beat, startedOver]);

  const lit = [speaking, done?.card === playingCard ? done.id : undefined];
  // The lit block scrolls into the middle of the strip.
  useEffect(() => {
    const strip = track.current;
    const target = strip?.querySelector<HTMLElement>("[data-lit]");
    if (!strip || !target) return;
    const left = target.offsetLeft - strip.clientWidth / 2 + target.offsetWidth / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [lit[0], lit[1], folded]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!card || !sequence) return null;
  const cardNumber = recording.cards.indexOf(card) + 1;
  const fold = (value: boolean) => {
    setFolded(value);
    try { localStorage.setItem(FOLDED_KEY, value ? "1" : "0"); } catch { /* Only a convenience. */ }
  };
  const playSentence = (index: number) => {
    const key = Object.entries(compiled.beatSpeech ?? {}).find(([, speech]) => speech.card === card.key && speech.sentences?.[0] === index)?.[0];
    const id = key && cards.flatMap((entry) => entry.beatIds).find((candidate) => beatKeyOf(candidate) === key);
    if (!id || !runtime) return;
    // What was done before the jump no longer says where the lesson is.
    setDone(null);
    onJump?.();
    runtime.playBeat(id);
  };

  return (
    <section className="teach-sequence teach-watch-sequence" data-folded={folded || undefined} aria-label={tr("第 {{v0}} 张的顺序", { v0: cardNumber })}>
      <header className="teach-sequence-head">
        <button type="button" className="teach-sequence-toggle" aria-expanded={!folded} onClick={() => fold(!folded)}>
          {folded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          {tr("第 {{v0}} 张的顺序", { v0: cardNumber })}
        </button>
        {!folded && <p className="teach-sequence-note">{tr("正在讲的话和刚做的动作会亮起来。点一句话，从那里开始看。")}</p>}
      </header>
      {!folded && (
        <ol ref={track} className="teach-sequence-track">
          {sequence.map((item) => {
            const on = lit.includes(item.id) || undefined;
            if (item.kind === "action") {
              const Icon = ICONS[item.action];
              return (
                <li key={item.id} className="teach-sequence-slot">
                  <div className="teach-sequence-block" data-action data-readonly data-lit={on} data-item={item.id} aria-current={on ? "step" : undefined}>
                    <Icon size={16} aria-hidden="true" /><span>{item.label}</span>
                  </div>
                </li>
              );
            }
            return (
              <li key={item.id} className="teach-sequence-slot">
                <div className="teach-sequence-block" data-sentence data-lit={on} data-item={item.id} aria-current={on ? "step" : undefined}>
                  <MessageSquare size={16} aria-hidden="true" />
                  <button type="button" className="teach-sequence-words" title={tr("从这句开始看")}
                    aria-label={tr("第 {{v0}} 句：{{v1}}。从这句开始看", { v0: item.index + 1, v1: item.text || tr("（没听清）") })}
                    onClick={() => playSentence(item.index)}>
                    {item.text || <span className="academy-muted">{tr("（没听清）")}</span>}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
