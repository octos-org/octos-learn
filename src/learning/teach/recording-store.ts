// Draft recordings live on the device under the learner's profile until they
// are submitted. A damaged draft is locked rather than overwritten, so the
// learner's work can still be recovered.

import { loadRecoverableJson, writeRecoverableJson } from "../recoverable-storage";
import { LEARNER_RECORDING_SCHEMA, type LearnerRecording, type TopicType } from "./recording";

const TOPIC_TYPES: readonly TopicType[] = ["on_map_lit", "on_map_unlit", "math_off_map", "other"];
const TAKE_STATUSES = ["recording", "kept", "superseded"] as const;

export function recordingDraftsKey(profileId: string): string {
  return `octos-learn:learner-recordings:v1:${profileId}`;
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${what} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, what: string): string {
  if (typeof value !== "string") throw new Error(`${what} must be text`);
  return value;
}

function list(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${what} must be a list`);
  return value;
}

/** Validates the parts of a stored recording that the studio depends on. */
export function decodeRecording(value: unknown): LearnerRecording {
  const recording = record(value, "recording");
  if (recording.presenter !== undefined) {
    const presenter = record(recording.presenter, "presenter");
    if (presenter.mouthMotion !== undefined && presenter.mouthMotion !== "off" && presenter.mouthMotion !== "basic") throw new Error("Unknown mouth motion mode");
  }
  if (recording.schema !== LEARNER_RECORDING_SCHEMA) throw new Error("Unknown recording schema");
  text(recording.id, "id");
  text(recording.createdAt, "createdAt");
  text(recording.updatedAt, "updatedAt");
  const topic = record(recording.topic, "topic");
  text(topic.text, "topic.text");
  if (!TOPIC_TYPES.includes(topic.type as TopicType)) throw new Error("Unknown topic type");
  list(recording.goals, "goals").forEach((goal) => text(goal, "goal"));
  for (const cardValue of list(recording.cards, "cards")) {
    const card = record(cardValue, "card");
    text(card.key, "card.key");
    text(card.title, "card.title");
    if (card.kind !== "teach" && card.kind !== "your_turn") throw new Error("Unknown card kind");
    for (const takeValue of list(card.takes, "takes")) {
      const take = record(takeValue, "take");
      if (!TAKE_STATUSES.includes(take.status as (typeof TAKE_STATUSES)[number])) throw new Error("Unknown take status");
      list(take.events, "events").forEach((event) => {
        const fields = record(event, "event");
        if (typeof fields.t !== "number" || typeof fields.type !== "string") throw new Error("Invalid event");
      });
    }
  }
  return value as LearnerRecording;
}

function decodeDrafts(value: unknown): LearnerRecording[] {
  return list(value, "drafts").map(decodeRecording);
}

export function loadRecordingDrafts(storage: Storage, profileId: string): LearnerRecording[] {
  return loadRecoverableJson({
    storage,
    key: recordingDraftsKey(profileId),
    fallback: () => [],
    decode: decodeDrafts,
  });
}

/** Saves one draft, replacing the stored draft with the same id. Returns false when storage refuses. */
export function saveRecordingDraft(storage: Storage, profileId: string, recording: LearnerRecording): boolean {
  const drafts = loadRecordingDrafts(storage, profileId).filter((draft) => draft.id !== recording.id);
  return writeRecoverableJson(storage, recordingDraftsKey(profileId), [...drafts, recording]);
}

export function deleteRecordingDraft(storage: Storage, profileId: string, id: string): boolean {
  const drafts = loadRecordingDrafts(storage, profileId);
  return writeRecoverableJson(storage, recordingDraftsKey(profileId), drafts.filter((draft) => draft.id !== id));
}
