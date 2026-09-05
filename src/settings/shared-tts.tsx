import { useEffect, useState } from "react";
import { request } from "@/api/client";
import { formatSettingsError } from "./settings-api";

export interface SharedTtsLimits {
  enabled: boolean;
  platform_monthly_chars: number;
  user_monthly_chars: number;
}
export interface SharedTtsStatus {
  configured: boolean;
  available: boolean;
  uses_platform: boolean;
  month: string;
  limits: SharedTtsLimits;
  user_used_chars: number;
  platform_used_chars?: number;
  can_manage: boolean;
}
export const fetchSharedTts = () =>
  request<SharedTtsStatus>("/api/learn/tts/status");

function HostedTtsPanel() {
  const [status, setStatus] = useState<SharedTtsStatus | null>(null);
  const [limits, setLimits] = useState<SharedTtsLimits | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      fetchSharedTts()
        .then((s) => {
          if (!cancelled) {
            setStatus(s);
            setLimits((previous) => previous ?? s.limits);
          }
        })
        .catch(() => {
          if (!cancelled)
            setMessage("暂时无法读取平台语音用量；个人 TTS 设置不受影响。");
        });
    void refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  async function save() {
    if (!limits) return;
    setSaving(true);
    setMessage("");
    try {
      await request("/api/learn/tts/limits", {
        method: "PUT",
        body: JSON.stringify(limits),
      });
      setStatus(await fetchSharedTts());
      setMessage("平台语音额度已更新，即刻生效。");
    } catch (e) {
      setMessage(formatSettingsError(e));
    } finally {
      setSaving(false);
    }
  }
  const number = (n: number) => n.toLocaleString("zh-CN");
  return (
    <section
      className="rounded-2xl border border-teal-700/20 bg-teal-50/60 p-5 text-slate-800"
      aria-label="平台旁白语音"
    >
      <h3 className="font-semibold">平台提供的旁白语音</h3>
      {status ? (
        <>
          <p className="mt-2 text-sm">
            {!status.configured
              ? "本站尚未提供默认 TTS。"
              : status.available
                ? "可用，无需填写 TTS 凭据。"
                : "平台语音已暂停或额度用完，文字旁白仍可使用。"}
          </p>
          <p className="mt-2 text-sm">
            本月已使用 {number(status.user_used_chars)} /{" "}
            {number(status.limits.user_monthly_chars)} 字符
          </p>
          <progress
            className="mt-2 w-full accent-teal-700"
            max={Math.max(1, status.limits.user_monthly_chars)}
            value={status.user_used_chars}
            aria-label="本月个人平台语音用量"
          />
          <p className="mt-2 text-xs">
            {status.month} · 每月 1 日 00:00 UTC
            重置。只统计平台代付的合成请求；个人凭据由你自己的账户计费。请求发出后即计入额度，失败或中断不自动返还，实际账单以火山控制台为准。
          </p>
          {status.can_manage && limits && (
            <fieldset className="mt-4 space-y-3 border-t border-teal-700/20 pt-4">
              <legend className="text-sm font-medium">管理员额度设置</legend>
              <p className="text-sm">
                平台本月已用 {number(status.platform_used_chars ?? 0)} /{" "}
                {number(status.limits.platform_monthly_chars)} 字符
              </p>
              <label className="block text-sm">
                <input
                  type="checkbox"
                  checked={limits.enabled}
                  onChange={(e) =>
                    setLimits({ ...limits, enabled: e.target.checked })
                  }
                />{" "}
                启用平台代付 TTS
              </label>
              <label className="block text-sm">
                平台每月字符上限
                <input
                  className="ml-3 w-36 rounded border bg-white p-2"
                  type="number"
                  min="0"
                  max="100000000"
                  step="1000"
                  value={limits.platform_monthly_chars}
                  onChange={(e) =>
                    setLimits({
                      ...limits,
                      platform_monthly_chars: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="block text-sm">
                每用户每月字符上限
                <input
                  className="ml-3 w-36 rounded border bg-white p-2"
                  type="number"
                  min="0"
                  max={limits.platform_monthly_chars}
                  step="1000"
                  value={limits.user_monthly_chars}
                  onChange={(e) =>
                    setLimits({
                      ...limits,
                      user_monthly_chars: Number(e.target.value),
                    })
                  }
                />
              </label>
              <button
                className="rounded-lg bg-teal-800 px-4 py-2 text-sm text-white disabled:opacity-50"
                disabled={
                  saving ||
                  limits.user_monthly_chars > limits.platform_monthly_chars
                }
                onClick={save}
              >
                {saving ? "保存中…" : "保存额度"}
              </button>
            </fieldset>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm">正在读取平台语音用量…</p>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}

export function SharedTtsPanel() {
  return import.meta.env.VITE_HOSTED_TTS_ENABLED === "true"
    ? <HostedTtsPanel />
    : null;
}
