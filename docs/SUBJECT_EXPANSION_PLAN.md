# Octos Learn subject plugin plan

**Status** — Draft for product-owner review, 2026-11-08. Replaces the earlier discussion draft of this file. Code references were checked at learning-coach `be05941`, octos-lesson-language (OLL) `350d5e0`, octos-learn `e453bd8` and octos-course-library `0781f74` (each repository's `origin/main` on that date).

## 1. Goals

1. Keep extending mathematics.
2. Add other subjects, starting with physics, chemistry and biology (decision E1 in the [Studio expressiveness plan](LEARNER_EXPRESSIVENESS_PLAN.md)).
3. Make every subject, mathematics included, a **plugin**, so the system can grow to teach any subject without rewriting its core.
4. Fold Studio Phase B into this plan. Phase A stays the Studio implementation and acceptance track.

Every subject must work through all three lesson paths: AI-generated lessons (Learning Coach), learner-recorded lessons (Studio) and curated lessons (CoursePacks). All three end as canonical OLL and play in the same runtime.

## 2. Principles

- **Plugins are first-class.** A subject plugin is a real code module. It can carry model guidance, schemas, compilers, Studio tools and runtime rendering. Mathematics is the first plugin, not a special case.
- **Lessons stay declarative.** A lesson names the plugins and versions it needs. It never contains or downloads code. The app or server installs plugins the way it installs any other dependency. This matters here for three reasons:
  - Generated lessons come from a model.
  - CoursePacks and `.olesson` files are downloaded and shared.
  - Replay, validation and compatibility checks only work on data.
- **Program-owned correctness.** The model chooses what to teach. The plugin's code computes quantities, bindings and checks.
- **Speed gate.** No change may slow the first playable section's p50, and the normal path keeps zero added model round trips (`AGENTS.md`, rule 1). Phase B decision E5 still applies: an AI lesson adopts a new capability only after that capability passes the speed gate, as a separate change.
- **One implementation per capability.** Coach, Studio and CoursePacks share the plugin's compiler and renderer instead of each keeping their own copy.

This plan supersedes the "no general plugin system" item in OLL [decision 0004](https://github.com/alan0x/octos-lesson-language/blob/350d5e03ec16233c677b963e949335250f8725e0/decisions/0004-interactive-whiteboard-mvp-boundaries.md), which was scoped to the MVP. The other three items in 0004 stay in force: shared variable state, the runtime living in the OLL repo, and raw ink stored separately. Record the change as a new OLL decision (0012) once the plugin contract in §4 is agreed.

## 3. Where we are

Mathematics already behaves like a single plugin, but its pieces are spread over four repositories and hard-coded in several places.

| Area | Current state | Consequence for plugins |
| --- | --- | --- |
| Coach registry | 13 recipes in one table, `LESSON_PLAN_CAPABILITY_REGISTRY` (`learning-coach/src/lesson-plan.ts:18`). It has no subject dimension. `process_diagram` is the only recipe that isn't math or physics. | The registry becomes the union of the installed plugins' recipes. |
| Coach prompts | Every request lists all 13 recipes (`src/lesson-plan-generation.ts:2892`, `:3020`). About 1.3 KB of recipe-specific rules is hard-coded in the first-section and section system prompts (`:148–180`). Recipe facts are written by hand in `visualsForSection`. | Rules and facts move into each plugin. |
| Coach schemas | The combined first response uses a schema that allows every capability (`src/lesson-plan-schema.ts:444–496`). Later sections narrow to the outline's capabilities (`:660`). | The permitted set must reach the outline, the first section, the fallback call and repairs. |
| OLL runtime | Node kinds and execution features are closed, code-owned tables: `OLL_NODE_KINDS` (`packages/core/src/capabilities.ts:9`) and `OLL_EXECUTION_FEATURES` (`packages/core/src/execution-requirements.ts:6`). Players check requirements before playback (`packages/player-core/src/index.ts:61`). | Needs an extension point so installed plugins can add node kinds, features and renderers. |
| Studio | Has its own panel compilers in `src/learning/teach/compile-recording.ts`; the insert panels are listed at `studio-add.tsx:54–56`. Unit circle and polygon logic duplicates Coach's recipes. | Studio tools should come from plugins and share each plugin's compiler. |
| Learner packages | The `.olesson` manifest records no player version. Its `requiredCapabilities` is a closed list of avatar features (`learner-package.ts:30`). OLL requirements are found only at playback. | Add a declaration of OLL and plugin requirements. |
| CoursePacks | The manifest has `subject`, `minimumPlayerVersion` and `requiredCapabilities` (`octos-course-library/packages/course-pack/src/types.ts:40–44`). The validator and loader check them (`validator.ts:354`, `browser.ts:277`). All 11 packs are mathematics. | Plugin features join the existing declaration. |
| Jev admission gate | Learn calls Jev before every text and voice lesson request and awaits the answer, with a default timeout of 2 s (`src/learning/admission-fast-gate.ts`; `src/learning/learning-workspace.tsx:1533`, `:3020`; `src/api/typesafe-client.ts:65`). It already asks for a `subject` (`math`, `physics`, `general_science`, `language_humanities`, `other`), with per-choice probabilities. The answer is shown only in the debug panel; Coach never receives it. The gate sends text only today. Jev 1.13+ can also read an attached image, once Learn's relay sends Jev's image opt-in header (#132). | Jev becomes the subject signal for plugin selection (§5) with no added model round trip. |
| OLL versions | Each repository pins a different OLL: Learn `2128dc5` (player 0.10.0), Coach `7aec858` (0.5.0), Course Library `1a46385` (0.3.0). | Course Library can't currently publish packs that need player features newer than 0.3.0. Align the pins before the first plugin ships runtime code. |

Measured fixed payload of the normal first request (text/voice, from the bundled `lesson-plan.js` and the prompt sources at `be05941`):

- response schema: about 7.1 KB
- system prompt, before learner context: about 6.7 KB
- `visual_recipes`: 2.8 KB for 13 recipes

At most about 4.5 KB of that is specific to a recipe. Scoping today's math registry would therefore save little. Scoping matters because without it, every new subject would add its full guidance to every request.

## 4. Plugin architecture

### 4.1 What a plugin contains

| Part | Purpose | Used by |
| --- | --- | --- |
| Manifest | Stable ID (`physics`), semantic version, dependencies on other plugins (for example on `shared`), the minimum OLL core version | All |
| Subject description | One short line saying what the plugin teaches. It becomes this plugin's choice in the Jev subject question | Learn (Jev) |
| Recipe cards | One line per recipe: features, numeric inputs, purpose, and any advice on when to choose it | Coach outline |
| Authoring guidance | Detailed rules for writing each recipe's parameters, plus a few targeted examples | Coach first section, sections, repair |
| Schema fragments | Parameter schemas per recipe | Coach provider schema and validation |
| Recipe compilers | Turn validated parameters into OLL authoring actions. Deterministic and tested | Coach, Studio, CoursePack authoring |
| Section facts | Program-computed facts about a visual already on the board | Coach later sections |
| Runtime extensions (optional) | New node kinds, bindable properties, task kinds, reducer logic, web renderer, headless tests, and the execution features they add | OLL player in every app |
| Studio tools | Insert-panel entries, forms and recording events that call the same recipe compilers | Studio |
| Fixtures and samples | One sample lesson per recipe or extension; golden canonical output | Tests, CoursePack authoring |
| Content assets | Pictures or symbol sets, with licence and source recorded per asset | Runtime, Studio |

A plugin may contain only recipes, which compile entirely to existing OLL, or recipes plus runtime extensions. Most subjects start with recipes. New runtime code is only needed when the teaching requires new state, interaction or rendering.

### 4.2 Shared tools are a plugin too

Text, notes, tables, graphs, sliders, diagrams, data charts and the generic task kinds belong to a `shared` plugin that every subject depends on. A physics lesson about reading a graph uses `shared` alone. A lesson about forces uses `physics` together with `shared`.

### 4.3 Where code lives

The proposal is to start plugins as packages in the OLL repository (`packages/plugin-shared`, `packages/plugin-math`, `packages/plugin-physics`, …), versioned with the runtime they extend. Coach, Learn (including Studio) and Course Library depend on the same published versions. Move the plugins to their own repository later if their release cadence diverges from the runtime's.

### 4.4 OLL extension point

- Node kinds, binding capabilities, task kinds and execution features become a core table plus the tables of the installed plugins, assembled at startup by the host.
- Plugin features are namespaced, for example `plugin:physics/vectors@1`, and each one maps to a minimum plugin version.
- `deriveExecutionRequirements` reports plugin features alongside core features. A player that lacks a plugin, or has an older version of it, reports the missing requirement before playback begins.
- Core OLL validation still owns variables, expressions and references. Plugins validate their own node content through a registered validator.

### 4.5 Lesson provenance and compatibility

- Compiled lessons record the plugins and versions that produced them, in compilation metadata, separate from execution requirements. Coach doesn't emit this today: the `capability` key in `lesson-plan-compiler.ts:80` is internal and is not written to the lesson.
- CoursePacks declare plugin features in the existing `requiredCapabilities` field.
- Learner packages gain an optional `oll: { minimumPlayerVersion, requiredCapabilities }` block in the manifest. Keep it separate from the avatar list.
- Published lessons keep playing: an installed plugin version must continue to support every feature version it has ever declared.

## 5. AI generation with plugins

### 5.1 What Coach knows before the first model call

The normal path sends the outline and first section in one call (`generateLessonPlanWithModel`). The fields known before that call are listed in the input allow-list (`src/main.ts:404–419`):

- request text and its request parts
- language, input modality and request source (text, camera or ink selection)
- `current_lesson` text
- learner and tutor context
- teacher profile and teacher experiences

There is no subject field today. The model reads camera and selection images only inside the call itself.

### 5.2 Identifying the subject with Jev

Learn already waits for Jev before sending a text or voice lesson request (§3). Customers configure Jev with their own key (BYOK, decision S9), so it is the main subject signal. Using its answer adds no model round trip.

- **Choices come from the plugins.** Build the Jev `subject` question from the installed plugins' subject descriptions (§4.1), plus `unclear`. This replaces today's fixed five choices, which merge chemistry and biology into `general_science`. The `shared` plugin is never a choice because it is always included.
- **Selection from probabilities:**
  - Select the top plugin when its probability reaches threshold T1.
  - Also select the second plugin when its probability reaches T2. This handles mixed-subject requests.
  - Below T1, or when `unclear` wins, select nothing.
  - Start at T1 0.6 / T2 0.05, the P0 baseline's best setting: 70 of 78 lesson requests scoped correctly, 7 broad, 1 reroute, no unneeded plugin. Confirm on held-out requests before switching scoping on (§9).
- **Context can supply the subject instead:**
  - the plugins recorded for the lesson already on the board (§4.5)
  - the Studio or CoursePack subject
  - the application context of requests that skip the gate (`learning-workspace.tsx:3019`)

  When Jev and the context disagree, Jev's answer about the new request wins if it is confident. Otherwise use both.
- **Camera and selection requests:** attach the frozen camera frame or ink selection to the Jev request (`assets`, through #132). In P0, Jev identified the subject for 9 of 9 readable images and returned clarify for a blurred one. Without the image it answers "unclear" for requests like "help me with this one". TypeSafe labels image input experimental, so if the image call fails, fall back to the text-only answer, then to the context subject, then to the broad request.
- **Hand-off to Coach:** Learn sends `plugins` (selected IDs), `plugin_confidence` and `plugin_source` (`jev`, `context` or `none`) with the lesson request. Coach adds these fields to its input allow-list (`learning-coach/src/main.ts:404–419`), and Octos passes them through unchanged. Coach rejects unknown plugin IDs.
- **No keyword routing.** The subject is a semantic judgement by Jev, in line with the existing admission prompts.

### 5.3 Scoped and broad requests

- **Scoped request,** when at least one plugin is selected. It includes only the `shared` plugin and the selected plugins:
  - recipe cards
  - authoring guidance and examples
  - schema fragments
  - section facts

  Nothing from other plugins is sent.
- **Broad request,** when no plugin is selected because Jev is unavailable, timed out, failed or was not confident. It includes every installed plugin, which matches today's behaviour. The product owner accepted this fallback on 2026-11-08.
- **Prompt caching:** order the blocks the same way every time: shared first, then plugins in a fixed order. Each plugin combination then keeps a stable prefix for Vertex caching. Track `cached_content_tokens`, which `main.ts` already logs.

### 5.4 Recovering from a wrong subject

A scoped request whose subject is wrong could produce a lesson built with the wrong tools. Two rules prevent that:

1. **Explicit reroute.** In a scoped request, the response envelope has a `reroute` field. The model sets it, with a short reason, when teaching the request correctly needs tools it wasn't given. It must do this instead of substituting a weaker tool. This matters because the outline prompt currently encourages replacing an unavailable visual with one that can be built.
2. **Unsupported means reroute.** In a scoped request, a request-coverage result of `unsupported` is treated as a reroute, because it may only reflect the scoping. Only a broad request may tell the learner that a lesson isn't supported.

On reroute, Coach repeats the first call once as a broad request. That is one extra model round trip, which the product owner accepted on 2026-11-08. Coach never reroutes twice, and it logs each reroute as `subject_reroute` with Jev's answer and the reason given.

### 5.5 One permitted set everywhere

The same plugin set drives:

- the first-request and fallback-outline recipe lists
- the outline feature enum and the feature check (`lesson-plan-generation.ts:478`)
- the first-section schema
- section schemas
- repair requests
- section facts
- post-generation validation

## 6. Studio with plugins

- The Insert panel is built from the installed plugins' Studio tools, grouped by subject, with recent items first.
- A tool records ordinary Studio events and calls the plugin's recipe compiler when the lesson is compiled. The resulting OLL matches what Coach would produce for the same parameters.
- The current math panels (graph, grid, unit circle, polygon, 3D solid) move into `plugin-math`. Coach and Studio then share one implementation instead of each keeping its own unit circle and polygon code.
- Phase A acceptance continues unchanged. Its remaining guide lessons ("water cycle", "food chain", "states of matter", "force and acceleration with a slider graph", "cylinder volume") become the first per-subject regression lessons.

## 7. Phase B, merged

Each Phase B item now lands in a plugin. "Recipe" means it compiles to existing OLL. "Runtime" means it needs new OLL semantics: a decision record, schema, reducer, renderer, headless golden and execution feature.

| Phase B item | Plugin | Kind | Notes |
| --- | --- | --- | --- |
| B1 Picture library + labels | shared (assets per subject plugin) | Runtime (labels, leader lines) on the existing `image` + `regions` | Curated, licence-clean pictures only (E3) |
| B2 Task kinds: label, choice, order, match | shared | Runtime | Checked by the runtime, no scripts |
| B3 Free-layout diagram | shared | Runtime | Grid positions, labelled arrows |
| B6 Data charts | shared | Runtime | Bar, line, scatter, dot plot; revisable values |
| B11 Timeline | shared | Runtime | Later |
| B4 Vectors and forces | physics | Runtime | Magnitudes bindable to sliders. Replaces the plain segment the spring recipe uses as its force arrow |
| B7 Circuits | physics | Runtime | Switch state bound to a variable |
| B8 Measuring tools | physics (shared later if chemistry needs it) | Runtime | Readouts put a value on the board |
| B5 Chemical notation, particle models | chemistry | Recipe (`\ce{}` in `math`) + runtime (particles, balance check) | Split into two steps |
| B9 Number line | math | Runtime | A diagram fakes one today (`learner-context-number-line-v2`) |
| B10 Fraction and area models | math | Runtime | Grades 3–6 |
| B11 Geometry constructions | math | Runtime | Polygons by vertices, transformations |

Existing recipes move as they are. Physics gets `spring_and_mass`; its limits (fixed amplitude, phase-only control, no units) are listed as work for B4. `process_diagram` goes to `shared`. All the rest go to `math`.

## 8. Roadmap

### P0 · Contract and baseline

**Status (2026-11-09):** done pending review. OLL pins aligned (learning-coach #39, octos-course-library #10). Payload ceilings, routing cases and the live baseline are in learning-coach #40 (`docs/P0_BASELINE_2026-11-09.md`): first playable p50 8.4 s and p95 16.7 s over 109 lessons. Decision 0012 is proposed in OLL #33. Found along the way, outside plugin scope: optional practice questions that fail a lesson already playing (4 of 5 failures), exact-equality answer checks on rounded science answers, and the gate falsely asking for clarification on clear follow-ups.

- Agree the plugin contract (§4) and record OLL decision 0012.
- Align the OLL pins in Coach, Learn and Course Library.
- Build the fixture set and the payload/latency baseline (§9).

**Exit** — the contract, decision record, pinned commits, fixtures and baseline numbers are reviewed.

### P1 · Mathematics becomes the first plugin

- Move the 13 recipes, the hard-coded rules and the section facts into `plugin-math` and `plugin-shared`, with no change in behaviour.
- Move the Studio math panels to the shared compilers.
- Add the extension point to OLL core (§4.4), with no new features yet.

**Exit** — for every math fixture and every entry point, the provider schema hash and the prompt hash equal the baseline. All 11 CoursePacks and saved learner lessons replay unchanged.

### P2 · Plugin selection in Coach

- Build the plugin-based Jev subject question and pass `plugins`, `plugin_confidence` and `plugin_source` to Coach (§5.2).
- Implement scoped and broad requests, reroute recovery and the single permitted set (§5.3–5.5), behind a config switch.
- Measure Jev's subject accuracy and tune T1 and T2 before switching scoping on.
- Create an empty `physics` plugin holding `spring_and_mass` plus a constant-speed motion recipe built on `shared` graphs.
- Pilot lesson: *How does distance change over time at constant speed?* All three paths are possible with today's tools (the Studio graph panel already supports slider letters). This proves physics routing to a shared tool and parity across the three paths.

**Exit** — the routing fixtures pass, the reroute rate is measured, and the speed gate passes with Jev on and with Jev off.

### P3 · First runtime extension: vectors and forces (B4)

- Build the vector node in `plugin-physics`, with a namespaced execution feature, the Studio tool and the Coach recipe.
- Pilot lesson: the Phase A guide "force and acceleration with a slider graph", built with real vectors.
- This is the first lesson that needs a feature an older player lacks. It exercises the version and plugin checks in the live, Studio and CoursePack paths.

**Exit** — the three paths agree on canonical state at equal slider values. An older player, or one without the plugin, refuses the lesson with a clear message before playback.

### P4 onwards · Breadth

Follow the Phase B order:

1. shared B1 → B2 (label first) → B3
2. physics B4 → B7 → B8
3. chemistry B5
4. shared B6
5. math B9 → B10 → B11

Choosing the next capability depends on:

- how many real lessons it unlocks across subjects and paths
- the quality of its deterministic model
- Phase A device feedback

Math and science items are developed in parallel (decision S5).

## 9. Measurement and gates

**Payload, measured offline for every fixture and every entry point:**

- Entry points: first request, admission, camera, selection, fallback outline, section, repair.
- Bytes: schema, system prompt, prompt and full request bytes, from the existing `schema_bytes` / `system_prompt_bytes` / `prompt_bytes` / `request_bytes` fields.
- A token count of the full request body *including the response schema*, from the provider's counter. Label any other count as an estimate.
- Gates:
  - P1: math is byte-identical.
  - Afterwards: a scoped request contains nothing from unselected plugins, and adding a plugin leaves other subjects' scoped payloads unchanged.
  - **Hard ceilings (decision S6).** Fixed byte and token limits for the full request body, schema included, apply to three cases: a scoped single-plugin request, a scoped two-plugin request and the broad request. Set them in P0 from the measured baseline. Every plugin carries a budget for its own cards, guidance and schema fragments.
  - A test computes every entry point's payload and fails the build when a ceiling or a plugin budget is exceeded. Raising a ceiling requires an explicit change to the plan and a fresh live speed comparison. The broad request has a ceiling too: once all plugins no longer fit, plugins must shrink their cards and guidance; they don't get to raise the limit.

**Subject identification, measured offline against Jev:**

- Labels: each fixture has its expected plugins, or "any" when shared tools suffice.
- Record: top choice, probabilities, latency, timeouts and failures.
- Report: accuracy, and how often requests end up scoped, mixed or broad at the chosen T1 and T2. Break this down by short, mixed, English, Chinese and camera/selection requests.

**Live comparison:**

- Conditions: baseline and candidate interleaved per case. Same model, route, thinking level and output limit, in the same time window.
- Sample: at least 40 pairs for speed.
- Fixtures:
  - Coach's `eval/lesson-plan-generation-cases.json` and `testsuite/math-natural-course-cases.json`
  - new science cases: about 10 per plugin
  - about 8 ambiguous, 8 mixed-subject and 8 camera or selection cases
  - 5 follow-up cases
- Record:
  - prompt, cached, candidate and thought tokens
  - model calls
  - local rejections per part
  - fallback from the first request to the outline-only call
  - reroute rate, and the first-playable time of rerouted requests
  - whether Jev was available, and the selected plugins and their source
  - outcome (lesson, clarify, ignore, unsupported)
  - route correctness against the expected plugins
- First playable: the first `lesson-prefix-published` event plus the client timing. The p50 is the gate; p95 is a diagnostic.
- Quality: a blinded rubric covering goal match, whether the visual shows the right relationship, agreement between narration and visual, subject accuracy, and request coverage.

**Compatibility:**

- Existing CoursePacks and saved learner lessons replay.
- Known and unknown plugin requirements are exercised in the Learn player, the learner-package viewer and the Course Library validator and loader.

**Rollout:** the config switch stays reversible until the live comparison passes. Plugins are enabled one by one.

## 10. Decisions for the product owner

**Decided (2026-11-08)**

| # | Question | Decision |
| --- | --- | --- |
| S1 | How is the subject identified before generation? | Jev, using each customer's own key (§5.2) |
| S2 | What happens when Jev is unavailable or not confident? | A broad request with all plugins (§5.3) |
| S3 | Is one extra model round trip acceptable to recover from a wrong subject? | Yes, once per request (§5.4) |

**Decided (2026-11-09)**

| # | Question | Decision |
| --- | --- | --- |
| S4 | Where do plugins live? | Start as packages in the OLL repository (§4.3) |
| S5 | Order of math and science | Develop math (B9–B11) and science items in parallel (§8) |
| S6 | Payload gate | "A scoped request contains nothing from unselected plugins", plus hard ceilings on payload size (§9) |
| S7 | Learner package format | Add the `oll` requirements block to the `.olesson` manifest (§4.5) |
| S8 | Third-party plugins | First-party plugins only for now |
| S9 | How Jev is provided | Jev stays BYOK: each customer uses their own Jev key, managed through Octos like ASR and TTS. No shared platform credential is shipped. |

## 11. Where to start reading

| Repository | Source |
| --- | --- |
| `learning-coach` | `src/lesson-plan.ts` (registry), `src/lesson-plan-generation.ts` (prompts, `generateLessonPlanWithModel`), `src/lesson-plan-schema.ts`, `src/lesson-plan-compiler.ts`, `src/main.ts` (input allow-list, payload telemetry), `data/topic-catalog` |
| `octos-lesson-language` | `decisions/0004-interactive-whiteboard-mvp-boundaries.md`, `packages/core/src/capabilities.ts`, `packages/core/src/execution-requirements.ts`, `packages/player-core/src/index.ts`, `SPEC.md` |
| `octos-learn` | [Studio expressiveness plan](LEARNER_EXPRESSIVENESS_PLAN.md) (Phase B, decisions E1–E5), `src/learning/admission-fast-gate.ts` (Jev), `src/learning/learning-workspace.tsx`, `src/learning/teach/compile-recording.ts`, `studio-add.tsx`, `learner-package.ts`, `src/learning/course-pack/course-pack-loader.ts` |
| `octos-course-library` | `packages/course-pack/src/types.ts`, `validator.ts`, `browser.ts` |
