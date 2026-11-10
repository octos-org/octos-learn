# Octos Learn subject plugin plan

**Status** — Revised plan accepted 2026-11-09. Replaces the earlier discussion draft of this file. Code references were checked at learning-coach `be05941`, octos-lesson-language (OLL) `350d5e0`, octos-learn `e453bd8` and octos-course-library `0781f74` (each repository's `origin/main` on that date).

**Review (2026-11-09)** — after P0 and the P1 migration merged, the plan was reviewed against `origin/main` of all four repositories and the P0 baseline. The work that follows from it is listed in §13. The product owner accepted the review's changes the same day (decisions S6 revised, S10–S15 in §11): P1 gets a close-out list, P2 starts with a payload experiment and runs in shadow mode, the first science capabilities move forward, the ceilings get headroom, and the plan gains an Earth and space science plugin, a "none of these" subject choice, a grade-level input and an accuracy approach for subjects the program cannot compute.

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

- **Choices come from the plugins.** Build the Jev `subject` question from the installed plugins' subject descriptions (§4.1), plus `none` and `unclear`. This replaces today's fixed five choices, which merge chemistry and biology into `general_science`. The `shared` plugin is never a choice because it is always included.
  - `none` means Jev is confident the request belongs to no installed subject, such as history or language. It selects the `shared` plugin alone (decision S13). §5.4's reroute still applies if the lesson turns out to need a subject tool.
  - `unclear` means Jev cannot tell. It selects nothing, which gives the broad request.
  - The subject plugins are `math`, `physics`, `chemistry`, `biology` and `earth_space` (decision S12). Earth and space science is one of the three core science strands in US K–12 standards, and the Phase A guide lesson "water cycle" belongs to it.
- **Selection from probabilities:**
  - Select the top plugin when its probability reaches threshold T1.
  - Also select the second plugin when its probability reaches T2. This handles mixed-subject requests.
  - When `none` reaches T1, select `shared` alone.
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

**Order of work (decision S6, revised 2026-11-09).** Coach first receives the selected plugins in *shadow mode*: it logs them and still sends the broad request. Scoped requests and the reroute of §5.4 are built only when one of two triggers fires: the payload experiment in P2 shows that request size costs first-playable time, or the broad request comes within its headroom of the ceiling (§9). The design below is what gets built then.

Jev is optional and uses the customer's own key, so a customer without Jev always gets the broad request. The broad request therefore has to stay good and fast in its own right, and the share of lesson requests that arrive with a Jev answer is recorded (§9).

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

`earth_space` and `biology` start with no runtime code of their own. They carry a subject line, recipe cards and authoring guidance over the shared tools (B1 pictures and labels, B3 diagrams, B6 charts), plus their picture assets. Five of the twelve rows above land in `shared`, which every request carries, so `shared` has its own payload budget (§9).

Existing recipes move as they are. Physics gets `spring_and_mass`; its limits (fixed amplitude, phase-only control, no units) are listed as work for B4. `process_diagram` goes to `shared`. All the rest go to `math`.

## 8. Roadmap

### P0 · Contract and baseline

**Status (2026-11-09):** done pending review. OLL pins aligned (learning-coach #39, octos-course-library #10). Payload ceilings, routing cases and the live baseline are in learning-coach #40 (`docs/P0_BASELINE_2026-11-09.md`): first playable p50 8.4 s and p95 16.7 s over 109 lessons. Decision 0012 is proposed in OLL #33. Found along the way, outside plugin scope: optional typed questions that fail a lesson already playing (4 of 5 failures) and exact-equality answer checks on rounded science answers, both fixed in learning-coach #41. Two clear follow-ups pass the gate only through its pass-through rule, so any change to the gate's questions must recheck them.

- Agree the plugin contract (§4) and record OLL decision 0012.
- Align the OLL pins in Coach, Learn and Course Library.
- Build the fixture set and the payload/latency baseline (§9).

**Exit** — the contract, decision record, pinned commits, fixtures and baseline numbers are reviewed.

### P1 · Mathematics becomes the first plugin

**Status:** closed under the local acceptance scope in §13.1. Decision 0012 is accepted (OLL #40) and describes two layers for each plugin:
- **Shared layer**, in OLL `packages/plugin-<id>`: manifest, Jev subject line, and recipe builders that take neutral input and are used by Coach, Studio and Course Library.
- **Generation layer**, in Coach `src/plugins/`: prompt rules, schema fragments, section facts and generation hooks, for Coach only.

Merged:
- **Byte-identity check:** learning-coach #42, covering 1,680 request digests plus each run's lesson.
- **Coach's generation layer** for `math`, `physics` and `shared`: learning-coach #43 and #44. The compiler dispatches through the installed recipe registry after the close-out.
- **Shared layers in OLL:**
  - `plugin-math`: all 11 math recipes plus Studio's 3D solids (OLL #34, #35, #36, #38);
  - `plugin-shared`: the process diagram (#35);
  - `plugin-physics`: the spring (#37).
- **Coach builds every recipe with these builders,** with requests and lessons byte-identical: learning-coach #45 to #48.
- **Studio uses the builders** for the unit circle, polygon, graph, diagram and 3D solids: octos-learn #133 and #134. Current Studio recordings and hand-edited OLL use the same authoring workflow.
- **OLL extension point:** OLL #39. Plugin features (`plugin:<id>/<name>@<major>`), `requiredPlugins`, and refusal of a missing or outdated plugin before playback.

Still open:
- Hosts passing installed extensions to the player; this comes with P3's first runtime extension.
- Coach adopting Studio's solids for AI lessons, which is a deliberate output change.

**Close-out.** The implementation, merge order and local acceptance evidence are recorded in §13.1. Coach's math-only answer path remains a known exception outside the recipe compiler.

- Move the 13 recipes (11 math, `spring_and_mass` to `physics`, `process_diagram` to `shared`), the hard-coded rules and the section facts into their plugins, with no change in behaviour.
- Move the Studio math panels to the shared compilers.
- Add the extension point to OLL core (§4.4), with no new features yet.

**Exit** — for every math fixture and every entry point, the provider schema hash and the prompt hash equal the baseline. All 11 CoursePacks replay unchanged, and current Studio recordings can be saved, exported and played. Development recordings predating the change are outside the P1 acceptance scope. Camera and selection paths are checked with automated fixtures. Physical camera and live Jev verification are tracked separately.

### P2 · Subject signal in shadow mode

Revised 2026-11-09 (decisions S6 and S10).

1. **Payload experiment, before anything else.** The baseline cannot say whether request size costs time: at most 4.5 KB of a 17 KB first request is recipe-specific, no request hit the prompt cache, and the model spends 7.8 s (p50) writing about 1,170 output tokens. Pad the first request's recipe guidance and schema by about 2, 4 and 8 KB and compare first-playable time against the unpadded request, interleaved, at least 40 pairs per size. The result sets the ceilings' headroom (§9) and decides whether scoped requests are built now or later.
2. **The plugin-based Jev question** (§5.2), including `none`, `unclear` and the image attachment, replaces today's five choices. Recheck the two follow-ups that pass the gate only through its pass-through rule.
3. **Hand-off in shadow mode.** Learn sends `plugins`, `plugin_confidence` and `plugin_source`; Coach validates and logs them and keeps sending the broad request. Each trace records what a scoped request would have contained and whether the lesson used a recipe outside it. That measures route correctness on real requests with no risk to lessons.
4. **Held-out routing check.** Confirm T1 and T2 on requests that were not used to tune them.
5. **Physics pilot on shared tools.** Add a constant-speed motion recipe built on `shared` graphs. Pilot lesson: *How does distance change over time at constant speed?* through all three paths.

Deferred until a trigger in §5.3 fires: scoped requests, reroute recovery and the single permitted set (§5.3–5.5), behind a config switch.

**Exit** — the experiment's result is recorded and the ceilings are re-set from it; the routing fixtures pass; shadow-mode route correctness and the share of requests with a Jev answer are reported; the speed gate passes with Jev on and with Jev off.

### P3 · First science capabilities: vectors (B4) and free-layout diagrams (B3)

Moved forward on 2026-11-09 (decision S11) to run in parallel with P2. The baseline's main finding was that science lessons lack real visuals: chemistry and biology used only notes, formula cards and step diagrams, and the water cycle was drawn as a straight list. Neither item depends on scoping.

- **B4, vectors and forces,** in `plugin-physics`: the vector node with a namespaced execution feature, the Studio tool and the Coach recipe. This is the first runtime extension, so hosts start passing installed extensions to the player here.
  - Pilot lesson: the Phase A guide "force and acceleration with a slider graph", built with real vectors.
  - This is the first lesson that needs a feature an older player lacks. It exercises the version and plugin checks in the live, Studio and CoursePack paths.
- **B3, free-layout diagram,** in `plugin-shared`: grid positions and labelled arrows, so cycles are drawn as cycles and food webs as webs.
  - Pilot lesson: the Phase A guide "water cycle", routed to `earth_space`.
- AI lessons adopt each capability only after it passes the speed gate, as a separate change (E5).

**Exit** — the three paths agree on canonical state at equal slider values. An older player, or one without the plugin, refuses the vector lesson with a clear message before playback. The water cycle lesson shows a closed cycle in all three paths.

### P4 onwards · Breadth

Follow the Phase B order:

1. shared B1 → B2 (label first); B3 is in P3
2. physics B7 → B8; B4 is in P3
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
  - **Hard ceilings (decision S6).** Fixed byte and token limits for the full request body, schema included, apply to three cases: a scoped single-plugin request, a scoped two-plugin request and the broad request. Every plugin carries a budget for its own cards, guidance and schema fragments.
    - *Done in P0:* byte ceilings per input route and request path, measured offline over the course fixtures (system prompt, prompt and response schema; learning-coach `eval/payload-ceilings.json`). These cover today's broad request.
    - *Pending:* a token budget for the full request body, from the provider's token counter, and the ceilings for the scoped single- and two-plugin requests, set when scoped requests exist.
    - *Headroom (decision S14).* The P0 ceilings are the measured maxima, so the first new recipe would break the broad ceiling. After the P2 payload experiment, re-set each ceiling to the measured maximum plus the largest increase that showed no loss of first-playable p50. Split the broad ceiling into a budget for `shared` and a budget per subject plugin. Building scoped requests is triggered when the broad request has used 80% of its headroom.
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
  - whether Jev was available, and the selected plugins and their source; from these, the share of lesson requests that arrive with a Jev answer
  - in shadow mode: whether the lesson used a recipe outside the plugins Jev selected
  - outcome (lesson, clarify, ignore, unsupported)
  - route correctness against the expected plugins
- First playable: the first `lesson-prefix-published` event plus the client timing. The p50 is the gate; p95 is a diagnostic.
- Quality: a blinded rubric covering goal match, whether the visual shows the right relationship, agreement between narration and visual, subject accuracy, level fit and request coverage. Review at least 10 lessons per subject; the reviewer does not know which condition produced a lesson. The P0 review covered 12 lessons and was not blinded, so it is an indication, not a baseline.

**Compatibility:**

- Existing CoursePacks and saved learner lessons replay.
- Known and unknown plugin requirements are exercised in the Learn player, the learner-package viewer and the Course Library validator and loader.

**Rollout:** the config switch stays reversible until the live comparison passes. Plugins are enabled one by one.

## 10. Level and accuracy outside mathematics

Program-owned correctness (§2) covers what a program can compute. Much of chemistry, biology and Earth science is stated fact, and the P0 sample showed the gap: an invented figure ("500 billion liters"), narration that gave a speed the slider no longer showed, and the Calvin cycle offered in answer to "How do plants make their own food?". Decision S15 adds three measures.

- **Grade level is an input.** Learn sends the learner's grade band (K–2, 3–5, 6–8, 9–12) with the lesson request when the profile has one. Coach puts it in the request, and plugin guidance may state what each band covers. Without a grade band, Coach fits the level to the wording of the question. This adds no model call.
- **Narration follows board state.** Wherever a lesson value comes from a variable, the narration refers to the variable and the program fills in the number, as math lessons already do. The plan check that rejects narration contradicting a visual (`check_plan`) extends to physics quantities.
- **Stated facts are checked where a program can check them, and measured where it cannot.**
  - Checkable: chemical equations balance, units agree, a quantity in the narration matches its computed value. These are plugin checks and add no model call.
  - Not checkable: figures and claims with no source in the request. Plugin guidance tells the model not to state specific figures it was not given. The quality rubric's subject-accuracy score is tracked per subject, and a plugin is enabled for AI lessons only when its sample has no factual error (§9, rollout).
  - Curated material carries the facts where it can: labelled pictures (B1) and CoursePacks are reviewed once and reused.

## 11. Decisions for the product owner

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
| S6 | Payload gate | "A scoped request contains nothing from unselected plugins", plus hard ceilings on payload size (§9). Revised later the same day: see the review decisions below |
| S7 | Learner package format | Add the `oll` requirements block to the `.olesson` manifest (§4.5) |
| S8 | Third-party plugins | First-party plugins only for now |
| S9 | How Jev is provided | Jev stays BYOK: each customer uses their own Jev key, managed through Octos like ASR and TTS. No shared platform credential is shipped. |

**Decided after the plan review (2026-11-09)**

| # | Question | Decision |
| --- | --- | --- |
| S6 (revised) | When are scoped requests built? | Coach first receives the subject in shadow mode and keeps sending the broad request. Scoped requests and reroute are built when the payload experiment shows a cost or the broad request nears its ceiling (§5.3). Hard ceilings stay |
| S10 | What comes first in P2? | A payload experiment that measures first-playable time against request size (§8, P2) |
| S11 | When do science capabilities start? | B4 vectors and B3 free-layout diagrams move forward and run in parallel with P2 (§8, P3) |
| S12 | Earth and space science | Add an `earth_space` plugin (§5.2) |
| S13 | Requests outside every subject | A `none` choice in the Jev question selects `shared` alone (§5.2) |
| S14 | Ceiling headroom | Re-set the ceilings from the experiment, with a separate budget for `shared` (§9) |
| S15 | Level and accuracy outside math | Grade band as an input, narration tied to board state, program checks where possible and a per-subject accuracy gate (§10) |

## 12. Where to start reading

| Repository | Source |
| --- | --- |
| `learning-coach` | `src/lesson-plan.ts` (registry), `src/lesson-plan-generation.ts` (prompts, `generateLessonPlanWithModel`), `src/lesson-plan-schema.ts`, `src/lesson-plan-compiler.ts`, `src/main.ts` (input allow-list, payload telemetry), `data/topic-catalog` |
| `octos-lesson-language` | `decisions/0004-interactive-whiteboard-mvp-boundaries.md`, `packages/core/src/capabilities.ts`, `packages/core/src/execution-requirements.ts`, `packages/player-core/src/index.ts`, `SPEC.md` |
| `octos-learn` | [Studio expressiveness plan](LEARNER_EXPRESSIVENESS_PLAN.md) (Phase B, decisions E1–E5), `src/learning/admission-fast-gate.ts` (Jev), `src/learning/learning-workspace.tsx`, `src/learning/teach/compile-recording.ts`, `studio-add.tsx`, `learner-package.ts`, `src/learning/course-pack/course-pack-loader.ts` |
| `octos-course-library` | `packages/course-pack/src/types.ts`, `validator.ts`, `browser.ts` |

## 13. TODO list

P1 close-out and its local acceptance scope are recorded below. The later phases remain planned work.

### 13.1 P1 close-out

The owner approved merge and local acceptance, with physical camera and Jev checks tracked separately. Older Studio recordings are excluded from the development compatibility gate.

| Repository | Change | Evidence |
| --- | --- | --- |
| [OLL #40](https://github.com/alan0x/octos-lesson-language/pull/40) | Decision 0012 accepted. Math declares its shared plugin dependency. P1 pin: `7c12c9c`. | 455 tests |
| [Course Library #11](https://github.com/alan0x/octos-course-library/pull/11) | One OLL pin. Pack validation and the browser reader use the installed execution extensions when the host supplies them. | 21 tests, type check, 11 matching replay digests |
| [Coach #50](https://github.com/alan0x/learning-coach/pull/50) | Version 0.24.3. Registry dispatch and OLL-owned manifests and subject lines. Plugin IDs and versions travel in the completed job's structured metadata. | 251 tests. 1,680 request digests and the lesson digests match the baseline. |
| [Learn #135](https://github.com/octos-org/octos-learn/pull/135) | New `.olesson` packages declare player requirements. Learn persists the plugin versions on the generating question for future context routing. | Type check, lint, build, 2,013 unit tests, 107 service tests, 18 Chromium tests |

Coach, Learn and Course Library were verified on OLL `7c12c9c`. Coach 0.24.3 was installed in the normal local Octos profile. The automated acceptance covers Studio recording and playback, package export and validation, camera capture and selection routing. The replay and function plot issues found during the manual pass predate P1 and are tracked separately.

- [ ] Follow-up manual coverage: physical camera teaching and live Jev image relay.
- [ ] When publishing the new package writer, deploy the learner-lessons service that accepts the `oll` block before the app. Production deployment is outside this close-out.

### 13.2 P2 · Subject signal in shadow mode

- [ ] **Payload experiment.** Write the padding harness in Coach (pad recipe guidance and schema by about 2, 4 and 8 KB). Needs the product owner's approval of the spend first: at least 40 interleaved pairs per size is about 240 live lesson generations on the owner's key.
- [ ] Record the experiment's result in Coach `docs/` and decide here whether scoped requests are built now or stay deferred.
- [ ] Re-set `eval/payload-ceilings.json` from the result: measured maximum plus tested headroom, with a separate budget for `shared` and one per subject plugin (S14). Add the provider token count for the full request, schema included.
- [ ] Build the Jev subject question from the installed plugins' subject lines, with `none` and `unclear`, in `admission-fast-gate.ts`. Attach the camera frame or ink selection.
- [ ] Recheck the two follow-ups that pass the gate only through its pass-through rule ("那晚上植物还会这样吗？" and the heating-curve follow-up).
- [ ] Learn sends `plugins`, `plugin_confidence` and `plugin_source`; Octos passes them through; Coach adds them to its input allow-list, rejects unknown IDs and logs them. Coach keeps sending the broad request.
- [ ] Coach's trace records what a scoped request would have contained, and whether the lesson used a recipe outside it.
- [ ] Report the share of lesson requests that arrive with a Jev answer.
- [ ] Write held-out routing cases (not the 93 used for tuning) and confirm T1 0.6 / T2 0.05 on them.
- [ ] Add the `earth_space`, `chemistry` and `biology` plugins as manifest, subject line and empty recipe set, in OLL and Coach, so Jev can choose them.
- [ ] Constant-speed motion recipe in `physics`, built on `shared` graphs. Pilot lesson through Coach, Studio and a CoursePack.
- [ ] Speed gate with Jev on and with Jev off (interleaved pairs; needs spend approval).

Deferred until a trigger in §5.3 fires: scoped requests, reroute recovery, the single permitted set.

### 13.3 P3 · Vectors (B4) and free-layout diagrams (B3)

For each of the two capabilities:

- [ ] OLL decision record (0013 vectors, 0014 free-layout diagram).
- [ ] Schema, reducer, web renderer, headless golden and execution feature. B4 is `plugin:physics/vectors@1` in `plugin-physics`; B3 goes in `plugin-shared`.
- [ ] Recipe builder in the OLL plugin package.
- [ ] Studio tool that calls the builder.
- [ ] Coach recipe (card, guidance, schema fragment, compiler), adopted for AI lessons only after it passes the speed gate (E5).

Once for P3:

- [ ] Learn, the learner-package viewer and Course Library pass installed extensions to the player (first runtime extension).
- [ ] Pilot lesson "force and acceleration with a slider graph" with real vectors, through all three paths.
- [ ] Pilot lesson "water cycle" as a closed cycle, routed to `earth_space`, through all three paths.
- [ ] Check that an older player, and a player without the plugin, refuse the vector lesson before playback in the live, Studio and CoursePack paths.

### 13.4 Level and accuracy (§10)

- [ ] Decide where the grade band comes from in the learner profile, and whether Learn asks for it. Learn sends it; Coach adds it to the input allow-list and the request.
- [ ] Extend `check_plan` so narration that contradicts a physics quantity on the board is rejected.
- [ ] Plugin guidance: no specific figures that the request did not supply.
- [ ] Chemistry checks: equations balance, units agree (with B5).
- [ ] Blinded quality review, at least 10 lessons per subject, with level fit and subject accuracy scored. Use it as the gate for enabling each subject's plugin in AI lessons.

### 13.5 Open questions for the product owner

- [ ] Approve or adjust the payload experiment's spend (§13.2).
- [ ] Whether Coach's math-only answer path (plot, implicit plot, 3D) should move into the plugin model, and when.
- [ ] How many customers have Jev configured today. If few, the broad request is the main path and deserves the first quality work.
