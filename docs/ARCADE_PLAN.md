# Arcade: math fluency mini-games — implementation plan

Date: 2026-11-25. Status: **draft for review** (owner decisions below are settled; everything marked *proposed* is open for review).

## 0. Summary

The Arcade is a new page, separate from the whiteboard. Children practise quick math facts (addition, subtraction, multiplication and division) by playing short 3D mini-games drawn in a hand-drawn notebook style. A fact card sits at the top of the screen and a writing strip at the bottom. The child writes the answer by hand, or types it on a number pad on devices without touch, and every correct answer immediately drives the game: a leap, a boost, a new line in a drawing. A round has 20 facts and lasts about two to three minutes.

The lessons on the whiteboard teach *why* 7 + 8 = 15. The Arcade builds the *speed* of recalling it. The two are complementary.

Version 1 ships:
- the Arcade page and one finished game;
- handwriting recognition of numbers that runs on the device;
- an adaptive scheduler that keeps asking the facts each child is slow or wrong on;
- records, achievements and a star map mark built on the existing learning-history service.

Three more games follow, one PR each.

What makes it cheap to run: **no model calls**. A program generates and checks every question, so lesson generation speed, prompts and API cost are untouched.

## 1. Decisions

Owner, 2026-11-25:
1. **A separate Arcade page**, not games inside whiteboard lessons.
2. **Hand-drawn notebook art style**, similar to the reference video.
3. **Developed in parallel** with the current math work (`docs/MATH_WORK_STACK.md`).
4. **Version 1 is math only.**

Owner, 2026-11-25, on the plan's questions:

5. **Mascot:** a new original doodle octopus, as recommended. The owner delegated naming: the mascot is **Nib** (§5.6).
6. **Game names:** delegated. Order: A, then B, C and D, as recommended (§5.5).
7. **Times tables to 10×10** in version 1; ×11 and ×12 are out.
8. **Children's handwriting collection** (consent logistics, and later training use) is deferred until M1 needs it.

Standing decisions that apply:
- Target market is US K–12 (2026-10-30): COPPA/FERPA-aware design; Chromebooks and iPads matter.
- Main devices are desktop browsers and large touch-screen TVs (2026-10-24). The TVs run the Android APK, which is a WebView shell.
- Art comes from AI generation (2026-10-24), checked against the teacher art rules where people are drawn.
- Achievement ceremonies never interrupt a running activity (2026-10-27). Achievements never claim mastery.
- No stopgaps: propose the real fix. Report any effect on lesson speed with numbers (here: none).

## 2. The reference, and what we take from it

The reference is a 52-second screen recording by Mitch Forest, "edu/acc – Fluency practice but make it fun" (an X post the owner shared on 2026-11-25). It shows:
- an Arcade home with a mascot;
- a subject picker (Read / Spell / Math) and a picker for five 3D games;
- in every game: a fact card at the top, a lined handwriting strip at the bottom with no submit button, 20 progress dots, a streak flame and a star count;
- every correct answer moves the game forward and earns stars, streak multipliers, banners and confetti;
- facts answered at roughly two seconds each.

**Principles we adopt:**
1. **The answer is the only control.** The child's hands are busy writing, so the game never asks for steering or timing input. Everything the game does follows from answers.
2. **Games are independent of questions.** In the video the same games run spelling and math. Our games consume round events and never know what a fact is. Any skill can be played in any game.
3. **One art style everywhere.** Simple 3D shapes made charming by one consistent drawing treatment: paper, ink outlines, pencil hatching.
4. **Write, don't choose.** Producing the answer is recall; picking from options is recognition. Handwriting also keeps the screen free of a keyboard.
5. **Constant small rewards** within a round, and a clear summary at the end.

**What we do not copy:** the reference's games, game names, characters, levels or enemies. Specifically: no pencil mascot; no rooftop runner, ink-blot tower defense, pencil-kart race, ruler flick or grappling-hook game; none of their banner wording. Our games, mascot, names and level designs are our own (section 5.5). Lined notebook paper and doodle drawing are a common visual genre. We use our own palette, props and characters within it, and the art style board (milestone M0) is checked for originality as well as quality.

## 3. Goals and non-goals

**Goals**
- G1. Build fact fluency, meaning fast, accurate recall of K–5 facts, through play children choose to repeat.
- G2. Make the feedback loop seconds long, matching the product's gamification direction.
- G3. Run well on every target device: touch TV (APK), iPad, Chromebook (including non-touch), desktop.
- G4. Record honest facts that feed achievements and the star map without claiming mastery.
- G5. Add zero model calls and leave the main app bundle and lesson speed unchanged.

**Non-goals for version 1**
- Reading or spelling (the other two modes in the reference). Math only, by decision 4.
- Multi-digit written algorithms (for example 4.NBT.B.4). These are paper work, not two-second recall.
- Teaching concepts. Lessons do that, and the Arcade links to them (section 4.7).
- Multiplayer, leaderboards, friends or any sharing.
- A currency, shop, purchases or collectibles. These wait for PRD decision D12.
- Grading or teacher-facing timed tests.
- Storing or uploading children's handwriting.
- Camera air-writing as an answer method.

## 4. Learning design

### 4.1 Skills

A *skill* is a set of facts with one answer format. Version 1 skills (*proposed*):

