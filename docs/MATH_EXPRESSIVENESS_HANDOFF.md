# Handoff: math expressiveness work

As of 2026-11-18. Read in this order:

1. **This file.** It covers state, rules, tools and traps.
2. **`docs/MATH_WORK_STACK.md`**: the status page. It shows where we are, why, and what needs the owner. Keep it updated.
3. **`docs/MATH_EXPRESSIVENESS_PLAN.md`**: the plan, which is the contract.
   - §5 is the definition of done for a component.
   - §7 is the sequence.
   - §8 holds the decisions, including the M4 speed rule as revised on 2026-11-18.
4. **OLL decisions 0020 and 0019**, in `octos-lesson-language/decisions/`.
   - 0020 is the standing rule.
   - 0019, as amended, is the 3D design (shipped 2026-11-18).
5. **The Coach run records for 3D:** `learning-coach/docs/SOLIDS_JUDGE_2026-11-17.md` and `docs/SOLIDS_PROBE_2026-11-17.md`.

## 0. Where things stand (2026-11-18)

**3D solids (plan step 3.7) is finished and on.** Every PR is merged, and no PRs of this work are open.

| PR | What | Merged |
|---|---|---|
| OLL #73 | `buildSolid`: a second solid `beside`; the program-computed measures line `show` (exact fractions; `=` only for ≤ 3 decimal places or nπ/d, d ≤ 12); the L-shaped `two_boxes` composite; `cutRange`; player 0.13.0 with feature `scene3d:caption`; `check:solids-browser` | f712bc4 |
| Learn #165 | Pins OLL f712bc4. Studio's `SolidChoice` excludes `two_boxes`. | yes |
| Coach #116 | Solids judge and 22 SD cases, the `solid_3d` recipe (then a trial), harness support, probe and gate records | c7727af |
| Coach #117 | Revised speed-gate script (`scripts/speed-gate.mjs`) | yes |
| Coach #118 | Switch-on: `solid_3d` last in the catalog; `cube_with_section` in `RETIRED_RECIPES` | f50f239 |
| Coach #119 | M1 re-tag after the switch-on (`testsuite/math-expressiveness-m1-2026-11-18.json`) | yes |

**What it took:**
- **Paid calls:** three probes (6 → 10 → 13 of 16 SD cases) and five speed-gate runs. The gate passed at the 80-pair cap: fitting requests −2.17 s; other requests median +0.24 s (interval −0.81 to +1.26 s).
- **Review:** five rounds on the judge and the measures. They left exactness on exact fractions and noise-only comparisons (trap 14).
- **Request cost:** +801 B, accepted by the owner.
- **Defaults on `main`:** the default request is byte-identical to the one the gate measured. 132 of 139 recorded lessons replay identically; the other 7 had asked for the retired cube and now get a new outline.
- **M1:** pictures fully drawn rose from 33 to 35 of 145. The top of the candidate ranking is unchanged: fraction area models, counters and ten frames, data charts.

