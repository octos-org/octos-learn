import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  MoreHorizontal,
  Clock3,
  BookOpen,
  Eye,
  LogOut,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/auth-context";
import { deleteSession, setSessionTitle } from "@/api/sessions";
import {
  fetchCoursePackCatalog,
  getEmbeddedCoursePackCatalog,
  loadSavedCoursePackCatalog,
  saveCoursePackCatalog,
  selectLatestCoursePacks,
  supportsCoursePackPlayer,
  type CoursePackCatalog,
  type CoursePackCatalogEntry,
} from "./course-pack/course-pack-catalog";
import {
  listInstalledCoursePacks,
  type InstalledCoursePack,
} from "./course-pack/course-pack-store";
import {
  createCoursePackLearningInstance,
  adoptLearningSession,
  listLearningSessions,
  listCoursePackLearningInstances,
  removeLearningSession,
  updateLearningSession,
  type LearningSessionRecord,
} from "./learning-session-store";
import { discoverServerLearningSessions } from "./learning-session-sync";
import { groupCoursePacks } from "./course-collections";
import "./course-launcher.css";

type CatalogState = {
  catalog: CoursePackCatalog | null;
  embeddedIdentities: Set<string>;
  live: boolean;
  loading: boolean;
  error: string | null;
};

function courseTags(entry: CoursePackCatalogEntry): string {
  const grades: Record<string, string> = {
    "primary-age-8-9": "小学（8–9岁）",
    "secondary-age-12-14": "初中（12–14岁）",
    "highschool-mathematics": "高中",
    "college-calculus": "大学微积分",
  };
  const grade = entry.grade.trim();
  const subject = entry.subject.trim();
  return [
    grade.toLowerCase() === "unspecified" ? "" : (grades[grade] ?? grade),
    subject === "mathematics" ? "数学" : subject,
  ].filter(Boolean).join(" · ");
}

function useLauncherCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>(() => {
    const saved = loadSavedCoursePackCatalog();
    return {
      catalog: saved,
      embeddedIdentities: new Set(),
      live: false,
      loading: true,
      error: null,
    };
  });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      const [embedded, publicCatalogResult] = await Promise.all([
        getEmbeddedCoursePackCatalog(controller.signal),
        fetchCoursePackCatalog(controller.signal).catch((err: unknown) => {
          return err instanceof Error ? err : new Error(String(err));
        }),
      ]);

      if (cancelled || controller.signal.aborted) return;

      const embeddedPacks = embedded?.packs ?? [];
      const embeddedSet = new Set(embeddedPacks.map((p) => `${p.packId}@${p.version}`));

      if (publicCatalogResult instanceof Error) {
        if (embeddedPacks.length > 0) {
          const latestEmbedded = selectLatestCoursePacks(embeddedPacks, {
            isEmbedded: (entry) => embeddedSet.has(`${entry.packId}@${entry.version}`),
          });
          setState({
            catalog: { ...embedded!, packs: latestEmbedded },
            embeddedIdentities: embeddedSet,
            live: true,
            loading: false,
            error: null,
          });
        } else {
          const saved = loadSavedCoursePackCatalog();
          const latestSaved = saved
            ? { ...saved, packs: selectLatestCoursePacks(saved.packs) }
            : null;
          setState({
            catalog: latestSaved,
            embeddedIdentities: new Set(),
            live: false,
            loading: false,
            error: publicCatalogResult.message || "课程目录暂不可用",
          });
        }
      } else {
        saveCoursePackCatalog(publicCatalogResult);
        const mergedPacks = selectLatestCoursePacks(
          [...embeddedPacks, ...publicCatalogResult.packs],
          { isEmbedded: (entry) => embeddedSet.has(`${entry.packId}@${entry.version}`) },
        );
        setState({
          catalog: {
            schemaVersion: 1,
            generatedAt: publicCatalogResult.generatedAt,
            packs: mergedPacks,
          },
          embeddedIdentities: embeddedSet,
          live: true,
          loading: false,
          error: null,
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return state;
}

function CourseCard({
  entry,
  live,
  installed,
  installedThumbnail,
  authenticated,
  embedded,
  index,
}: {
  index: number;
  entry: CoursePackCatalogEntry;
  live: boolean;
  installed: boolean;
  installedThumbnail?: string;
  authenticated: boolean;
  embedded: boolean;
}) {
  const navigate = useNavigate();
  const supported = supportsCoursePackPlayer(entry.minimumPlayerVersion);
  const playable = supported && (live || installed);
  const source = {
    packId: entry.packId,
    version: entry.version,
    archiveSha256: entry.archiveSha256,
  };
  const [latestInstance, setLatestInstance] = useState(
    () => listCoursePackLearningInstances(source)[0] ?? null,
  );
  const destination = (mode: "preview" | "learn", instanceId?: string) =>
    `/course/${encodeURIComponent(entry.packId)}`
      + `?version=${encodeURIComponent(entry.version)}`
      + `&title=${encodeURIComponent(entry.title)}`
      + `&mode=${mode}`
      + (instanceId ? `&instance=${encodeURIComponent(instanceId)}` : "");
  const startNewInstance = () => {
    if (!authenticated && !embedded) {
      navigate(destination("learn"));
      return;
    }
    const instance = createCoursePackLearningInstance(source, entry.title);
    navigate(destination("learn", instance.id));
  };
  const restartCourse = () => {
    if (!window.confirm("从课程初始白板重新开始？原来的学习记录会保留。")) return;
    startNewInstance();
  };
  const deleteProgress = () => {
    if (!latestInstance
      || !window.confirm("删除这门课程当前保存的学习记录？课程包本身不会被删除。")) return;
    removeLearningSession(latestInstance.id);
    setLatestInstance(listCoursePackLearningInstances(source)[0] ?? null);
  };
  return (
    <article className="course-launcher-card">
      <div className="course-launcher-cover">
        <img src={installedThumbnail ?? entry.thumbnailUrl} alt="" />

      </div>
      <div className="course-launcher-card-body">
        <div className="course-launcher-card-meta">
          <span className="course-launcher-grade">{courseTags(entry)}</span>
          <span className="course-launcher-version">课程包 v{entry.version}</span>
        </div>
        <div className="course-lesson-number">第 {String(index + 1).padStart(2, "0")} 课</div>
        <h3>{entry.title}</h3>
        <p>{entry.description}</p>
        <div className="course-launcher-facts">
          <span><Clock3 size={14} aria-hidden="true" /> {Math.max(1, Math.ceil(entry.durationSeconds / 60))} 分钟</span>
          <span>{embedded ? "内置课程 · 可离线" : installed ? "已下载 · 可离线" : "尚未下载"}</span>
        </div>
        <div className="course-launcher-card-footer">
          {playable ? (
            <div className="course-launcher-actions">
              <Link to={destination("preview")} className="course-launcher-preview">
                <Eye size={14} aria-hidden="true" /> 预览
              </Link>
              {entry.capabilities.interactiveWhiteboard ? (
                latestInstance ? (
                  <>
                    <details className="course-launcher-more" onKeyDown={event => {
                      if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
                    }} onBlur={event => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false;
                    }}>
                      <summary aria-label={`更多操作：${entry.title}`}><MoreHorizontal size={20} /></summary>
                      <div className="course-launcher-more-panel" onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); }}>
                    <button type="button" className="course-launcher-restart" onClick={restartCourse}>
                      <RotateCcw size={14} aria-hidden="true" /> 重新开始
                    </button>
                    <button
                      type="button"
                      className="course-launcher-delete"
                      onClick={deleteProgress}
                      aria-label={`删除“${entry.title}”的学习记录`}
                      title="删除学习记录"
                    >
                      <Trash2 size={14} aria-hidden="true" /> 删除学习记录
                    </button>
                      </div>
                    </details>
                    <Link
                      to={destination("learn", latestInstance.id)}
                      className="course-launcher-start"
                    >
                      继续学习 <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </>
                ) : (
                  <button type="button" className="course-launcher-start" onClick={startNewInstance}>
                    开始互动 <ArrowRight size={16} aria-hidden="true" />
                  </button>
                )
              ) : null}
            </div>
          ) : (
            <span className="course-launcher-unavailable">
              {supported ? "联网后可打开" : "需要更新应用"}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function WhiteboardSessionCard({
  session,
  onChanged,
}: {
  session: LearningSessionRecord;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const open = () => {
    updateLearningSession(session.id, { status: "active" });
    navigate("/board");
  };
  const rename = () => {
    const title = window.prompt("重命名学习白板", session.title)?.trim();
    if (!title || title === session.title) return;
    if (!updateLearningSession(session.id, { title })) return;
    onChanged();
    void setSessionTitle(session.id, title).catch(() => undefined);
  };
  const remove = () => {
    if (!window.confirm(`删除“${session.title}”？此操作会删除这块白板的学习记录。`)) return;
    void deleteSession(session.id)
      .catch(() => undefined)
      .finally(() => {
        removeLearningSession(session.id);
        onChanged();
      });
  };
  return (
    <article className="course-launcher-session-card">
      <button type="button" className="course-launcher-session-open" onClick={open}>
        <span>{session.title}</span>
        <small>{session.status === "completed" ? "已完成" : "继续学习"}</small>
      </button>
      <div className="course-launcher-session-actions">
        <button type="button" onClick={rename} aria-label={`重命名 ${session.title}`}>
          <Pencil size={15} aria-hidden="true" />
        </button>
        <button type="button" onClick={remove} aria-label={`删除 ${session.title}`}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export function CourseLauncher() {
  const { token, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const collectionId = searchParams.get("collection");
  const state = useLauncherCatalog();
  const [loggingOut, setLoggingOut] = useState(false);
  const [whiteboards, setWhiteboards] = useState(() =>
    listLearningSessions().filter((session) => !session.source));
  const refreshWhiteboards = () => {
    setWhiteboards(listLearningSessions().filter((session) => !session.source));
  };
  useEffect(() => {
    if (!token) return;
    let active = true;
    void discoverServerLearningSessions()
      .then((sessions) => {
        if (!active) return;
        sessions.forEach((session) => adoptLearningSession(session));
        setWhiteboards(listLearningSessions().filter((session) => !session.source));
      })
      .catch(() => {
        // Local whiteboards remain available while the server is offline.
      });
    return () => {
      active = false;
    };
  }, [token]);
  const [installed, setInstalled] = useState<InstalledCoursePack[]>([]);
  const [installedThumbnails, setInstalledThumbnails] = useState<Map<string, string>>(
    () => new Map(),
  );
  useEffect(() => {
    let active = true;
    const createdUrls: string[] = [];
    void listInstalledCoursePacks().then((packs) => {
      if (!active) return;
      const thumbnails = new Map<string, string>();
      if (typeof URL.createObjectURL === "function") {
        for (const pack of packs) {
          if (pack.thumbnail) {
            const url = URL.createObjectURL(pack.thumbnail);
            createdUrls.push(url);
            thumbnails.set(pack.identity, url);
          }
        }
      }
      setInstalled(packs);
      setInstalledThumbnails(thumbnails);
    });
    return () => {
      active = false;
      for (const url of createdUrls) URL.revokeObjectURL(url);
    };
  }, []);
  const installedByIdentity = new Map(installed.map((pack) => [pack.identity, pack]));
  const catalogPacks = state.catalog?.packs.filter((pack) => pack.recommended) ?? [];
  const candidatePacks = [...catalogPacks];
  if (!state.live) {
    for (const pack of installed) {
      candidatePacks.push(pack.catalogEntry);
    }
  }
  const visiblePacks = selectLatestCoursePacks(candidatePacks, {
    isEmbedded: (entry) => state.embeddedIdentities.has(`${entry.packId}@${entry.version}`),
  });
  const collections = groupCoursePacks(visiblePacks);
  const selected = collections.find(group => group.id === collectionId);
  useEffect(() => {
    document.querySelector(".course-launcher")?.scrollTo?.(0, 0);
  }, [collectionId]);
  return (
    <main className="course-launcher">
      <div className="course-launcher-inner">
        <header className="course-launcher-header">
          <div className="course-launcher-brand">
            <img src="/images/octos-logo-color.svg" alt="" />
            <span>Octos Learn</span>
          </div>
          <nav aria-label="账户">
            {token ? (
              <>
                <Link to="/settings"><Settings size={17} aria-hidden="true" /> 设置</Link>
                <button
                  type="button"
                  disabled={loggingOut}
                  onClick={() => {
                    setLoggingOut(true);
                    void logout().finally(() => setLoggingOut(false));
                  }}
                >
                  <LogOut size={17} aria-hidden="true" />
                  {loggingOut ? "正在退出…" : "退出"}
                </button>
              </>
            ) : (
              <Link to="/login">登录</Link>
            )}
          </nav>
        </header>

        {!collectionId && <section className="course-launcher-hero">
          <p className="course-launcher-eyebrow">LEARN ON A LIVING WHITEBOARD</p>
          <h1>从一组课程，开始新的探索。</h1>
          <p>跟着准备好的课程探索，也可以写下自己的问题，让小章鱼陪你一起推导。</p>
          <Link to="/board?new-board=1" className="course-launcher-blank">
            <Plus size={20} aria-hidden="true" /> 新建空白白板
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>}

        { !collectionId && whiteboards.length > 0 && (
          <section className="course-launcher-sessions" aria-labelledby="course-launcher-sessions-title">
            <div className="course-launcher-section-title">
              <div>
                <p>RECENT WHITEBOARDS</p>
                <h2 id="course-launcher-sessions-title">最近白板</h2>
              </div>
            </div>
            <div className="course-launcher-session-grid">
              {whiteboards.map((session) => (
                <WhiteboardSessionCard
                  key={session.id}
                  session={session}
                  onChanged={refreshWhiteboards}
                />
              ))}
            </div>
          </section>
        )}

        <section className="course-launcher-library" aria-labelledby="course-launcher-library-title">
          {collectionId && <Link to="/" className="course-collection-back"><ArrowLeft size={17} /> 全部课程集</Link>}
          <div className="course-launcher-section-title">
            <div>
              <p>{selected ? selected.level : "CURATED COLLECTIONS"}</p>
              <h2 id="course-launcher-library-title">{selected?.title ?? "课程集"}</h2>
            </div>
            <BookOpen size={23} aria-hidden="true" />
          </div>

          {selected && <p className="course-collection-intro">{selected.description}<span>{selected.packs.length} 节课 · 约 {Math.ceil(selected.packs.reduce((sum, p) => sum + p.durationSeconds, 0) / 60)} 分钟 · 按顺序循序学习</span></p>}
          {collectionId && !selected && !state.loading && <p role="status">这个课程集暂不可用，请选择其他课程集。</p>}
          {state.error && (
            <p className="course-launcher-notice" role="status">
              {state.catalog
                ? "课程目录暂不可用，正在显示本机保存的目录；已下载课程仍可离线打开。"
                : "课程目录暂不可用；你仍可新建空白白板。"}
            </p>
          )}
          {state.loading && !state.catalog && (
            <p className="course-launcher-state" role="status">正在读取课程目录…</p>
          )}
          {!state.loading && visiblePacks.length === 0 && (
            <div className="course-launcher-empty">
              <BookOpen size={27} aria-hidden="true" />
              <h3>课程包还在准备中</h3>
              <p>首批经过审核的课程发布后会出现在这里。现在可以先进入空白白板。</p>
            </div>
          )}
          {!selected && visiblePacks.length > 0 && <div className="course-collection-grid">
            {collections.map(group => <Link key={group.id} to={`?collection=${group.id}`} className="course-collection-card">
              <img src={`/images/course-collections/${group.cover}.svg`} alt="" />
              <div className="course-collection-body">
                <span className="course-collection-level">{group.level}</span>
                <h3>{group.title}</h3><p>{group.description}</p>
                <div className="course-collection-footer"><span>{group.packs.length} 节课 · 约 {Math.ceil(group.packs.reduce((sum, p) => sum + p.durationSeconds, 0) / 60)} 分钟</span><strong>查看课程 <ArrowRight size={17} /></strong></div>
              </div>
            </Link>)}
          </div>}
          {selected && (
            <div className="course-launcher-grid">
              {selected.packs.map((entry, index) => {
                const identity = `${entry.packId}@${entry.version}`;
                return (
                  <CourseCard
                    key={identity}
                    entry={entry}
                    index={index}
                    live={state.live}
                    installed={installedByIdentity.has(identity)}
                    installedThumbnail={installedThumbnails.get(identity)}
                    authenticated={Boolean(token)}
                    embedded={state.embeddedIdentities.has(identity)}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
