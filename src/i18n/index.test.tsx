import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getLocale, initialLocale, initLocale, localizedCatalog, LOCALE_STORAGE_KEY, normalizeLocale, setLocale, tr } from "./index";
import en from "./messages/en.json";
import zh from "./messages/zh.json";
import { memoryGroup } from "../learning/memory/memory-entries";
import { LanguageSwitch } from "./language-switch";
import { useLocale } from "./use-locale";

afterEach(() => { cleanup(); localStorage.removeItem(LOCALE_STORAGE_KEY); setLocale("en-US", false); });

describe("language preference", () => {
  it("keeps translated catalogs live, cloneable, and independent of stored IDs", () => {
    const data = localizedCatalog({ id: "voice", title: "Voice", formerNames: ["阿澜"], rows: ["开始互动"] });
    setLocale("zh-CN", false);
    expect(data.title).toBe("语音");
    setLocale("en-US", false);
    expect(data.title).toBe("Voice");
    expect(data.id).toBe("voice");
    expect(data.formerNames).toEqual(["阿澜"]);
    expect(structuredClone(data).rows).toEqual(["Start interacting"]);
    expect(memoryGroup("阿澜老师用图讲解")).toBe("alan");
    expect(memoryGroup("Only for Alan: explain using diagrams")).toBe("alan");
    expect(memoryGroup("For all teachers: use examples")).toBe("all");
  });

  it("has matching resources and interpolation variables in both languages", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    const tokens = (message: string) => [...message.matchAll(/\{\{\w+\}\}|\{(?:topic|name|target|days)\}/g)].map(match => match[0]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) expect(tokens(en[key]), key).toEqual(tokens(zh[key]));
    expect(tr("课程主题 {{v0}}", { v0: 2 }, "en-US")).toBe("Lesson topic 2");
  });
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
