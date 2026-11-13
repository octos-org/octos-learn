# Math expressiveness plan (K–12)

**Status** — Accepted 2026-11-12 (Q1–Q4 as recommended); Q5, on managing the request's growth, is open. Code references were checked at learning-coach `3242238`, octos-lesson-language (OLL) `2444000` and octos-learn `5346bef` (each repository's `main` on that date).

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
| `function_plot` | Curves on a coordinate plane, sliders for parameters | 8–12 | 184 |
| `coordinate_circle` | A circle on coordinates | 9–12 | 153 |
| `unit_circle_projection` | The unit circle with sine/cosine projections | 9–12 | 94 |
| `circle_and_arc` | A circle, arcs and angles | 7–12 | 416 |
| `circle_polygon_bounds` | Inscribed and circumscribed polygons (π bounds) | 7–12 | 432 |
| `circle_area_rearrangement` | A circle cut and rearranged into a near-rectangle | 7 | 76 |
| `geometric_rearrangement` | Polygon pieces moved to show equal areas (e.g. Pythagoras) | 6–8 | 383 |
| `rectangle_unit_square_array` | Unit squares in rows and columns (area, multiplication) | 3–5 | 162 |
| `cube_with_section`, `function_surface_with_section`, `implicit_surface_with_section` | 3D solids and surfaces cut by a plane | 9–12 | 69 / 110 / 141 |
| `number_line` (+ `_compare`, `_solution`, `_rounding`) | Jumps, comparing two numbers, inequality solution sets, rounding | 1–8 | 392 / 116 / 152 / 119 |

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
- **Number line:** a double number line for ratios, and a number line for measurements and time.

**New components**
- **Fraction and area models** (decision 0014, Phase B item B10): bars, circles and area partitions; comparing two fractions; the area model for multiplication.
- **Data charts** (decision 0015, item B6): bar, line, dot plot, histogram, box plot and scatter plots from a small table, with a line of best fit.
- **Place value:** base-ten blocks and place-value charts (K–3).
- **Tape diagrams and ratio tables** (grades 2–7).
- **Probability:** tree diagrams and simple simulations (grades 7–12).
- **Clocks and money** (K–3), if M1 shows they matter.

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
3. **Goal-1 clean-up** (§2.3). Small, and no lesson changes.
4. **Components in the order M1 sets**, each through §5. Fractions (0014) and charts (0015) start their decision records once M1 confirms where they rank.
5. **Re-measure** after each component; this plan's table of results is updated each time.

## 8. Decisions

Q1–Q4 and the M4 rule were accepted on 2026-11-12. Q5 is open, and postponed: for now the budget reallocation applies.

- **Q1 Budget.** Move unspent budget from the paused plugins to math (recommended: math 5,800 → 9,900 bytes; physics 2,086 → 600, still above its 449; chemistry, biology and Earth & space 1,000 → 100 each; shared unchanged at 2,265). The budgets then total 13,065 bytes, below today's 13,151, which is the live-tested headroom. No ceiling is raised and no live comparison is needed. At roughly 200 bytes per recipe, this leaves room for about 20 more math recipes or extensions. The budget limits size, not speed: runs 9 and 9b showed that about 250 tokens of number-line guidance slowed other requests by seconds, while 1,331 tokens of unavailable cards in the 2026-11-11 experiment cost nothing. What a card says matters more than its length. Resuming another subject later means giving its budget back, or building scoped requests first. Scoping by subject (S14) would save little for a math request, since everything outside math is about 720 bytes. Growth inside math is Q5.
- **Q2 Question set.** About 160 questions, banded as in §3, mostly in English with a fifth in Chinese, and a quarter held out. Recommended as written.
- **Q3 Hand reading.** Until a component has a judge, its M2 and M3 results come from hand reading of a sample. Recommended: accept this, and require a judge as part of each new component (§5, step 3).
- **Q4 Order.** The order of components follows M1's measured gain per cost, not a fixed list. Fractions and charts stay in the plan regardless. Recommended.

- **M4 rule (accepted 2026-11-12).** The speed comparison used to judge one median over requests that use the new component and requests that don't. Live traffic is mostly the latter, and a gain on one side hid a loss on the other. From now on the two are judged separately, each by its paired median at most +0.5 s. The harness computes this verdict (Coach #73).
- **Q5 Managing growth (open).** The request will keep growing as components are added; a bigger budget only postpones the limit. Proposed, cheapest first:
  1. **Measure the real limit.** The only size ever tested is +8,368 bytes; it is not a measured cliff. Runs 5–9 also show a signal: with the number-line types offered (+107 to +252 tokens), requests that do not use them were 1.7 s slower (95% interval 0.7–2.8 s, 50 pairs), cause not established. One paid size test (about +16 KB and +32 KB) shows whether size moves first-playable time at all. Budgets move from bytes to the provider's tokens (already pending in the subject plan), since bytes overcount Chinese guidance. We also check how much of the fixed part of the request is cached, because cached text costs little time.
  2. **Make cards cheap by construction.** A family shares one card plus one line per type: the number line costs 392 bytes, and each added type 116–152. Shared rules (1,203 bytes) and the schema (1,558 bytes) are almost half of math, so parameter names are shared across recipes. "Marginal bytes" joins the definition of done (§5).
  3. **Only then, offer a subset.** Full cards for a fixed bundle (for example by grade band) and a one-line index for the rest. The choice must be made before the first model call, from what Coach knows then (the grade input, Jev's subject signal). A miss reuses the existing one-restart path. Fixed bundles keep the request's prefix stable, so caching keeps working. The trigger is evidence (M2's "chosen" rate falling, or the size test showing a slowdown), not a byte percentage.

## 9. Changes to other plans

- [Subject plugin plan](SUBJECT_EXPANSION_PLAN.md): the math items of §8 are replaced by this plan; P3 and the science items of P4 are paused; decision S5 is suspended. A note at the top of that plan points here.
- [Studio expressiveness plan](LEARNER_EXPRESSIVENESS_PLAN.md): items B6, B9, B10 and B11 follow this plan; the other Phase B items wait with the science work.
