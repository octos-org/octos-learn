# Handoff: math expressiveness work

As of 2026-11-17. Read in this order:

1. **`docs/MATH_WORK_STACK.md`**: where we are, why, and what needs the owner. Keep it updated.
2. **`docs/MATH_EXPRESSIVENESS_PLAN.md`**: the plan, which is the contract. §5 is the definition of done for a component; §7 is the sequence.
3. **OLL decisions 0020 and 0019**, in `octos-lesson-language/decisions/`. 0020 is the standing rule; 0019 (as amended) is the 3D design you build next.

This file covers what those don't: state, conventions, tools and traps.

## 1. Repositories

All three live side by side under one `OctosLearn/` folder.

| Repo | GitHub | Role |
|---|---|---|
| **learning-coach** ("Coach") | `alan0x/learning-coach` | Generates the lesson with the model, then validates and compiles it. Most work happens here. |
| **octos-lesson-language** ("OLL") | `alan0x/octos-lesson-language` | Lesson language, core validation, player (web-runtime), math plugin builders (`packages/plugin-math`). |
| **octos-learn** ("Learn") | `octos-org/octos-learn` | The app, Studio, and the plan docs. |

**Coach map:**
- Math recipes: `src/plugins/math-compilers.ts` (compile), `src/plugins/math-hooks.ts` (`lower_model_parameters`, run before the schema filter) and `src/plugins/plot-bindings.ts`.
- Model loop: `src/lesson-plan-generation.ts`. Compiler: `src/lesson-plan-compiler.ts`.
- Card reuse: `src/compiled-visual-reuse.ts`.
- Judges: `scripts/plot-judge.mjs` (cases in `testsuite/plot-judge-cases.json`, PJ-01…) and the number-line steps judge.

**How the repos depend on each other:**
- Coach and Learn pin OLL by commit.
- Coach also records the pin in `oll-contract.json` (the build checks it) and commits its built `lesson-plan.js` and `main`.
- Learn records the pin in `package.json`, `pnpm-lock.yaml` and `learning-stack-bom.json`.

## 2. Working with the owner

- **The owner merges PRs.** Merge only PRs the owner names. Open PRs in English, one commit per task, each branched from the latest main.
- **Paid model runs need explicit owner approval, with the call count, before running.**
  - Report token totals.
  - Don't state prices you haven't verified. The route is google / gemini-3.6-flash. As checked on 2026-11-15, it costs $0.75 per 1M input tokens, $0.075 per 1M cached and $3.75 per 1M output (thinking included) until 2026-12-31, and prices double from 2027-01-01.
- **The owner wants short chat answers, with recommendations rather than surveys.** Point to the work stack page for detail. Inflated framing ("major architectural redesign") confused them before. Decision 0020 is a rule applied as fields are touched, not a project.
- **Use an advisor or reviewer model at key points if you have one**: before committing to an approach, and before declaring done. Code-review agents must not check out branches in the main repos, and must never symlink `node_modules`.
- **The two principles (2026-11-16), applied together:**
  1. The model writes creative, instructional and semantic content; deterministic code does strict logic (cross-references, derived values, ranges, bindings).
  2. The program expects random model output and accommodates it as far as it can, while still ending correct.
  - **The rule that reconciles them:** wording may trigger a refusal or re-ask, never choose a drawn value.
  - **The ladder:** make every intent expressible in the schema → normalize when the fields admit exactly one reading → derive → drop only parts nothing narrates → retry narrowed → refuse only meaning faults.

## 3. Data rules

- **Held-out questions:** a quarter of the 160-question set (`testsuite/math-expressiveness-question-set.json`) is held out. Never quote held-out questions, and never use the question set to tune prompts or cards. Probe cases (PA-, PJ-, SD- and so on) are written separately for that.
- **Private material:** keep credentials, private lesson content and personal details out of PRs, notes and repos. When logging a route, print only the provider and model, never a key.

## 4. Next work: 3D solids (plan 3.7, decision 0019 §5)

Free work comes first. The paid steps need approval.

1. **OLL render work** (`packages/plugin-math/src/solids.ts`, `buildSolid`):
   - `beside`: a second solid along x, with the camera framing both.
   - The `show` line under the solid (volume, surface area, face/edge/vertex counts), computed by the program.
   - The L-shaped composite of two boxes side by side.
   - A browser check that includes two solids in one frame.
   - A new player or plugin feature version, if a renderer change needs one (see trap 3).
