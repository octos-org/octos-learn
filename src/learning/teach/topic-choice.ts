// A learner may teach any topic. Typing a topic suggests matching stars from
// the star map; choosing one makes the topic "on the map", lit when the learner
// already has activity on it. Anything else is a free topic the learner marks
// as maths or not. No model is involved.

import type { RecordingTopic } from "./recording";

export interface TopicCandidate {
  starTopicId: string;
  name: string;
  lit: boolean;
}

export type TopicChoice =
  | { kind: "star"; starTopicId: string; name: string; lit: boolean }
  | { kind: "free"; text: string; isMath: boolean };

function normalise(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
}

function score(name: string, query: string): number {
  const haystack = normalise(name);
  if (haystack === query) return 4;
  if (haystack.includes(query)) return 3;
  const words = haystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const tokens = query.split(" ").filter(Boolean);
  if (tokens.length && tokens.every((token) => words.some((word) => word.startsWith(token)))) return 2;
  return 0;
}

/**
 * Stars whose name in any supplied language matches the query, best first.
 * `labels` gives the name to show for each star in the learner's language.
 */
export function searchStarTopics(
  query: string,
  namesByLanguage: ReadonlyArray<Readonly<Record<string, string>>>,
  labels: Readonly<Record<string, string>>,
  litTopicIds: ReadonlySet<string>,
  limit = 6,
): TopicCandidate[] {
  const normalised = normalise(query);
  if (!normalised) return [];
  const best = new Map<string, number>();
  for (const names of namesByLanguage) {
    for (const [id, name] of Object.entries(names)) {
      const value = score(name, normalised);
      if (value > (best.get(id) ?? 0)) best.set(id, value);
    }
  }
  return [...best.entries()]
    .sort(([leftId, left], [rightId, right]) => right - left
      || Number(litTopicIds.has(rightId)) - Number(litTopicIds.has(leftId))
      || (labels[leftId] ?? leftId).localeCompare(labels[rightId] ?? rightId))
    .slice(0, limit)
    .map(([id]) => ({ starTopicId: id, name: labels[id] ?? id, lit: litTopicIds.has(id) }));
}

export function topicFromChoice(choice: TopicChoice): RecordingTopic {
  if (choice.kind === "star") {
    return { text: choice.name, type: choice.lit ? "on_map_lit" : "on_map_unlit", starTopicId: choice.starTopicId };
  }
  return { text: choice.text.trim(), type: choice.isMath ? "math_off_map" : "other" };
}