| Skill id | Facts | US standard | Star map topic | Facts in set |
| --- | --- | --- | --- | --- |
| `add-sub-5` | a ± b, all numbers 0–5 | K.OA.A.5 | `mt_ghF3Vv6taM` Fluent adding and subtracting within 5 | 21 + 21 |
| `add-sub-10` | a ± b within 10; make-ten and number-bond forms | 1.OA.C.6 | `mt__we2TDqnJx` within 10; `mt_s2mfRBoTal` number bonds | 66 + 66 |
| `add-sub-20` | one-digit + one-digit sums and the related subtractions | 2.OA.B.2 | `mt__t4afSyZRm` within 20 | 100 + 100 |
| `mul-2-5-10` | a × b (0–10) with a factor of 2, 5 or 10, and their divisions | 3.OA.C.7 | `mt_HhuSDxwDNM` times tables 2, 5, 10 | 57 + 54 |
| `mul-3-4-8` | a × b (0–10) with a factor of 3, 4 or 8, and their divisions | 3.OA.C.7 | `mt_wQ89AEXhz3` times tables 3, 4, 8 | 57 + 54 |
| `mul-div-100` | all products of 0–10 by 0–10, and their divisions | 3.OA.C.7 | `mt_K5jM7vlVhA` all tables (the topic runs to 12×12; version 1 stops at 10×10, decision 7) | 121 + 110 |

Exact sets:
- **Add/sub within n:** a + b with a + b ≤ n; c − b with 0 ≤ b ≤ c ≤ n.
- **Within 20:** a + b with a, b ∈ 0–9, and the subtractions (a + b) − b.
- **Division:** c ÷ d = q for each listed product with d ≠ 0.

The counts above were computed from these definitions. A unit test recomputes them.

Skills overlap (for example 3 × 5 is in both `mul-2-5-10` and `mul-3-4-8`). A fact has one id, so its state carries across skills.

3.OA.C.7 asks for all products of two one-digit numbers from memory. The ×10 facts are added because the catalog topics include them.

Answer range in version 1: whole numbers 0–100. Every answer has at most three digits, with no signs, fractions or decimals. That keeps the recognizer's vocabulary to the ten digits.

**Forms** (*proposed*): `a + b = □` and `a − b = □` for every add/sub skill, and `a × b = □` and `c ÷ b = □` for multiplication. From `add-sub-10` upward, missing-addend forms (`□ + b = c`, `a + □ = c`) appear in about 20% of items, because they support the relationship between addition and subtraction (1.OA.D.8). Forms are data on the fact, so adding one later needs no game change.

**Later** (version 1.x, not version 1): mental add/sub within 100 (2.NBT.B.5, `mt_cChv2j_-Da`) and within 1000 (3.NBT.A.2, `mt_HFRYjTb-Z5`), doubles and near-doubles sets, and ×6, ×7, ×9 as their own set.

### 4.2 Facts and identity

- A fact has a canonical id: `add:3+4`, `sub:7-4`, `mul:6x7`, `div:42/7`. `3+4` and `4+3` are separate facts, because children often know one before the other. They belong to the same *family* (`fam:3,4,7`) for display and later analysis.
- A fact's answer is computed by the program. Tests check every fact in every skill against plain arithmetic.
- The form is recorded with each answer, so "□ + 4 = 7" and "3 + 4 = □" stay distinguishable in the records.

### 4.3 What "fast" means

- **Recall time** runs from the moment the fact is shown to the child's first stroke (or first key). Total time to the accepted answer is recorded too. Recall time is the measure of retrieval because it excludes writing speed, which varies a lot with age and device.
- A fact is **quick** when its two most recent answers were correct with recall time ≤ *T*. The default is *T* = 2.5 s (*proposed*; tuned in play tests at M5, possibly per skill). The fact needs two answers on different days before it counts as *quick*.
- User-facing words: "quick", "fast", "practised". **Never** "mastered", "fluent" or "knows". This matches the achievement and map rules.

### 4.4 Per-fact state

Each fact is in one of: `new` (never shown), `learning` (shown, not yet quick), `quick`, or `slipping` (was quick, then missed or slow). State is a pure function of recorded answers, versioned as `arcade-facts-v1`. It is recomputed from the records like achievements are, so deleting records changes it consistently.

Spacing across days follows Leitner-style boxes. A `quick` fact is reviewed after 1, 3, 7 and then 14 days. A slow or wrong answer moves it to `slipping`, which is reviewed in the same or the next round.

### 4.5 Round composition

A round is 20 items (*proposed*). The scheduler fills it as follows:
- **Target facts (2–4):** `learning` or `slipping` facts, each asked three or more times in the round, spaced 2–5 items apart.
- **Review facts:** due `quick` facts, enough to keep the expected success rate around 80–90%.
- **New facts:** introduced only when fewer than 2 target facts are available, at most 2 per round, easiest first (smaller numbers; ×0, ×1, ×2, ×5, ×10 before the others).

On a **wrong** answer:
- the card shows the correct fact for about 1.5 s;
- the streak resets, but stars already earned stay;
- the game plays a gentle stumble, with no damage or lives;
- the fact comes back 2–4 items later.

