# Math work stack

As of 2026-11-24. This is the **status page for the math expressiveness work**, kept as a stack.

- The top layer (L4) is what is happening now.
- Each layer below it says why the layer above exists, down to the product (L0).
- Each layer also lists its siblings (done, now, next, later), so depth and breadth are both visible.

The plan itself is `docs/MATH_EXPRESSIVENESS_PLAN.md`; this page says where we are in it.

## Working rules (owner, 2026-11-21; must be followed)
1. **When a test question fails, examine the interactive component itself first.** Is it actually capable of representing the knowledge being taught in a way that is appropriate for this particular question?
2. **If it isn't, the model is forced to squeeze the lesson into the closest representation the card can produce,** which gives an incorrect or misleading picture. This does not necessarily mean the model broke our rules, or that the program failed to enforce them.
3. **The real solution is to design interactive components that fit the teaching need,** and that help children understand abstract concepts through concrete, intuitive visualizations. It is not to keep adding rules that prevent wrong pictures.
4. **The goal is a much wider variety of interactive components,** each designed for a specific teaching need.

**In practice:**
- every failure analysis starts with what the child should see and do, and whether a component shows it;
- a misleading picture is answered with the component that fits, not with a refusal rule;
- interaction is designed in from the start;
- work proceeds from a map of teaching needs to components, not one card at a time;
- every plan says how each item follows these rules, and reviewers check that as well as the facts.

**Keep it current.** Update it whenever an item finishes, a layer is pushed (going deeper) or popped (coming back up), or something needs the owner. The owner reads this page to follow the project at a glance. A rendered copy is kept as a claude.ai artifact by whoever is working; this file is the record in the repo.

Legend: **Done**, **Now**, **Next**, **Later**, **Merge** (waiting for the owner to merge), **Paused**.

---

## Needs the owner

