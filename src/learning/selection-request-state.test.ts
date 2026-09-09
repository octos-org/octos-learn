import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelectionRequestState } from "./selection-request-state";

afterEach(() => vi.restoreAllMocks());

describe("selection request delivery", () => {
  beforeEach(() => localStorage.clear());

  it("blocks discovered files before RPC success and permanently after timeout", () => {
    const requests = new SelectionRequestState("session");
    requests.begin("first");
    expect(requests.canConsume("first")).toBe(false);
    requests.timeout("first");
    expect(requests.accept("first")).toBe(false);
    const restored = new SelectionRequestState("session");
    expect(restored.canConsume("first")).toBe(false);
    restored.begin("retry");
    expect(restored.accept("retry")).toBe(true);
    expect(restored.canConsume("retry")).toBe(true);
    expect(restored.canConsume("first")).toBe(false);
  });

  it("retains accepted and legacy results without crossing session boundaries", () => {
    const requests = new SelectionRequestState("a");
    requests.begin("turn");
    requests.accept("turn");
    requests.timeout("turn");
    expect(new SelectionRequestState("a").canConsume("turn")).toBe(true);
    requests.begin("expired");
    requests.timeout("expired");
    expect(new SelectionRequestState("b").canConsume("expired")).toBe(true);
    expect(requests.canConsume("legacy")).toBe(true);
  });

  it("blocks delivery after a reload while the RPC outcome is unknown", () => {
    new SelectionRequestState("a").begin("turn");
    expect(new SelectionRequestState("a").canConsume("turn")).toBe(false);
  });

  it("reads a timeout persisted by another instance", () => {
    const first = new SelectionRequestState("a");
    const second = new SelectionRequestState("a");
    first.begin("turn");
    second.timeout("turn");
    expect(first.accept("turn")).toBe(false);
  });
});


it("failed acceptance persistence never opens the consumption gate", () => {
  localStorage.clear();
  const requests = new SelectionRequestState("write-failure");
  requests.begin("turn");
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  expect(() => requests.accept("turn")).toThrow("quota");
  expect(requests.canConsume("turn")).toBe(false);
  expect(() => requests.timeout("turn")).toThrow("quota");
  expect(requests.canConsume("turn")).toBe(false);
  write.mockRestore();
  expect(new SelectionRequestState("write-failure").canConsume("turn")).toBe(false);
});