On an **unsure** reading (section 7.5) the child is asked to write it again. That costs no streak and is not an attempt: it is recorded as `unsure` only so misreadings can be measured, and it never changes a fact's state.

A round ends after 20 items. Leaving early ends the round with `left`, and its answers still count.

Randomness uses a seeded generator, so a round is reproducible in tests.

### 4.6 Starting point

The profile has no grade field. On the first visit the child (or a parent) picks a skill on the skill picker, where cards show the age range in plain words. The first round seeds that skill's fact states. After that, the picker marks the *suggested* skill: the lowest skill not yet mostly quick (≥ 90% of facts `quick`). The child can always pick any skill.

### 4.7 Concept before speed

Speed drills on a fact family the child does not understand are frustrating. Each skill card has a **"Learn how"** link that opens a new whiteboard with the topic's existing prompt (`src/learning/map/topic-prompts-*.json`), so a lesson explains the idea. If the star map has no record at all for the skill's topic, the card shows the link more prominently. It never blocks play.

### 4.8 Pressure and anxiety

- No visible countdown in version 1. Speed is shown only as the child's own improvement ("12 facts got quicker this week"), never as a race against a clock.
- No lives, no game over and no losing stars.
- No daily streaks or penalties for missed days; this matches the achievement rules for persistence.
- A wrong answer earns a calm "here it is" moment, not a failure sound.

## 5. Experience design

### 5.1 Flow

The child moves through these steps:
1. **Hall:** an Arcade card in the academy hall, plus an "Arcade" place in the academy navigation.
2. **`/arcade` home:** the mascot, a big Play button and the child's star total.
3. **Skill picker** (`/arcade/skills`): each skill shows a progress bar of quick facts, the suggested skill and its "Learn how" link.
4. **Game picker** (`/arcade/skills/:skill/games`): one card per game. Version 1 has one game; locked cards show "coming soon".
5. **Round** (`/arcade/play/:skill/:game`): a short countdown, 20 items, then the results.
6. **Results:** stars, best streak, facts that became quick, a personal best if any, and one line from the child's teacher. Buttons: play again, change game, change skill.

### 5.2 Round screen

Layout is landscape-first:
- a fact card at the top centre;
- the game scene filling the screen;
- the writing strip at the bottom centre (about 40% of the width on TV and desktop, 70% on tablets). It has an eraser button and a faint baseline.

The HUD shows progress dots, the streak, stars and a back button. On non-touch devices a number pad replaces the strip (section 7.5). Phones are not a target device in version 1; a phone held upright gets a "turn your device" note.

### 5.3 The answer-driven game rule

- The world keeps a gentle idle motion while the child thinks and writes. Nothing bad happens while waiting.
- A **correct** answer triggers the game's big action within 100 ms of acceptance.
- A **wrong** answer triggers a soft stumble or wobble.
- A streak of 3, 5 and 10 escalates the visuals (speed lines, colour, particles).
- Games never decide correctness, timing or scoring. They only render round events (section 7.7).

### 5.4 Rewards inside a round

- Stars: +5 per correct answer, plus a streak bonus (+5 at a streak of 3, +10 at 5, +15 at 10; *proposed*).
- Short banners in our own words (for example "Nice!", "Three in a row!", "Unstoppable!"; final wording is part of the copy review).
- Results screen: total stars, best streak, quick facts gained.
- Stars are a score, not a currency. Nothing can be bought with them in version 1.
- Achievements earned during a round are **held until the round ends**, using the existing `holdAwards` mechanism, and then shown by the existing ceremony.

### 5.5 The games

All games share one notebook world and the same answer-driven rule. Names were chosen 2026-11-25 (decision 6); the build order is A, B, C, D.

| | Game | zh (*proposed*) | Correct answer does | Streak does | Why it suits |
| --- | --- | --- | --- | --- | --- |
| **A (v1)** | **Margin Run** | 页边快跑 | Nib runs along a notebook page whose doodles rise into a landscape; each answer is a leap over the next doodle obstacle | Speed lines, a longer leap, then a glide | Simplest endless scene; the strongest sense of motion |
| B | **Paper Glider** | 纸飞机 | Nib rides a folded-paper glider that catches an updraft and passes through the next drawn hoop | Loops and a contrail | Calm and flowing; a good second game |
| C | **Star Sketch** | 星星连线 | Draws one line of a constellation; finishing one brings its doodle creature to life | Lines glow and sparkle | Ties to our star map and academy theme |
| D | **Up the Page** | 一页登顶 | Adds a block to a tower climbing the page | Bigger blocks and a sway-proof glow | Very readable on TV; good for younger children |

**Naming checks (2026-11-25):** web searches found no existing game with these names.
- "Paper Plane" was replaced by "Paper Glider" because it is too generic.
- "Doodle Tower" was replaced by "Up the Page" because "Doodle" is crowded among K–5 math apps (DoodleMath, Math Doodles, Doodle School: Math).
- "Tower Math" is an existing 3D tower arithmetic game, so we avoid "tower" in the name.

Each game is a separate lazy-loaded module and a separate PR.

### 5.6 Mascot and teachers