**Next (plan §7, the work stack's L3):**
1. **Decided (owner, 2026-11-18):** the rest of 3.6 goes before the 60-question re-run (3.8).
2. **The rest of 3.6** (order and stop rule in the work stack's L3):
   - free: program checks (stand-in counts, animations that change nothing, wrong arithmetic in praise messages), 6c, the open part of 6d, and the two renderer defects in plan 3.6 (slope triangle across a pole, cancellation near a = 0);
   - paid: the outline's "no visual" rule (a control-arm probe, then the gate; dropped if the probe shows no benefit).
3. **3.8:** one 60-question re-run (paid). It closes step 3.
4. **Step 4:** new components in strict M1 order (fractions and area models first).
5. **3.5 slice 3:** Studio graph forms, moved after 3.8 (owner, 2026-11-18).
6. **Side track** (work stack L4, items 6–9): split the plan's history out, the cumulative speed benchmark, the fractions decision record draft.
- **New rule (owner, 2026-11-18):** every paid probe or gate states a written pass bar first (plan §5).
- **There is no real-learner data yet** (owner, 2026-11-18).

**Known and accepted (not blocking):**
- An open-top box is a near miss: surface area is always the whole surface.
- A teacher-driven cut or net is a later 0020-style field; the slider is learner-only in v1.
- Narration can state numbers that disagree with the measures line, or promise motion. Probes read this by hand; a regex check waits for a census of recorded messages.
- A periodic cumulative speed benchmark of `main` against a frozen reference is proposed (budget +1.5 s), not yet built.
- `TRIAL_RETIRES` is empty. It is kept for the next trial that replaces a recipe.

**Merge order for any new player feature: OLL → Learn → Coach** (trap 3).

## 1. Repositories

All live side by side under one `OctosLearn/` folder (on this Mac: `/Users/yy/Documents/projects/OctosLearn`).

| Repo | GitHub | Role |
|---|---|---|
| **learning-coach** ("Coach") | `alan0x/learning-coach` | Generates the lesson with the model, then validates and compiles it. Most work happens here. |
| **octos-lesson-language** ("OLL") | `alan0x/octos-lesson-language` | Lesson language, core validation, player (web-runtime), math plugin builders (`packages/plugin-math`). |
| **octos-learn** ("Learn") | `octos-org/octos-learn` | The app, Studio, and the plan docs (this file). |
| `handoff-math-expressiveness/` | not in git | Run evidence (`runs/`) and replay/re-judge tools (`tools/`). |

**Coach map:**
- Recipes: `src/plugins/math.ts` (cards and schemas), `src/plugins/math-compilers.ts` (compile; `compileSolid3d`), `src/plugins/math-hooks.ts` and `src/plugins/plot-bindings.ts`.
- Trial switch: `src/plugins/index.ts`.
  - `TRIAL_RECIPES` and `TRIAL_RETIRES`.
  - A trial is offered only when named in the env `LEARNING_COACH_TRIAL_RECIPES`, so default requests stay byte-identical.
  - `SCHEMA_PROPERTY_ORDER` sets the order in which the model sees fields (trap 10).
- Model loop: `src/lesson-plan-generation.ts`. Compiler: `src/lesson-plan-compiler.ts`. Card reuse: `src/compiled-visual-reuse.ts`. Lesson language: `src/lesson-text.ts`.
- Judges: `scripts/plot-judge.mjs`, `scripts/solids-judge.mjs`, and the number-line steps judge. Cases are in `testsuite/*-judge-cases.json`.
- `scripts/case-overlap.mjs` checks that new probe cases are not near copies of open or held-out questions.

**OLL map for 3D:** `packages/plugin-math/src/solids.ts` (`buildSolid`) and `solid-measures.ts`.
- Exact measures use BigInt fractions built from the sizes' decimal digits.
- "=" is shown only for at most three decimal places, or for nπ/d with d ≤ 12; otherwise "≈".

**How the repos depend on each other:**
- Coach and Learn pin OLL by commit.
- Coach also records the pin in `oll-contract.json` (the build checks it) and commits its built `lesson-plan.js` and `main`.
- Learn records the pin in `package.json`, `pnpm-lock.yaml` and `learning-stack-bom.json`.

## 2. Working with the owner

**Approval and money:**
- **Every paid model call needs the owner's prior approval, stating the model, purpose and expected call count.** Ask for paid steps one at a time.
  - Report token totals.
  - Don't state prices you haven't verified. The route is google / gemini-3.6-flash. As checked on 2026-11-15, it costs $0.75 per 1M input tokens, $0.075 per 1M cached and $3.75 per 1M output (thinking included) until 2026-12-31, and prices double from 2027-01-01.
- **Prefer offline testing**: replays, fixtures, judges over saved lessons.

**PRs and merging:**
- Open PRs in English, one commit per task, each branched from the latest main.
- **Label every PR you report "Needs code review" or "No review needed"**, with a one-line reason.
  - Lessons, requests, recipes, renderers and judges need review.
  - Pins, docs and records don't.
- **Merge authority:** you may merge pin bumps, docs-only and evaluation-only PRs yourself once tests pass. The owner merges everything that changes lessons, requests, recipes or renderers.
- **Reviews are capped at two rounds.** Only a wrong or misleading picture or narration blocks; list the rest as "Known issues" in the PR body. (#73 and #116 had a third round, from the owner's own review.)

**Communication:**
- **Short answers, with recommendations rather than surveys.** Point to the work stack for detail. Avoid inflated framing.
- **Keep `docs/MATH_WORK_STACK.md` current** (a docs PR you merge yourself). Also keep a rendered copy as a claude.ai artifact if you can.
- **Use a reviewer model at key points if you have one**: before committing to an approach, and before declaring done. Review agents must not check out branches in the main repos, and must never symlink `node_modules`.

**The two principles (2026-11-16), applied together:**
1. The model writes creative, instructional and semantic content; deterministic code does strict logic (cross-references, derived values, ranges, bindings).
2. The program expects random model output and accommodates it as far as it can, while still ending correct.
- **The rule that reconciles them (owner's words):** "Model-generated wording must never determine what is actually drawn. Mathematical correctness must be enforced through validated structured data and deterministic logic." Wording may trigger a refusal or re-ask, never choose a drawn value.
- **The ladder (0020):** make every intent expressible in the schema → normalize when the fields admit exactly one reading → derive → drop only parts nothing narrates → retry narrowed → refuse only meaning faults.

## 3. Data rules

- **Held-out questions:** a quarter of the 160-question set (`testsuite/math-expressiveness-question-set.json`) is held out.
  - Never quote held-out questions.
  - Never use the question set to tune prompts or cards. Write probe cases separately (PA-, PJ-, SD- and so on) with expectations written before the code, and check them with `case-overlap.mjs`.
- **Private material:** keep credentials, private lesson content and personal details out of PRs, notes and repos. Print only provider and model, never a key.

## 4. Request size and speed

- Every change to what the model is asked needs:
  - its byte cost measured (`handoff-math-expressiveness/tools/reqbytes.mjs <built lesson-plan.js>`);
  - a paired test;
  - the speed gate.
- `npm test` in Coach fails if any default request or produced lesson changes (`eval/request-hashes.json`).
  - Re-record with `node scripts/measure-lesson-payload.mjs --record-hashes` only when the change is intended.
- **3D cost:** the trial adds +801 B to the request (the owner accepted it; cap history in OLL 0019's amendments).

## 5. Tools and evidence

**Speed and quality harness:** `scripts/eval-trial-recipe-speed.mjs` in Coach.
- Flags: `--build`/`--baseline-build`, `--both-arms`, `--recipes <key>`, `--pairs`, `--other-cases`, `--quality-repeats`, `--lesson-calls 4` (what Coach really does), `--max-calls`, `--octos-profile <profile json>`.
- It keeps raw model replies and compiled parts in its `work_dir` (a temp folder named in the report). Copy that folder into `handoff-math-expressiveness/runs/` afterwards; temp folders get cleaned.
- **Known quirk:** calls are counted when a model call starts, so an aborted next-section call still counts.
- The exact gate command used for runs 1c, 1d and 1e (1e with `--pairs 1 --max-calls 8`), from `learning-coach/` with Node 22 on the PATH:

  ```
  node scripts/eval-trial-recipe-speed.mjs --build <frozen build dir> --octos-profile <profile json> --pairs 20 --recipes solid_3d --other-cases HO-MA-01,HO-PH-02,HO-CH-01,HO-BI-01,HO-ES-01,HO-MA-04,HO-PH-04,HO-CH-04,HO-BI-04,HO-ES-04 --quality-repeats 0 --lesson-calls 4 --max-calls 50 --out <run.json>
  ```

  The frozen build is `handoff-math-expressiveness/runs/solids/gatebuild`; runs 1c to 1e used this build.
  To replay one recorded request offline, use `tools/replay-one.mjs <build> <raw-model.txt> <case id>`. Its trial request bytes match run 1's: prompt 4384, schema 8525.

**Speed gate (revised M4, owner 2026-11-18; plan §8):** `scripts/speed-gate.mjs` in Coach.
- **Measure:** per request, the generated tokens (output plus thinking, every call) converted to seconds at the run's fitted rate (about 5.4 ms per token + 1.7 s; r² ≈ 0.69).
- **Judge:** fitting and other requests separately, using a seeded bootstrap 95% interval of the paired median.
  - Pass if the upper end is ≤ +0.5 s.
  - Fail if the lower end is > +0.5 s.
  - Otherwise add 20 pairs, each extension approved by the owner. At 80 pairs, the median decides.
  - A planned group with no complete pairs is "incomplete".
- **Pool runs:** `node scripts/speed-gate.mjs a.json b.json …`. The harness's `summary.speed` is the revised verdict; `speed_wall_clock` is only for reference.
- **Why it changed:** extra *thinking* tokens, not input size, drive the cost. Wall-clock pairs are too noisy (per-pair sd about 4.8 s) to settle ±0.5 s with 20 pairs.
- **Don't change the rule to fit a result.**

**3D evidence** (`handoff-math-expressiveness/runs/solids/`):
- `probe-1`…`probe-3` and `gate-1`, `gate-1b`, `gate-1c`, `gate-1d`, `gate-1e`. Each has the run JSON (with `work_dir` pointed at its copied `work/`) and the log.
- `gatebuild/`: the frozen candidate build.
- `replay-main.jsonl`: the replay of main to compare against.

**Replays and re-judging (free)**, in `handoff-math-expressiveness/tools/`:
- `replay-every.sh <coach root> <out.jsonl>`: replays every recorded run's raw replies through a Coach build (139 lessons). Compare with a replay of main. A change that is meant to leave lessons alone must give identical lines.
- `replaystrip.mjs`, `rejudge.mjs` and `fixstrip/`: replay with an expected flag removed, and old judge against new over saved parts.
- `reqbytes.mjs`: request bytes of a build.
- Some older tools still hard-code `/Users/mali/...`. Fix the path when you use one.

**OLL checks:** `npm run check:plot-browser`, `check:number-line-browser` and `check:solids-browser`. New behaviour gets a check that fails on main.

**Test counts at handoff:** OLL 554, Coach 582 and Learn 2049 unit tests, all passing.

## 6. Traps learned the hard way

1. **zsh:**
   - Quote globs. `grep --include=*.ts` silently fails ("no matches found"), and the search then looks empty.
   - Unquoted variables don't word-split; use `${=var}`.
2. **OLL contract:** after changing Coach's OLL pin, update `oll-contract.json` too, or the build fails. Commit the rebuilt `lesson-plan.js` and `main`.
   - If built artefacts change unexpectedly, `node_modules` probably holds a different OLL. Run `npm ci`.
   - Stale `node_modules` also makes judge tests fail oddly.
3. **Player versions gate merge order.** Learn's player checks lessons with its own OLL. A lesson using a new player feature plays on an older Learn without refusing, but may draw wrongly. So a new feature version means: OLL merged → Learn pin bump → Coach.
4. **Card reuse identity** (`compiled-visual-reuse.ts`) compares bindings. Reuse keeps a visual's own variables (the solids slider) only when its card is written anew.
5. **A lesson that fails part-way never completes.** Browser-check loops need a step bound.
6. **Regex checks over model prose** need a census on recorded messages before shipping.
7. **Look past the field to the intent.** Before accommodating a model output, ask whether "one reading" holds for the model's intent, not only for the field as written. (Sorting reversed boundaries could draw the complement; reverted in #108.)
8. **Git hygiene:**
   - Never symlink `node_modules` into a worktree.
   - Check `git status` before `git add`.
   - **Force-push is blocked: merge main into a pushed branch, never rebase it.**
   - Push with `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push`.
9. **Learn's `pnpm test` is the full Playwright suite.** It is slow and regenerates screenshots under `docs/`. For a pin bump, run `npx vitest run` and `npx tsc --noEmit -p .`, and let CI run the end-to-end smoke test. Never `git commit -a` in Learn after a local Playwright run.
10. **The owner's PR reviews and your replies post from the same GitHub account** (`alan0x`). Read the body of every comment newer than your last reply: reviews carry **[P1]/[P2]** findings, and replies start with "Fixed in".
11. **A classifier may deny some actions** (it has denied reading held-out raw replies, and auto-merging). Don't retry; ask the owner.
12. **The provider writes object properties in schema order.** A field listed before the one the model wants to start with can never be written. 3D probe 1 failed because the height came before the radius. Order every model-facing object's fields so each intended combination can be written in order.
13. **Number fields reach the model as `{mantissa, scale}` decimals.** `coerceModelNumbers` decodes nested values; schema bytes grow about 31 B per number field.
14. **Exactness is never a float tolerance.** OLL measures use exact fractions. The solids judge matches a rounded value to half a unit of its last shown digit, with a 64-ulp floor. Three review rounds found the float-tolerance versions wrong.

## 7. Local environment (this Mac)

- Node 22 is user-local: `export PATH=$HOME/.local/node22/bin:$PATH`. pnpm is in the same tree.
- Octos solo: `octos/target/release/octos serve --host 127.0.0.1 --port 50080 --solo` with `OCTOS_LEARN_HISTORY_URL=http://127.0.0.1:5173`.
- Learn: `pnpm dev --port 5173 --strictPort`.
- The owner's Octos profile JSON is under `~/.octos/profiles/`. Paid runs pass it as `--octos-profile`. Never print its contents.
