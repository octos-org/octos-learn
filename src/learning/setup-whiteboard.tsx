import { useLocale } from "@/i18n/use-locale";
import { tr } from "@/i18n";
import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { request, setSelectedProfileId } from "@/api/client";
import { refreshOminixRuntimeSummary } from "@/home/use-ominix-runtime-summary";
import {
  getMyProfile,
  updateMyProfileConfig,
  formatSettingsError,
  profileModelSaveMessage,
  type Profile,
} from "@/settings/settings-api";
import { LLM_PROVIDERS, isLessonCapable } from "@/settings/llm-providers";
import { ServiceSettings } from "@/byok/service-settings";
import { prepareClientServices, setLessonConfigured } from "@/byok/services";
import { TeacherSkinPicker } from "@/settings/teacher-skin-picker";
import {
  isEmbeddedCourseLocation,
  isKnownEmbeddedCourseLocation,
} from "@/auth/embedded-course-access";
import {
  LearningModelContext,
  LearningModelIssueContext,
  learningModelIssue,
  hasLearningModel,
  needsLearningSetup,
  setupSkipKey,
} from "./setup-state";
import "./setup-whiteboard.css";

/** Credentials are regular authenticated settings forms, never OLL cards,
 * canvas snapshots, conversation attachments, or localStorage values. */
export function LearningSetupGate({ children }: { children: ReactNode }) {
  useLocale();
  const location = useLocation();
  const [embeddedCourse, setEmbeddedCourse] = useState(
    () => isKnownEmbeddedCourseLocation(location),
  );
  const [required, setRequired] = useState<boolean | null>(null);
  const [modelConfigured, setModelConfigured] = useState(!embeddedCourse);
  const [modelIssue, setModelIssue] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void isEmbeddedCourseLocation(location).then((isEmbedded) => {
      if (!active) return;
      setEmbeddedCourse(isEmbedded);
      getMyProfile()
        .then((p) => {
          if (active) {
            if (p?.id) { setSelectedProfileId(p.id); setLessonConfigured(hasLearningModel(p)); void prepareClientServices().catch(() => undefined); }
            setRequired(p ? needsLearningSetup(p) : false);
            setModelConfigured(p ? hasLearningModel(p) : !isEmbedded);
            setModelIssue(p ? learningModelIssue(p) : null);
          }
        })
        .catch(() => {
          if (active) {
            setRequired(false);
            if (isEmbedded) setModelConfigured(false);
          }
        });
    });
    const changed = () => { void getMyProfile().then(p => { if (active && p) { setModelConfigured(hasLearningModel(p)); setLessonConfigured(hasLearningModel(p)); setModelIssue(learningModelIssue(p)); } }).catch(() => undefined); };
    window.addEventListener("octos:settings-closed", changed);
    return () => { active = false; window.removeEventListener("octos:settings-closed", changed); };
  }, [location]);
  if (embeddedCourse) {
    return (
      <LearningModelContext.Provider value={modelConfigured}>
        <LearningModelIssueContext.Provider value={modelIssue}>
          {children}
        </LearningModelIssueContext.Provider>
      </LearningModelContext.Provider>
    );
  }
  if (required === null)
    return <div className="setup-board setup-loading">{tr("正在打开白板…")}</div>;
  return required ? (
    <Navigate
      to={`/setup?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`}
      replace
    />
  ) : (
    <LearningModelContext.Provider value={modelConfigured}>
      <LearningModelIssueContext.Provider value={modelIssue}>
        {children}
      </LearningModelIssueContext.Provider>
    </LearningModelContext.Provider>
  );
}

