# Math work stack

As of 2026-11-17. This is the **status page for the math expressiveness work**, kept as a stack.

- The top layer (L4) is what is happening now.
- Each layer below it says why the layer above exists, down to the product (L0).
- Each layer also lists its siblings (done, now, next, later), so depth and breadth are both visible.

The plan itself is `docs/MATH_EXPRESSIVENESS_PLAN.md`; this page says where we are in it.

**Keep it current.** Update it whenever an item finishes, a layer is pushed (going deeper) or popped (coming back up), or something needs the owner. The owner reads this page to follow the project at a glance. A rendered copy is kept as a claude.ai artifact by whoever is working; this file is the record in the repo.

Legend: **Done**, **Now**, **Next**, **Later**, **Merge** (waiting for the owner to merge), **Paused**.

---

## Needs the owner

- **Merge:** Coach #115, the plot judge fix. It only affects evaluation: no lesson, request or recipe changes. After it, the next step is 3D.
- **Decide (later):** before the 60-question re-run, whether the rest of step 3.6 (program checks, the outline's substitution rule) goes before or after the 3D build. The plan only says "before the re-run".

---

## L4 · Now: two small fixes before 3D (both done)

**Why here:** both turned up while testing the points fix (Coach #113) on 2026-11-16. The re-run and the 3D work would count them as failures if they stayed.

- **Done:** points on function plots (Coach #113, merged 2026-11-16).
  - Paired test: 19 of 20 lessons against 18 of 20.
  - Speed check passed.
  - Cost that day about $1.25.
- **Done:** plan item 6e, merged 2026-11-17 (OLL #72, Learn #163, Coach #114).
  - Before: a dragged point crossing a gap in the curve (x = −1 on y = 2/(x + 1)) broke the lesson at that slider position.
  - Now: the point hides there and comes back, and the slope readout says why instead of measuring a stale point. Player 0.12.0, feature `plot:secant-hide-undefined`.
  - No model request changed.
  - All 139 recorded lessons and all 2,080 fixture runs are the same apart from the new flag.
- **Merge:** plot judge false alarm (Coach #115).
  - Where a slider moves a domain bar's end, the judge read the function a rounding step beside the end and called correct lessons wrong.
  - It now reads the function at the end itself.
  - Re-judging all 196 saved lessons changes one verdict, the known PJ-10 false alarm, which now passes.
- **Later:** a dragged point on a curve a slider moves can be left undrawn (same as before #113). Watch for it in recordings.

### How we got here: the points story

- **Problem (2026-11-15):** to put a point on a graph, the model had to write which slider each point belongs to (`sample_x_numbers`, an index into the outline's numbers).
  - It wrote x positions instead (`[1, 3]` meaning x = 1 and 3), and repeated the mistake on every retry.
  - 2 of 40 lessons in the speed check came out empty. Recordings showed 42 such slips.
- **Fixes that failed review:**
  - #102 repaired the numbers by guessing from the lesson text, which could draw a wrong picture.
  - #105 restricted the field to an enum, which tied points to the wrong slider.
  - #105, narrowed, dropped the field, which let a piecewise function publish as two full lines (PJ-07).
  - #109, a piecewise check, let the wording decide the drawing.
  - #110 re-asked without the field, which published narration about points that were never drawn.
- **The owner's two principles (2026-11-16):**
  1. The model writes meaning, and the program does exact logic.
  2. The program copes with the model's randomness and still ends correct.
  - The advisor's rule, accepted by the owner: wording may trigger a re-ask, never decide what is drawn.
  - The real cause was that the model's intent had nowhere to go.
- **Fix:** decision 0020 (OLL). The model writes points as it means them: `{x, y}` for a fixed point, `{slider}` for a dragged one. Built in Coach #113, reviewed twice, tested, and merged. The two items above turned up during those tests.

---

## L3 · Step 3 of the plan: finish the current stage

**Why here:** the number line and function plot were extended and switched on (2026-11-15). This step clears what that work left behind, then adds 3D, then measures everything once.

- **Done:** 3.1 Re-tag coverage. Pictures fully drawn for 33 of 145 questions, up from 27.
- **Done:** 3.2 Speed check for the two switch-ons: passed. It found the points slip.
- **Done:** 3.3 3D plan written and accepted (OLL decision 0019, amended 2026-11-16 by 0020).
- **Done:** 3.4 No math special cases left outside the math plugin (Coach half). Two small follow-ups (4a, 4b) ride with later changes.
- **Done:** 3.5 Studio uses the same builders: number line and plot marks.
- **Done:** 3.6a The points slip, fixed by #113.
- **Now:** 3.6 Fixes before the re-run. 6e is merged; the judge fix is waiting for merge (L4).
- **Next:** 3.7 Build 3D solids. Built under the "model writes meaning" rule from the start. The paid probe and the speed check are each approved by the owner first.
- **Later:** the rest of 3.6:
  - program checks (stand-in counts, animations that change nothing, wrong arithmetic in praise messages);
  - the outline's "no visual" rule (paid probe);
  - smaller open items 6b to 6d.
- **Later:** 3.5 slice 3, Studio graph forms (after 3D; owner's call, 2026-11-16).
- **Later:** 3.8 One 60-question re-run (paid). Closes this whole stage.

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

- **Merge:** Coach #115, the plot judge fix (evaluation only).
- **Kept:** Coach #79, the card-rule experiment, kept as a record.
- **Waiting:** Coach #81, the program-written practice invitation. Waits until recordings show the problem.
