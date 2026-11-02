import { tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getSelectedProfileId, getToken } from "@/api/client";

import { AcademyHeader } from "../academy/academy-header";
import { openHistoryApi } from "../history/history-api";
import { TOPIC_NAME_CATALOGS, topicNameLabels } from "../map/taxonomy-labels";
import { defaultCardTitles } from "./card-templates";
import { createRecording, keptTake, planCards, type LearnerRecording } from "./recording";
import { loadRecordingDrafts, saveRecordingDraft } from "./recording-store";
import { searchStarTopics, topicFromChoice, type TopicChoice } from "./topic-choice";
import "./teach.css";

const MAX_CARDS = 6;

interface PlannedCard {
  title: string;
  kind: "teach" | "your_turn";
}

type Step = "topic" | "goal" | "cards" | "ready";

function newRecordingId(): string {
  return `rec-${crypto.randomUUID()}`;
}

/** Plans a learner-taught lesson: any topic, what the viewer will learn, and its cards. */
export function TeachPlanPage({ onPlanned }: { onPlanned?: (recording: LearnerRecording) => void }) {
  const locale = useLocale();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("topic");
  const [query, setQuery] = useState("");
  const [litTopics, setLitTopics] = useState<ReadonlySet<string>>(new Set());
  const [freeTopic, setFreeTopic] = useState(false);
  const [choice, setChoice] = useState<TopicChoice>();
  const [goal, setGoal] = useState("");
  const [cards, setCards] = useState<PlannedCard[]>(() => defaultCardTitles().map((title) => ({ title, kind: "teach" })));
  const [saveFailed, setSaveFailed] = useState(false);
  const [planned, setPlanned] = useState<LearnerRecording>();
  // Lessons this learner has started on this device, newest first.
  const [drafts] = useState(() => loadRecordingDrafts(localStorage, getSelectedProfileId() ?? "local")
    .filter((draft) => draft.cards.length).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let active = true;
    // Lit stars only order suggestions; planning works without them.
    void openHistoryApi(token)
      .then((api) => api.learningMap())
      .then((map) => { if (active) setLitTopics(new Set(map.topics.map((topic) => topic.topic_id))); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const suggestions = useMemo(
    () => searchStarTopics(query, TOPIC_NAME_CATALOGS, topicNameLabels(locale), litTopics),
    [query, locale, litTopics],
  );

  const chooseFree = (isMath: boolean) => {
    setChoice({ kind: "free", text: query, isMath });
    setStep("goal");
  };

  const updateCard = (index: number, title: string) => {
    setCards((current) => current.map((card, position) => (position === index ? { ...card, title } : card)));
  };
  const removeCard = (index: number) => setCards((current) => current.filter((_, position) => position !== index));
  const hasYourTurn = cards.some((card) => card.kind === "your_turn");
  const cardsValid = cards.length > 0 && cards.every((card) => card.title.trim());

  const start = () => {
    if (!choice || !cardsValid) return;
    const now = new Date().toISOString();
    const recording = planCards(
      createRecording({ id: newRecordingId(), now, topic: topicFromChoice(choice), goals: [goal] }),
      now,
      cards,
    );
    const profileId = getSelectedProfileId() ?? "local";
    if (!saveRecordingDraft(localStorage, profileId, recording)) {
      setSaveFailed(true);
      return;
    }
    setSaveFailed(false);
    setPlanned(recording);
    setStep("ready");
    onPlanned?.(recording);
    navigate(`/teach/${recording.id}`);
  };

  return (
    <main className="course-launcher academy-page teach-page">
      <div className="course-launcher-inner">
        <AcademyHeader />
        <h1 className="academy-title">{tr("我来讲一课")}</h1>
        <Link className="teach-secondary" to="/teach/avatar-lab">{tr("体验动态头像")}</Link>

        {step === "topic" && drafts.length > 0 && (
          <section className="teach-step" aria-labelledby="teach-drafts-title">
            <h2 id="teach-drafts-title">{tr("接着讲你的课")}</h2>
            <ul className="teach-drafts">
              {drafts.map((draft) => (
                <li key={draft.id}>
                  <Link to={`/teach/${draft.id}`}>
                    <span>{draft.topic.text}</span>
                    <span className="teach-chip">{tr("录好 {{v0}}/{{v1}} 张", { v0: draft.cards.filter((card) => keptTake(card)).length, v1: draft.cards.length })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {step === "topic" && (
          <section className="teach-step" aria-labelledby="teach-topic-title">
            <h2 id="teach-topic-title">{tr("你想讲什么？")}</h2>
            <p className="academy-muted">{tr("什么主题都可以，星图上的知识点或你喜欢的任何东西。")}</p>
            <input
              className="teach-input"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setFreeTopic(false); }}
              aria-label={tr("主题")}
              placeholder={tr("例如：斜率")}
            />
            {suggestions.length > 0 && !freeTopic && (
              <ul className="teach-suggestions" aria-label={tr("星图上的知识点")}>
                {suggestions.map((candidate) => (
                  <li key={candidate.starTopicId}>
                    <button
                      type="button"
                      onClick={() => {
                        setChoice({ kind: "star", ...candidate });
                        setStep("goal");
                      }}
                    >
                      <span>{candidate.name}</span>
                      <span className="teach-chip">{candidate.lit ? tr("已点亮") : tr("还没点亮")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim() && !freeTopic && (
              <button type="button" className="teach-secondary" onClick={() => setFreeTopic(true)}>
                {suggestions.length ? tr("都不是，就讲我写的这个") : tr("就讲这个")}
              </button>
            )}
            {freeTopic && (
              <div className="teach-question" role="group" aria-labelledby="teach-math-question">
                <p id="teach-math-question">{tr("这是数学主题吗？")}</p>
                <button type="button" onClick={() => chooseFree(true)}>{tr("是数学")}</button>
                <button type="button" onClick={() => chooseFree(false)}>{tr("不是数学")}</button>
              </div>
            )}
          </section>
        )}

        {step === "goal" && choice && (
          <section className="teach-step" aria-labelledby="teach-goal-title">
            <h2 id="teach-goal-title">{tr("小章鱼想知道：听完你的课，我会学会什么？")}</h2>
            <textarea
              className="teach-input"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              aria-label={tr("听完能学会什么")}
              placeholder={tr("例如：用任意两个点求出斜率")}
            />
            <div className="teach-actions">
              <button type="button" className="teach-secondary" onClick={() => setStep("topic")}>{tr("上一步")}</button>
              <button type="button" disabled={!goal.trim()} onClick={() => setStep("cards")}>{tr("下一步")}</button>
            </div>
          </section>
        )}

        {step === "cards" && (
          <section className="teach-step" aria-labelledby="teach-cards-title">
            <h2 id="teach-cards-title">{tr("把课分成几张卡片")}</h2>
            <p className="academy-muted">{tr("每张卡片讲一件事，一次录完；讲错了只要重录那一张。")}</p>
            <ol className="teach-cards">
              {cards.map((card, index) => (
                <li key={index}>
                  <input
                    className="teach-input"
                    value={card.title}
                    onChange={(event) => updateCard(index, event.target.value)}
                    aria-label={tr("第 {{v0}} 张卡片", { v0: index + 1 })}
                  />
                  {card.kind === "your_turn" && <span className="teach-chip">{tr("轮到你了")}</span>}
                  <button type="button" className="teach-icon" onClick={() => removeCard(index)} aria-label={tr("删除第 {{v0}} 张卡片", { v0: index + 1 })} disabled={cards.length === 1}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
            <div className="teach-actions">
              <button type="button" className="teach-secondary" disabled={cards.length >= MAX_CARDS} onClick={() => setCards((current) => [...current, { title: "", kind: "teach" }])}>
                <Plus size={16} aria-hidden="true" /> {tr("加一张卡片")}
              </button>
              {!hasYourTurn && (
                <button type="button" className="teach-secondary" disabled={cards.length >= MAX_CARDS} onClick={() => setCards((current) => [...current, { title: tr("轮到你了"), kind: "your_turn" }])}>
                  <Plus size={16} aria-hidden="true" /> {tr("加一道“轮到你了”练习")}
                </button>
              )}
            </div>
            <div className="teach-actions">
              <button type="button" className="teach-secondary" onClick={() => setStep("goal")}>{tr("上一步")}</button>
              <button type="button" disabled={!cardsValid} onClick={start}>{tr("开始录课")}</button>
            </div>
            {saveFailed && <p role="alert">{tr("这台设备暂时保存不了，请稍后再试。")}</p>}
          </section>
        )}

        {step === "ready" && planned && (
          <section className="teach-step" aria-labelledby="teach-ready-title">
            <h2 id="teach-ready-title">{planned.topic.text}</h2>
            <p className="academy-muted">{tr("课已经规划好，保存在这台设备上。")}</p>
            <ol className="teach-cards">
              {planned.cards.map((card) => <li key={card.key}>{card.title}</li>)}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
