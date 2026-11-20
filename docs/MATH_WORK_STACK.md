# Math work stack

As of 2026-11-18. This is the **status page for the math expressiveness work**, kept as a stack.

- The top layer (L4) is what is happening now.
- Each layer below it says why the layer above exists, down to the product (L0).
- Each layer also lists its siblings (done, now, next, later), so depth and breadth are both visible.

The plan itself is `docs/MATH_EXPRESSIVENESS_PLAN.md`; this page says where we are in it.

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
- **Decide (owner):**
  1. Restore the split view's purpose in the guidance (710 B, within the 720 B allowed), and measure it with a second dev-set re-run, about 70 calls with a cap of 90.
  2. Accept an `equivalent` card with a consistent `split_each_part`, at no request cost (FD-05).
  3. Whether a cut of whole things (a/1) keeps "Each share is …" and its marks (FD-20).
- **Next:** the tape-diagram card's decision record.
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
- **Paid runs:** every paid run is approved by the owner first, with its call count.
- **Request changes:** any change to what the model is asked gets a paired test and a speed check (+0.5 s at most).

## Open pull requests

- **Kept:** Coach #79, the card-rule experiment, kept as a record.
- **Waiting:** Coach #81, the program-written practice invitation. Waits until recordings show the problem.
