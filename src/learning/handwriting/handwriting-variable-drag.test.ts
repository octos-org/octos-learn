import { afterEach, describe, expect, it } from "vitest";
import { BrowserLessonSession, parseCanonicalJsonl, type StudentVariableInputEvent } from "octos-lesson-language/web-runtime";
import source from "../oll/fixtures/unit-circle-sine.canonical.jsonl?raw";
import type { OllLessonRuntimeController } from "../oll/use-oll-lesson-runtime";
import { HandwritingVariableDrag } from "./handwriting-variable-drag";

afterEach(() => { document.body.innerHTML = ""; });
function setup() {
  const session = new BrowserLessonSession(parseCanonicalJsonl(source), { load: () => undefined, save() {}, remove() {} }, "air-cancel-test");
  while (session.cursor < session.operations.length) session.advance();
  const alias = Object.keys(session.projection.board!.variables!)[0]!;
  const runtime = {
    get board() { return session.projection.board; }, playing: false,
    handleStudentVariableInput(name: string, value: number, event: StudentVariableInputEvent) {
      if (event.phase === "start") return session.beginStudentVariableOperation(name, { control: event.control, input: event.input });
      if (event.phase === "update") session.updateStudentVariableOperation(event.operation_id!, value);
      else session.commitStudentVariableOperation(event.operation_id!, value);
    },
  } as unknown as OllLessonRuntimeController;
  const input = document.createElement("input"); input.type = "range"; input.dataset.airVariable = alias;
  input.getBoundingClientRect = () => ({ left: 0, top: 80, width: 300, height: 40 } as DOMRect);
  document.body.append(input);
  const options = { getRuntime: () => runtime };
  const before = runtime.board!.variables![alias]!.value;
  return { session, runtime, input, alias, before, options };
}
describe("hand drags use the existing runtime operation transaction", () => {
  it("updates the graph live but records and evaluates only one final operation", () => {
    const s = setup(); const drag = HandwritingVariableDrag.start(s.input, { x: 150, y: 100 }, s.options)!;
    expect(drag).toBeTruthy(); drag.update({ x: 90, y: 100 });
    expect(s.runtime.board!.variables![s.alias]!.value).not.toBe(s.before);
    expect(s.session.studentOperations).toHaveLength(0);
    drag.end(true); drag.end(true);
    expect(s.session.studentOperations).toHaveLength(1);
    expect(s.session.studentOperations[0]).toMatchObject({ before: { value: s.before } });
  });
  it("restores the original value and leaves tasks and history unchanged when cancelled", () => {
    const s = setup(); const tasks = structuredClone(s.session.studentTasks);
    const drag = HandwritingVariableDrag.start(s.input, { x: 150, y: 100 }, s.options)!;
    drag.update({ x: 90, y: 100 }); drag.end(false);
    expect(s.runtime.board!.variables![s.alias]!.value).toBe(s.before);
    expect(s.session.studentOperations).toHaveLength(0);
    expect(s.session.studentTasks).toEqual(tasks);
    const next = HandwritingVariableDrag.start(s.input, { x: 150, y: 100 }, s.options)!;
    next.update({ x: 80, y: 100 }); next.end(true);
    expect(s.session.studentOperations).toHaveLength(1);
  });
  it("cancels if its target disappears", () => {
    const s = setup(); const drag = HandwritingVariableDrag.start(s.input, { x: 150, y: 100 }, s.options)!;
    drag.update({ x: 90, y: 100 }); s.input.remove(); drag.update({ x: 80, y: 100 }); drag.end(true);
    expect(s.runtime.board!.variables![s.alias]!.value).toBe(s.before);
    expect(s.session.studentOperations).toHaveLength(0);
  });
});
