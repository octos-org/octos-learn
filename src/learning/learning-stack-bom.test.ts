import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("learning stack release BOM", () => {
  it("pins the web Runtime and cross-repository learning contracts", async () => {
    const [bom, packageJson] = await Promise.all([
      readFile(resolve(process.cwd(), "learning-stack-bom.json"), "utf8").then(JSON.parse),
      readFile(resolve(process.cwd(), "package.json"), "utf8").then(JSON.parse),
    ]);
    const web = bom.components.octos_web;
    const coach = bom.components.learning_coach;
    const oll = bom.components.octos_lesson_language;
    const dependency = packageJson.dependencies["octos-lesson-language"];

    expect(bom.schema).toBe("octos.learning-stack.release-bom.v1");
    expect(bom.contracts.learn_trace).toBe("octos.learn.trace.v1");
    expect(dependency).toContain(`#${web.oll_web_runtime_ref}`);
    expect(web.oll_web_runtime_ref).toBe(oll.web_runtime_ref);
    expect(coach.oll_authoring_ref).toBe(oll.authoring_profile_ref);
    expect(coach.package_version).toBe("0.14.0");
    for (const ref of [
      web.main_baseline_ref,
      coach.main_baseline_ref,
      oll.reviewed_main_ref,
      oll.authoring_profile_ref,
      oll.web_runtime_ref,
    ]) {
      expect(ref).toMatch(/^[0-9a-f]{40}$/u);
    }
  });
});