- **Mascot: Nib** (zh 小墨, *proposed*), decision 5.
  - **Who Nib is:** a small, original doodle octopus whose ink draws the notebook world. A nib is the tip of a pen. A web search found no existing octopus character called Nib.
  - **Look:** ink-blue linework, one pencil-colour fill, big readable eyes, and tentacles that animate well for run, leap, stumble, idle and cheer.
  - **Not the Octos avatar:** Learn already has an octopus, the "Octos" teacher skin (`src/components/octos-avatar.tsx`, skins ocean, coral, scholar and starlight). Nib must read as its own character, a hand-drawn notebook doodle with a different silhouette, face and colours. The M0 style board shows the two side by side to check that.
  - **Not the reference's mascot:** Nib must not resemble the reference's pencil mascot.
  - **Later:** more doodle critters can come as collectibles if D12 allows.
- **Teachers:** they appear on the results screen only. The teacher's existing portrait is taped into the notebook like a photo, with one short spoken line. The line uses the existing award voice path and respects "teacher voice off" and "playful lines off". Teachers do not appear inside the 3D scenes in version 1, because their painted style would clash with the doodles.

### 5.7 Accessibility

- The number pad is always available from a button on the strip, on every device, for children with motor difficulties.
- With `prefers-reduced-motion`, or the in-app setting: no particles, camera shake or speed lines, and actions resolve as short cuts.
- Sound and music each have a switch. Every reward is visual as well, so sound is never required.
- Feedback uses shape and motion as well as colour, so it reads without colour vision.
- The fact card is announced through an `aria-live` region, and results are readable text.
- TV text: the fact card is at least 6% of the screen height.

## 6. Art direction: the notebook look

**Look:**
- cream lined paper with blue rules and a margin line;
- ballpoint-blue ink outlines with a slight wobble;
- colored-pencil fills with diagonal hatching for shade;
- tape, sticky notes and taped photos for UI frames;
- a small, consistent palette (blue ink, warm yellow, coral, mint, lilac; *proposed*).

**Approach:** the charm comes from one rendering treatment over very simple geometry, not from detailed models.

**Rendering kit** (three.js r183, already a dependency):
- **Paper:** a screen-space background shader with procedural rules, plus a grain texture.
- **Hatching material:** a light-dependent tonal art map (3 to 4 hatch textures of increasing density, blended by lighting), multiplied with a flat pencil colour.
- **Outlines:** an inverted-hull outline per mesh (cheap, works on every tier). A screen-space edge pass is used only on the high tier.
- **Line boil:** outline and hatch jitter is re-seeded about 8–12 times per second, for the hand-animated feel. It is off under reduced motion.
- **Doodle effects:** confetti made of paper bits, scribble puffs and pencil speed lines, as instanced sprites.

**Assets:**
- **Level pieces:** a kit of low-poly primitives (boxes, cylinders, ramps, props such as erasers, paper clips and sticky notes), mostly built in code.
- **Mascot:** a low-poly rigged glTF with run, leap, stumble, idle and cheer clips.
- **Art source** (owner decision): concept sheets from AI image generation, then the 3D model from an AI 3D generator with hand clean-up, or from a commissioned 3D artist. The shader unifies whichever is chosen.

**UI:** HTML/CSS over the canvas, with SVG hand-drawn frames. Display fonts are open-licence handwriting fonts for Latin text, plus a checked Chinese handwriting font (licence confirmed before use).

**Rules:**
- No legible text inside generated images (an existing art rule).
- Every asset's source and licence is recorded in `docs/arcade/ASSET_LICENSES.md`.
- Sound effects and music are CC0 or commissioned, recorded the same way.

**Process:** at M0 a style board (paper, ink, hatching, mascot sheet, one game mock frame, UI frame) is made as a private artifact. The owner approves it before production assets are made, as was done for the teacher portraits.

## 7. Technical design

### 7.1 Where the code lives

Only `octos-learn`. Nothing changes in OLL, Learning Coach or the course library.

```
src/arcade/
  pages/        arcade home, skill picker, game picker, round page, results
  round/        round engine (pure TypeScript state machine), scoring, timing
  facts/        skill catalog, fact generators, fact ids, forms
  schedule/     per-fact state derivation (shared with the service), round scheduler
  input/        writing strip, number pad, input chooser, answer decision
  ink/          recognizer client, worker, model loading
  render/       notebook rendering kit (paper, hatching, outlines, boil, effects)
  games/        one folder per game; each exports an ArcadeGame
  history/      arcade events, progress client, offline cache
  audio/        sound manager
services/learning-history/
  arcade-*.mjs  event validation additions, fact-state derivation, progress endpoint
tools/arcade-ink/   recognizer training and evaluation (Python); no data in git
public/arcade/      model file(s), textures, audio (lazy-fetched)
docs/arcade/        recognizer model card, evaluation reports, asset licences, style guide
```

`facts/` and `schedule/` are written as plain ES modules with no browser dependencies, so the service can import the same derivation code. This is the same pattern as `achievement-catalog.mjs`.

### 7.2 Routing, loading and the feature flag

- New routes under the existing `AuthGuard`: `/arcade`, `/arcade/skills`, `/arcade/skills/:skill/games` and `/arcade/play/:skill/:game`. All are `React.lazy`.
- three.js, onnxruntime-web, the model and each game load only on Arcade routes. A bundle check (a test over the Vite manifest) fails if any of them appears in the entry chunk.
- onnxruntime-web reuses the wasm files already served for voice activity detection, so there is no second copy.
- **Feature flag:** an "Arcade" switch on the settings Experiments tab, like air writing. While off, the hall card and nav place are hidden and the routes redirect to the hall. The flag defaults to on at launch (end of M5).
- Navigation: a fifth academy place, "Arcade" (zh: 游戏厅, *proposed*), with a gamepad icon, also on the mobile bottom bar.

