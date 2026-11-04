import { useEffect, useRef, useState } from "react";
import { tr } from "@/i18n";
import { listAvatarClips, readAvatarClip, renameAvatarClip, saveAvatarClip, trashAvatarClip, type AvatarClipSummary } from "./performance-store";
import type { AvatarTrack } from "./performance-track";

export function AvatarClipLibrary({ profileId, track, disabled, sourceKey, onOpen }: {
  profileId: string;
  track: AvatarTrack | null;
  disabled: boolean;
  sourceKey: string;
  onOpen: (track: AvatarTrack) => void;
}) {
  const [clips, setClips] = useState<AvatarClipSummary[]>([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [trash, setTrash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const alive = useRef(false);
  // Also invalidate a read if recording starts, or a different source is chosen while it awaits storage.
  const selection = useRef({ track, disabled, sourceKey });
  useEffect(() => { selection.current = { track, disabled, sourceKey }; }, [track, disabled, sourceKey]);
  useEffect(() => {
    let current = true; alive.current = true;
    void listAvatarClips(profileId).then((items) => { if (current) setClips(items); })
      .catch(() => { if (current) setError(true); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; alive.current = false; };
  }, [profileId]);

  const run = async (operation: () => Promise<void>, success?: string) => {
    setBusy(true); setError(false); setMessage(null);
    try {
      await operation();
      const items = await listAvatarClips(profileId);
      if (alive.current) { setClips(items); if (success) setMessage(success); }
    } catch { if (alive.current) setError(true); }
    finally { if (alive.current) setBusy(false); }
  };
  const visible = clips.filter((clip) => Boolean(clip.deletedAt) === trash);
  const unavailable = busy || loading || disabled;
  return <section className="avatar-lab-library" aria-label={tr("本机表情片段库")}>
    <h2>{tr("本机表情片段库")}</h2>
    <p>{tr("点击保存后，片段会留在当前浏览器的当前账号下。不会上传；换浏览器或清除网站数据后需重新导入备份。")}</p>
    <form className="avatar-lab-actions" onSubmit={(event) => {
      event.preventDefault(); if (!track || unavailable || !name.trim()) return;
      const input = { id: crypto.randomUUID(), name, track };
      void run(async () => { await saveAvatarClip(profileId, input); if (alive.current) setName(""); }, tr("片段已保存在本机。"));
    }}>
      <label>{tr("片段名称")}<input type="text" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={tr("给这段表情起个名字")} disabled={unavailable} /></label>
      <button className="teach-secondary" type="submit" disabled={unavailable || !track || !name.trim()}>{tr("保存当前片段")}</button>
    </form>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{tr("片段库暂时无法读写，当前片段仍可导出备份。请检查浏览器存储空间后重试。")}</p>}
    <div className="avatar-lab-library-tabs">
      <button type="button" className="teach-secondary" aria-pressed={!trash} onClick={() => { setTrash(false); setEditing(null); }}>{tr("已保存片段")}</button>
      <button type="button" className="teach-secondary" aria-pressed={trash} onClick={() => { setTrash(true); setEditing(null); }}>{tr("片段回收站")}</button>
    </div>
    {loading ? <p role="status">{tr("正在读取本机片段…")}</p> : !visible.length ? <p>{trash ? tr("回收站是空的。") : tr("还没有保存的片段。可以先打开一个表情样例，再保存到这里。")}</p> : <ul>
      {visible.map((clip) => <li key={clip.id}>
        <div><strong>{clip.name}</strong><span>{(clip.durationMs / 1000).toFixed(1)} s · {clip.frameCount} {tr("帧")} · {clip.sources.map((source) => source === "demo" ? tr("合成演示") : source === "arkit" ? tr("Apple 捕捉") : tr("摄像头捕捉")).join(" / ")}</span></div>
        <div className="avatar-lab-actions">
          {trash ? <button type="button" className="teach-secondary" disabled={unavailable} onClick={() => void run(() => trashAvatarClip(profileId, clip.id, false), tr("片段已恢复。"))}>{tr("恢复片段")}</button> : <>
            <button type="button" className="teach-secondary" disabled={unavailable} onClick={() => {
              const expected = selection.current;
              void run(async () => { const value = await readAvatarClip(profileId, clip.id); if (alive.current && selection.current === expected && !expected.disabled) onOpen(value); });
            }}>{tr("打开片段")}</button>
            <button type="button" className="teach-secondary" disabled={unavailable} onClick={() => { setEditing(clip.id); setEditName(clip.name); }}>{tr("重命名片段")}</button>
            <button type="button" className="teach-secondary" disabled={unavailable} onClick={() => void run(() => trashAvatarClip(profileId, clip.id, true), tr("片段已移到回收站，可以恢复。"))}>{tr("移到回收站")}</button>
          </>}
        </div>
        {editing === clip.id && !trash && <form className="avatar-lab-actions" onSubmit={(event) => {
          event.preventDefault(); if (unavailable || !editName.trim()) return;
          void run(async () => { await renameAvatarClip(profileId, clip.id, editName); if (alive.current) setEditing(null); }, tr("片段名称已更新。"));
        }}><label>{tr("新的片段名称")}<input value={editName} maxLength={80} onChange={(event) => setEditName(event.target.value)} disabled={unavailable} /></label><button className="teach-secondary" disabled={unavailable || !editName.trim()} type="submit">{tr("保存名称")}</button><button className="teach-secondary" type="button" onClick={() => setEditing(null)}>{tr("取消")}</button></form>}
      </li>)}
    </ul>}
    {trash && <p>{tr("回收站中的片段仍保存在这台设备上，可随时恢复。")}</p>}
  </section>;
}
