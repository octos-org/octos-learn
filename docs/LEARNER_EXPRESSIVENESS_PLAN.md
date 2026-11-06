# Learner lessons: expressiveness plan

Status: proposal, 2026-11-06. Phase 2 of the teaching-mode plan (accounts, consent, class/family sharing) is postponed; this plan comes first.

## 1. Goal

A child should be able to teach what they actually want to teach, the way they would explain it at a whiteboard, without the studio getting in the way.

Two gaps stand in the way:

1. **The studio does not use what OLL already offers.** About half of OLL's content kinds, actions and task types cannot be produced by recording.
2. **OLL itself is narrow.** It is strongest in algebra, functions, trigonometry and 3D; it has little for the K–8 math most US learners teach (number lines, fractions, data), and only list-like diagrams for science and ELA.

Order of work: first bring the studio up to **everything OLL can already express** (no OLL contract changes), then **extend OLL** where real lessons need it, highest-value first.

### Principles

- **Teach by doing, not by forms.** Everything new is placed and changed on the board by touch, pen or voice; settings are a small tray next to the card, never a form in a side panel. A child should not need to type a function to draw a line.
- **Every new thing must play back.** Each studio feature ships with its compiler mapping, a check that it plays to the same board, and a Playwright recording-to-playback test.
- **OLL keeps correctness.** The studio never invents a renderer of its own; if OLL cannot express it, it goes to section 5, not into a front-end patch.
- **Speed stays a hard gate.** No change may slow the AI lesson's first playable beat (AGENTS.md rule 1); learner features stay behind their own entry and add no model round trips to AI lessons.
- **Kids' privacy.** No learner photos or uploads until accounts and consent exist (postponed Phase 2). Pictures come from a curated library only.

## 2. Where we are (inventory, 2026-11-06)

### 2.1 What the studio can record today

| Area | Studio today |
|---|---|
| Handwriting | Pen, eraser, stroke-by-stroke playback, "Make it neat" (handwriting → typeset math) |
| Pointing | Laser (`point`), highlighter (`emphasize: focus`, ends with `none`), arrows between cards (`connect`, relation always `points_to`) |
| Insert | Function graph (one expression, optional linked variable), coordinate grid (+ points, line through two points, "graph it"), unit circle (θ), box (3D) |
| Moving things | Drag a variable (slider or circle point → `animate`), rotate a 3D scene (→ nearest `view` preset) |
| Card flow | Cards, "Put it next to…", replace/hide ink, order strip (sentences and actions) |
| Practice | "Your turn": one task type (`expression_target`), only for unit-circle θ / sin / cos |

### 2.2 OLL capabilities the studio never produces

| OLL feature | Notes |
|---|---|
| `text`, `note` nodes | No typed or spoken text card at all; non-math lessons are ink only |
| `table` | Rows and columns of text or math |
| `diagram` | Sequences (`sequence`), elements, edges and regions |
| `image` with `regions` | Pictures with labelled, pointable regions (needs a curated library) |
| `shape` | Basic shapes and labels |
| `math` written directly | Only reachable through handwriting + "Make it neat"; no step-by-step `revise` of a working line |
| `geometry` beyond grid/unit circle | Circles, segments, arcs/angles, hidden construction points, regular polygons with measurements, generic `angle_control` points |
| `plot` beyond one curve | Several curves, implicit curves (circles, ellipses), guides (`x = a` lines), parameters on sliders (`(x-h)^2+k`) |
| `scene3d` beyond box | Sphere, cylinder, cone, surface `z=f(x,y)`, implicit surface, sections (with intersections, slider-bound), point/edge/face highlights on any solid, `view: show <part>` |
| `emphasize` kinds | Only `focus`/`none`; never `supporting`, `warning`, `resolved` |
| `connect` relations and labels | Always `points_to`, no labels |
| `group`, `focus` targets | No grouping ("these three cards are one idea") |
| `teacher.expression` | Never used, though the presenter characters could show it (`encouraging`, `careful`, `celebrating`) |
| `lesson.variables` with sliders | Only created implicitly by the unit circle/graph; no "make this number a slider" |
| Tasks | Never `numeric_answer` (answer entry) or `scene3d_view_target`; `expression_target` only for the unit circle |
| Placement | Only "next to"; never `below`, `above`, `inside`, `overlay` |

### 2.3 Gaps already found in the user's recordings

- Worked solutions spread over cards instead of growing in one place ("growing card", agreed 2026-11-05).
- Handwriting shrunk into a narrow column instead of kept at drawn size.
- No live preview of an arrow or ink while recording.
- "Your turn" only works with the unit circle.
- Lesson 5 (water cycle): drawing alone is slow for a non-math lesson; no text, labels, pictures or sequence.

## 3. Phase 0 — finish what is open (before the plan starts)

