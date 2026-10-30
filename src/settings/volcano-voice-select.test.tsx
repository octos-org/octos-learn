import { tr } from "@/i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VolcanoVoiceSelect } from "./volcano-voice-select";
const voices = [
  { id: "v2", name: "New voice", resourceIds: ["seed-tts-2.0"] },
  { id: "v1", name: "Older voice", resourceIds: ["seed-tts-1.0"] },
];
function mockCatalog() {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ version: 1, voices })));
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("Volcano voice catalog", () => {
  it("waits for a speech credential, loads without credentials and filters by resource", async () => {
    const fetcher = mockCatalog(); const changed = vi.fn();
    const view = render(<VolcanoVoiceSelect hasCredential={false} resourceId="seed-tts-2.0" value="v2" onChange={changed} />);
    expect(fetcher).not.toHaveBeenCalled(); expect(screen.getByRole("combobox")).toHaveProperty("disabled", true);
    view.rerender(<VolcanoVoiceSelect hasCredential resourceId="seed-tts-2.0" value="v2" onChange={changed} />);
    await screen.findByRole("option", { name: "New voice" });
    expect(screen.queryByRole("option", { name: "Older voice" })).toBeNull();
    expect(fetcher).toHaveBeenCalledWith("/voice-catalog/volcano.json", expect.objectContaining({ credentials: "omit" }));
    expect(changed).not.toHaveBeenCalled();
    view.rerender(<VolcanoVoiceSelect hasCredential resourceId="seed-tts-1.0" value="v1" onChange={changed} />);
    expect(screen.getByRole("option", { name: "Older voice" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "New voice" })).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("preserves unlisted or cloned IDs and changes them only on user input", async () => {
    mockCatalog(); const changed = vi.fn();
    render(<VolcanoVoiceSelect hasCredential resourceId="seed-tts-2.0" value="my-clone" onChange={changed} />);
    await screen.findByRole("option", { name: "New voice" });
    expect(screen.getByLabelText(tr("Custom Voice ID"))).toHaveProperty("value", "my-clone");
    expect(changed).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "v2" } });
    expect(changed).toHaveBeenCalledWith("v2");
  });
  it("retains a manual input when the catalog fails and supports retry", async () => {
    const fetcher = mockCatalog(); fetcher.mockRejectedValueOnce(new Error("offline"));
    render(<VolcanoVoiceSelect hasCredential resourceId="seed-tts-2.0" value="v2" onChange={vi.fn()} />);
    await screen.findByRole("alert");
    expect(screen.getByLabelText(tr("Custom Voice ID"))).toHaveProperty("value", "v2");
    fireEvent.click(screen.getByRole("button", { name: tr("Reload voices") }));
    await screen.findByRole("option", { name: "New voice" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("finishes loading with a useful timeout instead of a disabled selector", async () => {
    vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<VolcanoVoiceSelect hasCredential resourceId="seed-tts-2.0" value="" onChange={vi.fn()} />);
    await act(async () => {});
    await act(async () => { vi.advanceTimersByTime(8000); });
    expect(screen.getByRole("alert").textContent).toContain(tr("The voice list took too long to load. Retry or enter your voice ID."));
    expect(screen.getByRole("combobox")).toHaveProperty("disabled", false);
    expect(screen.getByLabelText(tr("Custom Voice ID"))).toBeTruthy();
  });
  it("rejects malformed catalogs without clearing the saved voice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ version: 1, voices: [null] }))));
    render(<VolcanoVoiceSelect hasCredential resourceId="seed-tts-2.0" value="saved" onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByLabelText(tr("Custom Voice ID"))).toHaveProperty("value", "saved");
  });
});
