# Math expressiveness plan (K–12)

**Status** — Accepted 2026-11-12 (Q1–Q4 as recommended); Q5, on managing the request's growth, is open. Updated 2026-11-15: the two extensions' progress and switch-on, the 3D solids extension placed after them (owner), a review of what the plan had dropped (§10), and the order from here (§7 step 3). Code references were checked at learning-coach `3242238`, octos-lesson-language (OLL) `2444000` and octos-learn `5346bef` (each repository's `main` on that date).

**What changed.** On 2026-11-12 the product owner paused expansion into other subjects: the new math components were progressing slowly, and math comes first. Mathematics is the whole of the next phase, from kindergarten to grade 12. This plan replaces the math items of the [subject plugin plan](SUBJECT_EXPANSION_PLAN.md) (§8, P4 item 5: B9 → B10 → B11) and pauses its science items (P3, and P4 items 1–4). Decision S5 (math and science in parallel) is suspended until the owner resumes broader expansion. That plan's principles, payload gates (§9) and plugin contract (§4) still apply.

## 1. Goals

1. **Math runs on the plugin architecture.** This is largely done (§2.3); one small clean-up remains.
2. **The math components can show more of K–12 math.** This covers extending the components we have (the number line's comparing, inequality and rounding types are the first example) and adding new ones (fraction models, data charts).
3. **Progress is measured.** One fixed question set, re-measured after every component, says whether lessons can show more and whether what they show is right.

All three lesson paths keep working: AI lessons (Learning Coach), learner-recorded lessons (Studio) and curated CoursePacks. All three end as canonical OLL.

## 2. Where we are

### 2.1 Visual components (recipes) an AI lesson can use

The numbers are each recipe's bytes in the broad request: its model guidance plus parameter names.

| Recipe | What it shows | Mostly for | Bytes |
|---|---|---|---|
| `function_plot` | Curves on a coordinate plane, sliders for parameters; marks (intercepts, vertex, symmetry axis, slope triangle, domain, range) and piecewise functions since 2026-11-15 (OLL 0018) | 8–12 | 184 (+ the options: 713 of their 800 B cap) |
| `coordinate_circle` | A circle on coordinates | 9–12 | 153 |
| `unit_circle_projection` | The unit circle with sine/cosine projections | 9–12 | 94 |
| `circle_and_arc` | A circle, arcs and angles | 7–12 | 416 |
| `circle_polygon_bounds` | Inscribed and circumscribed polygons (π bounds) | 7–12 | 432 |
| `circle_area_rearrangement` | A circle cut and rearranged into a near-rectangle | 7 | 76 |
| `geometric_rearrangement` | Polygon pieces moved to show equal areas (e.g. Pythagoras) | 6–8 | 383 |
| `rectangle_unit_square_array` | Unit squares in rows and columns (area, multiplication) | 3–5 | 162 |
| `cube_with_section`, `function_surface_with_section`, `implicit_surface_with_section` | 3D solids and surfaces cut by a plane | 9–12 | 69 / 110 / 141 |
| `number_line` (+ `_compare`, `_solution`, `_rounding`, `_steps`) | Jumps, comparing two numbers, inequality solution sets, rounding; two or three moves on one line since 2026-11-15 (OLL 0017); units up to 1000 | 1–8 | 392 / 116 / 152 / 119 / 334 |

Besides these, every lesson can use formulas, notes, tables and simple diagrams on the board, and typed answers that the program checks.

The four number-line recipes are on (Coach 0.29.0, 2026-11-13). Runs 9 and 9b failed the speed gate; after the cards were rewritten (Coach #73), runs 11 and 11b passed (see §7, step 0).

### 2.2 Payload budget

Math's share of the broad request is **5,760 of its 5,800-byte budget**. A new recipe costs about 70–430 bytes. Without a change, there is room for nothing more. The paused plugins hold unspent budget: physics uses 449 of 2,086 bytes, chemistry, biology and Earth & space use 2 of 1,000 each, and shared uses 265 of 2,265. Q1 (§8, accepted) moves most of that to math. This stays inside the headroom already tested live (8,368 bytes), so no ceiling is raised.

### 2.3 Goal 1: what is still outside the math plugin

- **Coach core:** about four `function_plot` special cases (`lesson-plan-compiler.ts`, `lesson-plan-schema.ts`, `lesson-plan-generation.ts`) and one hard-coded list of drawable kinds in the compiler.
- **Learn Studio:** the number line and polygon forms are written in Studio rather than supplied by the math plugin.

Moving these into the plugin is one small item (step 3 in §7). It changes no lesson.

## 3. The question set

**One fixed set of K–12 math questions, written and frozen before any new component is designed.** It is what "more expressive" is measured against. It is never used to tune a prompt or a recipe; probes and tests use their own cases.

- **Size:** about 160 questions.

  | Grade band | Questions |
  |---|---|
  | K–2 | 30 |
  | 3–5 | 40 |
  | 6–8 | 40 |
  | 9–12 | 50 |

- **Domains:**
  - K–8: the star map's 12 math domains, such as counting, place value, fractions, measurement, geometry, data and algebra. The star-map catalog has 567 math topics, mostly in K–8.
  - 9–12: number and quantity, algebra, functions, geometry, statistics and probability, plus introductory precalculus and calculus. The existing natural-input set (`learning-coach/testsuite/math-natural-course-cases.json`, 12 high-school topics) is reused here.
  - Standard codes are cited only where they have been looked up.
- **Phrasing:**
  - **Language:** mostly English (the US market), with about a fifth in Chinese for current users.
  - **Kinds:** a mix of detailed requests, short questions and topic names, as learners actually ask.
- **Each question is tagged** with:
  - its band and domain;
  - what a good teacher would draw: a picture of the relationship, or "no visual needed";
  - which kind of component that picture needs.
- **Held out:** a quarter of the questions are never used in any design discussion or probe, so the measure cannot be fitted to them.

## 4. Measures

| Measure | Question it answers | How | Cost |
|---|---|---|---|
| **M1 Coverage** | For what share of the questions can a component draw the picture a good teacher would? | Hand tagging: *fully*, *partly* or *not*. *Not* splits into "extend an existing component" or "needs a new one". | Free |
| **M2 Chosen and correct** | When a component fits, does the AI lesson use it, and is the picture right? | A paid run over a stratified sample. Automatic checks where a judge exists (today only the number line); otherwise read by hand. | Paid |
| **M3 Never misleads** | When nothing fits, does the lesson leave the picture out rather than draw a wrong one? | Same run, read by hand. | Paid |
| **M4 Speed and size** | Did the lesson get slower or the request bigger? | First-playable p50 within +0.5 s (live comparison); plugin budgets (offline, every build). | Paid live comparison per adopted component |

All four are reported by grade band. M1's split decides the order of work (§6), so the order is measured, not assumed.

**Baseline:** M1 now (free). Then one paid run of M2 and M3 over a fixed regression sample of about 60 questions, stratified by band, at about $0.60–1.00 plus about a day of hand reading. The sample is chosen once and kept; it holds questions that existing components serve, questions that nothing serves, and near misses (questions close to a component but outside what it can show).

**After each component:** M1 again (free), and one paid run over the regression sample plus the questions the component newly serves. M2 and M3 are reported separately for three groups:
- **newly served:** does the lesson use the new component, and is the picture right?
- **previously served:** do the existing components still get chosen and drawn correctly (no regression)?
- **not served, including near misses to the new component:** M3's negative cases. A new recipe chosen for a request it cannot show counts as misleading here.

**Judges.** Only the number line has an automatic judge today, and it took several rounds to make it trustworthy. Each new component gets its own judge, written before its recipe (§5). Until then, its questions are read by hand.

## 5. Definition of done for a component

What the number line taught us, made into a checklist so that the next components go faster:

1. **Decision record** (OLL): what the card draws, what the program computes, and what the model writes. The owner accepts it before any code.
2. **Render first.** The card is checked in the real player (phone width included) before Coach uses it.
3. **Checks before the recipe.** The automatic judge and its test cases are written before the recipe exists, including negative tests (a wrong picture must fail).
4. **The model writes only what it means.** The program owns ranges, ticks, steps and every derived value. Tests go through the real generation pipeline, not just the compiler.
5. **Free replay.** Recorded model replies are kept and replayed through every new build at no cost.
6. **Small probe, then the gate.** A probe of about $0.25 tests the model's behaviour; the gate runs once on frozen code with rules written down beforehand.
7. **Studio and CoursePacks** use the same builder.
8. **Switched on** in a separate change, then M1–M3 are re-measured.

## 6. Candidates

Two kinds, ranked by M1 gain per unit of cost once the baseline exists. The list below is a starting point; M1's split will add to it and re-order it.

**Extend existing components**
- **Coordinate plane:** plotted points and polygons, transformations (translate, reflect, rotate, dilate), and 2D inequalities with shaded regions.
- **Function plot:** piecewise functions, several functions at once, sequences as points, and the derivative or area under a curve as explicit layers.
- **Geometry:** angles with a protractor reading, constructions, and nets of solids.
- **Number line:** a double number line for ratios, and a number line for measurements and time. (Decision 0017 moved the double number line to the ratio component; see §10.)
- **3D solids** (M1 `solids_3d_ext`; added 2026-11-15): solids beyond the cube for AI lessons — prisms, cylinders, cones, spheres, composite boxes. OLL's math plugin already draws 20 solids (`plugin-math/src/solids.ts`, used by Studio); AI lessons can use only `cube_with_section` and the two surfaces.

**New components**
- **Fraction and area models** (decision 0014, Phase B item B10): bars, circles and area partitions; comparing two fractions; the area model for multiplication.
- **Data charts** (decision 0015, item B6): bar, line, dot plot, histogram, box plot and scatter plots from a small table, with a line of best fit.
- **Place value:** base-ten blocks and place-value charts (K–3).
- **Tape diagrams and ratio tables** (grades 2–7).
- **Probability:** tree diagrams and simple simulations (grades 7–12).
- **Clocks and money** (K–3), if M1 shows they matter.
- **Counters and ten frames** (K–2; M1 `counters_ten_frames`, ranked second by M1, already in §7's order; added here 2026-11-15).

The owner has confirmed that fractions and charts stay in the plan.

## 7. Sequence

0. **Finish the number line.** Every gate below passes before the separate change that switches it on:
   - **Quality:** run 9 left out the comparing, solution-set and rounding questions (a harness defect, fixed in Coach #70). Run 9b runs them (owner-approved). Runs 9 and 9b together must have no misleading lesson under the slip rule.
   - **Speed:** run 9 was inconclusive (+1.09 s). Run 9b adds the one allowed repeat; speed is judged on all 40 pairs (paired median at most +0.5 s).
   - **Request size:** with the four types on, the fallback-outline request exceeded its S6 ceiling by up to 925 bytes. The owner approved raising those ceilings (Coach #72); the payload test must pass with the four types enabled.
   - **Player:** one real lesson in the app, with the four types enabled locally. (Phone width was dropped on 2026-11-13: there is no mobile product.)
   - **Then** the switch-on change. If any gate fails, the number line stays a trial and the failure is reported to the owner.
   - **Result (2026-11-12):** quality passed (no misleading first section in runs 9 and 9b), but speed failed: +0.77 s against +0.5 s, after the one allowed repeat. The number line stays a trial. Requests that use it are about 3 s faster; other requests are about 2.8 s slower, probably because the model thinks more often on them (58% of turns against 40%). The next step is finding why, before anything else is added to the request (Q5).
   - **Result (2026-11-13):** the cards were rewritten (Coach #73) and gated again on frozen code under the M4 rule (§8). Runs 11 and 11b: all 80 planned lessons pass every hard check; requests the number line fits start 3.8 s sooner, other requests +0.15 s (each within +0.5 s). Request size passes with #72's ceilings. Real lessons in the app found two player defects, both fixed: the number line had no sliders or practice task (Learn #150), and once they showed they covered the cards below (OLL #55; Learn must pin it). With both, two real lessons showed no overlaps and practice worked. Coach #74 switches the number line on; it merges after #70–#73, and ships together with Learn #150 and its OLL #55 pin.
   - **Done (2026-11-13):** Coach #70–#74 merged (Coach 0.29.0: the number line is on). Learn #150–#152 and OLL #55–#59 merged: the number line's sliders and practice, its layout (teaching stage, reading lanes, camera framing), question cards at full width, inline math in every lesson text Learn draws, and speech that never receives formula markup. Learn pins OLL `fa58c32`. Known and left for later (owner, 2026-11-13): a model-written success message can state wrong arithmetic (1 of 9 checkable claims in 144 local messages).
1. **Write and freeze the question set**, with its tags. Free; reviewed by the owner.
   - **Done (2026-11-13):** Coach #75 (`testsuite/math-expressiveness-question-set.json`), frozen at version 2: 160 questions with a seeded quarter held out. Owner decisions: 6–8 drawn evenly by grade (the catalog's 6–8 topics are mostly grade 6); the natural-set linear-systems and Pythagoras questions count in 6–8; the hand-picked 9–12 topics are accepted.
2. **Baseline M1** (free), and **baseline M2 and M3** (paid, owner's approval).
   - **M1 (2026-11-13):** Coach #76 (`testsuite/math-expressiveness-m1-baseline.json`). Of the 145 questions that need a picture, a component fully draws 27 (19%): K–2 1 of 27, 3–5 3 of 37, 6–8 7 of 36, 9–12 16 of 45. Ranked by gain on the open questions: fraction and area models 10, counters and ten frames 9, data charts 8, polygon figures 7, place value 6. Proposed order, for the owner: the small number-line and function-plot extensions together (10), then fractions (0014), counters and ten frames, data charts (0015), polygon figures, place value.
   - **M2/M3 (2026-11-14):** Coach #77, a fixed 60-question sample, one paid run (145 model calls). Where a component fits, M2 is strong: all 12 served questions used it, none drawn wrong. M3 fails: no lesson left the picture out, and 13 of 58 mislead. The causes: a count clamped to the unit-square array's 8 (3), a count narrowed by a recipe sharing its number (1), narration describing parts that are not drawn (5), and a recipe used for a concept it cannot show (4). **Order (owner, 2026-11-14): M3 first.** (1) Fix the two code defects (Coach #78); (2) state each recipe's limits on its card and check narration against what is drawn, each through the §5 probe and gate, probing on separate cases, never on this set; (3) re-run the sample; then components in M1 order.
   - **M3-first, as done (2026-11-14):**
     - **(1) Done:** Coach #78 fixes the clamp and shared-number defects (4 of the 13).
     - **(2) Tried and not adopted:** Coach #79 kept as the record.
       - Card limits on four recipes, and a narration rule where section 1 is written.
       - A probe on 13 cases written for it misled 3 of 13; a control arm on #78's build misled 1 of 13. That is within chance at one run per case, so there is no evidence of benefit for 289 request bytes.
       - The model ignored explicit card clauses. The one solid effect was harmful: told the array's limit of 8, the model shrank counts itself, so #78's refusal never fired.
       - Every misleading lesson in the baseline and the probes was on a question no component fully serves.
     - **(3) Deferred (owner, 2026-11-14):** the 60-question re-run is skipped for now and **must still be done**.
       - It comes after the first new components, and then serves as their re-measure (step 5) and M3-first's closing measure together.
       - Open and held-out results are reported separately.
     - **Next (owner, 2026-11-14):**
       - resolve the request-size limit (Q5; the fallback outline has 158 bytes left on #78, and a recipe costs 70–430);
       - then the number-line and function-plot extensions, first in M1 order.
   - **The two extensions, as done (2026-11-14 to 11-15):**
     - Q5 headroom accepted (Coach #83). Decision records OLL 0017 (number line) and 0018 (function plot) accepted; player 0.11.0 and math plugin 0.3.0 (OLL #61, #62); Coach and Learn pin OLL `8e85fe1`.
     - Judges written first: the plot judge (PJ cases) and the number-line steps judge (ST cases), Coach #85, #86.
     - **Number line:** coarse units up to 1000 are on (Coach #87, a fit-only change). Two-to-three-step lines (`number_line_steps`, Coach #88): in the reduced trial 4 of 6 in-scope cases passed both repeats and no lesson misled. **Switched on by the owner on 2026-11-15** (Coach #99), before the speed gate.
     - **Function plot:** marks, pieces, domain and range (Coach #89–#92), then repairs in place instead of refusals (#94–#97). A trial failed (Coach #93, `docs/PLOT_TRIAL_2026-11-15.md`); after the repairs, run B (73 calls, options on vs off) gave 17 vs 15 playable, 13 vs 4 judge passes, median 6.8 vs 8.1 s to the first playable section. **Switched on by the owner on 2026-11-15** (Coach #98), before the combined speed gate.
     - **Still to do for this stage:** step 3 below.
   - **The 3D solids extension (owner, 2026-11-15)** comes immediately after the two extensions and before fractions. Read as: the next component, after this stage's §5 work, with its decision record started now (step 3.3). Rendering exists (OLL `solids.ts`), so the work is the AI path: which solids a lesson may name, what the program computes (dimensions, sections, views), the judge, and the request bytes.
3. **From here, in order** (2026-11-15; order recommended after review with Fable, the advisor, for the owner to confirm). Every item found in the review (§10) is a step here. "Free" means no model calls; "paid" means the owner approves the call count first.
   1. **Re-tag M1** (free). Re-tag coverage after the two switch-ons, and give each cut feature a candidate in the same pass (§10 item 6): the double number line goes to the ratio component; the area under a curve, tangents and intersecting curves get a function-plot candidate. *Done when* M1's table and the candidate list are updated; M1 then orders everything after 3D.
      - **Done (2026-11-15, Coach #101):** of the 145 questions that need a picture, a component fully draws 33, up from 27 (19% → 23%); open questions 18 → 23, held out 9 → 10. Cut features have candidates: the double number line goes to the ratio component, probability words to probability, and the area under a curve, tangents, intersections and turning points to `function_plot_calculus_ext`.
      - **Two claims of decision 0017 were checked and are false:**
        - Counting by 25s to 200 is not drawn: the fit takes the smallest unit that fits (5), so the line has one jump of 200.
        - The hiker question (1,245, −380, +615) is refused: the values share only 5, which needs 296 ticks.
        - Both stay with `number_line_ext` as "repeated jumps of a chosen size" and "ticks the coarse units do not divide".
   2. **Speed gate for the two switch-ons** (paid). Compare against the build before them (Coach `75578ab`, `--baseline-build`), judging requests that use the new parts and requests that don't separately (M4 rule). Run it on its own, without waiting for Coach #81, so that a failure can be attributed. Hold every request-changing merge until it runs. *Done when* both groups are within +0.5 s, or the owner decides on a failure. Estimate: about 40 pairs, as in earlier gates; the exact call count goes to the owner first.
      - **Done (2026-11-15, Coach #100, `docs/SPEED_GATE_SWITCH_ONS_2026-11-15.md`): speed passes.** Requests that use the new parts −674 ms, others −208 ms (paired medians); 125 of 160 calls, about $0.74–0.87.
      - **Defect found:** 2 of 40 lessons with the new parts produced nothing. The model wrote x positions in `sample_x_numbers` and repeated the slip on every retry. It is still open; see step 3.6a.
   3. **3D solids decision record** (free; OLL), in parallel with 3.1 and 3.2. *Done when* the owner accepts it.
      - **Done (2026-11-15):** decision 0019 accepted with all six questions as recommended (OLL #66).
   4. **Goal-1 clean-up** (free; §2.3, formerly step 3). Coach's four `function_plot` special cases, and Studio's number-line and polygon forms supplied by the math plugin. No lesson changes. *Done when* no math special case remains outside the plugin.
      - **Coach half: done (Coach #103, merged after two reviews).** The core names no recipe; the four plot special cases, the drawable-kinds list and the 3D camera table are recipe declarations. No request or lesson changes.
      - **Learn half:** Studio has drawn number lines and polygons with the plugin's builders since 2026-11-09 and 11-11, so §2.3's line was stale. The number-line form's own checks move into the plugin in 3.5, slice 1.
      - **Follow-ups from #103's reviews (owner: schedule as fits):**
        - **4a.** Reword the repair message about the "published graph" so it fits any recipe that declares `ranges_fixed_once_shown`. It changes repair requests, so it goes with the next request-changing measurement (3.6, the substitution rule).
        - **4b.** Derive the drawable kinds from compiled output (scan `bindings` on every written node), not from recipe declarations. It goes with the next Coach change that touches the compiler's effect check; no lesson changes.
   5. **Studio and CoursePacks use the same builder** for number-line steps and the plot options (free; §5 step 7, §10 item 1). It follows 3.4, which moves Studio's number-line form into the plugin. If the 3D record is accepted first, 3D's build (3.7) goes first and this resumes after.
      - **Course packs** write OLL directly and call no builder, so they need no work here.
      - **Slice 1: done (2026-11-16).** The number-line form's checks are in the plugin (OLL #68), and Studio's form takes up to three moves (Learn #159), both merged after review. The choices are recorded in 0017's Studio section.
      - **Slice 2: done (2026-11-16).** The plot-mark derivation moved from Coach into the plugin (OLL #69, Coach #106), merged after review. Every recorded lesson and request is unchanged.
      - **Slice 3:** Studio graph forms: mark toggles, two reference points, pieces. **The owner decides whether it goes before or after the 3D build (3.7).**
   6a. **The `sample_x_numbers` slip** (found in 3.2). The model writes x positions where lesson-number indexes belong (`[1, 3]` for x = 1 and 3) and repeats it on every retry.
      - **Why not a repair in place:** #102 tried one and was closed after two code reviews. Any repair that reads the lesson's text to judge whether the formula is the real curve can draw a wrong picture.
      - **Census** (corrected): 42 recorded slips. 15 on section calls in lessons with no lesson numbers, including both lessons the gate lost; 12 on section calls with numbers; 15 on bootstrap calls.
      - **Tried and closed (Coach #105, five reviews):** an enum on the field, then (narrowed) leaving it out in lessons with no numbers. A paired probe (75 calls) showed no regression. Replayed on the recorded slips, the narrowed form rescued three lost lessons but let a piecewise request publish drawn as two full lines (PJ-07). Main has no check that a piecewise request draws pieces; #105 removed the refusal that was blocking it by accident. The defect stays open.
      - **A piecewise check was tried and dropped (Coach #109, closed).** A refusal triggered by wording is harmless only while the retry is free. #109's retry then required `pieces`, so the wording decided what was drawn. Review published a two-curve comparison as one wrong series, and found slider and five-piece cases whose retry could never be met.
      - **What the recordings show instead:** every piecewise misdraw (PJ-07, PJ-08) was written to a request that did not offer `pieces`. Under the current request, all 25 recorded piecewise lessons drew pieces.
      - **Retry tweaks cannot fix this slip (Coach #110, not recommended).** #110 left the field out of retries in lessons with no lesson numbers.
        - **Measured:** the paired check (owner-approved, 89 calls, `docs/RETRY_NARROWING_CHECK_2026-11-16.md`) gave 20 of 20 lessons against 18 of 20.
        - **Why not merge:** review found it publishes narration about points ("look at the points at x = 1 and x = 3") with no points drawn, where main loses the lesson. The x positions the model means have nowhere to go.
        - **The fix is step 5's `points` redesign** (OLL #70, 0018 amendment): a fixed point written as x and y and checked against the curve, and a moving point by its slider name. It moves ahead of the rest of 3.6, since the slip costs about one lesson in ten on these cases.
      - **Still open:**
        - **6b.** Slips in lessons with numbers. An enum was tried and dropped: it turns an x value into a valid but wrong index, binding a point to an unrelated slider.
        - **6c.** Refusals keyed on the learner's request or the outline's purpose, which a retry cannot meet, so the lesson is lost. These are the moving-point and vertex refusals, and the purpose checks in `math-teaching-contracts.ts`.
        - **6d.** The moving-point wording check misses phrasings without a point label, titles, and plots with several formulas; the plot guidance names `sample_x_numbers=[1,2]` where a section may have fewer numbers.
        - All three were found on main; 6c and 6d go with 3.6's program checks.
        - **6e.** A moving point whose slider spans a pole (y = 2/(x + 1) with x from −5 to 5) cannot be drawn at the pole: the plot fails at that slider state (found in the retry check). Coach checks a sample slider's ends only. Proposed fix: bind sample points with `hide_when_undefined`, so the point hides at the pole and the secant readout handles a missing point. It changes every plot with moving points, so it needs replays and a browser check.
        - The plot judge's false positive for slider-moved poles (3.6) showed up again in the retry check; fixing it first matters for the re-run.
   6. **Before the 60-question re-run, everything that run will judge:**
      - **Program checks** (free): undisclosed stand-in counts, animations that change nothing, and wrong arithmetic in model-written success messages (§10 items 4 and 5). They change no request. They are developed on the probe recordings (PA cases), never on the question set. Each record says what happens on a hit, since a refusal costs a call.
      - **The outline's substitution rule** (paid probe): rewrite it, and allow "no visual" when nothing fits, net of bytes. It changes requests, so it comes after 3.2's gate, with a control-arm probe.
      - **Defects that can draw a wrong picture or miscount** (free; §10 item 7): the plot judge's false positive for slider-moved poles (fixed first, or the re-run counts it); a slope triangle straddling an interior pole; floating-point cancellation near a = 0.
   7. **3D solids build** through §5 (paid probe and gate, each approved first).
   8. **One 60-question re-run** (paid): it closes M3-first, the two extensions and 3D together, reporting open and held-out results separately. *Alternative for the owner:* a re-run before 3D as well, at the cost of a second run.
   9. **Backlog with a trigger** (OLL): plot labels overlapping at a few slider states, and number-line tick labels adding rows while dragging. Taken up if a recording or a judge shows them in a real lesson.
4. **Components in the order M1 sets** (re-tagged in 3.1), each through §5, after the 3D solids extension. Fractions (0014) and charts (0015) start their decision records once M1 confirms where they rank.
5. **Re-measure** after each component; this plan's table of results is updated each time.

## 8. Decisions

Q1–Q4 and the M4 rule were accepted on 2026-11-12. Q5's first decision, request headroom, was accepted on 2026-11-14 (below); the rest of Q5 stays open.

- **Q1 Budget.** Move unspent budget from the paused plugins to math (recommended: math 5,800 → 9,900 bytes; physics 2,086 → 600, still above its 449; chemistry, biology and Earth & space 1,000 → 100 each; shared unchanged at 2,265). The budgets then total 13,065 bytes, below today's 13,151, which is the live-tested headroom. No ceiling is raised and no live comparison is needed. At roughly 200 bytes per recipe, this leaves room for about 20 more math recipes or extensions. The budget limits size, not speed: runs 9 and 9b showed that about 250 tokens of number-line guidance slowed other requests by seconds, while 1,331 tokens of unavailable cards in the 2026-11-11 experiment cost nothing. What a card says matters more than its length. Resuming another subject later means giving its budget back, or building scoped requests first. Scoping by subject (S14) would save little for a math request, since everything outside math is about 720 bytes. Growth inside math is Q5.
- **Q2 Question set.** About 160 questions, banded as in §3, mostly in English with a fifth in Chinese, and a quarter held out. Recommended as written.
- **Q3 Hand reading.** Until a component has a judge, its M2 and M3 results come from hand reading of a sample. Recommended: accept this, and require a judge as part of each new component (§5, step 3).
- **Q4 Order.** The order of components follows M1's measured gain per cost, not a fixed list. Fractions and charts stay in the plan regardless. Recommended.

- **M4 rule (accepted 2026-11-12).** The speed comparison used to judge one median over requests that use the new component and requests that don't. Live traffic is mostly the latter, and a gain on one side hid a loss on the other. From now on the two are judged separately, each by its paired median at most +0.5 s. The harness computes this verdict (Coach #73).
- **Q5 decision (accepted 2026-11-14): request headroom.**
  - **The problem.** The fallback-outline, later-section, section-repair and first-section-retry ceilings sat at their measured maxima (Coach #72): 98–158 B of total headroom and 0 B of schema headroom. No new component fit; the number-line and function-plot extensions need about 1–1.2 KB.
  - **The change** (Coach #83): each of those paths gets +2,000 B in total and in schema, on every input route. First-request and practice ceilings are unchanged.
  - **Why it's safe.** These requests stay far below the first-request sizes already tested live (+8,368 B, 26 KB) without a measured slowdown, the argument accepted for #72.
  - **Live check.** Folded into the next speed gate, which covers the practice invitation (Coach #81) and the two extensions, using the two-build mode (Coach #82). (2026-11-15: the extensions' gate now runs on its own, §7 step 3.2; #81 gets its own.)
  - **Not chosen now.** Selecting components before the first call (Q5 item 3, for example with Jev choosing a bundle) stays the long-term option for when the first request itself fills up. It can't replace headroom, because requests without a Jev answer (no key, a timeout, camera and selection) still get the full catalog.
- **Q5 Managing growth (open).** The request will keep growing as components are added; a bigger budget only postpones the limit. Proposed, cheapest first:
  1. **Measure the real limit.** The only size ever tested is +8,368 bytes; it is not a measured cliff. Runs 5–9 also show a signal: with the number-line types offered (+107 to +252 tokens), requests that do not use them were 1.7 s slower (95% interval 0.7–2.8 s, 50 pairs), cause not established. One paid size test (about +16 KB and +32 KB) shows whether size moves first-playable time at all. Budgets move from bytes to the provider's tokens (already pending in the subject plan), since bytes overcount Chinese guidance. We also check how much of the fixed part of the request is cached, because cached text costs little time.
  2. **Make cards cheap by construction.** A family shares one card plus one line per type: the number line costs 392 bytes, and each added type 116–152. Shared rules (1,203 bytes) and the schema (1,558 bytes) are almost half of math, so parameter names are shared across recipes. "Marginal bytes" joins the definition of done (§5).
  3. **Only then, offer a subset.** Full cards for a fixed bundle (for example by grade band) and a one-line index for the rest. The choice must be made before the first model call, from what Coach knows then (the grade input, Jev's subject signal). A miss reuses the existing one-restart path. Fixed bundles keep the request's prefix stable, so caching keeps working. The trigger is evidence (M2's "chosen" rate falling, or the size test showing a slowdown), not a byte percentage.

## 9. Changes to other plans

- [Subject plugin plan](SUBJECT_EXPANSION_PLAN.md): the math items of §8 are replaced by this plan; P3 and the science items of P4 are paused; decision S5 is suspended. A note at the top of that plan points here.
- [Studio expressiveness plan](LEARNER_EXPRESSIVENESS_PLAN.md): items B6, B9, B10 and B11 follow this plan; the other Phase B items wait with the science work.

## 10. Review of dropped items (2026-11-15)

The owner asked whether anything else was overlooked the way the 3D solids extension was (M1 added it as a candidate ranked 6th, tied with place value, but no order or step ever named it). Checked: §5 against each shipped extension, §6 against the M1 candidates, every §7 step, the cuts in decisions 0017 and 0018, §8's open items, open PRs in the three repositories, and the follow-ups and "left for later" notes of 2026-11-13 to 11-15.

**Silently dropped: no step, owner, or decision named them.** Each is now a step in §7 step 3 (owner, 2026-11-15): items 1 → 3.5, 2 → 3.1, 3 → 3.4, 4 → 3.6, 5 → 3.6, 6 → 3.1, 7 → 3.6 and 3.9.

1. **§5 step 7, Studio and CoursePacks use the same builder:** not done for either extension. Decisions 0017 and 0018 do not mention Studio. A learner recording a lesson cannot add number-line steps, plot marks, pieces, or domain and range. *Recommended:* a small Studio item per extension, after the 3D solids decision record.
2. **§5 step 8 and §7 step 5, re-measure M1 after a switch-on:** not done for coarse units or the plot options. M1 is free (hand tagging). *Recommended:* re-tag now, before ordering further work.
3. **§7 step 3, the Goal-1 clean-up:** never done or rescheduled since M3-first took over. The four `function_plot` special cases in Coach's core remain. *Recommended:* do it with the next Coach change that touches the plot; it changes no lesson.
4. **M3 follow-ups proposed 2026-11-14 and never decided:** M3 failed its baseline (13 of 58 sampled lessons mislead; #78 fixed 4). After the card-limits probe (#79, not adopted), three program-side next steps were proposed and are recorded nowhere in the plan:
   - rewrite the outline's substitution rule (it invites stand-ins) and allow "no visual" when nothing fits, net of bytes;
   - a program check for undisclosed stand-in counts;
   - a check for animations that change nothing.

   The 60-question re-run (deferred, below) will measure M3 again, but nothing between now and then targets it. *Recommended:* decide these before the re-run.
5. **Model-written success messages can state wrong arithmetic** (1 of 9 checkable claims in 144 local messages, "left for later" on 2026-11-13). No step owns it.
6. **Cut-out scope with no destination:**
   - 0017 sends the double number line to "the ratio component", but M1's `tape_diagram_ratio_table` does not list it.
   - 0018 leaves out the area under a curve, tangents and intersecting curves. §6 still lists "the derivative or area under a curve as explicit layers", but no M1 candidate or decision carries them.
   - *Recommended:* attach each to a candidate, so the next M1 re-tag counts it.
7. **Known renderer and judge defects recorded only in Coach changelogs:**
   - plot labels overlap at 4 of 221 slider states (OLL);
   - the plot judge's false positive for slider-moved poles;
   - floating-point cancellation near a = 5e-17;
   - a slope triangle straddling an interior pole;
   - number-line tick labels adding rows while dragging (recorded in 0017).

   *Recommended:* one OLL and Coach issue list, triaged by the owner.

**Deferred, with a recorded home:** the 60-question re-run (§7 step 2; after the first new components); Q5 items 1–3 (§8); the speed gate (now §7 step 3.2, run without waiting for Coach #81; #81 keeps its own task-side clause, re-probe and gate); M1 candidates ranked below place value (§7 step 4, "in the order M1 sets").

**Paused by the owner:** the science plugins and decision S5 (§9); phone width (2026-11-13).

**Stale lists corrected in this change:** §6 lacked counters and ten frames and the 3D solids, both M1 candidates; §2.1 did not show the plot options.