| Item | State |
|---|---|
| OLL PR alan0x/octos-lesson-language#29 (ink stroke by stroke, words-only beats, continuous pace) | Open, 407/407 tests |
| App PR octos-org/octos-learn#123 (recorded order, order strip, 3-step setup, character voices, wordless-card flag) | Open, 1902/1902 unit, 6/6 Playwright |
| Re-record the lessons that have no captions or no sentence timing | User |
| Verify the new Gemini key with one model feature (Octo's question or Check) | Next model call |
| Course Playwright specs need `learn.pitun.cc` reachable (TLS fails through the local proxy) or `OCTOS_TEST_COURSE_CACHE` | Environment |

## 4. Phase A — the studio reaches OLL parity (no OLL contract change)

Ordered by how much each unlocks for real lessons. Each item lists the studio interaction, the OLL it compiles to, and how it is accepted.

### A1. Growing card and better handwriting (agreed)

- One card that later cards **add to**: math lines in a worked solution stay in one card, aligned at `=`; later cards `revise` it instead of creating new cards. Camera follows the newest line.
- Handwriting kept at the **size and place it was drawn**, not shrunk into a ~340 px column.
- Live preview of an arrow and of ink while recording.
- OLL: `board.revise` of `math` and `ink` (already allowed); layout uses existing teaching layout.
- Accept: lesson 2 (3x + 5 = 20) recorded as one growing card plays back aligned on 1366×768 and 1920×1080, Beat text ≥ 12.5 px.

### A2. Words on the board: text, notes, tables

- **Text card**: say it or type it. "Write what I just said" turns the last sentence into a text card (no model call: it is the learner's own caption). Pen-to-text is a later option.
- **Note card**: a short conclusion/tip with a role (`conclusion`, `warning`, `summary`), shown in its role's style.
- **Table card**: pick rows × columns, tap a cell to type or say; cells can be math.
- OLL: `write` `text` / `note` / `table`; `revise` to fill a cell during a later sentence.
- Accept: lesson 5 (water cycle) and an ELA lesson (e.g. "what makes a complete sentence") recordable without drawing.

### A3. Diagrams

- **Steps / cycle**: add boxes in order (type or say each), they appear one by one as you talk; cycles close back to the first.
- **Links**: tap two boxes to connect them, optionally say a label.
- OLL: `diagram` with `sequence` / `elements` + `edges`; `revise` to add a box; `connect` inside a diagram.
- Accept: water cycle as a 4-box cycle; a food chain; story structure (beginning–middle–end).

### A4. Full 2D math: geometry and graphs

- **Geometry tray**: circle, segment, angle (arc + label), regular polygon (sides on a slider, show perimeter/diameter), hidden construction points; tap points on the grid to build them.
- **Graph tray**: add a second curve; a circle/ellipse (implicit curve); vertical/horizontal guide lines; **"make this number a slider"** on any number in the expression (`a`, `h`, `k`) so the learner drags it while talking.
- OLL: `geometry` circles/segments/arcs/regular polygons/bindings/`angle_control`; `plot` curves (several, implicit), guides, variable-reading expressions; `lesson.variables` with `control: slider`.
- Accept: slope lesson with a slider for m; vertex form (h, k sliders); "inscribed polygons approach the circle" (sides slider).

### A5. Full 3D

- Sphere, cylinder, cone; surface `z = f(x, y)`; a cutting plane with a slider (show the cross-section); tap an edge/face/vertex on any solid to highlight it; "turn to show this part".
- OLL: `scene3d` objects, `sections` (`plane_and_intersection`, bound to a variable), `highlights` (`shown: when_emphasized`), `scene3d.view` `show`.
- Accept: cylinder volume with a moving cross-section; cone vs cylinder.

### A6. Pointing, grouping and the presenter

- Highlighter colours by meaning: **important** (`focus`), **also look** (`supporting`), **careful!** (`warning`), **done ✓** (`resolved`). Shape and icon, not colour alone.
- Arrows with a spoken or typed label; relation chosen from a few kid words ("leads to", "same as", "because").
- **Group**: lasso cards into one idea with a title.
- **Presenter expression**: a reaction button (😊 encouraging, 🤔 careful, 🎉 celebrating) recorded at that moment; the character shows it in playback.
- Placement: "below", "above", "inside" (callout on a figure), besides "next to".
- OLL: `emphasize` kinds, `connect.relation/label`, `board.group`, `teacher.expression`, placement relations.

### A7. "Your turn" for everything OLL can check

- **Answer entry**: any card can end with "What is …?"; the learner types the answer (number, fraction, mixed number) and optional unit and hints; the viewer answers after the lesson. (`numeric_answer`, anchored to the card.)
- **Move it to …**: for any slider variable (not only θ): demonstrate the target by dragging, then say the hint. (`expression_target` on any variable/expression.)
- **Turn the shape to see …**: for any 3D scene. (`scene3d_view_target`.)
- Accept: one practice of each kind recorded, completed by a viewer in playback, retries and hints work.

### Phase A acceptance

- A coverage matrix (OLL feature × studio) with every row in 2.2 either supported or explicitly deferred with a reason.
- Ten guide lessons recorded end to end (the five existing + water cycle without drawing, food chain, ELA sentence, vertex form, cylinder volume), each with a Playwright recording-to-playback test.
- Kids' usability pass: each new tool reachable in ≤ 2 taps from the dock, works by touch and pen, keyboard-accessible, captions always on.

## 5. Phase B — extend OLL where lessons need it

Each extension: an OLL decision record, schema + reducer + web runtime + headless golden, capability flag and execution-version gate, then the studio tool. AI lessons gain them too, but only after the speed gate passes. Ordered by expected value for US K–12 learners.

| # | Extension | Why | Sketch |
|---|---|---|---|
| B1 | **Number line** | K–8 core: integers, fractions, inequalities, jumps | `number_line` node: range, ticks, labelled points, jumps (arcs with labels), open/closed intervals; points bindable to variables (today the example `learner-context-number-line-v2` fakes one with a `diagram`) |
| B2 | **Fraction and area models** | Grades 3–6 fractions, multiplication | `fraction_model`: bar/circle/area partitions, shaded parts, compare two; `array`/area model for multiplication |
| B3 | **Data charts** | Statistics strand; science data | `chart`: bar, line, dot plot, pictograph, tally from a small data table; values editable during the lesson (`revise`) |
| B4 | **More task kinds** | Practice beyond numbers | `choice` (pick one/many), `order` (put steps in order), `match` (pairs), `label` (drag labels onto image regions or diagram boxes); all checked by the runtime, no scripts |
| B5 | **Picture library + free labels** | Science, geography, ELA | Curated, licence-clean picture set with predefined regions (`image` + `regions` already exist); add free-positioned labels/arrows on a picture; no learner uploads until Phase 2 |
| B6 | **Free-layout diagram** | Concept maps, cycles drawn as cycles, force diagrams | Diagram elements with relative positions (grid cells), not just a sequence; edges with labels and arrowheads |
| B7 | **Timeline** | History, story order, science processes | `timeline`: events with dates or order, eras as bands |
| B8 | **Geometry constructions and transformations** | Grades 6–10 geometry | Polygons by vertices, perpendicular/parallel through a point, translate/rotate/reflect with a slider, measured lengths/angles |
| B9 | **Units and measuring tools** | Measurement strand | Ruler/protractor overlays that read a value onto the board |

Recommended order: B1 → B4 (choice/order) → B2 → B3 → B5 → B6 → B7 → B8 → B9, revisited after Phase A shows what kids actually reach for.

## 6. Sequencing

```text
Phase 0 (merge, re-record, key check)
  └─▶ A1 growing card ─▶ A2 text/notes/tables ─▶ A3 diagrams ─▶ A7 your turn
                         └─▶ A4 2D math ─▶ A5 3D ─▶ A6 pointing/group/presenter
                                                      └─▶ Phase A acceptance
                                                            └─▶ B1 … B9 (one at a time, OLL first, then studio)
```

A2–A3 come early because they open non-math subjects at once; A4–A5 deepen math. A7 is pulled forward as soon as A2 lands (answer entry needs only a card).

## 7. Measures

- **Coverage:** share of OLL features the studio can produce (today ≈ half; Phase A target: all, or deferred with reason).
- **Reach:** guide lessons recordable without workarounds (today 4 of 5; target 10, then per-subject sets in Phase B).
- **Effort:** time to record each guide lesson and number of undo/discard per card, from the studio's own events.
- **Playback fidelity:** every recorded lesson plays to the same board (existing check), Beat text ≥ 12.5 px at 1366×768 and 1920×1080.
- **Speed:** AI lesson first-beat p50 unchanged (zero new model round trips).

## 8. Risks

| Risk | Response |
|---|---|
| The dock becomes a toolbox kids can't navigate | One "Put in" library with pictures and search; recent items first; trays appear next to the card only when it is selected |
| Typing is hard for young kids | Every text field also takes the last spoken sentence; pen-to-text later |
| OLL changes ripple into AI lessons | Capability flags and execution-version gates; goldens; AI lessons adopt a feature only after a separate speed check |
| Picture library licensing | Build from public-domain/CC0 sets or commissioned art; record the source per picture |
| Scope creep | Phase A is strictly "what OLL already has"; anything else waits for a Phase B decision record |

## 9. Decisions needed

| # | Question | Recommendation |
|---|---|---|
| E1 | Which subjects beyond math first? | Science (cycles, processes, labelled pictures), then ELA; social studies with timelines later |
| E2 | Grade focus for Phase B math | Grades 3–8 first (number lines, fractions, data), since most learner-teachers are in that range |
| E3 | Pictures | Curated library only until accounts/consent exist; no uploads, no camera photos |
| E4 | Text input for young kids | Speak-to-text from the learner's own captions by default; keyboard as alternative |
| E5 | Should AI lessons adopt Phase B kinds at the same time? | Only after each passes the speed gate, as a separate change |
