import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DeveloperTab } from "./developer-tab";

describe("DeveloperTab", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("renders the master debug mode switch and sub-feature toggles", () => {
    render(<DeveloperTab />);

    expect(screen.getByText(/Developer Options/i)).toBeTruthy();
    expect(screen.getByTestId("toggle-debug-mode")).toBeTruthy();
    expect(screen.getByTestId("toggle-jev-debugger")).toBeTruthy();
    expect(screen.getByTestId("toggle-trace-inspector")).toBeTruthy();
    expect(screen.getByTestId("reset-debug-settings")).toBeTruthy();
  });

  it("toggles master debug mode and updates status pill", () => {
    render(<DeveloperTab />);

    const masterSwitch = screen.getByTestId("toggle-debug-mode");
    // Initially in test mode, master switch is checked or unchecked
    const initialChecked = masterSwitch.getAttribute("aria-checked") === "true";

    fireEvent.click(masterSwitch);
    expect(masterSwitch.getAttribute("aria-checked")).toBe(String(!initialChecked));

    const pill = screen.getByTestId("debug-mode-status-pill");
    expect(pill.textContent).toContain(!initialChecked ? "已开启" : "已停用");
  });

  it("toggles Jev admission debugger sub-switch", () => {
    render(<DeveloperTab />);

    // Ensure master switch is ON
    const masterSwitch = screen.getByTestId("toggle-debug-mode");
    if (masterSwitch.getAttribute("aria-checked") !== "true") {
      fireEvent.click(masterSwitch);
    }

    const jevSwitch = screen.getByTestId("toggle-jev-debugger");
    const jevPill = screen.getByTestId("jev-debugger-status-pill");

    expect(jevSwitch.getAttribute("aria-checked")).toBe("true");
    expect(jevPill.textContent).toContain("已在白板显示");

    fireEvent.click(jevSwitch);
    expect(jevSwitch.getAttribute("aria-checked")).toBe("false");
    expect(jevPill.textContent).toContain("已隐藏");
  });

  it("disables sub-switches when master debug mode is turned off", () => {
    render(<DeveloperTab />);

    const masterSwitch = screen.getByTestId("toggle-debug-mode");
    if (masterSwitch.getAttribute("aria-checked") === "true") {
      fireEvent.click(masterSwitch);
    }

    const jevSwitch = screen.getByTestId("toggle-jev-debugger");
    expect(jevSwitch.hasAttribute("disabled")).toBe(true);

    const traceSwitch = screen.getByTestId("toggle-trace-inspector");
    expect(traceSwitch.hasAttribute("disabled")).toBe(true);
  });
});
