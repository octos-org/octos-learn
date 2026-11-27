# Arcade: math fluency mini-games — implementation plan

Date: 2026-11-25, revised 2026-11-26. Status: **reviewed (two rounds); building, standalone first (decision 18).**
- Owner decisions are settled; everything marked *proposed* is open.
- Review outcomes are in §17. No further review rounds.

## 0. Summary

The Arcade is a new page, separate from the whiteboard. Children practise quick math facts (addition, subtraction, multiplication and division) by playing short 3D mini-games drawn in a hand-drawn notebook style.

The way children answer depends on the device:
- **iPad, touch Chromebook, desktop:** the child writes the answer by hand on a sticky note at the bottom of the screen.
- **Non-touch devices:** a number pad.
- **Large touch TV** (the Android app): two answer choices appear on the left and right of the scene, and the child moves their body toward the right one in front of the TV's camera.

Every correct answer immediately drives the game: a leap, a boost, a new line in a drawing. A round has 20 facts and lasts about two to three minutes.

The owner's framing (2026-11-25): **the Arcade is entertainment first, not formal learning.** The learning design is kept deliberately simple.

The lessons on the whiteboard teach *why* 7 + 8 = 15. The Arcade makes recalling it fun and fast.

Version 1 ships:
- the Arcade page and one finished game (Margin Run);
- all three ways of answering;
- a simple adaptive scheduler;
- records, achievements and a star map mark built on the existing learning-history service.

Three more games follow, one PR each.

**Build order (decision 18):** a standalone, playable Arcade first (number pad and tap choices, device-only progress, the notebook look), then body input on the TV, then handwriting, then the full art and sound, and only then the records, achievements and star map on the server.

**No model calls.** A program generates and checks every question, so lesson generation speed, prompts and API cost are untouched.

## 1. Decisions

Owner, 2026-11-25, on the idea:
1. **A separate Arcade page**, not games inside whiteboard lessons.
2. **Hand-drawn notebook art style**, similar to the reference video.
3. **Developed in parallel** with the current math work (`docs/MATH_WORK_STACK.md`).
4. **Version 1 is math only.**

Owner, 2026-11-25, on the first draft's questions:

5. **Mascot:** a new original doodle octopus. The owner delegated naming: the mascot is **Nib** (§5.6).
6. **Game names:** delegated. Order: A, then B, C and D (§5.5).
7. **Times tables to 10×10** in version 1; ×11 and ×12 are out.
8. **Children's handwriting collection** (consent logistics, and later training use) is deferred until it is needed.

Owner, 2026-11-25, on review round 1 (§17):

9. **Correct answers are accepted immediately**, as soon as the reading equals the answer. There is no settle wait, for handwriting and the number pad alike.
10. **Entertainment first.** When the scheduler runs short, it fills the remaining slots with random facts from the skill. No placement round and no elaborate fill order.
11. **"Quick" needs a complete, correct answer.** Time is measured until the correct answer is accepted, not to the first stroke. A quickly written first digit therefore does not make an answer quick.
12. **TV input is body movement.** On the TV, two answer choices appear on the left and right; the child selects one by moving toward that side, detected by the camera. No handwriting on TVs (§7.6).
13. **Originality:** Margin Run stays first. The reference-like screen pieces are redesigned (§5.2):
    - the score is counted in **ink drops**, not stars;
    - progress is a drawn ink line;
    - the streak is an ink splash;
    - the answer area is a sticky note.
14. **Teacher on the results screen:** text only in version 1. No speech, so no use of the learner's paid text-to-speech key.
15. **No scope reduction** for version 1: music, the high-tier outline pass, the star map ring and about 12 achievements all stay.
16. **The owner playtests the games first**, before any sessions with children.
17. **Both the web app and the Android app are in version 1.** The online service is being restored, and no offline version is needed. A brief offline detour on 2026-11-25 was withdrawn the same day.

Owner, 2026-11-26, on review round 2:

