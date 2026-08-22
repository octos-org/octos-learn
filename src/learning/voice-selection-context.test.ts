import { describe, expect, it } from "vitest";
import { pendingVoiceSelectionFiles } from "./voice-selection-context";

describe("pendingVoiceSelectionFiles", () => {
  it("keeps a pending selection available until speech is admitted", () => {
    const file = new File(["selection"], "selection.png", {
      type: "image/png",
    });
    const pending = { file };

    expect(pendingVoiceSelectionFiles(pending)).toEqual([file]);
    expect(pendingVoiceSelectionFiles(pending)).toEqual([file]);
  });
});
