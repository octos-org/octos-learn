import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AvatarClipLibrary } from "./avatar-clip-library";
import { expressionSample } from "./expression-samples";
import { listAvatarClips } from "./performance-store";

beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const track = expressionSample("mouth");
const open = (profileId = "one", onOpen = vi.fn()) => render(<AvatarClipLibrary key={profileId} profileId={profileId} track={track} disabled={false} sourceKey="replay" onOpen={onOpen} />);

it("saves, survives a remount, renames, moves to trash and restores a synthetic clip", async () => {
  const page = open();
  await screen.findByText("还没有保存的片段。可以先打开一个表情样例，再保存到这里。");
  fireEvent.change(screen.getByRole("textbox", { name: "片段名称" }), { target: { value: "排练一" } });
  fireEvent.click(screen.getByRole("button", { name: "保存当前片段" }));
  await screen.findByText("片段已保存在本机。");
  expect(screen.getByText("排练一")).toBeTruthy();
  page.unmount();
  const onOpen = vi.fn(); open("one", onOpen);
  await screen.findByText("排练一");
  fireEvent.click(screen.getByRole("button", { name: "打开片段" }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith(track));
  await waitFor(() => expect((screen.getByRole("button", { name: "重命名片段" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "重命名片段" }));
  fireEvent.change(screen.getByRole("textbox", { name: "新的片段名称" }), { target: { value: "改好的名字" } });
  fireEvent.click(screen.getByRole("button", { name: "保存名称" }));
  await screen.findByText("片段名称已更新。");
  fireEvent.click(screen.getByRole("button", { name: "移到回收站" }));
  await screen.findByText("片段已移到回收站，可以恢复。");
  expect(screen.queryByText("改好的名字")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "片段回收站" }));
  await screen.findByText("改好的名字");
  fireEvent.click(screen.getByRole("button", { name: "恢复片段" }));
  await screen.findByText("片段已恢复。");
  fireEvent.click(screen.getByRole("button", { name: "已保存片段" }));
  expect(await screen.findByText("改好的名字")).toBeTruthy();
});

it("shows a storage failure and keeps the current clip available to the caller", async () => {
  vi.stubGlobal("indexedDB", { open() { throw new Error("denied"); } });
  open();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(track.frames).toHaveLength(121);
  expect(screen.queryByText("片段已保存在本机。")).toBeNull();
});

it("does not carry a previous profile's clips into a new library", async () => {
  const page = open("one");
  await screen.findByText("还没有保存的片段。可以先打开一个表情样例，再保存到这里。");
  fireEvent.change(screen.getByRole("textbox", { name: "片段名称" }), { target: { value: "私有片段" } });
  fireEvent.click(screen.getByRole("button", { name: "保存当前片段" }));
  await screen.findByText("片段已保存在本机。");
  page.rerender(<AvatarClipLibrary key="two" profileId="two" track={null} disabled={false} sourceKey="idle" onOpen={vi.fn()} />);
  expect(await screen.findByText("还没有保存的片段。可以先打开一个表情样例，再保存到这里。")).toBeTruthy();
  expect(screen.queryByText("私有片段")).toBeNull();
  expect((await listAvatarClips("one"))[0]!.name).toBe("私有片段");
});