### 7.3 Round engine

A pure TypeScript state machine with an injectable clock and seeded RNG:

`intro → countdown → asking ⇄ (judging → correct | wrong | unsure) → … → results`

- It emits typed `RoundEvent`s: `round_start`, `item_shown`, `input_started`, `answer_correct` (with streak and stars), `answer_wrong` (with the correct answer), `answer_unsure`, `streak_milestone` and `round_end`.
- Pages and games subscribe to these events. Only the engine decides correctness, score and the next item.
- It runs headless in unit tests: a scripted input sequence leads to an exact event log.

### 7.4 Scheduler

- `deriveFactStates(answers, now, rules)` is the pure §4.4 derivation, shared by client and service.
- `planRound(skill, states, seed)` returns the 20-item plan of §4.5. It re-plans only the remaining items after a wrong answer.
- The client plans from the cached progress plus its own unsynced answers, so rounds work offline. The service is the record of truth once events sync.

### 7.5 Answer input

**Writing strip:**
- a `<canvas>` with pointer events (pen, touch and mouse) and `touch-action: none`;
- when a pen is active, touch is ignored (palm rejection);
- strokes are smoothed, with an ink look matching the art;
- the eraser button clears the strip, and the strip clears itself on each new item.

**Recognizer** (on the device, in a Web Worker):
- **Input:** the strokes, rendered to a height-normalised greyscale line image.
- **Model:** two candidate designs, chosen by the M1 gate:
  - (a) split the ink into digits by stroke grouping, then a small single-digit CNN;
  - (b) a small CRNN with CTC over the whole line, which handles touching digits.
- **Size and speed:** ONNX, int8 if accuracy allows, ≤ 1 MB, p95 inference ≤ 50 ms on the reference low-end Chromebook (*proposed*).
- **Output:** the top candidate strings (up to 3 digits) with scores.

**Answer decision**, parameters *proposed* and tuned at M1 and M5:
- **Correct:** the expected answer is the **top-1** candidate with score ≥ τ_accept, and the pen has been up for 300 ms. The settle time lets a child finish "10" after writing "1".
- **Wrong:** a different number is top-1 with score ≥ τ_reject, and the pen has been up for 900 ms.
- **Unsure:** anything else after 900 ms. The strip wobbles and says "write it again". It is recorded as `unsure`, which is not an attempt (§4.5).
- The expected answer is never accepted just because it appears among the lower candidates. That rule guards against marking wrong answers right.
- Recognizer score and outcome are recorded with each answer (not the ink), so misreadings can be measured.

**Number pad:**
- large on-screen digit keys with backspace; physical keyboard digits work too;
- correct is accepted 300 ms after the typed value equals the expected answer;
- otherwise the answer is judged on ✓ (or Enter), or after 1.5 s idle once at least as many digits have been typed as the expected answer has.

**Input chooser:**
- touch or pen present → writing strip;
- otherwise → number pad;
- the child can switch at any time; the choice is remembered per device.

### 7.6 Recognizer data, training and evaluation (M1)

- **Training data:**
  - public handwritten-digit datasets, with each licence confirmed and recorded before use;
  - synthetic multi-digit lines composed from them;
  - augmentation for slant, stroke width, jitter, finger-thick strokes and touching digits.
- **Children's handwriting:** public digit sets are mostly adult writing. We collect our own set **for evaluation first**:
  - from the team, and from children whose parents give written consent;
  - through a dev-only collection page (`/arcade/ink-lab`, behind the debug flag) that shows a number, records the strokes and exports a JSON file locally;
  - collection happens outside the product; nothing is uploaded automatically;
  - files are stored outside git, with deletion on request.
  - Using children's samples for *training* needs the same consent and is a separate owner decision.
- **Evaluation harness:** `tools/arcade-ink/eval` replays stroke files through the exact browser preprocessing. It reports:
  - correct-answer acceptance;
  - **false-accept rate**: wrong answers written on purpose that were marked correct, using intentionally wrong samples;
  - the unsure rate;
  - latency;
  - all of the above per device class.
