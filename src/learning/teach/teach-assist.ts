// Model help while a learner records: Octo's question after a card, reading
// handwritten math for "Make it neat", and the review after the last card.
// The model sees what the learner said and short descriptions of the board,
// never names or other personal details.

import { invokeSkillAction, type SkillActionInvokeResponse } from "@/api/skill-actions";
import { uploadFiles } from "@/api/chat";

import type { CompiledLesson } from "./compile-recording";
import { keptTake, currentTake, type LearnerRecording } from "./recording";

export interface TeachCardSummary {
  key: string;
  title: string;
  said: string;
  board: string[];
}

export interface CardReview {
  key: string;
  status: "good" | "check";
  kind: "none" | "slip" | "misconception" | "unclear";
  message: string;
}

export interface LessonReview {
  cards: CardReview[];
  overall: string;
}

export interface InkToMath {
  latex: string;
  confidence: "high" | "medium" | "low";
  readable: boolean;
}

/** One assist session per recording; Octos creates it on first use. */
export function teachAssistSessionId(recording: LearnerRecording): string {
  return `teach-${recording.id}`;
}

type Action = Record<string, unknown> & { do: string };

function fragments(content: Record<string, unknown>): string {
  return ((content.fragments as Array<{ latex?: string }> | undefined) ?? []).map((fragment) => fragment.latex ?? "").join(" ");
}

/** What one compiled card shows on the board, in short phrases a reviewer can check. */
export function describeActions(actions: Action[]): string[] {
  const lines: string[] = [];
  for (const action of actions) {
    const content = (action.content ?? {}) as Record<string, unknown>;
    if (action.do === "write") {
      const place = action.place as { relation?: string; anchor?: string } | undefined;
      if (action.kind === "ink") lines.push(place?.relation === "annotates" ? `handwriting drawn on ${place.anchor}` : "handwriting");
      else if (action.kind === "math") lines.push(`math${place?.relation === "replaces" ? " (made neat from the handwriting)" : ""}: ${fragments(content)}`);
      else if (action.kind === "plot") {
        const curves = ((content.curves as Array<{ expression?: string }> | undefined) ?? []).map((curve) => `y = ${curve.expression}`);
        const points = ((content.points as Array<{ label?: string; x?: number; y?: number }> | undefined) ?? []).filter((point) => point.label !== "now")
          .map((point) => (point.label?.includes("(") ? point.label : `${point.label ?? ""} (${point.x}, ${point.y})`.trim()));
        lines.push(`graph ${action.as}: ${[...curves, ...points].join(", ")}`);
      } else if (action.kind === "geometry") {
        const points = ((content.points as Array<{ label?: string; visible?: boolean }> | undefined) ?? []).filter((point) => point.visible !== false && point.label);
        const circle = Array.isArray(content.circles) && content.circles.length > 0;
        lines.push(circle ? `unit circle ${action.as} with a draggable angle` : `coordinate grid ${action.as}${points.length ? ` with points ${points.map((point) => point.label).join(", ")}` : ""}`);
      } else if (action.kind === "scene3d") {
        const size = ((content.objects as Array<{ size?: { x: number; y: number; z: number } }> | undefined) ?? [])[0]?.size;
        lines.push(size ? `3D box ${action.as}: ${size.x} × ${size.y} × ${size.z}` : `3D scene ${action.as}`);
      }
    } else if (action.do === "revise") {
      const points = ((content.points as Array<{ label?: string; visible?: boolean }> | undefined) ?? []).filter((point) => point.visible !== false && point.label);
      lines.push(`${action.target} now shows points ${points.map((point) => point.label).join(", ")}`);
    } else if (action.do === "animate") lines.push(`moves ${action.variable} to ${Math.round(Number(action.value) * 100) / 100}`);
    else if (action.do === "view") lines.push(`turns ${action.target} to the ${action.preset ?? "shown"} view`);
    else if (action.do === "point") lines.push(`points at ${action.target}`);
    else if (action.do === "emphasize") lines.push(`highlights ${action.target}`);
    else if (action.do === "connect") lines.push(`arrow from ${action.from} to ${action.to}${action.label ? ` (${action.label})` : ""}`);
    else if (action.do === "hide") lines.push(`hides ${action.target}`);
  }
  return lines.slice(0, 24);
}