export function SetupWhiteboard() {
  useLocale();
  const navigate = useNavigate();
  const [search] = useSearchParams();
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
    const requested = search.get("redirect");
    const destination = requested?.startsWith("/board")
      && (requested.length === 6 || requested[6] === "?")
      ? requested
      : "/board";
    navigate(destination, { replace: true });
  }
  return (
    <main className="setup-board">
      <header className="setup-header">
        <LanguageSwitch />
        <div>
          <p className="setup-eyebrow">{tr("OCTOS LEARN · 第一块白板")}</p>
          <h1>{tr("把白板准备好，就可以开始了")}</h1>
        </div>
        <Link to="/settings">{tr("完整设置")}</Link>
      </header>
      <p className="setup-intro">
        {tr("写下问题、拍下纸上的题目，或直接开口问。Octos 会在同一块白板上讲解，并陪你一起推导。")}</p>
      {error && <p role="alert">{error}</p>}
      {!profile ? (
        <p role="status">{tr("正在读取你的设置…")}</p>
      ) : (
        <>
          <div className="setup-cards">
            <section className="setup-card">
              <span className="setup-tag">{tr("01 · AI 讲解需要")}</span>
              <h2>{tr("连接你的模型")}</h2>
              <p>
                {tr("使用自己的 API Key，模型费用由你的供应商账户承担。没有配置也能先写白板。")}</p>
              <ModelCard profile={profile} onSaved={setProfile} />
            </section>
            <section className="setup-card">
              <span className="setup-tag">{tr("02 · 可选")}</span>
              <h2>{tr("听老师讲，也可以只看文字")}</h2>
              <p>
                {tr("连接自己的语音服务，费用由供应商账户承担。可稍后设置，先看文字讲解。")}</p>
              <ServiceSettings compact />
            </section>
            <section className="setup-card">
              <span className="setup-tag">{tr("03 · 随时再开")}</span>
              <h2>{tr("语音和摄像头不影响打字")}</h2>
              <ul>
                <li>{tr("进入白板后点击「启用语音」，准备完成后再说话。")}</li>
                <li>{tr("语音服务忙碌时，可以继续打字，无需等待。")}</li>
                <li>{tr("启用摄像头后，发送问题时可附上纸上的题目。")}</li>
                <li>{tr("框选笔迹后提问，Octos 会围绕选中内容辅助你。")}</li>
              </ul>
              <p className="setup-note">
                {tr("浏览器只会在你主动启用时申请设备权限。")}</p>
              <div className="setup-companion-picker">
                <h3>{tr("选择右下角老师形象")}</h3>
                <p>{tr("点击形象即可保存，并立即应用到学习白板。")}</p>
                <TeacherSkinPicker compact />
              </div>
            </section>
          </div>
          <footer className="setup-footer">
            <button onClick={enter}>
              {hasLearningModel(profile)
                ? tr("进入我的白板")
                : tr("先用白板，稍后设置 AI")}
            </button>
            <p>
              {tr("以后可从设置随时调整。Key 由 Octos 管理；语音和 Jev 同步至本人设备后直连供应商，不写进白板或课程内容。")}</p>
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
  useLocale();
  const providers = LLM_PROVIDERS.filter((p) =>
    isLessonCapable(p.id, import.meta.env.VITE_PUBLIC_DEPLOYMENT === "true")
      && p.credentialKind !== "json",
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
            tr("连接测试失败，请检查模型名称和 API Key。"),
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
      setMessage(profileModelSaveMessage(result));
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
          {tr("本站课程生成目前使用 Gemini。请提供已开通相应模型的 Gemini API Key；课程将使用你在设置中保存的主模型。")}</p>
      )}
      {!isLessonCapable(providerId, import.meta.env.VITE_PUBLIC_DEPLOYMENT === "true") && (
        <p>{tr("当前模型平台暂不支持生成课程，请选择 Gemini。原设置尚未更改。")}</p>
      )}
      <div className="setup-handwritten" aria-hidden="true">
        <span>{tr("先连模型，其他的以后再说也行")}</span>
        <svg viewBox="0 0 72 42">
          <path d="M4 5 Q38 8 56 30 M44 24 L56 30 L50 18" />
        </svg>
      </div>
      <label>
        {tr("模型平台")}<select
          value={providerId}
          onChange={(e) => {
            setProviderId(e.target.value);
            setKey("");
            const p = providers.find((p) => p.id === e.target.value);
            setModel(p?.models[0]?.id || "");
            setMessage("");
          }}
        >
          {!providers.some((p) => p.id === providerId) && providerId && (
            <option value={providerId}>{providerId}{tr("（请在完整设置中检查课程支持）")}</option>
          )}
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {tr("模型名称")}<input
          value={model}
          onChange={(e) => { setModel(e.target.value); setMessage(""); }}
          required
          autoComplete="off"
        />
      </label>
      <label>
        API Key
        <input
          type="password"
          value={key}
          onChange={(e) => { setKey(e.target.value); setMessage(""); }}
          placeholder={
            provider && profile.config.env_vars[provider.envKey]
              ? tr("已保存；留空继续使用")
              : tr("粘贴你的 API Key")
          }
          autoComplete="new-password"
          spellCheck={false}
        />
      </label>
      <div className="setup-model-actions">
        <button disabled={busy || !provider} type="submit">
          {busy ? tr("正在测试并保存…") : tr("测试连接并保存")}
        </button>
        <p role="status">{message}</p>
      </div>
      <Link to="/settings?tab=llm">{tr("打开完整模型设置 →")}</Link>
    </form>
  );
}
import { LanguageSwitch } from "@/i18n/language-switch";
