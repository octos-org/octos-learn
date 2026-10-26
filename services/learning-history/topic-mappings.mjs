// Which knowledge-map topics each published course pack teaches, objective by
// objective. Content references are pinned to the published archive (its
// SHA-256 and entry file), not a mutable course name. Client requests cannot
// change these entries.
//
// 2026-10-26: the user decided course packs are judged by the model, the
// same way generated lessons are, instead of waiting for a human editorial
// review; the agent read each pack's narration and tasks and chose the
// topics, recorded in docs/COURSE_PACK_TOPIC_MAPPINGS.md. Packs whose content
// has no topic in the catalog (unit-circle trigonometry, multivariable
// surfaces) are left out until high-school topics are added.
const TAXONOMY = { repository: "https://github.com/withmarbleapp/os-taxonomy", commit: "c7ed549758d9fb430c4af54886c658e78162a0b1", topics_sha256: "15806a0b74445c52651e84c882104f630eb96ea9195c0befe8469587a0180fc0" };
/** Beat ids of one pack: `beats(section, count)` → its first `count` moments. */
const beatsOf = prefix => (section, count) => Array.from({ length: count },
  (_, i) => `${prefix}:step:section-${String(section).padStart(2, "0")}:beat:moment-${String(i + 1).padStart(2, "0")}`);

const LINEAR_GRAPHS = "mt_WBdHkc2HTf", PLOTTING_LINEAR = "mt_-3udyo6VyB", PROPORTION_GRAPHS = "mt_FspV_imUGK", SIMULTANEOUS = "mt_mqgu72aCMz";

const slope = beatsOf("slope-and-intercept-0.1.8");
const intro = beatsOf("linear-intro-and-slope-0.1.1");
const systems = beatsOf("linear-simultaneous-intersections-0.1.2");

export const TOPIC_MAPPINGS = [{
  id: "slope-and-intercept-0.1.8-map-1", status: "approved",
  course: { kind: "course-pack", id: "slope-and-intercept", version: "0.1.8", sha256: "e852bd217080b10fd6daab84e094e76fe5a3d9903540f914c60dc3ab7301c35b" },
  entry_sha256: "4d924d7fd7456a7a2839da5f26b09d8326156c2dc61b4412c31b26a139fbbbe9",
  taxonomy: TAXONOMY,
  required_beats: [1, 2, 3, 4].flatMap((section, i) => slope(section, [2, 5, 3, 3][i])),
  objectives: [
    { topic_id: LINEAR_GRAPHS, key: "linear-equation-parameters", title: "认识一次函数的两个参数", beat_ids: slope(1, 2), task_ids: [] },
    { topic_id: LINEAR_GRAPHS, key: "gradient-direction-and-steepness", title: "斜率与直线的方向、陡缓", beat_ids: slope(2, 5), task_ids: ["section-02-task-01"] },
    { topic_id: LINEAR_GRAPHS, key: "vertical-intercept", title: "纵截距与直线的位置", beat_ids: slope(3, 3), task_ids: ["section-03-task-01"] },
    { topic_id: PLOTTING_LINEAR, key: "gradient-rise-over-run", title: "斜率是纵向变化与横向变化的比", beat_ids: slope(4, 2), task_ids: ["section-04-task-01"] },
  ],
}, {
  id: "linear-intro-and-slope-0.1.1-map-1", status: "approved",
  course: { kind: "course-pack", id: "linear-intro-and-slope", version: "0.1.1", sha256: "a8ef5819d3815f5ce807f68bb02f07f1d25ff5709ba3d20d3fb04d7c13922472" },
  entry_sha256: "caac98a5519fc559146d38e3c5a52f6eafabfcc14ef1e492c49b36be6dbf18ed",
  taxonomy: TAXONOMY,
  required_beats: [1, 2, 3].flatMap((section, i) => intro(section, [2, 2, 4][i])),
  objectives: [
    { topic_id: PROPORTION_GRAPHS, key: "proportional-line-through-origin", title: "正比例函数的图像是过原点的直线", beat_ids: intro(1, 2), task_ids: [] },
    { topic_id: LINEAR_GRAPHS, key: "positive-slope-steepness", title: "正斜率越大，直线越陡", beat_ids: intro(2, 2), task_ids: ["section-02-task-01"] },
    { topic_id: LINEAR_GRAPHS, key: "negative-and-zero-slope", title: "负斜率的方向与斜率为 0", beat_ids: intro(3, 4), task_ids: ["section-03-task-01"] },
  ],
}, {
  id: "linear-simultaneous-intersections-0.1.2-map-1", status: "approved",
  course: { kind: "course-pack", id: "linear-simultaneous-intersections", version: "0.1.2", sha256: "8f05895e956e99c0878bde49b7a9e2d48d69361fdd9ad65f1c526e7a91403c3e" },
  entry_sha256: "39a2f8533da4f596612a0d9faff8ef3fe3958710d57ae1906d81f17811d738b2",
  taxonomy: TAXONOMY,
  required_beats: [1, 2, 3, 4].flatMap((section, i) => systems(section, [2, 4, 1, 2][i])),
  objectives: [
    { topic_id: SIMULTANEOUS, key: "intersection-is-common-solution", title: "两直线的交点就是方程组的公共解", beat_ids: [...systems(1, 2), ...systems(2, 4), ...systems(3, 1)], task_ids: [] },
    { topic_id: SIMULTANEOUS, key: "parallel-lines-no-solution", title: "平行的两条直线没有交点，方程组无解", beat_ids: systems(4, 2), task_ids: [] },
  ],
}];
