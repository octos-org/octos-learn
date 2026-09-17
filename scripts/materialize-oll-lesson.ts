import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AuthoringLesson } from "octos-lesson-language";
import {
  materializeOllLesson,
  type OllLessonMaterializationOptions,
} from "../src/learning/oll/oll-materialization";

function argumentsFrom(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--") continue;
    if (!name?.startsWith("--")) throw new Error(`Unexpected argument '${name}'`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for '${name}'`);
    result[name.slice(2)] = value;
    index += 1;
  }
  return result;
}

function required(values: Record<string, string>, name: string): string {
  const value = values[name]?.trim();
  if (!value) throw new Error(`Missing required --${name} <value>`);
  return value;
}

const values = argumentsFrom(process.argv.slice(2));
const sourcePath = resolve(required(values, "authoring"));
const outputPath = resolve(required(values, "output"));
const baseRevision = Number.parseInt(values["base-revision"] ?? "0", 10);
if (!Number.isInteger(baseRevision) || baseRevision < 0) {
  throw new Error("--base-revision must be a non-negative integer");
}
const regionIntent = values["region-intent"] ?? "new_topic";
if (regionIntent !== "new_topic" && regionIntent !== "continue_topic") {
  throw new Error("--region-intent must be new_topic or continue_topic");
}
const options: OllLessonMaterializationOptions = {
  lessonId: required(values, "lesson-id"),
  boardId: required(values, "board-id"),
  baseRevision,
  regionIntent,
  regionId: required(values, "region-id"),
};
const authoring = JSON.parse(await readFile(sourcePath, "utf8")) as AuthoringLesson;
const events = materializeOllLesson(authoring, options);
await writeFile(
  outputPath,
  `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify({
  status: "materialized",
  input: sourcePath,
  output: outputPath,
  events: events.length,
  ...options,
})}\n`);