- **Gate** (*proposed* numbers, M1 exit):

  | Measure | Bar |
  | --- | --- |
  | Correct answers accepted on the first try (children's set) | ≥ 95% |
  | Unsure | ≤ 4% |
  | False accepts | ≤ 0.5% |
  | p95 latency on the reference Chromebook | ≤ 50 ms |

  If the gate fails after one improvement cycle, the owner decides between more data collection and shipping version 1 with the number pad as the default input. That decision is recorded in this plan.
- The model card (`docs/arcade/INK_MODEL.md`) records data sources, licences, version, gate results and known weaknesses.

### 7.7 Game interface

```ts
interface ArcadeGame {
  id: string;
  mount(host: HTMLElement, ctx: { kit: NotebookKit; quality: QualityTier; reducedMotion: boolean; audio: ArcadeAudio }): Promise<void>;
  onEvent(event: RoundEvent): void;   // never returns a decision
  setQuality(tier: QualityTier): void;
  pause(): void; resume(): void;
  dispose(): void;                    // must release GPU resources (tested)
}
```

Each game has a headless smoke test: mount on a WebGL stub, feed a recorded event log, dispose, and assert no leaked geometries or textures (via `renderer.info`).

### 7.8 Performance

- **Quality tiers:** `high` (screen-space edges, full particles, pixel ratio ≤ 2), `medium` (hull outlines, half particles, pixel ratio ≤ 1.5) and `low` (hull outlines, few particles, pixel ratio 1, no shadows).
  - The starting tier comes from a short GPU probe.
  - A watchdog drops one tier when the frame rate stays under 45 fps for 3 s.
- **Targets** (*proposed*):

  | Device | Frame rate |
  | --- | --- |
  | iPad and desktop | 60 fps |
  | Low-end Chromebook and the Android touch TV | ≥ 30 fps |

  - Arcade JS + model + first game ≤ 3 MB compressed. Audio streams after the round starts.
  - Time from Play to a playable round ≤ 3 s on the reference Chromebook.
  - Memory ≤ 250 MB.
- three.js r183 requires WebGL2. The TV's WebView version is checked at M3. If it lacks WebGL2, that is a blocker for the TV to resolve, not a reason for a separate renderer.
- **Device matrix:**
  - Android touch TV (APK);
  - iPad (Safari, with and without Apple Pencil);
  - a low-end touch Chromebook and a non-touch Chromebook;
  - desktop Chrome, Edge and Safari.

### 7.9 Records (learning-history)

**New event kinds.** These are additive to `event-contract.mjs`: old clients never send them, and the service deploys before the client. Each round is its own run, `run_id = arcade:<round_id>`, as taught lessons use `taught:<id>`, so existing run deletion and backup cover it.

| Kind | Data |
| --- | --- |
| `arcade_round_started` | `round_id`, `skill_id`, `game_id`, `input` (`ink`/`keypad`), `rules_version` |
| `arcade_answer` | `round_id`, `item` (0–19), `fact_id`, `form`, `given` (integer or omitted when unsure), `result` (`correct`/`wrong`/`unsure`), `recall_ms`, `total_ms`, `input`, `score` (recognizer, optional) |
| `arcade_round_ended` | `round_id`, `reason` (`finished`/`left`), `answered`, `correct`, `stars`, `best_streak` |

- Events go through the existing offline device queue (IndexedDB) and sync like lesson events. At most 3 `unsure` events are recorded per item, so a round is at most 20 × 4 + 2 = 82 events, under the 100-event batch limit.
- No ink, images or free text are stored. `fact_id`, `skill_id` and `game_id` are validated against fixed patterns and catalogs.
- **Progress endpoint:** `GET /api/learn/history/arcade/progress?skill=<id>` returns the fact states (§4.4) and per-skill totals, derived on each read like achievements. The client caches the last response for offline rounds.

**Star map** (*proposed*, owner decision):
- Arcade answers count as `practising` on the skill's topic.
- When ≥ 90% of a skill's facts are `quick`, the topic star gets a "quick facts" ring, drawn like the existing taught-lesson ring.
- Arcade play alone never reaches `did-it`; that stays tied to lesson tasks.
- This is a map rules version bump (`map-states-v2`).

**Achievements** (*proposed*): a new "Arcade" category of about 12, in the existing catalog and rules engine, for example first round, 10 rounds, a streak of 10, a first fully quick skill, practice on 3 different days in a week, and every game played. All wording passes the no-mastery rule. Gold and star tier badges come from the existing badge art pipeline.

**Records page and weekly report:** an Arcade line (rounds and facts that got quicker this week). This is M4, after the records exist.

### 7.10 Settings

An "Arcade" section in settings holds:
- input (writing / number pad / automatic);
- sound effects on/off and music on/off;
- reduced effects;
- "show my teacher on results".

These are stored per device, like the experiments settings.

### 7.11 Internationalisation

All strings go through `tr()`, with Chinese and English messages, and `pnpm check:i18n` passes. Fact cards use the operator glyphs `+ − × ÷`, the same in both languages.

## 8. Privacy and safety (US K–12)

- The recognizer runs on the device. **Handwriting never leaves the device and is never stored.** The strip is cleared after every item.
- Recorded facts are answers, timings, scores and round totals under the learner's own account. They have the same access, deletion and backup rules as other learning history (OL-045 to OL-050 apply).
- There is no social feature, leaderboard, chat, advertising or purchase.
- Evaluation handwriting from children is collected only with written parental consent, outside the product, stored outside git, and deleted on request (section 7.6).
- No third-party service is called from the Arcade at all.

## 9. Working in parallel with the math work

- **Isolation:**
  - the `arcade/…` branch prefix, a dedicated worktree (`octos-learn-arcade`) and its own PR series;
  - the math work stack's repos (OLL, Coach, course library) are not touched;
  - new code lives under `src/arcade/`, `services/learning-history/arcade-*.mjs`, `tools/arcade-ink/` and `public/arcade/`.
- **Shared touch points**, each kept small and called out in its PR:
  - `src/App.tsx` (routes);
  - `academy-header.tsx` and the hall (entry);
  - `event-contract.mjs`, `map-progress.mjs` and the achievement files (records);
  - the settings tabs;
  - `docs/README.md`.
- **Speed (AGENTS.md rule 1):** zero model round-trips and zero prompt change, so lesson generation speed is unaffected by construction. The bundle check (§7.2) proves the main entry chunk does not grow beyond the route and flag code (*proposed* bound: +5 KB gzip).
- **Status:** progress is kept in the TODO list at the end of this file, linked from `docs/README.md`. `docs/MATH_WORK_STACK.md` belongs to the math work and is not edited by Arcade PRs.
- **Review labels:** every Arcade PR is reported as "Needs code review" or "No review needed", with a reason.

## 10. Milestones

Sizes are relative (S/M/L), not dates. M1 and M2 run in parallel.

| | Milestone | Size | Contents | Exit criteria |
| --- | --- | --- | --- | --- |
| **M0** | Plan and style | S | This plan reviewed and merged. Style board artifact, including Nib's character sheet beside the Octos avatar | Owner approves the plan and the style board |
| **M1** | Recognizer (go/no-go) | L | `/arcade/ink-lab` collection page; consented evaluation set; training pipeline; candidates (a) and (b); evaluation harness; worker integration; device latency | §7.6 gate passes, or the owner records the number-pad-default decision |
| **M2** | Round core and records | M | Skill catalog and generators; fact states; scheduler; round engine; writing strip + number pad + decision logic (with a stub recognizer until M1 lands); arcade events, service derivation, progress endpoint; plain dev harness page (debug flag only, never shipped) | Unit tests for every fact and every scheduler invariant; a full round via the number pad in Playwright; events sync and derive correctly |
| **M3** | First game | L | Notebook rendering kit; mascot model and clips; Margin Run; Arcade pages; hall card and navigation; feature flag; quality tiers | Plays at target frame rates on the device matrix; bundle check passes; full round via synthetic ink in Playwright with the real model |
| **M4** | Rewards | M | Arcade achievements; star map ring (`map-states-v2`); award hold during rounds; teacher line on results; records page line | Rule tests; ceremony never appears mid-round; wording review passes |
| **M5** | Play tests and launch | M | Sessions with consented children on TV, iPad and Chromebook; tuning of *T*, thresholds, round length and rewards; accessibility pass; i18n; copy review | Owner sees the play-test report and switches the flag on by default |
| **M6** | Games B–D | M each | One game per PR on the same kit | Same device and smoke checks as M3 |

**PR plan:**
- M0: one docs PR (No review needed: docs).
- M1: one PR for the tools and the model, plus the worker integration (Needs code review: changes the product's input path).
- M2: one or two PRs (Needs code review).
- M3: two PRs, the kit and the game (Needs code review).
- M4: one PR (Needs code review: changes achievement and map rules).
- M6: one PR per game.

PRs target `main`; they are not stacked. Each says "merge after X" where order matters.

## 11. Testing and acceptance

- **Unit (Vitest):**
  - every fact's answer;
  - skill fact counts;
  - form distribution;
  - fact-state derivation, including deletion;
  - scheduler invariants: spacing, target repetitions, no fact twice in a row, the new-fact cap;
  - round engine event logs;
  - decision logic over recorded recognizer outputs (correct, wrong, unsure, settle time);
  - number pad behaviour;
  - event validation;
  - service derivation and the progress endpoint;
  - achievement and map rules.
- **Browser (Playwright):**
  - a full round via the number pad;
  - a full round via replayed real strokes through pointer events, with the real model;
  - reduced motion;
  - offline round, then sync;
  - flag on/off;
  - the round page holds achievement ceremonies until the round ends.
- **Bundle check:** no three.js, onnxruntime-web or game code in the entry chunk.
- **Performance smoke:** a scripted round in headless Chromium samples frame times as a regression signal. Real numbers come from the device matrix, recorded in `docs/arcade/DEVICE_RESULTS.md`.
- **Recognizer report:** gate numbers per release of the model, in `docs/arcade/INK_MODEL.md`.
- **Proposed PRD requirements:** added as `OL-075` onward under PRD change control after approval, each with its check:
  1. The Arcade makes no model or third-party request. Check: a network log of a full round.
  2. Handwriting is not stored or transmitted. Check: storage and network inspection during and after a round.
  3. The expected answer is accepted only as the top-1 candidate. Check: a decision test over recorded outputs.
  4. False accepts ≤ 0.5% on the evaluation set. Check: the evaluation report.
  5. Achievements earned in a round appear only after the round ends. Check: Playwright.
  6. Arcade code is absent from the entry chunk. Check: the bundle check.
  7. Every fact's answer is correct. Check: an exhaustive unit test.
  8. No Arcade wording claims mastery. Check: catalog wording review plus a word-list test.
  9. A round is playable without touch. Check: the number-pad Playwright run.
  10. Frame-rate targets hold on the device matrix. Check: the device results file.

## 12. What we will measure

These are collected locally and in play tests only, until PRD decision D11 sets the collection policy:
- rounds per session, voluntary replays and the share of rounds finished;
- accuracy and recall time per fact over days (are facts getting quicker?);
- unsure rate and misreads, where a child rewrites the same number after a "wrong";
- frame rate and tier drops per device;
- which games and skills children pick.

## 13. Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Recognizer misreads children's digits | Frustration; wrong records | The M1 gate is on children's writing; an unsure path instead of "wrong"; the number pad is always one tap away |
| False accepts | Children practise wrong facts | Top-1-only acceptance; a false-accept bar in the gate; misread measurement |
| Art takes longer than code | M3 slips; the look disappoints | The style board is approved before production; the treatment is shader-led over simple geometry; one game before four |
| TV WebView or low-end Chromebook performance | Choppy play on main devices | Quality tiers and a watchdog; early device checks in M3; the WebGL2 check |
| Rewards without learning (PRD §11) | Engagement without fluency gains | The adaptive scheduler targets weak facts; per-fact recall time is measured; the "Learn how" link |
| Pressure and anxiety | Children avoid the Arcade | No countdown, lives or star loss; improvement framing |
| Competes with the math work for attention | Both slow down | Separate worktree, PRs and status; no shared repos except Learn |
| Too close to the reference | Reputational or IP risk | The originality rule in §2; the style board checked for it |
| Asset licensing | Takedown or relicensing | A licence record per asset; CC0 or commissioned audio |

## 14. Owner questions

Answered 2026-11-25 (decisions 5–8 in §1): mascot (Nib), game names and order, times tables to 10×10. Children's handwriting collection is deferred until M1.

Still open:
1. **Star map effect:** the proposed "quick facts" ring and `practising` only, or something else? Needed by M4.
2. **Teachers on the results screen:** taped portrait plus a spoken line, or not in version 1? Needed by M4.
3. **Children's handwriting for evaluation** (deferred): who recruits families and holds the consent forms? Is training on their samples allowed later? Needed when M1 reaches the children's set.
4. **3D art source:** AI 3D generation with clean-up, or a commissioned 3D artist? Needed for M3 production.
5. **Sound:** CC0 libraries, or commissioned sound and music? Needed by M3.
6. **zh names** for the Arcade place (游戏厅 proposed), Nib (小墨) and the games (§5.5). Needed by M3.

## 15. Questions for the reviewer

- Is the per-fact model (§4.3–4.5) sound for K–5 fluency? In particular: recall time measured to the first stroke, the *T* = 2.5 s default, two answers on different days, and the round mix.
- Is the answer decision (§7.5) safe against false accepts while staying quick for correct answers? Are the settle times right?
- Is the §7.6 gate the right go/no-go for handwriting, and are the bars right?
- Do the event kinds (§7.9) fit the learning-history contract, deletion and backup? Should fact states be derived on the service or the client?
- Are any shared touch points (§9) likely to conflict with the math work?
- Is there anything in §2 or §5.5 that is too close to the reference?

## 16. TODO

**M0 — plan and style**
- [ ] Agent review of this plan; owner accepts or amends (two review rounds at most).
- [ ] Style board artifact (paper, ink, hatching, palette, mascot sheet, game A frame, UI frame); owner approval.
- [x] Owner answers on mascot, game names and order, and times tables (2026-11-25; decisions 5–8).
- [ ] zh names (§14 question 6).

**M1 — recognizer**
- [ ] `/arcade/ink-lab` collection page (debug flag), stroke export format.
- [ ] Consent process and evaluation set: team samples, then consented children's samples; deliberately wrong-answer samples.
- [ ] Public dataset licences confirmed and recorded.
- [ ] `tools/arcade-ink`: training for candidates (a) and (b), augmentation, ONNX export, quantisation.
- [ ] Evaluation harness with the browser's exact preprocessing; per-device latency.
- [ ] Worker integration with onnxruntime-web (shared wasm).
- [ ] Gate result in `docs/arcade/INK_MODEL.md`; owner go/no-go.

**M2 — round core and records**
- [ ] Skill catalog, fact generators, forms, fact ids; exhaustive tests.
- [ ] Fact-state derivation (`arcade-facts-v1`) shared by client and service.
- [ ] Round scheduler and round engine with seeded RNG and an injectable clock.
- [ ] Writing strip, number pad, input chooser, answer decision (stub recognizer until M1).
- [ ] Event kinds in `event-contract.mjs`; device queue use; service derivation; progress endpoint; offline cache.
- [ ] Dev harness page (debug flag only).

**M3 — first game**
- [ ] Notebook rendering kit (paper, hatching, outlines, boil, effects) with quality tiers and the watchdog.
- [ ] Mascot model and animation clips.
- [ ] Margin Run on the `ArcadeGame` interface.
- [ ] Arcade pages, hall card, navigation place, feature flag, settings section.
- [ ] Bundle check; device matrix pass recorded in `docs/arcade/DEVICE_RESULTS.md`.

**M4 — rewards**
- [ ] Arcade achievements (catalog, rules, badge art, teacher lines).
- [ ] Star map `map-states-v2` with the quick-facts ring.
- [ ] Award hold during rounds; teacher line on results; records page line.

**M5 — play tests and launch**
- [ ] Consented play tests on TV, iPad and Chromebook; report.
- [ ] Tune *T*, thresholds, round length and rewards; accessibility pass; copy review; i18n.
- [ ] PRD requirements OL-075 onward added; owner switches the flag on by default.

**M6 — more games**
- [ ] Game B. [ ] Game C. [ ] Game D.
