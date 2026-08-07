import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OctosSkinArt } from "./octos-skin-art";

describe("OctosSkinArt", () => {
  afterEach(cleanup);

  it("keeps a matching SVG fallback when WebGL is unavailable", () => {
    const { container } = render(
      <OctosSkinArt
        skin="panda-3d"
        className="preview"
        activity="thinking"
      />,
    );

    expect(
      container.querySelector(".octos-model-art")?.getAttribute("data-failed"),
    ).toBe("true");
    expect(
      container.querySelector(".octos-avatar-art")?.getAttribute("data-skin"),
    ).toBe("scholar");
    expect(container.querySelector("model-viewer")).toBeNull();
  });
});
