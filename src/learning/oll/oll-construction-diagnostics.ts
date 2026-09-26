import {
  evaluateMathExpression,
  referencedMathVariables,
  type AuthoringLesson,
} from "octos-lesson-language";

export interface OllConstructionDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  proofStatus: "proven" | "disproven" | "not_proven";
  scope: "slider_grid" | "continuous_domain" | "authoring_intent";
  path: string;
  message: string;
  samples?: number;
}

/** Bounded local analysis. A finite slider proof never claims animation continuity. */
export function analyzeOllConstruction(source: AuthoringLesson): OllConstructionDiagnostic[] {
  const diagnostics: OllConstructionDiagnostic[] = [];
  const first = source.steps[0]?.beats[0];
  if (!source.board_context?.references.length && first?.say?.trim()
    && !first.actions.some(action => action.do === "write" && action.when !== "after_speech")) {
    diagnostics.push({ code: "OPENING_WITHOUT_VISIBLE_CONTENT", severity: "warning", proofStatus: "proven",
      scope: "authoring_intent", path: "/steps/0/beats/0", message: "新课程首段旁白开始时没有同步板书；请确认是有意延迟揭示，或声明介绍板书/标题开场策略。" });
  }
  const variables = source.lesson.variables ?? [];
  const initial = Object.fromEntries(variables.map(variable => [variable.as, variable.initial]));
  let remaining = 4096;
  const visualAliases = new Set<string>();
  const related = new Set<string>();
  const focusCounts = new Map<string, { count: number; path: string }>();
  const pair = (a: string, b: string) => [a, b].sort().join("\u0000");
  source.steps.forEach((step, si) => step.beats.forEach((beat, bi) => {
    const beatPath = `/steps/${si}/beats/${bi}`;
    if (beat.actions.some(action => action.do === "animate")
      && /(?:请你|你来|你可以|你试着|你来手动|请(?:拖动|调整|移动))/.test(beat.say ?? "")) {
      diagnostics.push({ code: "TEACHER_STUDENT_VOICE", severity: "warning", proofStatus: "not_proven",
        scope: "authoring_intent", path: `${beatPath}/say`, message: "教师动画配有邀请学生操作的口吻，请核对教学角色。" });
    }
    beat.actions.forEach((action, ai) => {
      const path = `${beatPath}/actions/${ai}`;
      if (action.do === "group") {
        for (const a of action.members) for (const b of action.members) if (a !== b) related.add(pair(a, b));
      }
      if (action.do === "focus") {
        for (let i = 0; i < action.targets.length; i++) for (let j = i + 1; j < action.targets.length; j++) {
          const key = pair(action.targets[i]!, action.targets[j]!);
          focusCounts.set(key, { count: (focusCounts.get(key)?.count ?? 0) + 1, path });
        }
      }
      if (action.do !== "write") return;
      if (["geometry", "scene3d", "plot", "diagram"].includes(action.kind)) visualAliases.add(action.as);
      if (action.place.anchor) related.add(pair(action.as, action.place.anchor));
      const bindings = action.content.bindings as Array<{ target: string; expression: string; allow_zero?: boolean }> | undefined;
      bindings?.forEach((binding, index) => {
        const bindingPath = `${path}/content/bindings/${index}`;
        const aliases = referencedMathVariables(binding.expression, variables.map(variable => variable.as));
        let complete = true;
        let grid: Record<string, number>[] = [{}];
        for (const alias of aliases) {
          const variable = variables.find(candidate => candidate.as === alias)!;
          const stepSize = variable.control?.step;
          const count = stepSize && stepSize > 0 ? Math.floor((variable.max - variable.min) / stepSize + 1e-9) + 1 : Infinity;
          if (!Number.isFinite(count) || count * grid.length > Math.min(512, remaining)) { complete = false; break; }
          const points = Array.from({ length: count }, (_, k) => Math.min(variable.max, variable.min + k * stepSize!));
          grid = grid.flatMap(values => points.map(value => ({ ...values, [alias]: value })));
        }
        if (!complete || grid.length > remaining) grid = remaining > 0 ? [initial] : [];
        let failure: string | undefined;
        let samples = 0;
        for (const values of grid) {
          remaining -= 1;
          samples += 1;
          try {
            const value = evaluateMathExpression(binding.expression, { ...initial, ...values });
            if (!Number.isFinite(value)) throw new Error("non-finite value");
            if (binding.target.endsWith(".radius") && (value < 0 || (value === 0 && !binding.allow_zero))) {
              throw new Error("invalid radius");
            }
          } catch (error) {
            failure = `${JSON.stringify(values)}: ${error instanceof Error ? error.message : String(error)}`;
            break;
          }
        }
        diagnostics.push({ code: failure ? "BINDING_DOMAIN_INVALID" : complete && grid.length ? "BINDING_GRID_PROVEN" : "BINDING_DOMAIN_UNPROVEN",
          severity: failure ? "error" : complete && grid.length ? "info" : "warning",
          proofStatus: failure ? "disproven" : complete && grid.length ? "proven" : "not_proven",
          scope: "slider_grid", path: bindingPath, samples,
          message: failure ?? (complete && grid.length ? "已枚举此绑定引用变量的有限滑块网格。" : "缺少有限步长或超出枚举预算，不能证明整个滑块域。") });
        if (aliases.length) diagnostics.push({ code: "CONTINUOUS_BINDING_UNPROVEN", severity: "warning", proofStatus: "not_proven",
          scope: "continuous_domain", path: bindingPath, message: "有限滑块网格检查不证明动画或几何拖动的连续取值域；运行时仍校验实际值。" });
      });
    });
  }));
  for (const [key, focus] of focusCounts) {
    const aliases = key.split("\u0000");
    if (focus.count >= 2 && aliases.every(alias => visualAliases.has(alias)) && !related.has(key)) {
      diagnostics.push({ code: "RELATED_VISUALS_SUGGESTION", severity: "warning", proofStatus: "not_proven",
        scope: "authoring_intent", path: focus.path, message: `图形 ${aliases.join("、")} 反复共同聚焦，但未声明直接布局关联；请核对，不自动分组。` });
    }
  }
  return diagnostics;
}