18. **Standalone first.** "At this early stage of development, let's not worry about lesson syncing at all. Even a standalone offline version is fine! Let's build it first and make sure it actually works."
    - The Arcade is built and proven as a standalone page first: it needs no login and no server, and keeps its progress on the device (§7.13).
    - Records, sync, achievements, the star map ring and the server support check move to a later milestone (M5, §10). Nothing is cut (decision 15 stands); only the order changes.
    - The round 2 findings about sync and server records (§17, round 2 #1, #3, #8) are kept with that milestone.

Owner, 2026-11-26, after playtest 1:

19. **Each game has its own art medium** (the owner leaned this way; the split below was agreed). *Shared* by every game: Nib, and everything the child answers with (fact strip, number pad or two choices, ink drops, streak, results), so switching games never means relearning how to answer. *Per game*: the art supply the world is drawn with, and Nib is drawn in that medium too (§5.5, §6).
20. **Games before the TV.** The TV is not ready yet, so games B–D (M7) are built next in the browser, one at a time, starting with Paper Glider. Then the body controls (M2) are built with the Mac's own camera; only the TV checks (camera through the WebView, WebGL2, load) wait for the TV.

Standing decisions that apply:
- Target market is US K–12 (2026-10-30): COPPA/FERPA-aware design; Chromebooks and iPads matter.
- Main devices are desktop browsers and large touch-screen TVs (2026-10-24). The TV runs the Android app, a WebView shell.
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
1. **The answer is the only control.** The child's hands (or body) are busy answering, so the game never asks for separate steering or timing input. Everything the game does follows from answers.
2. **Games are independent of questions.** Our games consume round events and never know what a fact is. Any skill can be played in any game.
3. **One art style everywhere.** Simple 3D shapes made charming by one consistent drawing treatment: paper, ink outlines, pencil hatching.
4. **Producing the answer beats picking it**, where the device allows. That means handwriting on tablets and computers. On the TV, body movement with two choices trades some of that for whole-body play (decision 12).
5. **Constant small rewards** within a round, and a clear summary at the end.

**What we do not copy:** the reference's games, game names, characters, levels, enemies or screen pieces.
- No pencil mascot.
- No rooftop runner, ink-blot tower defense, pencil-kart race, ruler flick or grappling-hook game.
- None of their banner wording.
- Not their combination of a lined strip, 20 dots, a flame streak and a star count. Ours is a sticky note, an ink line, an ink splash and ink drops (decision 13).

Our games, mascot, names, level designs and screen pieces are our own (§5). Lined notebook paper and doodle drawing are a common visual genre. We use our own palette, props and characters within it, and the style board (M0) is checked for originality as well as quality.

## 3. Goals and non-goals

**Goals**
- G1. Make practising K–5 facts something children choose to repeat, and help them get faster.
- G2. Make the feedback loop seconds long, matching the product's gamification direction.
- G3. Run well on every target device: touch TV (Android app, body input), iPad, Chromebook (including non-touch), desktop.
- G4. Record honest facts that feed achievements and the star map without claiming mastery.
- G5. Add zero model calls and leave the main app bundle and lesson speed unchanged.

**Non-goals for version 1**
- Reading or spelling (decision 4).
- Multi-digit written algorithms (for example 4.NBT.B.4). These are paper work, not quick recall.
- Teaching concepts. Lessons do that, and the Arcade links to them (§4.7).
- Multiplayer, leaderboards, friends or any sharing.
- A currency, shop, purchases or collectibles. These wait for PRD decision D12.
- Grading or teacher-facing timed tests.
- Storing or uploading children's handwriting or camera images.
- Camera air-writing as an answer method.
- An offline version (decision 17).

## 4. Learning design

The Arcade is entertainment first (decision 10). The design below is deliberately light: enough to keep a child on facts that are worth practising, and no more.

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

The counts were computed from these definitions, and review round 1 recomputed them. A unit test recomputes them again.

Skills overlap (for example 3 × 5 is in both `mul-2-5-10` and `mul-3-4-8`). A fact has one id, so its state carries across skills.

3.OA.C.7 asks for all products of two one-digit numbers from memory. The ×10 facts are added because the catalog topics include them.

Answer range in version 1: whole numbers 0–100. That keeps the handwriting recognizer to the ten digits.

**Forms:**
- `a + b = □` and `a − b = □` for every add/sub skill.
- `a × b = □` and `c ÷ b = □` for multiplication.
- From `add-sub-10` upward, missing-addend forms (`□ + b = c`, `a + □ = c`) appear in about 20% of items. They support the relationship between addition and subtraction (1.OA.B.4, 1.OA.D.8).

Forms are data on the fact, so adding one later needs no game change.

**Later** (version 1.x): mental add/sub within 100 (2.NBT.B.5, `mt_cChv2j_-Da`) and within 1000 (3.NBT.A.2, `mt_HFRYjTb-Z5`), doubles and near-doubles sets, and ×6, ×7, ×9 as their own set.

### 4.2 Facts and identity

- A fact has a canonical id within the shared identifier charset (`[A-Za-z0-9._:-]`): `add:3:4`, `sub:7:4`, `mul:6:7`, `div:42:7`.
- `3+4` and `4+3` are separate facts, because children often know one before the other. They share a *family* (`fam:3:4:7`) for display and later analysis.
- A fact's answer is computed by the program. Tests check every fact in every skill against plain arithmetic.
- The form and the input method are recorded with each answer.

### 4.3 What "quick" means

- **Answer time** runs from the moment the fact is shown until the correct answer is accepted (decision 11). A child who writes the first digit fast but finishes slowly is not quick.
- A fact is **quick** when its two most recent answers were correct, each within the time limit *T* for its input, on different days.
- **T per input** (*proposed* defaults, tuned in the owner's playtest):

  | Input | T |
  | --- | --- |
  | Handwriting | 3.0 s |
  | Number pad | 2.5 s |
  | Body | 3.0 s |

- **Body answers count like the others.** This follows the owner's entertainment-first framing. The records keep the input method, so body answers can be weighed differently later if wanted (*proposed*).
- A correct-but-slow answer leaves a quick fact quick but makes it due for review sooner. A wrong answer moves it to `slipping`.
- **Words:** user-facing text says "quick", "fast" or "practised". **Never** "mastered", "fluent" or "knows". This matches the achievement and map rules.

### 4.4 Per-fact state

Each fact is in one of four states:
- `new`: never shown;
- `learning`: shown, not yet quick;
- `quick`;
- `slipping`: was quick, then missed.

**Derivation:**
- State is a pure, incremental function of recorded answers, applied one answer at a time in time order, versioned as `arcade-facts-v1`.
- The service derives it from the records, as achievements are, so deleting records changes it consistently.
- The client applies its own not-yet-synced answers on top (§7.9).
- Until M5 (decision 18), it is derived on the device from the answers stored there (§7.13).

**Review spacing:** a `quick` fact comes up for review after 1, 3, 7 and then 14 days. A `slipping` fact comes up in the same or the next round.

### 4.5 Round composition

A round is 20 items (*proposed*). The scheduler fills it in this order:
1. **Target facts (2–4):** `learning` or `slipping` facts, each asked up to three times, spaced 2–5 items apart.
2. **Review facts:** due `quick` facts.
3. **New facts:** at most 2 per round, easiest first (smaller numbers; ×0, ×1, ×2, ×5, ×10 before the others).
4. **Random facts from the skill** fill whatever is left (decision 10). No fact appears twice in a row.

The first round on a skill is therefore mostly random facts. Their answers seed the fact states.

On a **wrong** answer:
- the card shows the correct fact for about 1.5 s; with handwriting, it also says what was read ("I read 17");
- the streak resets, but ink drops already earned stay;
- the game plays a gentle stumble, with no damage or lives;
- the fact comes back 2–4 items later;
- **the child can fix it** (owner playtest 1, 2026-11-26): during that moment the wrong pick is crossed out and the correct choice glows. Picking or typing the correct answer moves on at once. It is not a new attempt, so the miss still counts. Without a fix, the round moves on by itself as before. The same holds after "Show me".

**Show me:** a "Show me" button is always on the answer area, and it is offered gently after about 8 s without input. It reveals the answer and counts as wrong, but without the stumble. The child then sees the fact once more.

**Unsure readings** (handwriting only, §7.5):
- The child is asked to write it again. That costs no streak and is not an attempt; it is recorded as `unsure` only so misreadings can be measured.
- After 2 unsure readings on one item, the number pad is offered for that item.

**Ending:** a round ends after 20 items. Leaving early ends the round with `left`, and its answers still count. The round pauses while the page is hidden, and the paused time is excluded from answer times.

Randomness uses a seeded generator, so a round is reproducible in tests.

### 4.6 Starting point

The profile has no grade field. On the first visit the child (or a parent) picks a skill on the skill picker, where cards show the age range in plain words. After that, the picker marks the *suggested* skill: the lowest skill with fewer than 90% of its facts quick. The child can always pick any skill.

### 4.7 Concept before speed

Each skill card has a **"Learn how"** link that opens a new whiteboard with the topic's existing prompt (`src/learning/map/topic-prompts-*.json`), so a lesson explains the idea. If the star map has no record at all for the skill's topic, the link is shown more prominently. It never blocks play.

### 4.8 Pressure and anxiety

- No visible countdown. Speed is shown only as the child's own improvement ("12 facts got quicker this week").
- No lives, no game over and no losing ink drops.
- No daily streaks and no penalties for missed days; this matches the achievement rules for persistence.
- A wrong answer earns a calm "here it is" moment, not a failure sound.

## 5. Experience design

### 5.1 Flow

The child moves through these steps:
1. **Hall:** an Arcade card in the academy hall, plus an "Arcade" place in the academy navigation.
2. **`/arcade` home:** Nib, a big Play button and the child's ink-drop total.
3. **Skill picker** (`/arcade/skills`): each skill shows a progress bar of quick facts, the suggested skill and its "Learn how" link.
4. **Game picker** (`/arcade/skills/:skill/games`): one card per game. Version 1 has one game; locked cards show "coming soon".
5. **Round** (`/arcade/play/:skill/:game`):
   - a short countdown;
   - on the TV, a camera check first (§7.6);
   - 20 items;
   - the results.
6. **Results:** ink drops, best streak, facts that became quick, a personal best if any, and one written line from the child's teacher (decision 14). Buttons: play again, change game, change skill.

### 5.2 Round screen

Layout is landscape-first. The screen pieces are our own (decision 13):
- **Fact:** on a torn paper strip held by a paper clip, top centre.
- **Scene:** the game fills the screen.
- **Answer area**, by input:
  - **Handwriting:** a **sticky note** at the bottom centre with a faint guide line (about 40% of the width on desktop, 70% on tablets), plus eraser and "Show me" buttons.
  - **Number pad:** the sticky note becomes a pad of large digit keys.
  - **Body (TV):** the two choices appear *inside the scene* on the left and right (§5.5). A small doodle figure in a corner mirrors where the child is standing.
- **Progress:** an ink line drawn across the top, growing with each item.
- **Streak:** an ink splash that grows and changes colour at 3, 5 and 10.
- **Score:** ink drops.
- **Back button.**

Phones are not a target device in version 1; a phone held upright gets a "turn your device" note.

### 5.3 The answer-driven game rule

- The world keeps a gentle idle motion while the child thinks. Nothing bad happens while waiting.
- A **correct** answer triggers the game's big action within 100 ms of acceptance.
- A **wrong** answer triggers a soft stumble or wobble.
- A streak of 3, 5 and 10 escalates the visuals (speed lines, colour, particles).
- Games never decide correctness, timing or scoring. They only render round events (§7.8).
- In body mode, the game shows the two choices in its world and plays the child's movement toward a side as anticipation, before the selection is confirmed.

### 5.4 Rewards inside a round

- **Ink drops:** +5 per correct answer, plus a streak bonus (+5 at a streak of 3, +10 at 5, +15 at 10; *proposed*). The unit avoids "stars", which already mean the star map and the `ten-stars` and `hundred-stars` achievements.
- **Banners:** short, in our own words (for example "Nice!", "Three in a row!", "Unstoppable!"; final wording is part of the copy review).
- **Ink drops are a score, not a currency.** Nothing can be bought with them in version 1.
- **Achievements earned during a round are held until the round ends**, using the existing `holdAwards` mechanism.
- **After the round:**
  - once `arcade_round_ended` is committed, the results page syncs and reads `/achievements`;
  - the existing ceremony then shows anything new;
  - a new round does not start its countdown while a ceremony is on screen. The existing host keeps a ceremony that is already showing even after a hold starts (`award-host.tsx`).

### 5.5 The games

All games share the same answer-driven rule, Nib and the screen pieces; each is drawn in its own art medium (decision 19). Each game has two presentations:
- **Answer mode** (handwriting or number pad): the answer comes from the sticky note.
- **Choice mode** (TV): the two choices are part of the scene.

Names were chosen 2026-11-25 (decision 6); the build order is A, B, C, D.

| | Game | zh (*proposed*) | Medium (decision 19) | Correct answer does | In choice mode | Streak does |
| --- | --- | --- | --- | --- | --- | --- |
| **A (v1)** | **Margin Run** | 页边快跑 | Ballpoint pen and coloured pencil on lined notebook paper | Nib runs along a notebook page whose doodles rise into a landscape; each answer is a leap over the next doodle obstacle | The path forks around an obstacle; each fork carries a number; Nib takes the fork the child moves toward | Speed lines, a longer leap, then a glide |
| B | **Paper Glider** | 纸飞机 | Watercolor washes on cold-press paper, over a faint pencil sketch | Nib rides a folded-paper glider through the next drawn hoop | Two hoops, left and right | Loops and a contrail |
| C | **Star Sketch** | 星星连线 | White gel pen and chalk on black paper | Draws one line of a constellation; finishing one brings its doodle creature to life | Two candidate stars to connect | Lines glow and sparkle |
| D | **Up the Page** | 一页登顶 | Wax crayon on brown craft paper | Adds a block to a tower climbing the page | Two blocks swinging left and right; the chosen one drops | Bigger blocks and a sway-proof glow |

**Naming checks (2026-11-25):** web searches found no existing game with these names.
- "Paper Plane" was replaced by "Paper Glider" because it is too generic.
- "Doodle Tower" was replaced by "Up the Page" because "Doodle" is crowded among K–5 math apps (DoodleMath, Math Doodles, Doodle School: Math).
- "Tower Math" is an existing 3D tower arithmetic game, so we avoid "tower" in the name.

Each game is a separate lazy-loaded module and a separate PR.

### 5.6 Mascot and teachers

- **Mascot: Nib** (zh 小墨, *proposed*), decision 5.
  - **Who Nib is:** a small, original doodle octopus whose ink draws the notebook world. A nib is the tip of a pen. A web search found no existing octopus character called Nib.
  - **Look:** ink-blue linework, one pencil-colour fill, big readable eyes, and tentacles that animate well for run, leap, stumble, idle and cheer.
  - **Not the Octos avatar:** Learn already has an octopus, the "Octos" teacher skin (`src/components/octos-avatar.tsx`, skins ocean, coral, scholar and starlight). Nib must read as its own character, a hand-drawn notebook doodle with a different silhouette, face and colours. The M0 style board shows the two side by side.
  - **Not the reference's mascot:** Nib must not resemble the reference's pencil mascot.
  - **Later:** more doodle critters can come as collectibles if D12 allows.
- **Teachers:** they appear on the results screen only. The teacher's existing portrait is taped into the notebook like a photo, with one short **written** line (decision 14). The line follows the "playful lines" setting, and no speech is synthesized. Teachers do not appear inside the 3D scenes, because their painted style would clash with the doodles.

### 5.7 Accessibility

- The number pad is always available from a button on the sticky note, on every device, for children with motor difficulties.
- In body mode, tapping a choice on the touch screen also works, for children who cannot step or lean.
- With `prefers-reduced-motion`, or the in-app setting: no particles, camera shake or speed lines, and actions resolve as short cuts.
- Sound and music each have a switch. Every reward is visual as well, so sound is never required.
- Feedback uses shape and motion as well as colour.
- The fact is announced through an `aria-live` region, and results are readable text.
- TV text: the fact strip is at least 6% of the screen height.

## 6. Art direction: the notebook look

**One medium per game** (decision 19). Everything below describes Margin Run's ballpoint-and-pencil notebook, which is also the look of the menus and the screen pieces. The other games swap the medium and keep Nib and the screen pieces:
- **Paper Glider, watercolor:** objects are rendered in flat washes, then a full-screen pass paints them: wobbly edges, colour bleeding, pigment pooling at the edges, granulation from the paper grain and blotchy wash density, over a faint pencil sketch line. Its cost on the TV is measured once the TV is ready (§7.10).
- **Star Sketch, gel pen and chalk on black paper**, and **Up the Page, wax crayon on craft paper**: designed when each is built.

**Margin Run's look:**
- cream lined paper with blue rules and a margin line;
- ballpoint-blue ink outlines with a slight wobble;
- colored-pencil fills with diagonal hatching for shade;
- tape, sticky notes, torn strips and paper clips for UI frames;
- ink drops and splashes as the score language;
- a small, consistent palette (blue ink, warm yellow, coral, mint, lilac; *proposed*).

**Approach:** the charm comes from one rendering treatment over very simple geometry, not from detailed models.

**Owner, playtest 1 (2026-11-26):** the owner likes the rough, hand-drawn doodle look of the M1 stand-ins, including Nib built from simple shapes. M4 builds on that look rather than replacing it, and may explore **crayon** or **watercolor** variants of the same treatment.

**Rendering kit** (three.js r183, already a dependency):
- **Paper:** a screen-space background shader with procedural rules, plus a grain texture.
- **Hatching material:** a light-dependent tonal art map (3 to 4 hatch textures of increasing density, blended by lighting), multiplied with a flat pencil colour.
- **Outlines:** an inverted-hull outline per mesh on every tier. A screen-space edge pass is added on the high tier (decision 15).
- **Line boil:** outline and hatch jitter is re-seeded about 8–12 times per second, for the hand-animated feel. It is off under reduced motion.
- **Doodle effects:** confetti made of paper bits, scribble puffs, ink splashes and pencil speed lines, as instanced sprites.

**Assets:**
- **Level pieces:** a kit of low-poly primitives (boxes, cylinders, ramps, props such as erasers, paper clips and sticky notes), mostly built in code.
- **Nib:** a low-poly rigged glTF with run, leap, stumble, idle and cheer clips.
- **Art source** (owner decision): concept sheets from AI image generation, then the 3D model from an AI 3D generator with hand clean-up, or from a commissioned 3D artist. The shader unifies whichever is chosen.

**UI:** HTML/CSS over the canvas, with SVG hand-drawn frames. Display fonts are open-licence handwriting fonts for Latin text, plus a checked Chinese handwriting font (licence confirmed before use).

**Rules:**
- No legible text inside generated images (an existing art rule).
- Every asset's source and licence is recorded in `docs/arcade/ASSET_LICENSES.md`.
- Sound effects and music (decision 15) are CC0 or commissioned, recorded the same way.

**Process:** at M0 a style board (paper, ink, hatching, palette, Nib's sheet beside the Octos avatar, one Margin Run frame in each mode, the screen pieces) is made as a private artifact. The owner approves it before production assets are made, as was done for the teacher portraits.

## 7. Technical design

### 7.1 Where the code lives

Only `octos-learn`. Nothing changes in OLL, Learning Coach or the course library.

```
services/learning-history/
  arcade-facts.mjs (+ .d.mts)     skill catalog, fact generators, fact ids, forms, state derivation
  arcade-schedule.mjs (+ .d.mts)  round scheduler
  arcade-*.mjs                    event validation additions, progress endpoint, map and achievement rules
src/arcade/
  pages/        arcade home, skill picker, game picker, round page, results
  round/        round engine (pure TypeScript state machine), scoring, timing
  input/        sticky-note writing, number pad, choice input, input chooser, answer decision
  ink/          handwriting recognizer client, worker, model loading
  body/         camera capture, pose worker, side selection, calibration
  render/       notebook rendering kit (paper, hatching, outlines, boil, effects)
  games/        one folder per game; each exports an ArcadeGame
  history/      arcade event recording, progress client, local overlay
  audio/        sound and music manager
tools/arcade-ink/   recognizer training and evaluation (Python); no data in git
public/arcade/      recognizer model and runtime files, textures, audio (lazy-fetched)
docs/arcade/        model card, evaluation and device reports, asset licences, style guide
```

**Shared logic lives under `services/`.** Only `services/product-server.mjs`, `services/byok/*.mjs` and `services/learning-history/*.mjs` are deployed to the server (`PUBLIC_DEPLOYMENT_RUNBOOK.md`). The client imports these modules from `services/`, as `src/learning/history/device-queue.ts` already does with `event-contract.mjs`.

### 7.2 Routing, loading, gating and the feature flag

- **Routes:** `/arcade`, `/arcade/skills`, `/arcade/skills/:skill/games` and `/arcade/play/:skill/:game`. All are `React.lazy`.
  - **Standalone phase (decision 18):** the routes sit outside `AuthGuard`, as `/course/:packId` does, so the Arcade plays with no account and no server. They move under `AuthGuard` in M5, when progress joins the account.
- **Lazy loading:** three.js, the recognizer runtime and model, MediaPipe and the pose model, and each game load only on Arcade routes.
  - Vite `build.manifest` is enabled, and a bundle check over the manifest fails if any of them appears in the entry chunk.
  - The check covers the legacy Android build as well.
- **Assets:**
  - **Body mode reuses `/avatar-runtime/`** (round 2 #5). `scripts/prepare-avatar-assets.mjs` already prepares the pose model and the checksum-verified MediaPipe vision wasm there, for the web build and the Android app (`prebuild:android` → `prepare-android-assets.mjs`). No second copy is packaged (the wasm alone is 11.45 MB, stored uncompressed in the APK).
  - **The pose worker is a classic IIFE worker** built by a prepare script, like `face-capture.worker.js`. MediaPipe's loader uses `importScripts`, so it does not load in the app's default module workers (`vite.config.ts`, `worker: { format: "es" }`).
  - **The handwriting runtime is Arcade-owned.** The Android app deletes the voice-detection assets (`scripts/finalize-android-assets.mjs`), so their onnxruntime files cannot be reused (§7.5).
  - **Web:** compression for `.wasm`, `.onnx`, `.task` and `.glb` is configured in the deploy runbook.
- **Server support check (M5):** once the Arcade records to the server, it appears only when `GET /api/learn/history/arcade/progress` responds.
  - Only an authenticated 404 (a service that predates the Arcade, or after a rollback) hides it. A network error or server fault keeps the last known answer for that account (round 2 #1).
  - The response carries the catalog version, and the client hides skills the service cannot validate.
  - Not needed in the standalone phase.
- **Browser capability check** at entry:
  - Android WebView ≥ 91 (wasm SIMD; module workers);
  - WebGL2, a hard requirement: three.js dropped WebGL 1 in r163, and the repo uses r183 (round 2 #6);
  - for body mode, a camera.

  A device that fails sees a friendly "not available on this device" card. The TV runs WebView 101.
- **Feature flag:** an "Arcade" switch on the settings Experiments tab, like air writing. It defaults to on at launch (end of M6).
- **Navigation:** a fifth academy place, "Arcade" (zh: 游戏厅, *proposed*), with a gamepad icon, also on the mobile bottom bar.
- **Classroom presentation mode (OL-050):** the Arcade hides personal progress (quick-fact counts, ink-drop totals, history) until the same explicit reveal that other personal views use. Playing is still allowed.

### 7.3 Round engine

A pure TypeScript state machine with an injectable clock and seeded RNG:

`intro → (camera check) → countdown → asking ⇄ (judging → correct | wrong | unsure | shown) → … → results`, with `paused` reachable from any active state.

- It emits typed `RoundEvent`s:
  - `round_start`;
  - `item_shown`, with `choices` in choice mode;
  - `input_started` and `input_side` (body movement toward a side, before confirmation);
  - `answer_correct` (with streak and ink drops), `answer_wrong` (with the correct answer and, for handwriting, the reading), `answer_unsure` and `answer_shown` (from "Show me");
  - `streak_milestone`;
  - `round_end`.
- Pages and games subscribe to these events. Only the engine decides correctness, score and the next item.
- It runs headless in unit tests: a scripted input sequence leads to an exact event log.
- **Pausing:** hiding the page pauses the engine, and paused time is excluded from answer times.

### 7.4 Scheduler

- `deriveFactStates`, in `arcade-facts.mjs`, is the incremental derivation of §4.4. It is shared by client and service.
- `planRound(skill, states, seed)`, in `arcade-schedule.mjs`, returns the 20-item plan of §4.5. After a wrong answer or "Show me", only the remaining items are re-planned.
- The client plans from the last progress response plus its own unsynced answers (§7.9). A dropped connection during a session does not stop play.
- **Standalone phase:** the client plans from the answers stored on the device (§7.13). The derivation code is the same pure module, so M5 moves it to `services/learning-history/` for the service to share, without changing it.

### 7.5 Handwriting and number pad

**Sticky-note writing:**
- a `<canvas>` with pointer events (pen, touch and mouse) and `touch-action: none`;
- when a pen is active, touch is ignored (palm rejection);
- strokes are smoothed, with an ink look matching the art;
- the eraser clears the note, and the note clears itself on each new item.

**Recognizer** (on the device, in a Web Worker):
- **Input:** the strokes, rendered to a height-normalised greyscale line image.
- **Model:** two candidate designs, chosen by the M3 gate:
  - (a) split the ink into digits by stroke grouping, then a small single-digit CNN;
  - (b) a small CRNN with CTC over the whole line, which handles touching digits.
- **Runtime:** two candidates, also chosen at M3.
  - onnxruntime-web: `ort-wasm-simd-threaded.wasm` in 1.26.0 is 13.0 MB (3.3 MB gzip). The APK stores wasm uncompressed (`android/app/build.gradle`, `noCompress`), so it would use 13 MB of the 20 MB Android budget (round 2 #5).
  - A small pure-TypeScript or WebGL inference for the ≤ 1 MB model, which may avoid the wasm entirely.
  - The size each adds to the APK is a criterion of the comparison.
- **Size and speed:** model ≤ 1 MB, int8 if accuracy allows. Inference p95 ≤ 50 ms on the reference low-end Chromebook, with a separate cold-start bar (*proposed*).
- **Output:** the top candidate strings (up to 3 digits) with scores.
- **If loading fails:** the number pad takes over automatically, with a short note.

**Answer decision** (thresholds *proposed*, tuned at M3 and in the owner's playtest):
- **Correct:** accepted **immediately** when the expected answer is the **top-1** candidate with score ≥ τ_accept (decision 9).
  - The expected answer is never accepted just because it appears among the lower candidates.
  - Because acceptance is immediate, a child who meant a longer number that starts with the answer (writing "17" for 9 − 8) can be credited after the "1". The owner accepted this for the entertainment focus. The evaluation measures how often it happens (§7.7).
- **Wrong:** a different number is top-1 with score ≥ τ_reject, and the pen has been up for 900 ms. The wait is about 2 s instead when the child may still be writing the answer (round 2 #7):
  - the reading is shorter than the expected answer and could still become it (expected 12, written "1");
  - or the expected answer is among the top 3 candidates (a 4, 5 or 7 whose first stroke reads as "1").

  The longer wait only delays a *wrong* verdict; it never accepts.
- **When it runs:** the recognizer runs at each pen-up, not mid-stroke.
- **Between items:** strokes whose pointer-down came before the new item appeared are discarded, and the note ignores input for about 300 ms during the game's response. A carried-over stroke (the "7" of a meant "17") then cannot answer the next fact. This is a gap between items, not a settle wait (decision 9).
- **Unsure:** anything else after the wait. The note wobbles and says "write it again". It is recorded as `unsure`, which is not an attempt (§4.5).
- **Handwriting is never stored.** Recognizer score and outcome are recorded with each answer, so misreadings can be measured.

**Number pad:**
- large on-screen digit keys with backspace; physical keyboard digits work too;
- correct is accepted immediately when the typed value equals the expected answer (decision 9);
- otherwise the answer is judged on ✓ (or Enter), or after 1.5 s idle once at least as many digits have been typed as the expected answer has.

### 7.6 Body input on the TV (decision 12)

**When it is used:**
- on the TV, by default;
- the Android app tells the page that it is running on a TV through a small native flag (added in M2);
- the Arcade settings can override it on any device with a camera.

**Requirements:**
- A camera on the TV. **The TV has a USB camera** (owner, 2026-11-26).
  - Android exposes a USB camera to apps only when the vendor's system supports external cameras ([AOSP](https://source.android.com/docs/core/camera/external-usb-cameras); also noted in `LEARNER_AVATAR_ANIMATION_PLAN.md` §7). No record shows this camera opened from the WebView yet.
  - So the TV checks at the start of M2 begin by checking that the WebView lists it (`enumerateDevices`), opens it through `getUserMedia`, and delivers at least 15 frames per second at 640×480 or lower (§7.10).
- The Android app already declares `CAMERA` and grants WebView video capture (`MainActivity.java`, `onPermissionRequest`).
- Without a camera, the two choices are tapped on the touch screen.

**Detection:**
- MediaPipe `PoseLandmarker`, using the lite model already in the repo (`public/models/avatar-body/pose_landmarker_lite.task`, with its licence, used today by the avatar body capture in `face-capture.worker.ts`).
- It runs in a classic worker (§7.2) on frames from the camera, about 10–15 per second, on the CPU delegate as `face-capture.worker.ts` does.
- **Who is tracked** (round 2 #4a): the person nearest the centre *at calibration* is chosen, then followed by continuity (nearest torso position, similar shoulder width), not re-chosen every frame. Otherwise the selection move itself, which carries the player away from the centre, could hand tracking to a bystander.
  - If the player is lost for more than 1 s, the round pauses with "stand in the middle" and recalibrates.
- **`numPoses`:** 2 lets a second person be seen and ignored, but MediaPipe skips its detector only when it already tracks `numPoses` people, so with one child in view the detector runs on every frame. M2 measures ms per frame with 1 and 2 and picks one (round 2 #4c).

**Selecting a side** (all values *proposed*, tuned in the owner's playtest):
- The signal is the horizontal position of the torso centre (the midpoint of the shoulders and hips) in the mirrored image, relative to the calibrated centre.
  - **Scale** (round 2 #4b): it is divided by the shoulder width measured at calibration, updated only while the child faces the camera (a small depth difference between the shoulders). Per-frame width would shrink when the child turns and trigger early selections.
  - **Smoothing:** a One-Euro filter on the torso position.
  - When the hips are hard to see (behind a desk), the shoulder midpoint is used.
- Moving at least one shoulder width toward a side and holding for 250 ms *and* at least 3 consecutive pose frames selects that side.
- The next item arms only after the child is back within 0.4 shoulder widths of the centre (hysteresis). The game shows "back to the middle" with a doodle arrow.
  - **Timing** (round 2 #4d): the answer clock starts when the child is back in the middle and the item is shown, so the walk back does not count against *T*.
- **Calibration**, before the round: the child stands in the middle until the doodle figure lights up. It requires shoulders and hips in view, the torso in the middle third of the frame, and a shoulder width within set pixel limits, with "come closer" and "step back" prompts (round 2 #9).
- **"Show me" in body mode:** standing in the middle for about 8 s shows the answer, recorded as `shown` (round 2 #9).
- **Tap and move together:** the first confirmed input wins.

**Choices:**
- Two numbers, one correct, shown left and right.
- The correct side is random, balanced, and never the same more than 3 times in a row.
- **Wrong choices are plausible:**
  - ±1 and ±2;
  - the other operation's result (9 − 8: 17);
  - a neighbouring table fact (6 × 7: 36 or 48);
  - swapped digits (12: 21).

  A wrong choice is never equal to the answer, and always within 0–100.

**Recording:** a body answer records `input: body`, both choices and the side chosen. Answer time runs from the item shown to the confirmed selection.

**Privacy:**
- Camera frames are processed in memory on the device and never stored or uploaded. Only the chosen number is recorded.
- The camera starts only when the child presses Start on a body-mode round, shows a camera-on indicator, and stops when the round ends or the page is left.
- Capture stops on logout or when permission is revoked (OL-048). It also stops when the page is hidden (the app goes to the background) or a camera track ends; the round pauses and resumes through the camera check (round 2 #9).
- By default the mirror figure is a doodle drawn from the landmarks, not the camera image.

**Performance:** pose detection runs alongside the 3D scene. The TV checks (M2) measure both together (§7.10).

### 7.7 Recognizer data, training and evaluation (M3)

- **Training data:**
  - public handwritten-digit datasets, with each licence confirmed and recorded before use;
  - synthetic multi-digit lines composed from them;
  - augmentation for slant, stroke width, jitter, finger-thick strokes, touching digits and mirror-written digits.
- **Evaluation data:** public digit sets are mostly adult writing.
  - First, samples from the team, collected with a dev-only page (`/arcade/ink-lab`, behind the debug flag). It shows a number, records the strokes with their timing, and exports a JSON file locally.
  - Children's samples come later, under decision 8 (deferred). They are collected with written parental consent, outside the product, stored outside git and deleted on request. Training on them needs a separate decision.
- **The evaluation set includes deliberately wrong answers:**
  - look-alike digits (1/7, 4/9, 0/6);
  - reversed digit order (12/21);
  - operation mix-ups (17 for 9 − 8);
  - the prefix cases of §7.5.
- **The evaluation harness** (`tools/arcade-ink/eval`):
  - replays stroke files **with their original timing** through the exact browser preprocessing *and the answer decision*, not just the model;
  - reports correct answers accepted, correct answers marked wrong, false accepts (wrong answers marked correct, with prefix cases counted separately), the unsure rate, and latency;
  - reports everything per device class: iPad finger, iPad Pencil, Chromebook touch, desktop touch.
- **Gate** (*proposed*, M3 exit, per device class):

  | Measure | Bar |
  | --- | --- |
  | Correct answers accepted on the first try | ≥ 95% |
  | Correct answers marked wrong | ≤ 1% |
  | Unsure | ≤ 4% |
  | False accepts, not counting the accepted prefix cases | 0 in ≥ 600 deliberately wrong samples (95% upper bound ≈ 0.5%) |
  | p95 latency on the reference Chromebook | ≤ 50 ms warm; cold start ≤ 1 s |

  The prefix rate is reported, not gated (decision 9).
- **If the gate fails** after one improvement cycle, the owner decides between more data and shipping version 1 with the number pad as the default on that device class. The decision is recorded in this plan.
- **Model card:** `docs/arcade/INK_MODEL.md` records data sources, licences, version, gate results and known weaknesses.

### 7.8 Game interface

```ts
interface ArcadeGame {
  id: string;
  mount(host: HTMLElement, ctx: { quality: QualityTier; reducedMotion: boolean; audio: ArcadeAudio; mode: "answer" | "choice" }): Promise<void>; // each game brings its own style kit (decision 19)
  onEvent(event: RoundEvent): void;   // never returns a decision
  setQuality(tier: QualityTier): void;
  resize(width: number, height: number): void;
  pause(): void; resume(): void;
  dispose(): void;                    // must release GPU resources (tested)
}
```

- **Lost WebGL context:** the round continues with the HUD only (the fact, the answer area, progress and score). The game remounts if the context is restored.
- **Smoke test** for each game, in headless Chromium:
  - mount it, feed a recorded event log in both modes, resize it, then dispose of it;
  - assert that no geometries or textures leak (via `renderer.info`).

### 7.9 Records (learning-history)

**Built in M5 (decision 18).** Until then the Arcade keeps progress on the device (§7.13). When this is built, it also takes in the round 2 findings:
- **Sync lanes** (#1): separate batches alone do not protect lesson sync. The queue lists rows by hashed event id, so Arcade and lesson rows interleave, and any non-OK response stops the run (`synchronize.ts`). So the synchronizer sends lesson events first, then Arcade events. A 4xx on an Arcade-only batch is not fatal: those events stay pending, the Arcade lane is parked until the support check passes again, and no lesson-sync error is shown. The unknown-kind test seeds Arcade events whose ids sort before the lesson events.
- **Local day** (#2): the progress endpoint takes `utc_offset_minutes`, validated as `/map` does, and passes it to `deriveFactStates`. Test: answers at 23:50 and 00:10 local time.
- **No paid calls** (#3): Arcade routes call `muteAwardVoice('arcade', true)` (`award-events.ts`), so ceremonies are text only (decision 14). During a round the history coordinator is held busy, as `setClassroomBusy` does, and syncs at round end. The PRD line reads: "Arcade code makes no model or third-party request; the shared sync may run queued lesson maintenance after a round."
- **Service details** (#8):
  - The client keeps each local answer with its receipt `seq` until a progress response has `through ≥ seq` (the queue deletes acknowledged events), instead of a list of included ids.
  - The `(owner, kind, seq)` index is added with `CREATE INDEX IF NOT EXISTS` and no schema version bump, so a rollback still starts (`store.mjs` accepts versions 1–5 only).
  - Arcade achievement rules read `arcade_round_ended` and the derived fact states; `arcade_answer` stays out of the all-events scan in `evaluateAchievements`.
- **Moving progress over:** the answers stored on the device in the standalone phase are uploaded once as `arcade_answer` events when the player first signs in, after the owner confirms the device's progress belongs to that account.

**New event kinds.** These are additive to `event-contract.mjs`. Each round is its own run, `run_id = arcade:<round_id>`, as taught lessons use `taught:<id>`.

| Kind | Data |
| --- | --- |
| `arcade_round_started` | `round_id`, `skill_id`, `game_id`, `input` (`ink`/`keypad`/`body`), `rules_version` |
| `arcade_answer` | `round_id`, `item` (0–19), `fact_id`, `form`, `input`, `result` (`correct`/`wrong`/`unsure`/`shown`), `given` (integer; omitted when unsure or shown), `total_ms`, `first_input_ms` (diagnostic), `score` (recognizer, optional), `choices` and `side` (body only) |
| `arcade_round_ended` | `round_id`, `reason` (`finished`/`left`), `answered`, `correct`, `ink_drops`, `best_streak` |

- **Ids:** M5 defines deterministic event ids (from the round id and the answer's sequence number) and the `session_id` rule, checked against session deletion. `game_id` is validated by pattern only, so a new game needs no service deploy. `fact_id` and `skill_id` are checked against the shared catalog.
- **No ink, images, landmarks or free text are stored.**
- **Sync safety:**
  - The service rejects a whole batch if any event in it is unknown (`store.mjs`, `append`), and the synchronizer then stops (`synchronize.ts`).
  - So Arcade events go through the device queue **in their own batches**, never mixed with lesson events. A service without Arcade support (§7.2) can then never block lesson history.
  - The synchronizer already splits at 100 events per request.
- **Progress endpoint:** `GET /api/learn/history/arcade/progress?skill=<id>`.
  - It returns the fact states (§4.4), per-skill totals, `through` (the last event sequence it counted) and the ids of the Arcade events it included.
  - The client applies only its local answers that are not yet counted, and caches the last response.
  - It is derived on each read, like achievements.
- **Performance:** an `(owner, kind, seq)` index is added to the events table. `evaluateAchievements` parses every event on each read, and the Arcade adds about 20–80 events per round.
- **Deletion and backup:** Arcade runs are covered by the existing run deletion and backup (OL-016, OL-030, OL-063).
- **Records list:** Arcade runs get a label ("Arcade round: Margin Run, add within 10") in the records run list (`account-history-panel`).

**Star map** (`map-states-v2`):
- **A third association path:** Arcade answers count as `practising` on the skill's topic. Today topics come only from approved course mappings or automatic analysis (`map-progress.mjs`), and `practising` only from `task_attempt`.
- This needs a new `meaning` text and client type updates. Arcade play alone never reaches `did-it`; that stays tied to lesson tasks.
- **The "quick facts" ring** (decision 15): when at least 90% of a skill's facts are quick, its topic star gets a ring, drawn like the existing taught-lesson ring.
  - Once earned, the ring stays, in the spirit of OL-073.
  - Its label says "quick facts" and never echoes "Fluent" from the topic name.
  - **No ring on `mt_K5jM7vlVhA`** ("All times tables to 12×12") while version 1 covers only 10×10, since that would over-claim.
- **Days:** Arcade days count toward account-wide day-based achievements such as `studying` (*proposed*). Per-topic achievements (`regular-guest`, `reunion`) and star frame levels stay lesson-only.

**Achievements** (`achievements-v3`, decision 15): a new "Arcade" category of about 12 in the existing catalog and rules engine. Examples:
- first round;
- 10 rounds;
- a streak of 10;
- a first skill with every fact quick;
- practice on 3 different days in a week;
- every game played.

All wording passes the no-mastery rule. Gold and star tier badges come from the existing badge art pipeline.

**Records page and weekly report:** an Arcade line (rounds, and facts that got quicker this week). This is M5.

### 7.10 Performance

- **Quality tiers**, defined as caps in *device pixels* (the TV draws a 4K panel at DPR 4, with a 960×540 CSS viewport):

  | Tier | Render size cap | Outlines | Particles |
  | --- | --- | --- | --- |
  | `high` | 2560 × 1440 | hull outlines + screen-space edges | full |
  | `medium` | 1920 × 1080 | hull outlines | half |
  | `low` | 1280 × 720 | hull outlines | few; no shadows |

  - The starting tier comes from a short GPU probe.
  - A watchdog drops one tier when the frame rate stays below 85% of the device's target for 3 s.
- **Targets** (*proposed*):

  | Device | Frame rate |
  | --- | --- |
  | iPad and desktop | 60 fps |
  | Low-end Chromebook | ≥ 30 fps |
  | TV | ≥ 30 fps, *with pose detection running* |

  - **First visit:** every byte the Arcade transfers is counted, including runtime wasm, models and the first game. Cold and warm loads are measured separately. The budget (*proposed*) is ≤ 8 MB compressed on the web (body-mode assets excluded) and ≤ 20 MB added to the Android app.
  - Music and the handwriting-style display font compress poorly. Music loads after the round starts, and the font is subset to the Arcade's own strings (round 2 #5).
  - Time from Play to a playable round: ≤ 3 s on the reference Chromebook when warm.
  - Memory: ≤ 300 MB.
- **TV checks (M2):** the TV is an SKG M3G2 (Android 13, WebView 101, Mali-G52; per the performance reports in `docs/course-runtime-quality/`).
  - Its recorded capability probe says "WebGL 1.0" (`tv-capabilities.json`). The probe probably requested a WebGL1 context, and the GPU normally supports WebGL2.
  - Still, no three.js scene has run on it: the Android app deliberately uses static teacher art (commit `bd41b482`).
  - So M2 runs the notebook shader *with pose detection* on the TV, at each tier's render size. The shader and recognizer on a low-end Chromebook are measured in M3 and M4.
  - **Step 1, camera** (§7.6): on an isolated test page (some external cameras have crashed WebView's `getUserMedia`; crbug 1183362), the USB camera is listed by the WebView, opened through `getUserMedia`, at least 15 fps at 640×480 or lower. Frames per second, resolution and the time to first frame are recorded, with `dumpsys media.camera` (camera ids, hardware level) as evidence. If the WebView cannot open it, the owner decides: a native camera bridge in the Android app, another camera model, or the tap fallback only.
  - **Step 2, WebGL2:** `getContext('webgl2')` succeeds. Without it three.js cannot run, and the owner decides at once.
  - **Step 3, load** (as `LEARNER_AVATAR_ANIMATION_PLAN.md` §8 asks, not average fps; round 2 #6): p50 and p95 frame time and long frames; at least 10 minutes of back-to-back rounds with the HTML HUD animating at DPR 4; thermal drop; memory against the 300 MB target; pose ms per frame with `numPoses` 1 and 2; pose model cold start; latency from camera frame to confirmed selection.
  - On the Chromebook, the recognizer runtimes are timed with a stand-in model of the target size, since the real model exists only after M3.
  - **When:** steps 1 and 2 run at the start of M2; step 3 runs in M2 with the first playable Margin Run, and again in M4 with the full look.
  - If the TV cannot reach 30 fps at the low tier, the owner decides at M2. The options are a lower fixed resolution, a simpler 2.5D renderer for the TV, or the TV joining later.
- **Device matrix:**
  - the TV (Android app, body mode and tap fallback);
  - iPad (Safari, finger and Apple Pencil);
  - a low-end touch Chromebook and a non-touch Chromebook;
  - desktop Chrome, Edge and Safari.

### 7.11 Settings

An "Arcade" section in settings holds:
- input (automatic / writing / number pad / body);
- sound effects on/off and music on/off;
- reduced effects;
- "show my teacher on results".

These are stored per device, like the experiments settings.

### 7.12 Internationalisation

All strings go through `tr()`, with Chinese and English messages, and `pnpm check:i18n` passes. Fact strips use the operator glyphs `+ − × ÷`, the same in both languages. New strings are added late in each PR and rebased, because the message catalogs are shared hotspots (§9).

### 7.13 Progress on the device (standalone phase, decision 18)

- **Store:** an IndexedDB database `octos-arcade` on the device, not tied to an account. One player per device in this phase.
- **What it keeps:** each answer in the shape of the future `arcade_answer` event (§7.9: fact, form, input, result, given, time), each round's summary, and the ink-drop total. No ink, images or landmarks.
- **Fact states** are derived from these answers with the same pure derivation (§4.4), using the device's local day, which also settles round 2 #2 for this phase.
- **Reset:** the Arcade settings have "Clear Arcade progress on this device".
- **No network:** the Arcade's own code makes no request, so it works with the server down. The app shell's sign-in status check (`/api/auth/status`) still runs on every page and fails quietly; the end-to-end test blocks every server path and checks that nothing else is called.
- **Later:** M5 uploads these answers to the account (§7.9) and switches the scheduler to the server's progress.

## 8. Privacy and safety (US K–12)

- **Handwriting:** recognized on the device, never stored or sent. The note is cleared after every item.
- **Camera:** frames are processed in memory on the device for body mode. They are never stored or sent, and landmarks are not recorded.
  - The camera starts only on an explicit Start, shows an indicator, and stops at round end, when the page is left, on logout or when permission is revoked (OL-048).
- **Recorded facts:** answers, timings, scores, the input method and round totals, under the learner's own account. They have the same access, deletion and backup rules as other learning history (OL-045 to OL-047; OL-016, OL-030 and OL-063).
- **Data inventory:** per-fact answer timing is a new data class. It is added to the data inventory and privacy text under D04 before launch.
- **One child per account:** the Arcade assumes one child per account, like the rest of the product. A classroom TV used by several children under one account mixes their progress; the launch notes and settings say so.
- **Presentation mode:** personal progress is hidden in classroom presentation mode (OL-050).
- **No social features:** no leaderboard, chat, advertising or purchase.
- **No third-party calls:** the Arcade calls no third-party service. The teacher line on results is text only (decision 14).

## 9. Working in parallel with the math work

- **Isolation:**
  - the `arcade/…` branch prefix, a dedicated worktree (`octos-learn-arcade`) and its own PR series;
  - the math work stack's repos (OLL, Coach, course library) are not touched;
  - new code lives under `src/arcade/`, `services/learning-history/arcade-*.mjs`, `tools/arcade-ink/` and `public/arcade/`.
- **Real conflict hotspots** (review round 1 measured commits since 2026-11-10):

  | File | Commits |
  | --- | --- |
  | `package.json` | 40 |
  | `pnpm-lock.yaml` | 39 |
  | `learning-stack-bom.json` | 39 |
  | `en.json` / `zh.json` message catalogs | 7 each |

  - Arcade dependency changes go into one PR.
  - Message strings are added late and rebased.
- **Low-churn touch points**, each kept small and called out in its PR:
  - `src/App.tsx`;
  - `academy-header.tsx` and the hall;
  - `event-contract.mjs`, `map-progress.mjs`, `store.mjs` (index), `synchronize.ts` (separate batches) and the achievement files;
  - the settings tabs;
  - the Android app (TV flag, asset packaging);
  - `docs/README.md`.
- **Speed (AGENTS.md rule 1):** zero model round-trips and zero prompt change, so lesson generation speed is unaffected by construction. The bundle check (§7.2) proves the main entry chunk grows by no more than the route, flag and capability-check code (*proposed* bound: +5 KB gzip).
- **Status:** kept in the TODO list at the end of this file, linked from `docs/README.md`. `docs/MATH_WORK_STACK.md` belongs to the math work and is not edited by Arcade PRs.
- **Review labels:** every Arcade PR is reported as "Needs code review" or "No review needed", with a reason.

## 10. Milestones

Sizes are relative (S/M/L), not dates. **Order follows decision 18: make it playable and prove it works, then add the rest.** **Order of work (decision 20):** M1, then M7 (games B–D in the browser, Paper Glider first), then M2 with the Mac's camera (the TV checks when the TV is ready), then M3 onward. The style board (M0) runs alongside M1–M3; its approval gates production art in M4.

| | Milestone | Size | Contents | Exit criteria |
| --- | --- | --- | --- | --- |
| **M0** | Plan and style | S | This plan reviewed and merged. Style board artifact | Owner approves the plan and the style board |
| **M1** | Playable core (web, standalone) | L | Skill catalog, generators and fact derivation (pure modules); device progress store (§7.13); scheduler with random fill; round engine (pause, "Show me"); number pad and tap choices; **Margin Run first playable** in a basic notebook look (paper, ink outlines, hatching) in both modes; `/arcade` pages outside `AuthGuard`; results screen with ink drops and streaks | Exhaustive fact tests and scheduler invariants; full rounds in Playwright via the number pad and via tap choices; works with the server down; **owner playtest 1** on the web |
| **M2** | TV body input | L | TV checks steps 1–2 (camera, WebGL2) on an isolated page; pose worker (classic, reusing `/avatar-runtime/`); tracking, side selection, calibration, body "Show me"; choice mode on the TV; Android TV flag; TV load test (step 3) with Margin Run | Camera and WebGL2 pass, or the owner decides; full round via replayed landmarks in Playwright; ≥ 30 fps at some tier with pose running; **owner playtest on the TV** |
| **M3** | Handwriting | L | `/arcade/ink-lab`; team evaluation set with deliberately wrong and paused multi-stroke samples; training pipeline; model candidates (a) and (b); runtime candidates (size, latency, APK size); evaluation harness with timing replay; worker integration on the sticky note | §7.7 gate passes per device class, or the owner records the fallback decision; **owner playtest** with handwriting |
| **M4** | Full look and sound | L | Notebook rendering kit with tiers, watchdog and context loss; production art per the style board; Nib model and clips; music and sound; settings section; capability checks; bundle check | Device matrix at target frame rates; bundle check; **owner playtest 2** |
| **M5** | Records and rewards | L | Arcade events, sync lanes, progress endpoint, support check, server derivation, index (§7.9 with round 2 #1, #2, #3, #8); device progress moved to the account; routes under `AuthGuard`; Arcade achievements (`achievements-v3`); star map `map-states-v2` with the quick-facts ring; award hold and muted award voice; records page line; navigation place and flag | Events sync and derive correctly; an unknown-kind batch never blocks lesson sync; rule tests; ceremony never mid-round; wording review passes |
| **M6** | Launch | M | Accessibility pass; copy review; i18n; data inventory (D04); deploy runbook (ordering; compression); Android app release and size check; children's playtests when decision 8 allows | Owner switches the flag on by default |
| **M7** | Games B–D | M each | Paper Glider, Star Sketch, Up the Page, one PR each, both modes | Same device and smoke checks as M4 |

**PR plan:**
- M0: the plan PR (No review needed: docs).
- M1: one or two PRs, core then the game (Needs code review: new page and game code).
- M2: one PR for body input, plus a records PR for the TV results (No review needed: records).
- M3: tools and model, then worker integration (Needs code review: the product's input path).
- M4: the kit and the art, one or two PRs (Needs code review).
- M5: one or two PRs, service then client (Needs code review: changes sync, achievement and map rules).
- M7: one PR per game.

PRs target `main`; they are not stacked. Each says "merge after X" where order matters. Until M5 the Arcade touches no shared service code, so the standalone PRs cannot affect lessons or lesson sync.

## 11. Testing and acceptance

- **Unit (Vitest):**
  - every fact's answer;
  - skill fact counts;
  - form distribution;
  - incremental state derivation, including deletion and the local overlay;
  - scheduler invariants: target spacing, the new-fact cap, the random fill, no fact twice in a row;
  - round engine event logs, including pause and "Show me";
  - decision logic over recorded recognizer outputs (immediate correct, wrong with the prefix wait, unsure, number pad offered after two unsure readings);
  - number pad behaviour;
  - side selection over recorded landmark sequences (dwell, hysteresis, two people);
  - distractor rules (never the answer, in range, side balance);
  - event validation;
  - service derivation and the progress endpoint;
  - achievement and map rules.
- **Browser (Playwright):**
  - a full round via the number pad;
  - a full round via replayed real strokes through pointer events, with the real model;
  - a full round in body mode via replayed landmark sequences injected in place of the camera;
  - reduced motion;
  - a dropped connection mid-session, then sync;
  - flag on/off;
  - the service returning 404 for progress (the Arcade stays hidden);
  - an unknown-kind rejection that does not block lesson sync;
  - the round page holds ceremonies until the round ends, and does not start under one.
- **Bundle check:** web and legacy Android builds; no three.js, recognizer, MediaPipe or game code in the entry chunk.
- **Performance smoke:** a scripted round in headless Chromium samples frame times as a regression signal. Real numbers come from the device matrix, recorded in `docs/arcade/DEVICE_RESULTS.md`.
- **Recognizer report:** gate numbers per model release, in `docs/arcade/INK_MODEL.md`.
- **Proposed PRD requirements**, added as `OL-075` onward under PRD change control after approval, each with its check:
  1. The Arcade makes no model or third-party request. Check: a network log of a full round in each mode.
  2. Handwriting, camera images and landmarks are not stored or transmitted. Check: storage and network inspection during and after rounds.
  3. The expected answer is accepted only as the top-1 candidate. Check: a decision test over recorded outputs.
  4. False accepts (not counting prefix cases) stay within the §7.7 bar. Check: the evaluation report.
  5. Achievements earned in a round appear only after the round ends. Check: Playwright.
  6. Arcade code is absent from the entry chunk. Check: the bundle check.
  7. Every fact's answer is correct, and no distractor equals it. Check: exhaustive unit tests.
  8. No Arcade wording claims mastery. Check: catalog wording review plus a word-list test.
  9. A round is playable without touch and without a camera. Check: the number-pad and tap-fallback Playwright runs.
  10. Arcade events never block lesson-history sync. Check: the unknown-kind Playwright run.
  11. The camera starts only on explicit Start and stops at round end, when the page is left, on logout or when permission is revoked. Check: Playwright with a fake camera.
  12. Frame-rate targets hold on the device matrix. Check: the device results file.

## 12. What we will measure

These are collected in the owner's playtests and on development builds only, until PRD decision D11 sets the collection policy:
- rounds per session, voluntary replays and the share of rounds finished;
- accuracy and answer time per fact over days;
- the unsure rate, misreads (a child rewrites the same number after a "wrong") and the prefix-credit rate;
- in body mode: selection time, false selections (the child moved back immediately) and lost tracking;
- frame rate and tier drops per device;
- which games, skills and inputs children pick.

## 13. Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Recognizer misreads children's digits | Frustration; wrong records | The M3 gate per device class; an unsure path; the number pad after two unsure readings; automatic fallback |
| False accepts | Children credited for wrong facts | Top-1-only acceptance; the false-accept bar; the prefix rate measured (accepted risk, decision 9) |
| The TV cannot render 3D with pose detection at 30 fps | The main device plays poorly | TV checks at the start of M2; device-pixel tiers; owner decision before building |
| The WebView cannot open the TV's USB camera, or body tracking is unreliable (lighting, several children in view) | Body mode fails | Camera check first in M2, with an owner decision if it fails; tap fallback; centre-person tracking; calibration; measured in the owner's playtests |
| Two choices allow guessing | Weaker practice on the TV | Accepted for the entertainment focus; input recorded so it can be weighed later |
| Art takes longer than code | M4 slips; the look disappoints | The style board is approved before production; shader-led treatment over simple geometry; one game first |
| Rewards without learning (PRD §11) | Engagement without faster recall | Targets weak facts; answer time measured per fact; the "Learn how" link |
| Pressure and anxiety | Children avoid the Arcade | No countdown, lives or ink-drop loss; improvement framing |
| Arcade events break lesson sync | Lesson history stops syncing | Separate batches; the support check; service-first deploys |
| Competes with the math work for attention | Both slow down | Separate worktree, PRs and status; hotspots handled late |
| Too close to the reference | Reputational or IP risk | The originality rule in §2; our own screen pieces; the style board checked for it |
| Asset licensing | Takedown or relicensing | A licence record per asset; CC0 or commissioned audio |

## 14. Owner questions

Answered 2026-11-25 (decisions 5–17 in §1). Answered 2026-11-26: **the TV has a USB camera** (§7.6); whether the WebView can open it is the first TV check in M2.

Still open:
1. **USB camera model** (optional): its name helps if the M2 camera check fails.
2. **3D art source:** AI 3D generation with clean-up, or a commissioned 3D artist? Needed for M4 production.
3. **Sound and music source:** CC0 libraries, or commissioned? Needed by M4.
4. **zh names** for the Arcade place (游戏厅 proposed), Nib (小墨) and the games (§5.5). Needed by M4.
5. **Children's handwriting and playtests** (decision 8, deferred): who recruits families and holds the consent forms, and whether training on their samples is allowed. Needed by M6.
6. **Proposed defaults to confirm or change in the playtests:** the *T* values, round length, body-mode thresholds, whether body answers count toward "quick", and Arcade days counting toward day-based achievements.

## 15. Review rounds

Two rounds, the cap. Round 1 (2026-11-25) reviewed the first draft; round 2 (2026-11-26) checked the changes: body input, the answer decision, sync safety, the device checks, and whether accepted round 1 fixes reached the text. Outcomes are in §17.

## 16. TODO

**M0: plan and style**
- [x] Agent review rounds 1 and 2; owner decisions on their findings (2026-11-25, 2026-11-26).
- [x] TV camera confirmed: USB (owner, 2026-11-26).
- [ ] Plan PR merged.
- [ ] Style board artifact (paper, ink, hatching, palette, Nib's sheet beside the Octos avatar, Margin Run in both modes, the screen pieces); owner approval.

**M1: playable core (web, standalone)**
- [x] Skill catalog, fact generators, forms and ids; incremental fact derivation with the local day; exhaustive tests (`src/arcade/core/`).
- [x] Device progress store (`octos-arcade` IndexedDB) and "Clear Arcade progress".
- [x] Scheduler with targets, reviews, new facts and random fill; invariant tests.
- [x] Round engine with seeded RNG, injectable clock, pause and "Show me"; headless event-log tests.
- [x] Number pad (immediate correct; ✓/Enter or idle for wrong) and tap choices with distractors.
- [x] Margin Run first playable: three.js scene, paper and ink look, both modes, reacting only to `RoundEvent`s; `dispose` releases GPU resources. Nib is a stand-in built from simple shapes until M4.
- [x] `/arcade` home, skill picker, game picker and results; routes outside `AuthGuard`; zh/en strings.
- [x] Playwright: full rounds via number pad and tap choices, with the server down (`tests/arcade.spec.ts`).
- [x] **Owner playtest 1** (web, 2026-11-26): "overall, it's already fantastic". One issue, fixed: after a wrong pick the game ignored the correct pick until it moved on by itself (§4.5, "the child can fix it").
- [ ] Not yet in M1, planned later: the "Learn how" link (§4.7, needs the whiteboard and sign-in, so M5), the phone "turn your device" note and the settings section (M4).

**M2: TV body input**
- [ ] Isolated TV check page: camera listed and opened, fps and resolution, `dumpsys media.camera`; WebGL2.
- [ ] Classic pose worker reusing `/avatar-runtime/`; `numPoses` 1 vs 2 measured.
- [ ] Tracking by continuity, calibration with distance prompts, smoothed and calibrated side selection, hysteresis, timing from the middle, body "Show me", tap-and-move rule.
- [ ] Choice mode on the TV; Android TV flag; camera lifecycle (start, hide, track end, leave).
- [ ] TV load test (step 3) recorded in `docs/arcade/DEVICE_RESULTS.md`.
- [ ] **Owner playtest on the TV.**

**M3: handwriting**
- [ ] `/arcade/ink-lab` collection page (debug flag), stroke export with timing.
- [ ] Team evaluation set, including deliberately wrong samples (look-alikes, reversals, operation mix-ups, prefixes) and paused multi-stroke digits.
- [ ] Public dataset licences confirmed and recorded.
- [ ] `tools/arcade-ink`: training for candidates (a) and (b), augmentation (including mirror-written digits), export, quantisation.
- [ ] Runtime comparison: onnxruntime-web vs pure-TypeScript/WebGL inference (download size, APK size, latency, cold start).
- [ ] Evaluation harness replaying strokes with timing through preprocessing and the decision logic; per-device-class results.
- [ ] Sticky note with worker integration, the decision rules of §7.5, automatic number-pad fallback.
- [ ] Gate result in `docs/arcade/INK_MODEL.md`; owner go/no-go; owner playtest with handwriting.

**M4: full look and sound**
- [ ] Notebook rendering kit: paper, hatching, outlines (hull + high-tier edges), boil, effects, device-pixel tiers, relative watchdog, context-loss handling.
- [ ] Production art per the approved style board; Nib concept, model and animation clips.
- [ ] Sound effects and music (loaded after the round starts); subset display font.
- [ ] Settings section, capability checks, presentation-mode hiding.
- [ ] Bundle check (web and legacy Android, `build.manifest`); device matrix pass; **owner playtest 2**.

**M5: records and rewards**
- [ ] Event kinds, deterministic ids and the session rule; sync lanes (lesson first, Arcade lane parks on 4xx); `(owner, kind, seq)` index without a schema bump.
- [ ] Progress endpoint with `through`, catalog version and `utc_offset_minutes`; receipt-`seq` overlay; support check (authenticated 404 only).
- [ ] Device progress uploaded to the account once; routes under `AuthGuard`.
- [ ] Arcade achievements (`achievements-v3`: catalog, rules, badge art, written teacher lines); muted award voice; coordinator held busy during rounds.
- [ ] Star map `map-states-v2`: Arcade association path, `practising`, quick-facts ring (permanent; none on `mt_K5jM7vlVhA` for now).
- [ ] Day counting for account-wide achievements; award hold during rounds; no countdown under a ceremony.
- [ ] Records page line and run labels; navigation place and feature flag.

**M6: launch**
- [ ] Accessibility pass, copy review, i18n.
- [ ] Data inventory and privacy text (D04); deploy runbook (ordering, compression); Android app release and size check.
- [ ] Children's playtests when decision 8 allows; tuning.
- [ ] PRD requirements OL-075 onward added; owner switches the flag on by default.

**M7: more games**
- [x] Paper Glider (watercolor): watercolor kit (wash material, pencil sketch line, painting pass), Nib in watercolor, glider, hoops, wingtip trails, roll at 5 and loop at 10, both modes; Playwright round (`src/arcade/games/paper-glider/`, `src/arcade/render/watercolor-kit.ts`).
- [x] Paper Glider flight feel (owner, 2026-11-26: "lacks changes in perspective, so it doesn't really feel like flying"): the hoops weave, climb and dive along a fixed course; the glider swoops between them on curves, banking and pitching; a chase camera swings round behind it, lags on fast swoops, tilts the horizon with the bank (capped at about 17° for big screens), widens with speed and looks up during a loop; while waiting the glider rides the air in a slow weave; clouds drift on the wind and brush-stroke wind streaks rush past. Reduced motion turns off the tilt, the widening, the weave, the wind and the streaks.
- [ ] Paper Glider owner playtest; its frame rate on the TV once the TV is ready (the painting pass is a full-screen effect).
- [ ] Star Sketch (gel pen and chalk on black paper).
- [ ] Up the Page (wax crayon on craft paper).

## 17. Review findings and outcomes

### Round 1

The reviewer was an independent agent (Fable), on 2026-11-25. Its verdict: "needs rework" in the learning model and the answer decision; ready otherwise after the must-fixes. The outcomes below are the owner's. Milestone numbers in this table are from before decision 18 (old M1 handwriting is now M3; old M5 launch is now M6).

| # | Finding (severity) | Outcome |
| --- | --- | --- |
| 1 | Immediate acceptance credits wrong answers that start with the right digits (must-fix) | **Rejected by owner** (decision 9): accept immediately. The prefix rate is measured. The reviewer's reverse case (cutting off a child still writing a longer *correct* answer) is handled by the 2 s wrong wait (§7.5) |
| 2 | The scheduler cannot fill a first round; new facts arrive too slowly (must-fix) | **Modified by owner** (decision 10): fill with random facts from the skill; no placement round |
| 3 | "Quick" can be met without real retrieval (must-fix) | **Resolved by owner** (decision 11): time runs to the accepted correct answer, not the first stroke. "First showing only" and pause measurement were not adopted |
| 4 | Shared derivation code is in the wrong place; derivation must be incremental (must-fix) | **Accepted**: `services/learning-history/arcade-*.mjs`, incremental derivation, `through` in the progress response (§7.1, §7.4, §7.9) |
| 5 | Android app lacks the voice-detection wasm; the budget omits the wasm; minimum WebView (must-fix) | **Accepted**: Arcade-owned packaged assets, full-transfer budget, capability check, runtime comparison (§7.2, §7.5, §7.10) |
| 6 | TV rendering risk is checked too late (must-fix) | **Accepted and widened**: M0 spike now covers shader + pose detection on the TV at device-pixel tiers. The "WebGL 1.0" record is noted as a likely probe artifact (§7.10) |
| 7 | Service-first deploy does not protect lesson sync (must-fix) | **Accepted**: support check, separate batches, `game_id` by pattern (§7.2, §7.9) |
| 8 | The spoken teacher line calls the learner's paid TTS (must-fix) | **Resolved by owner** (decision 14): text only |
| 9 | A ceremony can overlay the next round (should) | **Accepted** (§5.4) |
| 10 | Star map and achievement rules need spelling out (should) | **Accepted**: third association path, `map-states-v2`, `achievements-v3`, permanent ring, no ring on the 12×12 topic, wording, day counting *proposed*, index (§7.9) |
| 11 | Recognizer gate details (should) | **Accepted**: correct-marked-wrong bar, sample size, wrong-sample types, per device class, timing replay, cold start, "I read …", number pad after two unsure readings, mirror digits (§7.5, §7.7). The TV bar is dropped because the TV no longer uses handwriting |
| 12 | Early children's playtest; cut music, edges, ring, speech, half the achievements; missing launch items (should) | **Partly**: no cuts (decision 15); the owner playtests first (decision 16); launch items accepted (M5) |
| 13 | No way out of an unknown fact (should) | **Accepted**: "Show me" (§4.5) |
| 14 | Gaps: shared TV, presentation mode, "stars" collision, pause, resize and context loss, watchdog, offline, TV ink latency (should) | **Accepted**: one child per account stated; OL-050 hiding; ink drops; pause; `resize` and context loss; relative watchdog; offline means a mid-session drop only. TV ink latency is moot, since the TV uses body input |
| 15 | The real conflict hotspots are package, lock, BOM and i18n files (should) | **Accepted** (§9) |
| 16 | Margin Run plus the reference-like screen pieces is close to the reference (should) | **Resolved by owner** (decision 13): Margin Run stays first; screen pieces redesigned |
| Nits | OL references; batch reasoning; ids and session; fact id charset; 1.OA.B.4; answer range; `build.manifest`; headless smoke tests; "fully quick" wording; run labels | **Accepted** throughout |

### Round 2

Same reviewer, 2026-11-26. Verdict: "ready with small fixes"; all fixes are plan text and no decision is reversed. The main claims were checked against the code before they were relayed. The owner's answer: build it standalone first (decision 18). Findings about records and sync are kept with M5; the rest are accepted now.

| # | Finding (severity) | Outcome |
| --- | --- | --- |
| 1 | Separate batches alone do not protect lesson sync: the queue orders by hashed id, and any non-OK response stops the run (important) | **Kept for M5** (decision 18): lesson-first sync lanes, non-fatal Arcade 4xx, support check on authenticated 404 only, catalog version (§7.2, §7.9) |
| 2 | "Different days" uses UTC, not the local day (important) | **Accepted**: the device's local day in the standalone phase (§7.13); `utc_offset_minutes` on the progress endpoint in M5 (§7.9) |
| 3 | The award ceremony speaks with the learner's paid TTS; sync after a round runs model maintenance (important) | **Kept for M5**: muted award voice, coordinator busy during rounds, reworded PRD line (§7.9). The standalone Arcade makes no request at all (§7.13) |
| 4 | Body tracking: identity switching, per-frame scale, `numPoses: 2` cost, walk-back timing (important) | **Accepted** (§7.6) |
| 5 | Pose worker format and packaging; onnxruntime size; music and font in the budget (important) | **Accepted**: reuse `/avatar-runtime/`, classic worker, 13.0 MB figure, APK size as a runtime criterion, music and font handling (§7.2, §7.5, §7.10) |
| 6 | Device checks: WebGL2 hard gate, frame-time and thermal measures, camera diagnostics, stand-in model (important) | **Accepted** (§7.10); the TV checks now open M2 |
| 7 | Answer decision: paused multi-stroke digits, carried-over strokes, when the recognizer runs (minor to important) | **Accepted** (§7.5, §7.7 samples in M3) |
| 8 | Overlay gap, index without a schema bump, achievement scan (minor) | **Kept for M5** (§7.9) |
| 9 | Body mode gaps: "Show me", page hidden and track end, calibration limits, tap and move (minor) | **Accepted** (§7.6) |
| Round 1 check | No accepted item missing; #7 completed by #1, #13 by #9; events index milestone | **Accepted**; the index is in M5 with the other records work |

