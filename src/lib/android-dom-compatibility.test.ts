import { afterEach, describe, expect, it, vi } from "vitest";
import { installAndroidDomCompatibility } from "./android-dom-compatibility";

const prototypes = [Element.prototype, Document.prototype, DocumentFragment.prototype];
const descriptors = prototypes.map(p => Object.getOwnPropertyDescriptor(p, "replaceChildren"));
const uuidDescriptor = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
afterEach(() => {
  vi.restoreAllMocks();
  if (uuidDescriptor) Object.defineProperty(crypto, "randomUUID", uuidDescriptor);
  else Reflect.deleteProperty(crypto, "randomUUID");
});
afterEach(() => prototypes.forEach((p, i) => {
  if (descriptors[i]) Object.defineProperty(p, "replaceChildren", descriptors[i]!);
  else Reflect.deleteProperty(p, "replaceChildren");
}));

describe("Android DOM compatibility", () => {
  it("supplies secure UUIDs for committed ink and preserves native UUID support", () => {
    Object.defineProperty(crypto, "randomUUID", { configurable: true, writable: true, value: undefined });
    const entropy = vi.spyOn(crypto, "getRandomValues");
    installAndroidDomCompatibility();
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).not.toBe(second);
    expect(entropy).toHaveBeenCalledTimes(2);
    const native = vi.fn(() => first);
    crypto.randomUUID = native;
    installAndroidDomCompatibility();
    expect(crypto.randomUUID).toBe(native);
  });
  it("preserves a supported engine's native methods", () => {
    const native = Element.prototype.replaceChildren;
    installAndroidDomCompatibility();
    expect(Element.prototype.replaceChildren).toBe(native);
  });

  it("replaces and clears children, preserving moved nodes and event listeners", () => {
    prototypes.forEach(p => Reflect.deleteProperty(p, "replaceChildren"));
    installAndroidDomCompatibility();
    const element = document.createElement("div");
    const button = document.createElement("button");
    let clicked = false;
    button.addEventListener("click", () => { clicked = true; });
    element.append(button, "old");
    element.replaceChildren("new", button);
    expect(element.textContent).toBe("new");
    expect(element.lastChild).toBe(button);
    button.click();
    expect(clicked).toBe(true);
    element.replaceChildren();
    expect(element.childNodes.length).toBe(0);
    const fragment = document.createDocumentFragment();
    fragment.replaceChildren("fragment", element);
    expect(fragment.textContent).toBe("fragment");
    expect(fragment.lastChild).toBe(element);
  });
});
