import {
  normalizeAuthoringLesson,
  reduceCanonicalEvents,
  type AuthoringLesson,
  type CanonicalEvent,
} from "octos-lesson-language";

type JsonRecord = Record<string, unknown>;

const richerVisualKinds = new Set([
  "diagram",
  "geometry",
  "plot",
  "scene3d",
]);

function visitStrings(value: unknown, visit: (value: string) => void): void {
  if (typeof value === "string") {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => visitStrings(item, visit));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.values(value).forEach((item) => visitStrings(item, visit));
}

function normalizedFormulaKeys(value: string): string[] {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\\(?:left|right)/gu, "")
    .replace(/\\operatorname\{([^{}]+)\}/gu, "$1")
    .replace(/\\(?:mathrm|text)\{([^{}]+)\}/gu, "$1")
    .replace(/\\(?=(?:sin|cos|tan|cot|sec|csc|log|ln|exp)\b)/gu, "")
    .replace(/\\(?:cdot|times)/gu, "*")
    .replace(/[{}()[\]$\s,.;:，。；：]/gu, "")
    .replace(/[−–—]/gu, "-")
    .replace(/\\/gu, "");
  if (normalized.length < 3) return [];
  const equals = normalized.indexOf("=");
  const rhs = equals >= 0 ? normalized.slice(equals + 1) : "";
  return [...new Set([
    normalized,
    ...(rhs.length >= 3 ? [rhs] : []),
  ])];
}

function actionFormulaKeys(action: JsonRecord): string[] {
  const content = action.content;
  if (!content || typeof content !== "object") return [];
  const keys = new Set<string>();
  visitStrings(content, (value) => {
    normalizedFormulaKeys(value).forEach((key) => keys.add(key));
  });
  return [...keys];
}

/**
 * Drop only a provably redundant, unreferenced standalone formula when the
 * same expression is already carried by a richer visual in this lesson.
 */
export function removeRedundantStandaloneMath(
  authoring: AuthoringLesson,
): AuthoringLesson {
  const result = structuredClone(authoring);
  const actions = result.steps.flatMap((step) =>
    step.beats.flatMap((beat) => beat.actions));
  const visualFormulaKeys = new Set(actions.flatMap((action) => {
    const actionRecord = action as unknown as JsonRecord;
    return richerVisualKinds.has(
      typeof actionRecord.kind === "string" ? actionRecord.kind : "",
    )
      ? actionFormulaKeys(actionRecord)
      : [];
  }));
  if (visualFormulaKeys.size === 0) return result;

  const exactStringCounts = new Map<string, number>();
  visitStrings(result, (value) => {
    exactStringCounts.set(value, (exactStringCounts.get(value) ?? 0) + 1);
  });
  for (const step of result.steps) {
    for (const beat of step.beats) {
      const filteredActions = beat.actions.filter((action) => {
        if (action.do !== "write" || action.kind !== "math") return true;
        const alias = action.as;
        if (!alias || (exactStringCounts.get(alias) ?? 0) > 1) return true;
        const formulaKeys = actionFormulaKeys(action as unknown as JsonRecord);
        return !formulaKeys.some((key) => visualFormulaKeys.has(key));
      });
      // Authoring Profile requires every Beat to retain at least one action.
      // A duplicate formula can be the only action in an explanatory Beat
      // even when the richer visual appears in another Beat. Keep that formula
      // instead of turning a valid lesson into an invalid empty action list.
      if (filteredActions.length > 0) beat.actions = filteredActions;
    }
  }
  return result;
}

export interface OllLessonMaterializationOptions {
  lessonId: string;
  boardId: string;
  baseRevision: number;
  regionIntent: "new_topic" | "continue_topic";
  regionId: string;
}

/**
 * The single Authoring -> Canonical boundary used by both live lessons and
 * portable CoursePacks. Keep this function pure so pack builders can run the
 * same contract and parity tests can compare complete Canonical event streams.
 */
export function materializeOllLesson(
  source: AuthoringLesson,
  options: OllLessonMaterializationOptions,
): CanonicalEvent[] {
  const authoring = removeRedundantStandaloneMath(source);
  const events = normalizeAuthoringLesson(authoring, options);
  // A referenced lesson intentionally points at nodes created by earlier
  // artifacts. It can only be reduced after classroom composition.
  if (!authoring.board_context?.references.length) reduceCanonicalEvents(events);
  return events;
}

export function materializationOptionsFromCanonicalLesson(
  events: CanonicalEvent[],
): OllLessonMaterializationOptions {
  const open = events.find((event) => event.event === "lesson.open");
  if (!open?.board) throw new Error("Canonical lesson is missing lesson.open board metadata");
  const regionIntent = open.board.region_intent;
  if (regionIntent !== "new_topic" && regionIntent !== "continue_topic") {
    throw new Error("Canonical lesson has an invalid board region intent");
  }
  return {
    lessonId: open.lesson_id,
    boardId: open.board.board_id,
    baseRevision: open.board.base_revision,
    regionIntent,
    regionId: open.board.region_id ?? open.lesson_id,
  };
}

export function assertOllMaterializationParity(
  authoring: AuthoringLesson,
  packagedEvents: CanonicalEvent[],
): CanonicalEvent[] {
  const materialized = materializeOllLesson(
    authoring,
    materializationOptionsFromCanonicalLesson(packagedEvents),
  );
  if (JSON.stringify(materialized) !== JSON.stringify(packagedEvents)) {
    throw new Error(
      "CoursePack Canonical lesson differs from the live materialization pipeline",
    );
  }
  return materialized;
}
