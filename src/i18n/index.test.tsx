import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getLocale, initialLocale, initLocale, LOCALE_STORAGE_KEY, normalizeLocale, setLocale } from "./index";
import { LanguageSwitch } from "./language-switch";
import { useLocale } from "./use-locale";

afterEach(() => { cleanup(); localStorage.removeItem(LOCALE_STORAGE_KEY); setLocale("en-US", false); });

describe("language preference", () => {
  it("normalizes browser languages and honours an explicit device choice", () => {
    expect(normalizeLocale("zh-TW")).toBe("zh-CN");
    expect(normalizeLocale("en-GB")).toBe("en-US");
    expect(normalizeLocale("fr")).toBe("en-US");
    localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");
    expect(initialLocale()).toBe("zh-CN");
  });

  it("switches language without remounting a page or losing unsaved input", () => {
    const mounted = vi.fn(), disposed = vi.fn();
    function Page() {
      const locale = useLocale();
      const [draft, setDraft] = useState("");
      useEffect(() => { mounted(); return disposed; }, []);
      return <><LanguageSwitch /><output>{locale}</output><input aria-label="draft" value={draft} onChange={event => setDraft(event.target.value)} /></>;
    }
    setLocale("en-US", false);
    render(<Page />);
    const input = screen.getByLabelText("draft");
    fireEvent.change(input, { target: { value: "x² + 1" } });
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(getLocale()).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("zh-CN");
    expect(screen.getByLabelText("draft")).toBe(input);
    expect((input as HTMLInputElement).value).toBe("x² + 1");
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(disposed).not.toHaveBeenCalled();
  });

  it("applies another tab's preference without writing back", () => {
    initLocale();
    localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: LOCALE_STORAGE_KEY })));
    expect(getLocale()).toBe("zh-CN");
  });
});