2. **Solids judge and cases before the recipe:**
   - SD-01 onward, written fresh, with expectations written in advance;
   - counter-examples (wrong shape, wrong volume, missing unfold);
   - near misses that are out of scope (plane figures, a torus, pouring demos, stacked unit cubes).
3. **Coach recipe `solid_3d`:** card, schema, compiler and tests.
   - Dimensions are plain numbers.
   - The model writes `interaction: "cut" | "unfold"`, and the program creates that slider and its range (0019 amendment).
   - Card plus schema ≤ 600 B, measured on a prototype first.
   - Replays of recorded lessons must be unchanged.
4. **Paid probe, then speed gate.** Ask the owner first, with call counts.
5. Then Coach and Learn pin the new OLL. Merge order: OLL → Learn → Coach.

After 3D: Studio graph forms (3.5 slice 3), the rest of 3.6, then the 60-question re-run (3.8). Raise the 3.6-before-or-after-3D choice with the owner before the re-run.

## 5. Tools and evidence

- **Speed and quality harness:** `scripts/eval-trial-recipe-speed.mjs` in Coach.
  - Flags: `--baseline-build`, `--both-arms`, `--recipes <key>`, `--pairs`, `--quality-repeats`, `--lesson-calls 4` (what Coach really does), `--max-calls`, `--octos-profile <profile json>`.
  - It keeps raw model replies and compiled parts in its `work_dir` (a temp folder named in the report).
  - **Known quirk:** calls are counted when a model call starts, so a next-section call that is aborted still counts. Counting completed calls is a pending follow-up.
- **Request and lesson digests:** `eval/request-hashes.json`.
  - `npm test` fails if any model request or produced lesson changes. Re-record with `node scripts/measure-lesson-payload.mjs --record-hashes`.
  - **The hashes part must not change unless you meant to change a request**; a request change needs a paired test and a speed gate.
- **Replays and re-judging (free):** the local `handoff-math-expressiveness/tools/` folder (not in git) has:
  - `replay-every.sh` with `replayall.mjs`: replay every recorded run's raw replies through a Coach build;
  - `replaystrip.mjs`: the same, with an expected flag removed before hashing;
  - `rejudge.mjs`: old judge against new over saved lesson parts;
  - `fixstrip/`: fixture digests with an expected flag removed.
  - Evidence from runs is under `handoff-math-expressiveness/runs/`.
  - **Run records in Coach:** `docs/PLOT_POINTS_PROBE_2026-11-16.md`, `docs/RETRY_NARROWING_CHECK_2026-11-16.md`.
- **OLL browser checks:** `npm run check:plot-browser` and `npm run check:number-line-browser`. New behaviour gets a check that fails on main.

## 6. Traps learned the hard way

1. **zsh:** quote globs. `grep --include=*.ts` silently fails ("no matches found"), and the search then looks empty.
2. **OLL contract:** after changing Coach's OLL pin, update `oll-contract.json` too, or the build fails. Commit the rebuilt `lesson-plan.js` and `main`.
3. **Player versions gate merge order.** Learn's player checks lessons with its own OLL. A lesson using a new player feature plays on an older Learn without refusing, but may draw wrongly. So a new feature version in OLL means: OLL merged → Learn pin bump → Coach.
4. **Card reuse identity** (`compiled-visual-reuse.ts`) compares bindings. A new binding option can stop a standalone plot from reusing a composite's identical plot. Three reuse tests catch this.
5. **A lesson that fails part-way never completes.** Browser-check loops need a step bound, or they hang instead of failing.
6. **Regex checks over model prose** (for example, arithmetic in messages) need a census on recorded messages before shipping.
7. **Look past the field to the intent.** Before accommodating a model output, ask whether "one reading" holds for the model's intent, not only for the field as written. Sorting reversed boundaries looked safe but could draw the complement of the narrated set (reverted in #108).
8. **Git hygiene:**
   - never symlink `node_modules` into a worktree or scratch copy;
   - check `git status` before `git add`;
   - force-push is blocked.
   - In this environment, push with `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push`.
9. **A classifier may deny some actions.** It has denied reading a held-out question's raw replies and auto-merging a PR. Don't retry; ask the owner.

## 7. Local environment (this Mac)

- Node 22 is user-local at `~/.local/node22/bin`; pnpm is in the same tree.
- Octos solo: `octos/target/release/octos serve --host 127.0.0.1 --port 50080 --solo` with `OCTOS_LEARN_HISTORY_URL=http://127.0.0.1:5173`.
- Learn: `pnpm dev --port 5173 --strictPort`.
- The owner's Octos profile JSON (under `~/.octos/profiles/`) is what paid runs pass as `--octos-profile`.
