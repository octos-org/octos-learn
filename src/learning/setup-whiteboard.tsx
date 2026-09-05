import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { request, setSelectedProfileId } from "@/api/client";
import { synthesizeSpeech } from "@/api/voice";
import { playAudioBlob, unlockAudio } from "@/home/voice/audio-playback";
import { refreshOminixRuntimeSummary } from "@/home/use-ominix-runtime-summary";
import {
  getMyProfile,
  updateMyProfileConfig,
  formatSettingsError,
  type Profile,
} from "@/settings/settings-api";
import { LLM_PROVIDERS } from "@/settings/llm-providers";
import { SharedTtsPanel } from "@/settings/shared-tts";
import {
  LearningModelContext,
  hasLearningModel,
  needsLearningSetup,
  setupSkipKey,
} from "./setup-state";
import "./setup-whiteboard.css";

/** Credentials are regular authenticated settings forms, never OLL cards,
 * canvas snapshots, conversation attachments, or localStorage values. */
export function LearningSetupGate({ children }: { children: ReactNode }) {
  const [required, setRequired] = useState<boolean | null>(null);
  const [modelConfigured, setModelConfigured] = useState(true);
  useEffect(() => {
    let active = true;
    getMyProfile()
      .then((p) => {
        if (active) {
          if (p?.id) setSelectedProfileId(p.id);
          setRequired(p ? needsLearningSetup(p) : false);
          setModelConfigured(p ? hasLearningModel(p) : true);
        }
      })
      .catch(() => {
        if (active) setRequired(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (required === null)
    return <div className="setup-board setup-loading">正在打开白板…</div>;
  return required ? (
    <Navigate to="/setup" replace />
  ) : (
    <LearningModelContext.Provider value={modelConfigured}>
      {children}
    </LearningModelContext.Provider>
  );
}

export function SetupWhiteboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getMyProfile()
      .then(setProfile)
      .catch((e) => setError(formatSettingsError(e)));
  }, []);
  function enter() {
    if (!profile) return;
    try {
      localStorage.setItem(setupSkipKey(profile.id), "yes");
    } catch {
      /* Storage can be disabled by browser policy. */
    }
    // Permission prompts belong to an explicit device button inside the board.
    // Do not turn on the camera/microphone as a side effect of first-run setup.
    navigate("/", { replace: true });
  }
  return (
    <main className="setup-board">
      <header className="setup-header">
        <div>
          <p className="setup-eyebrow">OCTOS LEARN · 第一块白板</p>
          <h1>把白板准备好，就可以开始了</h1>
        </div>
        <Link to="/settings">完整设置</Link>
      </header>
      <p className="setup-intro">
        写下问题、拍下纸上的题目，或直接开口问。Octos
        会在同一块白板上讲解，并陪你一起推导。
      </p>
      {error && <p role="alert">{error}</p>}
      {!profile ? (
        <p role="status">正在读取你的设置…</p>
      ) : (
        <>
          <div className="setup-cards">
            <section className="setup-card">
              <span className="setup-tag">01 · AI 讲解需要</span>
              <h2>连接你的模型</h2>
              <p>
                使用自己的 API
                Key，模型费用由你的供应商账户承担。没有配置也能先写白板。
              </p>
              <ModelCard profile={profile} onSaved={setProfile} />
            </section>
            <section className="setup-card">
              <span className="setup-tag">02 · 可选</span>
              <h2>听老师讲，也可以只看文字</h2>
              <p>
                平台提供有限额的旁白语音。你也可以配置自己的火山
                TTS，不占平台额度。
              </p>
              <SharedTtsPanel />
              <TtsCard profile={profile} onSaved={setProfile} />
            </section>
            <section className="setup-card">
              <span className="setup-tag">03 · 随时再开</span>
              <h2>语音和摄像头不影响打字</h2>
              <ul>
                <li>进入白板后点击「启用语音」，准备完成后再说话。</li>
                <li>语音服务忙碌时，可以继续打字，无需等待。</li>
                <li>启用摄像头后，发送问题时可附上纸上的题目。</li>
                <li>框选笔迹后提问，Octos 会围绕选中内容辅助你。</li>
              </ul>
              <p className="setup-note">
                浏览器只会在你主动启用时申请设备权限。
              </p>
              <Link to="/settings?tab=companion">选择右下角的老师形象 →</Link>
            </section>
          </div>
          <footer className="setup-footer">
            <button onClick={enter}>
              {hasLearningModel(profile)
                ? "进入我的白板"
                : "先用白板，稍后设置 AI"}
            </button>
            <p>
              以后从「设置 → 新手设置白板」回来，随时调整。API Key
              仅发送到本站后台的凭据设置接口，不写进白板或课程内容。
            </p>
          </footer>
        </>
      )}
    </main>
  );
}

function ModelCard({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: (p: Profile) => void;
}) {
  // This hosted release pins learning-coach to Gemini. Do not offer a model
  // platform that can pass a chat connection test but cannot generate lessons.
  const providers = LLM_PROVIDERS.filter((p) =>
    import.meta.env.VITE_PUBLIC_DEPLOYMENT === "true"
      ? p.id === "google"
      : p.credentialKind !== "json",
  );
  const [providerId, setProviderId] = useState(
    profile.config.llm.primary.family_id || "google",
  );
  const provider = providers.find((p) => p.id === providerId);
  const [model, setModel] = useState(
    profile.config.llm.primary.model_id || "gemini-3.6-flash",
  );
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    if (!provider || !model.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const test = await request<{
        ok: boolean;
        error?: string;
        message?: string;
      }>("/api/my/test-provider", {
        method: "POST",
        body: JSON.stringify({
          provider: provider.id,
          model: model.trim(),
          api_key: key.trim() || undefined,
          api_key_env: provider.envKey,
          base_url: provider.defaultBaseUrl,
          profile_id: profile.id,
        }),
      });
      if (!test.ok)
        throw new Error(
          test.error ||
            test.message ||
            "连接测试失败，请检查模型名称和 API Key。",
        );
      const result = await updateMyProfileConfig(profile, {
        llm: {
          primary: {
            family_id: provider.id,
            model_id: model.trim(),
            route: {
              api_key_env: provider.envKey,
              base_url: provider.defaultBaseUrl ?? null,
            },
          },
          fallbacks: [],
        },
        ...(key.trim()
          ? {
              env_vars: {
                ...profile.config.env_vars,
                [provider.envKey]: key.trim(),
              },
            }
          : {}),
      });
      setKey("");
      onSaved(result);
      setMessage("模型已连接并保存。可以开始 AI 课程了。");
      void refreshOminixRuntimeSummary();
    } catch (e) {
      setMessage(formatSettingsError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="setup-form"
    >
      {import.meta.env.VITE_PUBLIC_DEPLOYMENT === "true" && (
        <p>
          本站课程生成目前使用 Gemini。请提供已开通相应模型的 Gemini API
          Key；普通聊天模型连接成功不等于课程生成服务已配置。
        </p>
      )}
      <div className="setup-handwritten" aria-hidden="true">
        <span>先连模型，其他的以后再说也行</span>
        <svg viewBox="0 0 72 42">
          <path d="M4 5 Q38 8 56 30 M44 24 L56 30 L50 18" />
        </svg>
      </div>
      <label>
        模型平台
        <select
          value={providerId}
          onChange={(e) => {
            setProviderId(e.target.value);
            setKey("");
            const p = providers.find((p) => p.id === e.target.value);
            setModel(p?.models[0]?.id || "");
            setMessage("");
          }}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        模型名称
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          required
          autoComplete="off"
        />
      </label>
      <label>
        API Key
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={
            provider && profile.config.env_vars[provider.envKey]
              ? "已保存；留空继续使用"
              : "粘贴你的 API Key"
          }
          autoComplete="new-password"
          spellCheck={false}
        />
      </label>
      <button disabled={busy || !provider} type="submit">
        {busy ? "正在测试并保存…" : "测试连接并保存"}
      </button>
      <p role="status">{message}</p>
      <Link to="/settings?tab=llm">打开完整模型设置 →</Link>
    </form>
  );
}

function TtsCard({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: (p: Profile) => void;
}) {
  const [appid, setAppid] = useState(profile.config.tts_cloud?.appid || "");
  const [token, setToken] = useState("");
  const [voice, setVoice] = useState(
    profile.config.tts_cloud?.voice || "zh_female_xiaohe_uranus_bigtts",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function test(personal: boolean) {
    unlockAudio();
    setBusy(true);
    setMessage("");
    try {
      if (personal) {
        if (
          !appid.trim() ||
          (!token.trim() && !profile.config.env_vars.VOLC_TTS_TOKEN)
        )
          throw new Error("请填写 App ID 和 Access Token。");
        const p = await updateMyProfileConfig(profile, {
          tts_provider: "cloud",
          tts_cloud: { appid: appid.trim(), voice: voice.trim() },
          ...(token.trim()
            ? {
                env_vars: {
                  ...profile.config.env_vars,
                  VOLC_TTS_TOKEN: token.trim(),
                },
              }
            : {}),
        });
        setToken("");
        onSaved(p);
      }
      const audio = await synthesizeSpeech(
        "你好，我是你白板旁的学习伙伴。我们可以一起看图、推导和解决问题。",
      );
      const started = await playAudioBlob(audio, () => {});
      if (!started)
        throw new Error("音频已返回，但浏览器未能播放，请再次点击试听。");
      setMessage("试听已播放。如果没有听到，请检查本站音量和输出设备。");
      void refreshOminixRuntimeSummary();
    } catch (e) {
      setMessage(formatSettingsError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="setup-form">
      <button onClick={() => test(false)} disabled={busy}>
        {busy ? "正在准备语音…" : "试听当前旁白语音"}
      </button>
      <details>
        <summary>使用自己的火山 TTS（可选）</summary>
        <label>
          App ID
          <input value={appid} onChange={(e) => setAppid(e.target.value)} />
        </label>
        <label>
          Access Token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="new-password"
            placeholder="留空保留已有凭据"
          />
        </label>
        <label>
          音色 ID
          <input value={voice} onChange={(e) => setVoice(e.target.value)} />
        </label>
        <button disabled={busy} onClick={() => test(true)}>
          保存个人 TTS 并试听
        </button>
      </details>
      <p role="status">{message}</p>
      <Link to="/settings?tab=voice">语音设置与用量 →</Link>
    </div>
  );
}