- **Decided (owner, 2026-11-18): Coach #128 closed.** It fixed a real defect (a later section's target rounded off an earlier line's ticks, 2 → 1.99), but all three lessons it rescued read as misleading (steps lines used for subtraction, repeated jumps and number words), and review found a case where it loses a lesson main compiles. The real fix is the number line's scope (moves that go back, repeated jumps of a chosen size), in M1 order.
- **Done: 3.8, the 60-question re-run (Coach #127).**
  - **Misleading:** 25 of 58 → 16 of 54, read by the same readers on both runs. Paired: 15 questions better, 6 worse (p = 0.039).
  - **Lost lessons:** 1 → 5: three on "at most 24 parts per unit" and one on "two or three moves", each in section 2 after section 1 played, and one on the array. (First reported with the split reversed and as outline re-asks; corrected after reading the traces.)
- **Decided (owner, 2026-11-18): decision 0021 accepted** (OLL #75), all eight questions as recommended.
- **Decided (owner, 2026-11-18): 0021 amendment approved** (OLL #76): the fraction model is the math plugin's own card.
- **Done (2026-11-19): 0021 §5 steps 1 and 2.**
  - **Render first:** OLL #77 (3 review rounds), the `fraction_model` card, math plugin 0.4.0: bars, circles and grids; whole parts only (a full turn is a disc); two fractions on one whole size; the relation computed from the values; a bindable numerator. Browser check `check:fraction-model-browser`.
  - **Judge before recipe:** Coach #130 (6 review rounds; see the rules above), OLL at 6e59471 and `scripts/fraction-judge.mjs` with 24 new cases (`testsuite/fraction-judge-cases.json`, under the case-overlap bar). Requests and the 319 recorded lessons unchanged.
  - **Done: step 3, the trial recipe** (Coach #131, 1 review round; follow-ups #132 and #133, 1 round). Off by default: requests and the 319 recorded lessons are unchanged without it. The model writes the fractions as values and the view; the program decides the wholes, the model, a grid's layout and the marked share. Request cost with it on: 512 B (budget 700 B). Learn pins OLL 6e59471 (#194), so the app can show the card.
- **Decided (owner, 2026-11-19): no fraction slider in the first version**; FM-16 stays out of the probes.
- **Done: fraction probe 1 failed** (owner approved, 2026-11-19; Coach `docs/FRACTION_PROBE_2026-11-19.md`, #134). 102 of 180 calls. Judge passes 14/17 (pass); lost lessons 1 vs 2 (pass); near misses with a card **3/6** (fail: an unequal "half", a fraction of a set, a ratio tape); misleading narration **2** (fail: 1.6 drawn as "100/100 > 60/100", cups of 1/3 counted on a card that shows one third). No wrong value was drawn. Unforeseen: in 11 of 23 lessons the model filled the unused `split` with a runaway integer of thousands of digits, costing a re-ask each time.
- **Done: fraction probe 2 failed bar 4** (owner approved; Coach #135 fixes, #136 record; 104 of 120 calls on the owner's dedicated development key). Judge 13/17, near misses 1/6, lost 2 vs 1: pass. Misleading narration 4 plus 1 borderline: fail. Probe 1's bar 4 is corrected to 3 (a grid shaded by rows under narration that says columns).
  - **Program-side cause found:** in the first reply the card's settings require nothing, so in 16 of 19 lessons the model left out `fractions`; the refusal and re-ask then lost meaning (FM-11's right 160/100 became 60/100; FM-14 and FM-15 lost their split). This, not the runaway split, is why lessons with the card take more calls.
  - Also: the grid fills by rows where narration (both probes) says columns; a refusal for 37 parts points to a grid that cannot draw it either, losing the lesson in both probes.
- **Done: fraction probe 3 failed; the fraction card was parked (reopened the same day, below)** (owner approved the fixes and probe 3 and set the stop rule, 2026-11-19; Coach #137, OLL #78, Coach #138–#140; 101 of 120 calls). Judge 14/17 and lost lessons 0 vs 3 pass; near misses 2/6 and misleading narration 2 fail. Grids now fill by columns and match narration; fractions are still missing from 9 of 17 first replies. The two misleading lessons are questions whose whole is not one bar (1.6 as two parts; 3 ÷ 4 as 3/4 of one bar). Parked: the trial stays off; the card, judge, cases and recipe stay. Learn pins OLL da6c807.
- **Decided (owner, 2026-11-19): the fraction card is reopened for redesign, before counters.** The owner judged that parking misread the failures, and an independent Fable review agreed (Coach #141). The failures came from card gaps (no labelled quantity or tape view; no decimal or mixed-number input; a program-added ">" line under two parts of one amount) and from unnatural cases, not from the model's narration as such. Decision 0022 (OLL #79) is on hold.
- **Done: fraction redesign, free steps** (Coach #142, `docs/FRACTION_REDESIGN_2026-11-19.md`).
  - A standards blueprint; 24 development cases worded as learners ask.
  - A sealed scoring set of 34 cases, written by a fresh Fable agent and never read. Its hash is recorded, and its arithmetic was checked blind.
  - **Audit headline:** inside 0021's scope, today's card draws 10 of 16 development cases fully or mostly, 6 partly, and none misleadingly. Outside it (adding, copies, quantities), 3 of 6 cannot be drawn or mislead. In 7 cases the model must compute the answer just to write the card.
  - With the card off, quantity problems get a wrong number line or an array captioned for area.
  - The labelled-quantity picture the owner described is M1's planned tape-diagram component, which also serves 4 open ratio and percent questions.
- **Decided (owner, 2026-11-19): all four recommendations.**
  1. The labelled-quantity picture becomes its own tape-diagram card, built before the fraction card is switched on.
  2. Fraction fixes and the tape card come first, then counters (0022 stays on hold).
  3. Measurement: the sealed set, 3 runs per case, both arms read blind by fresh agents, the core scored separately, at most two scoring runs (each paid run asked for separately).
  4. A paid diagnostic first (Gemini 3.6 Flash, dev key, cap 130).
- **Done: the paid diagnostic** (Coach #143 runner and registration, 1 review round plus a fix check; results #144). 69 of 130 calls.
  - **Card on, 22 in-scope lessons:** reached a good card 8; reached the best card, which falls short 6; no card fits (tape) 2; the model fell short 1; the program dropped the model's second card 3; another good visual 2.
  - **Near misses:** a card was drawn in 2 of 2.
  - **New finding:** Coach drops a second create of the same card in the first section without a refusal. It happened in 15 lessons with the card on across four runs and in none of 93 without it. It hid good and bad second cards alike, and caused probe 2's misleading FM-13.
- **Decided (owner, 2026-11-19): 0021 amendment 2 accepted** (OLL #80), all six as recommended:
  - two steps on one card by the narrow rule;
  - a `share` view;
  - no `percent` in v1;
  - the guidance trimmed to stay within 700 B;
  - scope by row and picture, frozen before the sealed set is opened;
  - scoring once the tape card exists.
- **Done: build step 1 (OLL)**, OLL #81, 1 review round plus a fix check. Math 0.4.2:
  - a share marks one piece of each part;
  - the card writes the number's other form (mixed or whole on bars and circles; decimals on 10 and 100 grids);
  - the player redraws a revised card, and it grows clear of the card below.
- **Done: Coach pins OLL cea255a** (Coach #146, no review needed). The 319 lessons and request hashes are unchanged.
- **Done: build step 2**, Coach #145, 3 rounds (the third a one-line fix check). The judge reads each step of a revised card: an expectation can be met at any step, and what is not asked for is checked at every step.
- **Done: the scoring scope is frozen** (Coach #145, `testsuite/fraction-scoring-scope.json`). A fresh agent tagged the sealed cases, returning IDs and tags only: core 16, outside v1 10, tape 4, near misses 4.
- **Done: build step 3a**, Coach #147, 1 review round, no blocking findings:
  - the `share` view;
  - rule 2 as the recipe hook `choose_first_create`;
  - guidance at 698 B.
- **Done: build step 3b**, Coach #148, 1 review round plus a fix check; the round found a title and a timing problem, both fixed. A plain card, then its cut (or wholes, then shared), is drawn as the card and its revision. Anything else keeps the first create; a refused cut asks section 1 again. Replays: only FD-08 and FD-19 change, as intended; probe 3 and the 319 lessons are unchanged.
- **Done: Learn pins OLL cea255a** (Learn #206, no review needed), so the app draws shares and revised cards. No two-step lesson has been played in the app yet; OLL's browser check covers the player.
- **Reported to the owner: three build differences from the accepted amendment** (OLL #82, #83):
  - "one fraction, then the second added" is not built and keeps the first;
  - a share pair is added;
  - the share caption reads "Each share is a/b".
- **Follow-ups recorded (not blocking):**
  - rule 2 takes the later create's whole content, view included (a cut can show one moment early);
  - a share's card label reads "2/1 = 2";
  - the guidance doesn't state the 2 to 6 share limit;
  - Learn's own check of a two-step lesson in the app.
- **Done: the dev-set re-run** (owner approved; Coach #149 registration, #150 results; 69 of 90 calls). On the 22 in-scope lessons with the card on:
  - a good card in 9 (8 in the diagnostic);
  - the model fell short in 4 (1);
  - no card on either near miss (2 of 2 before).

  `share` and the two steps were used and drawn correctly. Two lessons mislead, because the model used the cut view to show parts: FD-11, which is core, read "Each share is 7/9", and FD-20 "Each share is 3/4". A replay shows the 3a and 3b rules are not the cause. The likely cause is #147's guidance trim, which removed the split view's purpose. FD-11 blocks the tape card and scoring.
- **Done: fixes after the re-run** (Coach #151, 1 review round plus a fix check, owner approved):
  - the split view's purpose is back in the guidance (710 B);
  - an equivalence can be written with its cut;
  - whole things are cut without a share.
- **Done: the second re-run** (Coach #152 registration, #153 results; 65 of 90 calls).
  - A good card in 10 of 22 lessons.
  - FD-11 is fixed, but FD-04 (core) now misleads ("Each share is 12/9 = 4/3"). The wording didn't stop the model writing the part count as its cut; the misuse moved.
  - Cause: a three-reply chain after refusals.
  - Two candidate program rules were tested on every split written in six runs:
    - R1, refuse a cut equal to the denominator: catches all 8 bad writes, but blocks a correct "half of a half";
    - R2, refuse a split of an improper fraction: catches the 3 core misleads and blocks none seen.
- **Decided (owner, 2026-11-20): R1, R2 and the small run are dropped.** The owner asked whether this was the morning's trap again, and it partly was:
  - the misleading cards came from the program refusing the model's natural descriptions of the picture (one fraction per whole, wholes in parts) and then drawing the squeezed-down reply;
  - both rules would have added more refusals;
  - one run per case chased a moving target.

  In their place is a free step: catalogue what the model writes, and propose card inputs that accept it as typed values.
- **Done (2026-11-20): the catalogue and a draft proposal** (handoff `runs/fractions/input-forms/`; no build, no calls). Every fraction input the model wrote across all six runs: 231, with 147 in first replies and 84 in section replies. A fresh Fable agent reviewed the proposal.
  - **The errors are the program's:**
    - a cut equal to the denominator is drawn as a further cut (three of the four misleading cards);
    - correct one-whole-per-entry lists such as 3/3, 3/3, 1/3 are refused;
    - first replies leave the card's values out (67 of 147 inputs; 0 of 84 in section replies), because that schema requires nothing, and each re-ask spends an attempt (probe 2's FM-15 was lost after three identical refused replies);
    - a valid section 1 is rewritten when only section 2's picture is refused (FD-20 lost its right 12/4).
  - **Proposal (typed values only):**
    - P1: a whole-by-whole list is one amount, and a cut restating the denominator is dropped where nothing is cut;
    - P2: under split, a cut equal to the denominator must say what it means (refused with typed pointers, or a proper fraction with its share as a witness). It refuses the same inputs as R1, including FD-05's correct 1/2 cut 2, which is pointed to `equivalent`;
    - P3: missing first-reply values have no cheap fix; a values-only call would be new core work;
    - P4: keep section 1 (recipe-agnostic, every capability) or allow one card per section (declared by the recipe);
    - captions unchanged, which corrects 2026-11-19.
  - **Net change against today:** newly accepted FD-04, FD-20 (re-run 1) and FM-01 (probe 1); newly refused 6 split inputs (4 wrong, 2 FD-05's correct ones).
- **Done (2026-11-20): did the card fit the lessons?** The owner asked whether the failures meant the card was unsuited to the lessons, rather than that the model or program broke rules (handoff `runs/fractions/card-fit/review.md`; no build, no calls). It is sorted by the 2026-11-19 audit's verdicts, which were written before the FD runs.
  - **"How many fit" (5.NF.B.7.b) has no picture that counts the pieces or states the division.** Without the card, FD-20 was wrong in all three runs. With it, the best card is "partly" (12/4, uncounted), and re-run 2 lost even that to the same-card refusal (P4).
  - **The audit predicted 2 of the 5 cases that went wrong** (FD-15, FD-23). It called the 16 in-scope cases, FD-04, 11 and 20 among them, "none misleading".
    - Found afterwards: all 5 sit in the 12 of 24 cases it flagged in some way. The other flag was that the card makes the model compute the answer to write it, against decision 0020.
    - There were none in the three "fully" cases.
    - Amendment 2 added the share view and two-step cards. The counting labels, operation views and "how many fit" were deferred, and we patched the split view instead.
  - **In the probes, about half the misleading lessons were program faults on questions the card fits,** all since fixed. The rest were questions it does not fit.
  - **Nothing broke a rule in the FD runs.** The model's arithmetic was right every time. What the four misleading captions share is a part count in the cut field after refusals. The card had no other way to say "each whole in d pieces", so one field carried two meanings.
  - **The reply chain still matters:** three of the four misleading captions began with a first reply that had no values (P3).
  - **Against "more cards":**
    - a half-fitting card pulled four operation lessons away from the number line (one-run readings);
    - the model ignores the card's exclusions;
    - every new recipe changes every math prompt.

    So each card needs a narrow scope, an input shape that shows its purpose, and a measured selection rate.
  - **Correction:** this morning's "the errors are the program's" holds for the mechanism, but was too narrow about the cause.
- **Decided (owner, 2026-11-21): all four recommendations.**
  - P1 and P2 are withdrawn.
  - P3 and P4 are to be designed in the next note.
  - The paid run that was to judge P1 and P2 is not needed.
  - The free design note is approved, with "how many fit" (B14b) as the first piece.

  **Still open:** the server's settings file has not been checked for `LEARNING_COACH_TRIAL_RECIPES`. The owner can confirm; I will not read production.
- **Done (2026-11-21): the design note** (handoff `runs/fractions/card-design/note.md`; free, nothing built, no model calls). Fable consulted three times; a fresh Fable review, then a check of its fixes (2 rounds).
  - **The review overturned my draft's input.** "N wholes, d pieces" is how the model also describes sharing (FD-16, FD-17, FM-14), so it can't separate "how many fit" from `share`. The model already writes the piece as a unit fraction (1/4, 1/3), so the divisor is typed as one, and a whole-number divisor is refused with a pointer to `share`.
  - **A local compile showed why the new picture needs its own fields:** today's card draws FD-20's numbers under `compare` as "3/1 > 1/4".
  - **The first-reply values (P3) are mainly the optional schema;** my "missing place" claim was overstated (2 or 3 of 67). Making the fields required risks silent fillers and breaks amendment 2's rule 2, so no change: measure it.
  - **Keeping section 1 (P4), replayed locally on 11 refused replies:** 1 better (FD-20), 3 the same with calls saved, 3 worse (the outline re-ask had rescued a thin or misleading first card). Not now.
  - **The `share` view is fine.** The reading tool overcounts cuts by one on circles drawn as a single whole (a/1); the Coach checkout's installed OLL is stale and needs a fresh install before the next audit.
- **Decide (owner):**
  - **D1:** the new picture as a separate card (recommended, chiefly because a later reply can't drift from it to a sibling view; the lean moved twice today);
  - **D2:** R2 exactly (an improper fraction under split refused, pointing to `one`; a/1 left alone), provisional on the probe;
  - **D3:** the first new card is static; a slider on the number of wholes comes later, with its own probe (reopens "no numerator slider in v1");
  - **D4:** FS-27 into the core of the frozen scope;
  - **D5:** order: the new card with D2, a probe, the tape card, counting givens, then one scoring;
  - **D6:** P3 unchanged and measured;
  - **D7:** P4 not now;
  - **D8:** raise the 720 B cap by measurement, with the speed gate.

  The probe (paid, about 36 lessons, at most about 80 calls) would be asked for separately, with its cases, expected pictures and pass bar written first.
- **Reconsidering (2026-11-21, late; awaiting the owner).** The owner asked whether I had understood the point: the failures may mean our components don't suit the questions, not that rules were broken. Measured against that, the design note partly slipped back:
  - D2 is another refusal rule on the old card;
  - most of the note is about plumbing;
  - it plans one card at a time;
  - the first card is static.

  **Proposed instead (free, nothing run):**
  - drop D2;
  - first write a component map: for every test question, what the child should see and do, which component that needs, and whether we have it;
  - then build the components the map ranks highest, each with its interaction designed in from the start.

  The D1–D8 list above waits on this.
- **Decided (owner, 2026-11-21, late): the working rules above,** and that work continues overnight.
  - I withdrew my D2.
  - The rest of that day's list (D1, D3–D8) is set aside, waiting for the owner, behind the component map.
- **Done (overnight 2026-11-21/22; free: no model calls, no product code):** the component map and working sketches (handoff `runs/fractions/component-map/`).
  - **Fraction map.** It has 27 teaching needs, each with what the child sees and does, how completion is checked from typed state, the control it needs, today's state and the harm in the runs.
    - First finding: the fraction card is the only math card with no learner control.
    - Ranked by harm: how many fit (5.NF.B.7.b), mixed numbers, joining and separating, a fraction of a length on a tape.
  - **Working sketches of those four** (artifact "Fraction Component Sketches").
    - They are drawn from tested code: 54 arithmetic checks and 36 checks in a headless browser.
    - A rules-first Fable review found that the first version let a child reach the answer by copying a count already on screen. Now the child decides when to stop, and nothing is counted or labelled until the child has typed it.
    - It also found needs folded into neighbours (now their own rows), a refused sum over one whole (now it spills into a second whole), and marbles on a continuous tape (now kilometres; objects as groups is its own component).
  - **K–12 by area, open questions only.** These come from the M1 tags; no question text was read and nothing was designed from the set.
    - In K–2, 16 of 22 open questions need a component that doesn't exist.
    - K–2 early number is split into 10 needs from the standards (codes checked).
    - Most K–2 needs are physical actions (touching each thing once, pairing, bundling ten), so a tap control in OLL would serve most of them.
- **Approved (owner, 2026-11-21): finish the map for all of K–12**, as the plan's step 4 list rewritten under the rules.
- **Done (2026-11-21): the K–12 component map** (handoff `runs/fractions/component-map/`: `SUMMARY.md`, `fractions.md`, `areas/*.md`; artifact "K–12 Component Map"). Free; nothing built.
  - **449 teaching needs** from the Common Core standards, area by area. Codes were taken from the fetched pages and spot-checked.
  - **Today:** none fully served, 158 partly drawn, 291 missing.
    - K–2: 63 needs, 50 missing.
    - 3–5: 96 needs, 58 missing.
    - 6–8: 132 needs, 80 missing.
    - High school: 158 needs, 103 missing.
  - **Shared pieces:**
    - every card can hold back a value until the child types it (a new option);
    - about 277 needs require a new tap or drag control (104 have nothing else);
    - about 250 need a new slider binding;
    - about 30 need a typed answer with a form or tolerance;
    - about 20 need an expression or list answer.
  - **Cards that don't fit their needs:**
    - 3D solids shows the asked measure;
    - the inequality line draws a continuous ray for whole-number stories;
    - the rounding line draws the result;
    - the array stops at 8 × 8;
    - the function plot only slides;
    - the rearrangements have only a progress slider;
    - there is no vertical number line.
  - **Process:** a pilot area first, then nine areas in parallel, then a rules-first Fable review. It found:
    - K–2 early number was a sketch, now rebuilt (34 needs);
    - ideas waved through as "served", now re-tested (none passed);
    - a wrong "fully" count;
    - fraction-map gaps;
    - folded rows;
    - slider-only actions.

    All were fixed, and a check of the fixes confirmed them.
  - **Provisional build order:** by open-question count (counts only): fraction models, counters and ten frames, data charts, polygon figures, place value, probability, tapes. 61 needs fit no existing picture kind.
- **Approved (owner, 2026-11-21): look for reusable building blocks** for the components, rather than building each one on its own (the AI still picks one component per need; the blocks stay inside the program).
- **Done (2026-11-21): the building-block test failed, 6 of 25** (handoff `runs/fractions/component-map/blocks/RESULT.md`). Free; nothing built.
  - **The test:** blocks were found in half the map, then a different agent tried to build 25 held-back needs from them, adding nothing. The bar of 20 was set before any block existed.
  - **In the half they came from,** 11 objects, 5 relations and 23 shared actions build 185 of 222 needs.
  - **Failures, in two kinds:**
    - 8 needed pieces from topics the blocks never saw (place value, high-school algebra, mapping arrows, a tree diagram);
    - 11 had the objects but lacked a piece. In about 6 that piece is the heart of the component (laying units along a length, linked clock hands, a compass, tracing a copy); in about 5 it is a small addition.
  - **The block count does not level off** (61 needs gave 14 blocks; 222 gave 39; the test wanted at least 7 more).
  - **A small core transferred:** containers, units, moving an item, figures, placing the next unit.
  - **Correction:** "a small set keeps recurring" was wrong. A small core recurs; most components need a piece of their own.
- **Decided (owner, 2026-11-21):**
  - grow blocks as components are built;
  - freeze the map as it stands, without a review (`FREEZE.md`, `NEEDS-INDEX.md`, 449 needs);
  - re-tag M1 against it;
  - apply the plan amendment (this PR, §5 items 9–10 and §6).
- **Done (2026-11-21): the re-tag** (handoff `component-map/BUILD-ORDER.md`, `RETAG-tags.json`).
  - **Method:** a fresh agent tagged all 160 questions with the needs their teacher pictures call for, returning IDs and tags only. The ranking uses open questions only.
  - **Result:** of 119 open questions, 104 call for a need in the map, 11 need no picture, and 4 fit no need.
  - **The order is coarse.** 104 questions spread over 137 needs, so most needs have 1 or 2.
  - **Top needs:**
    - tens-and-ones trading (K2N-23, 4 open questions);
    - making ten to add (K2N-19);
    - building and pulling apart a number by place, and adding and subtracting with trades on a place-value chart (35P-05, 35P-07);
    - where two lines cross (68E-28);
    - building a dot plot (68G-33);
    - a vertical number line (68R-15);
    - a unit fraction ÷ a whole number (FR-24);
    - and others at 2 each.
  - **By area:** 6–8 geometry and statistics 18 open questions; high-school functions 13; K–2 early number 12; high-school geometry and statistics 12; fractions 11.
  - **Correction:** the four sketched fraction components rank low by this measure. "How many fit" has 1 open question; mixed numbers, joining and the tape have 0. The earlier recommendation came from harm in the fraction runs, not from the plan's measure.
- **Decided (owner, 2026-11-21):**
  - **First component: trading tens and ones** (K2N-23), with its place-value siblings next (35P-05, 35P-07).
  - **The server settings question is closed:** the owner says whether the fraction trial is enabled there does not matter.
- **Reported to the owner (2026-11-21):** Learn #217 merged while its unit-test check was still pending. A wait-and-merge command treated a failed status read as "all passed". The check then passed on that commit. It is the third such slip. Merges now confirm each required check's conclusion through the API before merging.
- **Done (2026-11-21): the first component's decision record**, OLL #85, decision 0023, Proposed (no review needed: a proposed record only).
  - **The sketch** (handoff `component-map/first-component/sketch/`).
    - v1 failed a rules-first review: the program made the trade, pressing buttons until they went grey passed, the blocks were not to scale, and there was no inverse.
    - v2 was rebuilt:
      - the child gathers into a ring drawn with the outline of one ten;
      - only exactly ten trades;
      - the child can break a ten or a hundred back;
      - the child says when trading is done, then types the number, the count in each place, and the number by places.
    - A fix-check (round 2) rated 4 of the 9 findings fixed and 5 partly fixed, and found 3 new layout and state bugs. All 3 are fixed; the remaining limits are listed in the record.
    - Model: 27 checks pass. Page: 36 checks pass.
  - **Other design work:**
    - the practice pile differs from the lesson's;
    - the tap control is handled by the card (checked on paper against six needs near the top);
    - four new player abilities.
  - The one-page English summary is `first-component/SUMMARY-0023.md`.
- **Decided (owner, 2026-11-22), on 0023's six questions:**
  1. No limit on pressing "done".
  2. The tap control: approved.
  3. The other three player abilities: approved.
  4. 0022 is retired. OLL #79 is closed, replaced by per-need components.
  5. The fraction trial is paused.
  6. The order of work: approved.
- **Needs work (owner, 2026-11-22): the sketch is not intuitive enough.** The owner had to read the notes and try it several times before seeing what it teaches.
  - The sketch was built to test the logic and checks, not first-use clarity.
  - The meaning is carried by words instead of by the picture and its motion:
    - five buttons and a break mode;
    - instant trades, with no visible fusing of ten ones into a ten;
    - the piece tapped is not the piece that moves;
    - small pieces;
    - no demonstration before the child tries.
  - 0023 is back to Proposed until the interaction is redone.
- **Done (2026-11-22): sketch v3 of trading tens and ones** (handoff `first-component/sketch-v3/`).
  - **The mat:** a place-value mat with columns labelled in words. A tray of exactly ten sits between two columns, labelled, and takes no more once full (owner).
  - **Actions:** the tapped piece is the one that moves; the trade is animated; the buttons sit under the tray; break puts a ten back into the empty tray.
  - **Flow:** a demonstration comes first, then practice on a different problem.
  - **Tested:** a fresh agent's no-notes first-use test finished in one pass with one wrong first move, and its six findings are fixed. 32 model checks and 40 page checks pass.
- **Decided (owner, 2026-11-22): v3 accepted,** after one fix: the hundreds overlapped, and now stand three to a row, apart. Decision 0023 is accepted (OLL #85).
- **Done (2026-11-22): step 1 of 0023 in OLL,** four PRs, all "Needs code review", 9 review rounds in total. Each one was merged only after its conformance check passed.
  - **A: the `base_ten_trade` card** (OLL #86, math plugin 0.5.0; 2 rounds).
    - The card's rules are ported from sketch v3. The view draws the accepted mat.
    - Round 1 found that a three-column mat's fifth variable wasn't range-checked. Now each variable is checked on its own, and the card never draws more than the mat holds.
  - **B: card tasks** (OLL #87, player 0.14.0; 3 rounds).
    - New: a tap that changes several variables in one step; "I'm done" judged by the card; a gate so the card can be tapped only while its task is open; a practice pile that must be given.
    - Review found: a revised card would freeze, so a bound card can't be revised. A count could leave its range, so a practice pile is required and tap variables have no other control. A replay didn't lay the practice pile again; it does now, and once the task is done a replay shows the child's traded pile.
  - **C: tapping on the board** (OLL #88; 2 rounds). The unit tapped is the unit that moves, trades animate, and refusals are explained. Review found a stale animation timer and a revised title not redrawn; both are fixed, and the timer case has a browser test that fails without the fix.
  - **D: the demonstration** (OLL #89; 2 rounds). The lesson taps the card by its own rules, and the validator follows the counts in playback order and refuses an illegal tap before playback. Review found that a tap could push a count past its range, and that a slider could invalidate a later tap; both are refused now.
  - **Changes from the approved abilities, for the owner:** holding numbers back isn't needed, because the card never draws a number; instead the card can be tapped only while its task is open. The typed answers would be separate short questions (one blank each) unless the owner wants a multi-blank row, which would be a further ability.
- **Decided (owner, 2026-11-22): typed answers as rows of blanks** (option B), "it increases the expressive capabilities of our system". Recorded in 0023 amendment 1 (OLL #90).
- **Done (2026-11-22): the row, and the trading mat in Learn.** All "Needs code review" except #90, and each merged only after its checks passed.
  - **OLL #91: a row of blanks** (`numeric_row`; 1 round). Fixed text and 1 to 6 blanks, judged whole, never saying which blank is wrong; an empty blank isn't a try.
  - **OLL #92: question cards on one card stack in their order** (2 rounds). They were reversed. Round 1 found that a task docked under another card could push a question away; only cards hanging directly under the card count now.
  - **OLL #93: "I'm done" with a few ones left in the tray** (1 round; 0023 amendment 2). This was the first-use test's most confusing moment: done was refused and "Fill the tray first" was impossible. Done now needs only that no place has ten or more. The refusal states a fact, and the mat is laid tidy afterwards.
  - **Learn #223: Learn pins OLL 29403a3** (1 round), with taps on the mat, the "I'm done" button, the row card, and a test page with a browser test of the whole flow (now in CI).
  - **Checked:** a no-notes first-use test in Learn found the problems above. The demonstration plays correctly in Learn's own player.
- **Decided (owner, 2026-11-22):** both changes confirmed: the mat follows the open task, and "I'm done" works with a few ones left in the tray (OLL #94). The practice camera zoom-out is left as it is for now.
- **Done (2026-11-22): step 2 of 0023 in Coach.**
  - **Coach #154:** pins OLL 0225643; requests and recorded lessons are byte-identical. No review needed.
  - **Coach #155:** the blueprint (5 rows from the standards), 20 development cases (16 with the stated pile, 4 near misses; all under the overlap bars) and the judge; 2 review rounds.
    - Round 1 found: a case with no stated pile; "different practice pile" comparing piles rather than numbers; row words not tied to the practice pile; tests covering only two columns.
    - All are fixed, with a test for each check.
- **Decided (owner, 2026-11-22): the recipe's five decisions.** 1–4 as recommended: the program speaks the demonstration's trade steps; long piles show the first trade tap by tap, then the rest at once; the program writes the mat's practice; one mat per lesson. 5 changed: **English and Chinese both, from the start.**
- **Done (2026-11-22): the mat speaks Chinese,** OLL #95 (0023 amendment 3, math plugin 0.6.0; 2 review rounds: the mat's screen-reader name was still English). The owner confirmed the Chinese wording. Coach pins it (#156, no review needed); Learn pins it with a Chinese test page and browser test (#227, no review needed).
- **Done: a no-notes first-use test in Chinese.** The child finished; the mat's messages were clear. Found: a locked question's prompt showed the number before it was typed ("把37按数位拆开写"), so the recipe's prompts and hints will state no number (the approved rows stay; they unlock after "I'm done"). Open: no narration text is shown on the test page. For the owner: "摆面" may be unfamiliar to a child; Learn's generic answer feedback and input hint.
- **Done (2026-11-22): a quick second tap never undoes the first,** OLL #96 (2 review rounds: taps on a moving unit fell through to buttons). Found by diagnostics on Learn's CI. Learn pins it (#229, no review needed).
- **Done: the trading mat's sealed scoring set,** written by a fresh agent and never read; its hash is recorded and its arithmetic was checked blind (all cases fit the mat's limits). Recorded in handoff `first-component/STEP2-3-PLAN.md`.
- **Decided (owner, 2026-11-22): child-facing Chinese names the blocks, not the mat.** "摆面" was a coined word. OLL #97 (no review needed): 没有地方再放十个了。, and the screen-reader name 数位方块. Learn (this PR): 还没有。再看看这些方块。 Coach #157: 各有几个十、几个一？ (with 百 on a wide mat). **For the owner:** the approved "一共有多少个方块？" became "这些方块一共是多少？", because the first counts pieces (67 is 13 blocks).
- **Done: step 3, the Coach recipe,** Coach #157 merged (Needs code review; 2 review rounds, then the wording commit). The Chinese wording is merged everywhere: OLL #97, Learn #230, Coach #157; the record is corrected in OLL #98. **Open with the owner:** the total question is 这些方块一共是多少？, not the approved 一共有多少个方块？, because the approved one counts pieces.
- **Decided (owner, 2026-11-22): paid probes are authorized in advance.** The speed gate and sealed scoring are still announced first.
- **Done: probe setup,** Coach #158 (Needs code review; 1 round plus a check of its fixes: the report never named the recipe). It adds 13 Chinese development cases, the runner's judge, and the record with its bars before any call.
- **Done: probe 1 fails bars 2 and 4** (Coach #159; 131 calls in all, under the 290 cap).
  - Bar 1 passes: English 14/16, Chinese 9/10.
  - Bar 3 passes.
  - **Bar 2:** comparing two numbers drew the mat (one case per language).
  - **Bar 4:** the narration describes the pile before the trade the mat already showed (English 7, Chinese 2). It is a timing fault; the results it states are right.
  - Also: the model's practice piles lost two lessons (expanded form) and changed one lesson pile.
  - **Superseded (owner, 2026-11-22/23):** those fixes were not made. The owner reviewed the approach:
    - the pipeline stays (the model writes the whole timeline, fixed at generation);
    - one component per need stays;
    - no program-written narration or practice;
    - the problem to solve is the cost of adding a component;
    - a general fallback is wanted for when no component fits.
- **Done (2026-11-23): the trading mat rebuilt on the earlier components' pattern,** Coach #160 (Needs code review; 4 rounds).
  - The pile is lesson numbers; the model's own animation plays the trades in its own moment; the model writes the practice.
  - The program's demonstration, the program's practice and the six fields are removed.
  - Draft of the interface for new components: handoff `COMPONENT-INTERFACE-2026-11-23.md`.
- **Done: probe 2 fails all four bars; stopped for the owner** (Coach #161 setup, 1 round plus a check; #162 result; 190 calls).
  - **Worked:** every trade the model made played with its own sentence.
  - **Main cause of the failures:** the model writes the child's task and its hand-over for a slider ("adjust the loose ones to 14"), as every earlier component has one; the mat has none. That was 23 of 33 refusals, all three lost lessons, and 8 of 13 misleading lessons.
  - **Decided (owner, 2026-11-23):** "I think all interactive components should support slider-based interaction."
- **Done (2026-11-23): the trading mat has a slider** (OLL decision 0023 amendment 4). All "Needs code review", each merged only after its checks passed:
  - **OLL #99** (2 rounds): each stop of the slider on the ones (and tens with hundreds) is one trade made by the card's rules, animated as taps are.
  - **OLL #100** (1 round): a host's reset of one count is refused.
  - **Coach #163** (2 rounds): the mat's ones and tens get the slider; the model's slider task becomes the child's task.
  - **Learn #233** (2 rounds): the slider is live only in its task, trades animate, and there is no reset.
  - **First use, no notes:** finished every task; "I could clearly see ten ones become one ten". Open: Make/Break look tappable during a slider task; the slider starts mid-track, so the trading direction is unclear; the task feedback is in grown-up words.
  - **Rule recorded:** in the component interface spec and in decision 0023. The slider shows a place's count: a number on screen, which 0023 had ruled out until the child types.
- **Done: probe 3 fails bars 1 and 4; stopped for the owner** (Coach #163 record, #164 result, #165 checks; 163 calls).
  - Judge EN 9/16, ZH 5/10 (fail). Near misses 1/7 and lost lessons EN 0 vs 1, ZH 1 vs 1 (pass). Misleading EN 6, ZH 6 (fail).
  - **What the slider fixed:** refusals 33 → 7; lost lessons 3 → 1.
  - **What is left:**
    - 9 lessons ask the child to undo the trade (a break back to the start), which Coach's down-only rule drops;
    - 6 ask for a count that would change the total;
    - 6 retell the starting pile while the mat shows the traded pile, although every later-section request states each number's current value.
  - No single change clears the bars.
  - **Waiting for the owner:** whether to go on with the trading mat, and how.
- **Decided (owner, 2026-11-23 and 11-24): the trading mat goes on, and how components are judged changes.**
  - **I check only objective things:**
    - a lesson generates;
    - the components it chose render;
    - speed.
  - **Judging lessons is the owner's.** There are no narration bars or blind readings.
  - **Request size** is tracked, not capped. Growth is to be met by sending the model only the components a request needs.
  - **Coach's rewriting of model output stays for now.** It is documented in Coach issue #166 and in the handoff's `COACH-INTERVENTIONS-2026-11-24.md`.
  - **Ending with a trade left** (11 tens and 6 ones = 116) is correct but less complete.
  - **A slider that can't move** is hidden.
- **Done (2026-11-24): fixes from tracing two real lessons** (each "Needs code review"; merged after a review found nothing blocking):
  - **Coach #167 (2 rounds):**
    - typed and thinking questions are no longer deleted silently: a section that draws no card asks beside the latest earlier card;
    - a mat task whose target is already met starts from the lesson's end pile, otherwise one trade away;
    - the mat's guidance names the hundreds column;
    - later sections get each card's guidance;
    - the size ceilings are now measurements;
    - the base-ten judge keeps objective checks only.
  - **OLL #101 (3 rounds):** a card slider with one stop is hidden. It stays in the list, so a drag of another slider is never rebuilt.
  - **Learn #235 (2 rounds):** pins OLL 257dc8b and hides those rows without reserving room.
- **Done: trading mat, objective check 1** (handoff `runs/base-ten/objective-1/RECORD.md`; 155 calls on the dev key, gemini-3.6-flash). The 33 development questions, mat on and off, Coach main 1d3896b:
  - **Generation:** 33/33 lessons in both groups, none refused or lost.
  - **Speed:**
    - **Mat on:** first playable median 9.8 s (p90 12.1 s); total 13.5 s.
    - **Mat off:** first playable 9.4 s (p90 25.0 s); total 14.5 s.
    - **Paired, mat on − off:** +0.2 s to the first playable section, −0.8 s in total.
  - **Rendering in Learn's lesson board:** all 66 lessons play to the end with no page error, and every card is drawn. The checker completed every task: 91/91 with the mat (33 slider, 58 typed) and 77/77 without.
  - **Judge (objective):** 33/33. Notes: 3 lessons have no task on the mat; 1 near miss drew the mat; no lesson leaves a trade unfinished.
  - **Waiting for the owner: their review of the lessons.** Each can be played on a local index page, mat on beside mat off.
- **Done: the sketch card (the general fallback) on paper.** Two drafts, each tested by a fresh agent on 15 needs chosen by rule.
  - Draft 1: 2 full, 4 partly, 9 no.
  - Draft 2: 5 full, 5 partly, 5 no, on a fresh set.
  - It suits K–5 quantity, measurement and simple plane ideas, not objects (coins, a clock) or spatial acts (a fold).
  - Files: handoff `sketch-card/`. Nothing is built.
  - **For the owner:** "the rest at once" became "quickly, one trade at a time" (a brief tray fill and a make, about 3 s each): two animated counts showed 37 for 67 in Learn's player. 50 ones take about 28 s in all.
  - **Found (OLL, open):** when practice starts, the mat animates to the practice pile and shows wrong amounts for about a second.
- **Need IDs** (for example K2N-23): the grade band and area, then the row in that area's map. Examples: K2N is K–2 early number, 35O grades 3–5 operations, 35P grades 3–5 place value, FR fractions.
- **Reported to the owner (2026-11-19):** Learn #200 was merged before its unit-test check finished (it passed afterwards), the second time this has happened. Merges now wait for every check.
- **Reported to the owner (2026-11-19): held-out slip.** While gathering the counters cases, a wrong filter showed the text of two held-out questions (K2-08, G68-02) in my own tool output. They were written nowhere and shown to no one. The design uses only the open questions, and 0022 only counts those two.
- **Owner's app findings (2026-11-19):** a few issues found while trying the app; to be taken up after the plan's current steps.
- **Decided (owner, 2026-11-18): what comes next.** First the number-line losses (now #128), then step 4 in strict M1 order: fractions and area models first, starting with its decision record (side track item 9, **Now**).

  Narration remains the largest cause of misleading lessons (11 of 16); no program check reads it without a word list.
- **Decided (owner, 2026-11-18): Coach #121 closed.** The probe count (9 replays to 4 holds over 13 lessons) missed the 3-to-1 merge rule. A paid structural re-ask stays possible.
- **Done: the "no visual" probe failed its improve test; stop rule applied (Coach #122 closed, record on its branch).** 285 calls, read blind. Where nothing fits, 11 of 40 lessons misled on each arm (p = 0.62). Nothing was lost where a picture fits. The rule changed what was drawn, not whether lessons misled: stand-in-picture misleads fell 9 → 4, narration describing an absent picture rose 3 → 7. The remaining lever is narration, which no program check reads without a word list.
- **Decided (owner, 2026-11-18):**
  - The rest of 3.6 goes before the 60-question re-run (3.8), in the order of L4.
  - 3.5 slice 3 (Studio graph forms) moves after 3.8: it changes nothing AI lessons draw.
  - A written pass bar before every paid probe and gate is now a plan rule (§5).
  - There is no real-learner data yet, so every measure stays on the question set and probe cases.
- **Handoff:** `docs/MATH_EXPRESSIVENESS_HANDOFF.md` is current as of the end of 3D (2026-11-18), ready for another agent.
- **Rules (owner, 2026-11-19, refining 2026-11-18's):** reviews run until one finds nothing blocking, and the agent then merges any PR itself, lesson-changing ones included; every PR is still marked as needing a code review or not. Paid calls still need the owner's approval. Added 2026-11-19, after two PRs took six or more rounds:
  - **Blocking** is only what the PR causes compared with main (the learner sees something wrong or misleading, a lesson is lost, an unintended request or hash change, a broken test, CI check or runtime path). Reviewer briefs add no wider standard.
  - **Rounds after the first** re-check the previous round's fixes and the code they touched; new findings that are not regressions become recorded follow-ups.
  - **Tooling-only PRs** (no request, lesson or learner change) get one round plus a check of its fixes.
  - Status reports say how many rounds each PR took.

---

## L4 · Now: stop misleading, then re-measure (rest of 3.6, then 3.8)

**Why here:** the owner put "stop misleading" first on 2026-11-14 (13 of 58 lessons misled), and it has not been re-measured since. Every misleading lesson was on a question no component fits. Priorities agreed with the owner on 2026-11-18.

**Main track:**
1. **Now, free (Coach; merged by the agent once a review finds nothing blocking):**
   - **Done (2026-11-18):** wrong arithmetic in praise messages, Coach #120. A false claim written wholly in numerals drops the message (the learner sees the neutral reaction). Census of 307 probe messages: 9 claims read, all true. Follow-up merged (Coach #123, 2026-11-18, two review rounds): a task that asks for rounding to decimal places lets its message round there, lone fractions (`6/3 = 2`) are checked, curly apostrophes, a `task` field on the record. A structural label rule was tried and dropped in review (it kept false messages main drops). Census unchanged: 10 claims, all true, none dropped.
   - **Closed (owner, 2026-11-18):** animations that change nothing, Coach #121 (the probe count missed the merge rule).
   - **Done (2026-11-18): the rest of the free batch.**
     - **Stand-in counts: nothing to catch on main, no check built.** In the probe's control-arm lessons with the unit-square array, every count matches the question or is said aloud. Where a side is above 8 (NV-17), main draws a flowchart or a 3D box, never a shrunken grid.
     - **6c: no change (Coach #124 closed after two review rounds).** In 259 recorded lessons, the only refusal no retry can meet is NV-05 (a scatter of four points), lost anyway for another reason. Every narrower fix let misleading narration through (a polygon rearrangement for circle area, points to move that don't exist).
     - **Renderer defects, both fixed:**
       - a slope triangle no longer spans a pole (Coach #125);
       - plot marks hide at a coefficient that cancels to a rounding residue, and a cancelling double root is drawn (OLL #74, two review rounds; Coach #126 bumps OLL).
       - The 259 recorded lessons replay identically.
     - **6b: confirmed closed.** The first request carries no `sample_x_numbers`, and none of the probe's 120 fresh lessons wrote it.
     - **6d's open part: not pursued.** It would mean growing a wording list (owner's rule, 2026-11-18).
     - **4b: waits** for the next change to the compiler's effect check.
     - **Seen while reading, recorded only (narration and animation choices, not counts):**
       - NV-17: a 3D box whose narration invites dragging a slider that does not exist.
       - NV-10: a grid silently animated to 1 by 6 while the narration lists pairs.
2. **Done (2026-11-18):** the "no visual" probe's design (Coach #122, draft): the outline rule (+144 B, every ceiling holds), 30 overlap-checked cases (16 no fit, 4 stand-in, 10 fit), frozen builds, a blind-reading protocol, a case-level two-sided pass bar with simulated power, and a driver with a call cap. 4a rides in the same branch.
3. **Done (2026-11-18): the probe failed (stop rule).** 285 of 340 approved calls. The rule is dropped; 4a goes with the next request change.
4. **Skipped:** the speed gate (only if 3 passed).
5. **Done (2026-11-18):** 3.8, the 60-question re-run, 160 calls (Coach #127; see "Needs the owner").

**Side track (between paid steps):**
6. **Split the plan:** §7's history moves word for word into a history record; the plan keeps what is ahead. §5, §7 and §8 keep their numbers.
7. **Done (2026-11-18):** the written pass bar is a plan rule (§5).
8. **Cumulative speed benchmark:** build it (free, evaluation-only); its first run is paid (about 105–125 calls for 50 pairs), and the owner sets the total budget then (proposed +1.5 s). It catches small costs that add up; it does not change the per-change gate.
9. **Done: fractions and area models decision record,** OLL #75, decision 0021, accepted 2026-11-18. The plan's "0014" was never written, and the subject plan reserves 0014 for another diagram, so it took the next free number.

**After 3.8:** step 4 in strict M1 order (fractions and area models, counters and ten frames, data charts), then 3.5 slice 3.

---

## L4 (previous) · Done: 3D solids, plan 3.7 (decision 0019), finished and on 2026-11-18

**Why here:** 3.6's two fixes are merged (Coach #113–#115). 3D is the next item in the plan.

**Closed 2026-11-18:** OLL #73, Learn #165, Coach #116–#119 merged.
- `solid_3d` is on and `cube_with_section` is retired.
- The default request is byte-identical to the gated one.
- M1: 35 of 145 pictures fully drawn, up from 33.

The items below are the record.

- **Done:** step 1, OLL render work (OLL #73).
  - A second solid can stand beside the first, centred and framed together. One plane cuts both, and both nets open without touching.
  - A line under the scene shows the volume, surface area or face/edge/vertex counts. The program computes them, and they are exact where possible (`12π ≈ 37.70`). The player draws it from 0.13.0.
  - New composite: two boxes side by side (an L shape).
  - New browser check: `check:solids-browser`.
- **Done:** step 2, the solids judge and 22 cases (Coach #116).
  - Cases: SD-01–15, six near misses and one control.
  - Expectations were written before any recipe code.
  - Every case is at most 0.20 against open questions and 0.15 against held-out ones.
- **Done:** step 3, the `solid_3d` trial recipe (Coach #116).
  - The model writes shapes, the sizes the question states, `join`, `show` and `interaction`. The program does the logic.
  - The request grows by +730 B. The owner raised the cap from 600 B to about 720 B on 2026-11-17.
  - The slider is learner-only in v1 (owner, 2026-11-17).
  - Default requests are unchanged, and all 139 recorded lessons replay identically.
- **Done:** step 4a, three paid probes on the SD cases (50–75 calls each). 6 → 10 → 13 of 16 passed, and every lesson was read by hand. Fixes between probes:
  - the size order (the provider writes fields in schema order);
  - no outline numbers;
  - `show` required;
  - `join: l_shape`.
  Record: Coach `docs/SOLIDS_PROBE_2026-11-17.md`.
- **Decided (owner, 2026-11-17):**
  - Retire `cube_with_section` when `solid_3d` switches on (it already happens while the trial is on).
  - The open-top box stays a known near miss.
  - A teacher-driven cut or net is a later 0020-style field.
- **Done:** step 4b, the speed gate and its allowed repeat (155 calls).
  - Fitting requests were 1.7 s faster. Other requests were +1.2 s, then +0.75 s, both over the old +0.5 s median limit, though both 95% intervals span 0.
  - Under the old rule this failed, so `solid_3d` stays a trial.
- **Done:** the speed gate method was revised (owner, 2026-11-18; plan §8; Coach #117). Generated tokens are converted to seconds and judged sequentially. Under it, the solids result is: fitting pass; other **extend** (+0.43 s, interval −0.2 to +2.2 s, 40 pairs).
- **Done:** gate extensions 1c, 1d and 1e (93 calls, 2026-11-18). **The speed gate passed** at the 80-pair cap:
  - fitting: −2.17 s;
  - other: median +0.24 s (interval −0.81 to +1.26 s), within +0.5 s.
- **Done:** step 5 prepared. Coach #118 switches on `solid_3d` and retires `cube_with_section`.
  - The default request is byte-identical to the request the gate measured.
  - 132 of 139 recorded lessons replay identically. The other 7 had asked for the cube and now get a new outline.
- **Done:** M1 re-tag, Coach #119. Pictures fully drawn: 35 of 145, up from 33 (the L of two boxes, the prism's counts). The top of the candidate ranking is unchanged: fraction area models, counters and ten frames, data charts.
- **Known, not blocking:** narration is read by hand in the probe:
  - numbers that disagree with the measures line;
  - promised motion the lesson can't do.
  A regex check waits for a census of recorded messages. Surface area is always the whole surface: open-box and lateral-area questions are near misses.

### Before 3D: the points story (2026-11-15 to 11-17)

- Asking the model for an index into the outline's numbers (`sample_x_numbers`) failed: it wrote x positions instead. Five fixes failed review. Decision 0020 ("the model writes meaning, the program writes logic") fixed it in Coach #113. Plan item 6e and the plot-judge fix followed (#114, #115).

---

## L3 · Step 3 of the plan: finish the current stage

**Why here:** the number line and function plot were extended and switched on (2026-11-15). This step clears what that work left behind, then adds 3D, then measures everything once.

- **Done:** 3.1 Re-tag coverage. Pictures fully drawn for 33 of 145 questions, up from 27.
- **Done:** 3.2 Speed check for the two switch-ons: passed. It found the points slip.
- **Done:** 3.3 3D plan written and accepted (OLL decision 0019, amended 2026-11-16 by 0020).
- **Done:** 3.4 No math special cases left outside the math plugin (Coach half). Two small follow-ups (4a, 4b) ride with later changes.
- **Done:** 3.5 Studio uses the same builders: number line and plot marks.
- **Done:** 3.6a The points slip, fixed by #113.
- **Done:** 3.6 The fixes before 3D: 6e and the plot-judge fix (merged 2026-11-17).
- **Done:** 3.7 Build 3D solids (L4), on 2026-11-18.
- **Now:** the rest of 3.6 (L4), decided by the owner on 2026-11-18 to go before 3.8.
- **Next:** 3.8 One 60-question re-run (paid). Closes this whole stage.
- **Later:** 3.5 slice 3, Studio graph forms. Moved after 3.8 (owner, 2026-11-18; was "after 3D", 2026-11-16).

**How we got to step 3:**
- The first measurement (2026-11-14) found that 13 of 58 lessons misled learners, mostly on questions no component fits. The owner put "stop misleading" first.
- Card rules were tried and did not help (Coach #79).
- Then the number line and function plot were extended, and step 3 lists everything that left open.

---

## L2 · The plan's sequence

**Why here:** the order agreed for the whole math plan. Each step is measured before the next.

- **Done:** 0. Number line finished and switched on (2026-11-13).
- **Done:** 1. Question set written and frozen: 160 questions, a quarter held out.
- **Done:** 2. First measurements. Pictures for 19% of questions; lessons right when a component fits, but 13 of 58 misled.
- **Now:** 3. Finish the current stage (L3).
- **Later:** 4. New components in measured order: fractions and area models, counters and ten frames, data charts, polygons, place value.
- **Later:** 5. Re-measure after each component.

---

## L1 · Math expressiveness plan (K–12)

**Why here:** on 2026-11-12 the owner paused other subjects. Math, kindergarten to grade 12, is the whole of this phase.

- **Done:** Goal 1: math runs on the plugin architecture.
- **Now:** Goal 2: lessons can show more K–12 math, and show it correctly.
- **Now:** Goal 3: progress measured on one fixed question set.
- **Paused:** science and other subjects (subject expansion plan), until the owner resumes them.

---

## L0 · OctosLearn

**Why it all exists:** AI lessons (Learning Coach), learner-recorded lessons (Studio) and course packs, all ending in the same lesson language (OLL).

---

## Standing rules

- **Meaning and logic:** the model writes what to teach; the program works out anything that must be exact (OLL decision 0020). This applies whenever a field is built or changed. It is not a separate project.
- **Paid runs:** probe runs on the dev-probe key are pre-approved (owner, 2026-11-22); each is reported with its model, purpose and call count.
- **Request changes:** request size is tracked, not capped (owner, 2026-11-24); speed is measured in live runs.
- **Evaluation (owner, 2026-11-24):** I check objective things only (generation, rendering, speed); judging lessons is the owner's.

## Open pull requests

- **Kept:** Coach #79, the card-rule experiment, kept as a record.
- **Waiting:** Coach #81, the program-written practice invitation. Waits until recordings show the problem.
