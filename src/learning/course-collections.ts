import type { CoursePackCatalogEntry } from "./course-pack/course-pack-catalog";

// Editorial membership and sequence are independent of immutable pack versions.
export const COURSE_COLLECTIONS = [
  { id: "linear-functions", title: "读懂一次函数", level: "初中数学", description: "从斜率与截距出发，把函数图像、变化关系和方程联系起来。", cover: "linear", packIds: ["linear-intro-and-slope", "slope-and-intercept", "linear-simultaneous-intersections"] },
  { id: "trigonometry", title: "从单位圆理解三角函数", level: "高中数学", description: "让圆上的运动变成曲线，理解正弦、余弦与周期变化。", cover: "trig", packIds: ["trig-unit-circle-to-sine", "trig-cosine-and-phase-shift", "trig-quadrants-and-monotonicity"] },
  { id: "multivariable-calculus", title: "用截面理解多元函数", level: "大学微积分", description: "从三维曲面的截面入手，逐步认识等高线、偏导数与鞍点。", cover: "surface", packIds: ["surface-paraboloid-level-sets", "surface-partial-derivative-slice", "surface-saddle-point-analysis"] },
];

export function groupCoursePacks(packs: CoursePackCatalogEntry[]) {
  const byId = new Map(packs.map(pack => [pack.packId, pack]));
  const assigned = new Set(COURSE_COLLECTIONS.flatMap(group => group.packIds));
  const groups = COURSE_COLLECTIONS.map(group => ({ ...group,
    packs: group.packIds.flatMap(id => byId.has(id) ? [byId.get(id)!] : []),
  }));
  const remaining = packs.filter(pack => !assigned.has(pack.packId));
  if (remaining.length) groups.push({ id: "other", title: "其他课程", level: "探索学习", description: "更多可以独立学习的互动课程。", cover: "linear", packIds: remaining.map(p => p.packId), packs: remaining });
  return groups.filter(group => group.packs.length > 0);
}