/** Every recorded card as the learner said and showed it. */
export function cardSummaries(recording: LearnerRecording, compiled: CompiledLesson | null): TeachCardSummary[] {
  const beats = new Map((compiled?.lesson.steps[0]?.beats ?? []).map((beat) => [beat.key, beat]));
  const tasks = compiled?.lesson.lesson.tasks ?? [];
  return recording.cards.flatMap((card) => {
    const take = keptTake(card) ?? currentTake(card);
    if (!take) return [];
    const board = describeActions((beats.get(card.key)?.actions ?? []) as unknown as Action[]);
    const task = tasks.find((candidate) => (candidate as { as?: string }).as === `task-${card.key}`) as { completion?: { expression?: string; value?: number } } | undefined;
    if (task?.completion) board.push(`exercise for viewers: make ${task.completion.expression} equal ${task.completion.value}`);
    return [{ key: card.key, title: card.title, said: take.text ?? "", board }];
  });
}

function lessonContext(recording: LearnerRecording, language: string) {
  return { language, topic: recording.topic.text, topic_type: recording.topic.type, goals: recording.goals };
}

function metadata(response: SkillActionInvokeResponse, field: string): Record<string, unknown> {
  const failed = (response.results ?? []).find((result) => !result.success);
  if (!response.ok || failed) throw new Error(failed?.output?.trim() || "The assist request failed");
  const value = (response.results ?? []).map((result) => result.structured_metadata as Record<string, unknown> | undefined).find((entry) => entry?.[field]);
  if (!value) throw new Error("The assist reply is missing");
  return value[field] as Record<string, unknown>;
}

function turnId(recording: LearnerRecording, purpose: string): string {
  return `teach-${purpose}-${recording.id}-${Date.now()}`;
}

/** Octo, as a curious student, asks one question about the card just recorded. */
export async function askOcto(recording: LearnerRecording, compiled: CompiledLesson | null, cardKey: string, language: string): Promise<string> {
  const cards = cardSummaries(recording, compiled);
  const response = await invokeSkillAction(teachAssistSessionId(recording), "learning.teach.octo-question", {
    turn_id: turnId(recording, "octo"), lesson: lessonContext(recording, language), cards, card_key: cardKey,
  });
  const question = metadata(response, "teach_octo_question").question;
  if (typeof question !== "string" || !question.trim()) throw new Error("Octo's question is empty");
  return question.trim();
}

/** Card-by-card feedback on the whole lesson. */
export async function reviewLesson(recording: LearnerRecording, compiled: CompiledLesson | null, language: string): Promise<LessonReview> {
  const response = await invokeSkillAction(teachAssistSessionId(recording), "learning.teach.review", {
    turn_id: turnId(recording, "review"), lesson: lessonContext(recording, language), cards: cardSummaries(recording, compiled),
  });
  const review = metadata(response, "teach_review") as unknown as LessonReview;
  if (!Array.isArray(review.cards) || typeof review.overall !== "string") throw new Error("The review is incomplete");
  return review;
}

/** Draws snapshot SVG onto a white PNG, the format the recognition model reads. */
export async function inkPng(svg: string, width: number, height: number): Promise<Blob> {
  const scale = Math.min(4, Math.max(1, 640 / Math.max(width, height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Cannot draw the handwriting");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Cannot draw the handwriting"))), "image/png"));
}

/** Reads the learner's handwritten math as LaTeX, exactly as written, for them to confirm. */
export async function inkToMath(recording: LearnerRecording, ink: { svg: string; width: number; height: number }, language: string): Promise<InkToMath> {
  const png = await inkPng(ink.svg, ink.width, ink.height);
  const [path] = await uploadFiles([new File([png], "handwriting.png", { type: "image/png" })], "upload");
  if (!path) throw new Error("The handwriting could not be uploaded");
  const response = await invokeSkillAction(teachAssistSessionId(recording), "learning.teach.ink-to-math", {
    paths: [path], turn_id: turnId(recording, "ink"), lesson: { language },
  });
  const result = metadata(response, "teach_ink_to_math") as unknown as InkToMath;
  if (typeof result.latex !== "string" || typeof result.readable !== "boolean") throw new Error("The handwriting could not be read");
  return result;
}
