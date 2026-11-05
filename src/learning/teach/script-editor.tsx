// The card's script: what the learner said, one box per sentence, with the
// board actions between and during the sentences in the order they play.
// Tapping an action picks it up; tapping a place between sentences moves it
// there. Sentences can be corrected, split at the cursor, or joined.

import { tr } from "@/i18n";
import { ArrowDownToLine, Play, Scissors, Link2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { cardScript, gapOf, joinSentences, moveScriptChip, ScriptMoveError, splitSentence, type ScriptChip } from "./card-script";
import { correctSentence, type LearnerRecording, type RecordingCard } from "./recording";

export interface ScriptEditorProps {
  card: RecordingCard;
  label?: string;
  update: (change: (current: LearnerRecording) => LearnerRecording) => void;
  now: () => string;
  /** Why the lesson could not play the changed recording, or null when it can. */
  check: (before: LearnerRecording, after: LearnerRecording) => string | null;
  /** Where "play from this sentence" goes, for the sentence's index. */
  watchFrom?: (sentence: number) => string | undefined;
}

export function ScriptEditor({ card, label, update, now, check, watchFrom }: ScriptEditorProps) {
  const script = cardScript(card)!;
  const [values, setValues] = useState(script.sentences);
  const [picked, setPicked] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const boxes = useRef<Array<HTMLTextAreaElement | null>>([]);

  const changes = values.flatMap((value, index) => (value.trim() !== script.sentences[index] ? [{ index, text: value }] : []));
  const empty = values.every((value) => !value.trim());
  const saveWords = (current: LearnerRecording) => changes.reduce((next, change) => correctSentence(next, card.key, change.index, change.text, now()), current);

  /** Applies a change after the words being typed, unless the lesson could not play the result. */
  const apply = (change: (current: LearnerRecording) => LearnerRecording, after?: (current: LearnerRecording) => void) => {
    setProblem(null);
    update((current) => {
      try {
        const next = change(empty ? current : saveWords(current));
        const why = check(current, next);
        if (why) { setProblem(why); return current; }
        after?.(next);
        return next;
      } catch (error) {
        setProblem(error instanceof ScriptMoveError && error.reason === "order"
          ? tr("不能放在那里：动作要在它用到的东西之后，先写的笔画也要先出现。")
          : tr("这个改动做不了。"));
        return current;
      }
    });
  };
  const sentencesOf = (next: LearnerRecording) => cardScript(next.cards.find((candidate) => candidate.key === card.key)!)!.sentences;

  const chip = (item: ScriptChip) => (
    <button key={item.id} type="button" className="teach-script-chip" aria-pressed={picked === item.id}
      onClick={() => { setProblem(null); setPicked(picked === item.id ? null : item.id); }}>
      {item.label}
    </button>
  );
  const pickedChip = script.chips.find((item) => item.id === picked);
  const gap = (index: number) => {
    const here = script.chips.filter((item) => gapOf(item.slot) === index);
    const target = pickedChip && gapOf(pickedChip.slot) !== index;
    if (!here.length && !target) return null;
    return (
      <li key={`gap-${index}`} className="teach-script-gap">
        {here.map(chip)}
        {target && (
          <button type="button" className="teach-script-drop" onClick={() => apply((current) => moveScriptChip(current, card.key, picked!, index, now()), () => setPicked(null))}>
            <ArrowDownToLine size={14} aria-hidden="true" />{tr("放到这里")}
          </button>
        )}
      </li>
    );
  };

  return (
    <form className="teach-step teach-script" onSubmit={(event) => { event.preventDefault(); if (changes.length && !empty) apply((current) => current); }}>
      <fieldset className="teach-sentences-edit">
        <legend className="teach-label">{label ?? tr("你在这张卡片说的话")}</legend>
        <p className="academy-muted">{tr("点一个动作，再点“放到这里”，就能换它出现的地方。")}</p>
        <ol className="teach-sentences">
          {gap(0)}
          {values.map((value, index) => {
            const during = script.chips.filter((item) => item.slot.phase === "during" && item.slot.sentence === index);
            const from = watchFrom?.(index);
            return [
              <li key={`sentence-${index}`} className="teach-sentence teach-script-sentence">
                {during.length > 0 && <div className="teach-script-during"><span className="academy-muted">{tr("说这句时：")}</span>{during.map(chip)}</div>}
                <textarea ref={(element) => { boxes.current[index] = element; }} className="teach-input" rows={2} value={value}
                  aria-label={tr("第 {{v0}} 句", { v0: index + 1 })}
                  placeholder={tr("这句没听清，在这里写下你说的话。")}
                  onChange={(event) => setValues((current) => current.map((item, position) => (position === index ? event.target.value : item)))} />
                <div className="teach-script-tools">
                  <button type="button" className="teach-link-button" onClick={() => {
                    const at = boxes.current[index]?.selectionStart ?? 0;
                    apply((current) => splitSentence(current, card.key, index, at, now()), (next) => setValues(sentencesOf(next)));
                  }}><Scissors size={14} aria-hidden="true" />{tr("在光标处分开")}</button>
                  {index + 1 < values.length && (
                    <button type="button" className="teach-link-button" onClick={() => apply((current) => joinSentences(current, card.key, index, now()), (next) => setValues(sentencesOf(next)))}>
                      <Link2 size={14} aria-hidden="true" />{tr("和下一句合并")}
                    </button>
                  )}
                  {from && <Link className="teach-link-button" to={from}><Play size={14} aria-hidden="true" />{tr("从这句开始看")}</Link>}
                </div>
              </li>,
              gap(index + 1),
            ];
          })}
        </ol>
      </fieldset>
      {problem && <p role="alert" className="teach-notice">{problem}</p>}
      <button type="submit" disabled={!changes.length || empty}>{tr("保存字幕")}</button>
    </form>
  );
}
