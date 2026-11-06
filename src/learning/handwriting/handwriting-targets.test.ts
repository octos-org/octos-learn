import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HandwritingTargets } from "./handwriting-targets";
import type { HandwritingPointerAction } from "./handwriting-controller";

beforeEach(() => vi.stubGlobal("PointerEvent", MouseEvent));
afterEach(() => { document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const point = { x: 100, y: 100 };
const action = (type: HandwritingPointerAction["type"], reason: HandwritingPointerAction["reason"] = "release", x = 100): HandwritingPointerAction => ({ type, reason, point: { x, y: 100 }, timeMs: 0 });
function setup() {
  const shell = document.createElement("div");
  const viewport = document.createElement("div");
  const button = document.createElement("button");
  button.dataset.airCommand = "undo";
  shell.append(viewport, button);
  document.body.append(shell);
  viewport.getBoundingClientRect = () => ({ left: 0, top: 0 } as DOMRect);
  button.getBoundingClientRect = () => ({ left: 70, right: 130, top: 70, bottom: 130, width: 60, height: 60 } as DOMRect);
  const click = vi.fn(); button.addEventListener("click", click);
  const events: string[] = [];
  for (const type of ["pointerdown", "pointermove", "pointerup"]) viewport.addEventListener(type, () => events.push(type));
  const targets = new HandwritingTargets(viewport, 7);
  return { targets, button, click, events };
}
describe("capturing one hand action for one explicit target", () => {
  it("highlights on hover and runs a command once on intentional release", () => {
    const s = setup(); s.targets.hover(point);
    expect(s.button.hasAttribute("data-air-hover")).toBe(true);
    expect(s.click).not.toHaveBeenCalled();
    s.targets.dispatch([action("down"), action("move"), action("up"), action("up")], () => true, false);
    expect(s.click).toHaveBeenCalledTimes(1); expect(s.events).toEqual([]);
  });
  it.each(["lost", "stop"] as const)("cancels a command on %s", reason => {
    const s = setup(); s.targets.dispatch([action("down"), action("up", reason)], () => true, false);
    expect(s.click).not.toHaveBeenCalled();
  });
  it("cancels when the button disappears, becomes disabled or the hand leaves it", () => {
    const s = setup(); s.targets.dispatch([action("down")], () => true, false);
    s.button.disabled = true;
    s.targets.dispatch([action("up")], () => true, false);
    s.button.disabled = false;
    s.targets.dispatch([action("down"), action("up", "release", 200)], () => true, false);
    s.targets.dispatch([action("down")], () => true, false); s.button.remove();
    s.targets.dispatch([action("up")], () => true, false);
    expect(s.click).not.toHaveBeenCalled();
  });
  it("closes a board stroke even if an overlay appears on release", () => {
    const s = setup(); s.button.remove();
    s.targets.dispatch([action("down")], () => false, false);
    s.targets.dispatch([action("up")], () => true, false); s.targets.cancel();
    expect(s.events).toEqual(["pointerdown", "pointerup"]);
  });
  it("never transfers a stroke to a button crossed while drawing", () => {
    const s = setup(); s.targets.dispatch([action("down", "grip", 200)], () => false, false);
    s.targets.dispatch([action("move"), action("up")], () => true, false);
    expect(s.click).not.toHaveBeenCalled(); expect(s.events).toEqual(["pointerdown", "pointerup"]);
  });
  it("ignores unregistered controls and buttons belonging to a different board", () => {
    const s = setup(); delete s.button.dataset.airCommand;
    s.targets.dispatch([action("down"), action("up")], () => true, false);
    expect(s.click).not.toHaveBeenCalled(); expect(s.events).toEqual([]);
  });
  it("activates a tool as soon as pinch is recognized and consumes the whole pinch", () => {
    const s = setup(); s.button.dataset.airActivation = "press";
    s.targets.hover(point); s.targets.dispatch([action("down")], () => true, false);
    expect(s.click).toHaveBeenCalledTimes(1);
    s.targets.dispatch([action("move", "release", 200), action("up", "release", 200)], () => false, true);
    expect(s.click).toHaveBeenCalledTimes(1); expect(s.events).toEqual([]);
  });
  it("retains a highlighted target through small pinch-onset drift", () => {
    const s = setup(); s.targets.hover({ x: 128, y: 100 });
    s.targets.hover({ x: 135, y: 100 });
    expect(s.button.hasAttribute("data-air-hover")).toBe(true);
    s.targets.dispatch([action("down", "pinch", 135), action("up", "release", 138)], () => true, false);
    expect(s.click).toHaveBeenCalledTimes(1);
  });
  it("tolerates a release just outside the captured button", () => {
    const s = setup(); s.targets.dispatch([action("down"), action("up", "release", 138)], () => false, false);
    expect(s.click).toHaveBeenCalledTimes(1);
  });
  it("cancels a release over an adjacent control despite release tolerance", () => {
    const s = setup();
    const neighbor = document.createElement("button"); document.body.append(neighbor);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => s.button) });
    s.targets.dispatch([action("down")], () => true, false);
    vi.mocked(document.elementFromPoint).mockReturnValue(neighbor);
    s.targets.dispatch([action("up", "release", 138)], () => true, false);
    expect(s.click).not.toHaveBeenCalled();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("captures registered controls throughout the same page while excluding another page", () => {
    const s = setup();
    const scope = s.button.parentElement!;
    scope.dataset.airScope = "";
    const field = document.createElement("input");
    field.dataset.airCommand = "question-input";
    field.getBoundingClientRect = s.button.getBoundingClientRect;
    s.button.remove(); scope.append(field);
    s.targets.hover(point);
    expect(field.hasAttribute("data-air-hover")).toBe(true);
    s.targets.dispatch([action("down"), action("up")], () => true, false);
    expect(document.activeElement).toBe(field);
    expect(s.events).toEqual([]);
    const other = document.createElement("button"); other.dataset.airCommand = "home";
    other.getBoundingClientRect = field.getBoundingClientRect; document.body.append(other);
    const click = vi.fn(); other.addEventListener("click", click);
    field.remove(); s.targets.dispatch([action("down"), action("up")], () => true, false);
    expect(click).not.toHaveBeenCalled();
  });

  it("keeps a hovered course range in the variable path instead of treating it as a text field", () => {
    const s = setup(); s.button.remove();
    const range = document.createElement("input"); range.type = "range"; range.dataset.airVariable = "theta";
    range.getBoundingClientRect = s.button.getBoundingClientRect;
    document.body.firstElementChild!.firstElementChild!.append(range);
    s.targets.hover(point, true);
    expect(range.hasAttribute("data-air-hover")).toBe(true);
    s.targets.dispatch([action("down")], () => true, true);
    expect(s.targets.capturingButton).toBe(false);
    expect(s.events).toEqual([]);
  });

});
