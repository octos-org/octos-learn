// While a learner watches their lesson, the playing card on two tracks: the
// sentences said above, the board actions below, each action under the
// sentence it plays with (or in the gap between two sentences). The sentence
// being said and the action just done are lit, so the learner can check each
// part of what they recorded. A sentence plays from there when clicked.

import { tr } from "@/i18n";
import { ChevronDown, ChevronUp, MessageSquare, Pointer } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cardTracks } from "./card-script";
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
  const track = useRef<HTMLDivElement>(null);

  const beatId = runtime?.currentBeatId;
  const beat = beatId ? compiled.beatSpeech?.[beatKeyOf(beatId)] : undefined;
  const playingCard = beat?.card ?? cards[0]?.key;
  const card = recording.cards.find((candidate) => candidate.key === playingCard);
  const columns = card ? cardTracks(card) : undefined;
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
  // The lit column scrolls into the middle of the tracks.
  useEffect(() => {
    const strip = track.current;
    const target = strip?.querySelector<HTMLElement>("[data-now]");
    if (!strip || !target) return;
    const left = target.offsetLeft - strip.clientWidth / 2 + target.offsetWidth / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [lit[0], lit[1], folded]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!card || !columns) return null;
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
  const title = tr("第 {{v0}} 张：说的话和动作", { v0: cardNumber });

  return (
    <section className="teach-sequence teach-watch-sequence" data-folded={folded || undefined} aria-label={title}>
      <header className="teach-sequence-head">
        <button type="button" className="teach-sequence-toggle" aria-expanded={!folded} onClick={() => fold(!folded)}>
          {folded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          {title}
        </button>
        {!folded && <p className="teach-sequence-note">{tr("上下对齐的会同时发生。点一句话，从那里开始看。")}</p>}
      </header>
      {!folded && (
        <div className="teach-tracks">
          <div className="teach-tracks-labels" aria-hidden="true">
            <span><MessageSquare size={14} />{tr("说")}</span>
            <span><Pointer size={14} />{tr("做")}</span>
          </div>
          <div ref={track} className="teach-tracks-scroll">
            <ol className="teach-tracks-columns">
              {columns.map((column, index) => {
                const sentence = column.sentence;
                const now = column.actions.some((action) => lit.includes(action.id)) || (sentence && lit.includes(sentence.id)) || undefined;
                return (
                  <li key={sentence?.id ?? `${column.place}:${index}`} className="teach-tracks-column" data-place={column.place} data-now={now}>
                    <div className="teach-tracks-speech">
                      {sentence ? (
                        <button type="button" className="teach-tracks-sentence" data-item={sentence.id} data-lit={lit.includes(sentence.id) || undefined}
                          aria-current={lit.includes(sentence.id) ? "step" : undefined} title={sentence.text || tr("从这句开始看")}
                          aria-label={tr("第 {{v0}} 句：{{v1}}。从这句开始看", { v0: sentence.index + 1, v1: sentence.text || tr("（没听清）") })}
                          onClick={() => playSentence(sentence.index)}>
                          <span className="teach-tracks-words">{sentence.text || <span className="academy-muted">{tr("（没听清）")}</span>}</span>
                        </button>
                      ) : <span className="teach-tracks-pause" aria-hidden="true" />}
                    </div>
                    <ul className="teach-tracks-actions" aria-label={sentence
                      ? tr("说第 {{v0}} 句时做的", { v0: sentence.index + 1 })
                      : column.place === "before" ? tr("开口之前做的") : tr("两句话之间做的")}>
                      {column.actions.map((action) => {
                        const Icon = ICONS[action.action];
                        const on = lit.includes(action.id) || undefined;
                        return (
                          <li key={action.id} className="teach-tracks-action" data-item={action.id} data-lit={on} aria-current={on ? "step" : undefined}>
                            <Icon size={14} aria-hidden="true" /><span>{action.label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
