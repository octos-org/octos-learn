// Content references are pinned to the published archive, not a mutable course
// name. This candidate must remain inactive until an editorial review approves
// the meaning of each objective. Client requests cannot change this status.
const step = section => `slope-and-intercept-0.1.8:step:section-${String(section).padStart(2, "0")}`;
const beats = (section, count) => Array.from({ length: count }, (_, i) => `${step(section)}:beat:moment-${String(i + 1).padStart(2, "0")}`);
export const TOPIC_MAPPINGS = [{
  id: "slope-and-intercept-0.1.8-map-1", status: "pending-review",
  course: { kind: "course-pack", id: "slope-and-intercept", version: "0.1.8", sha256: "e852bd217080b10fd6daab84e094e76fe5a3d9903540f914c60dc3ab7301c35b" },
  entry_sha256: "4d924d7fd7456a7a2839da5f26b09d8326156c2dc61b4412c31b26a139fbbbe9",
  taxonomy: { repository: "https://github.com/withmarbleapp/os-taxonomy", commit: "533bab591b24c4024f0d70f9296aa4ee560fdd01", topics_sha256: "311b90e7706d76c21af7b68275eb738d3f3ade027418a633fa30d2faffe12693" },
  required_beats: [1, 2, 3, 4].flatMap((section, i) => beats(section, [2, 5, 3, 3][i])),
  objectives: [
    { topic_id: "mt_WBdHkc2HTf", key: "linear-equation-parameters", title: "认识一次函数的两个参数", beat_ids: beats(1, 2), task_ids: [] },
    { topic_id: "mt_WBdHkc2HTf", key: "gradient-direction-and-steepness", title: "斜率与直线的方向、陡缓", beat_ids: beats(2, 5), task_ids: ["section-02-task-01"] },
    { topic_id: "mt_WBdHkc2HTf", key: "vertical-intercept", title: "纵截距与直线的位置", beat_ids: beats(3, 3), task_ids: ["section-03-task-01"] },
    { topic_id: "mt_-3udyo6VyB", key: "gradient-rise-over-run", title: "斜率是纵向变化与横向变化的比", beat_ids: beats(4, 2), task_ids: ["section-04-task-01"] },
  ],
}];
