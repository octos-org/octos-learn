# Curated course rehearsal

## Scope

The first vertical slices are `rectangle-area-from-tiles` and
`slope-and-intercept`. The parity-safe build produces explicit-camera `0.1.3`
revisions; immutable `0.1.0`, rejected `0.1.1`, and manually corrected `0.1.2`
releases remain available for comparison.
They are individual candidate lessons with automated
reviews, pending human editorial approval, not yet complete grade-level
collections. Sources, candidate reviews, archives and
narration belong to `octos-course-library`, not this frontend repository.

This branch adds an opt-in development distribution adapter. It exposes the
publisher's public catalog and immutable release paths through the existing
Vite frontend. Other `/api` requests continue to use `OCTOS_API_TARGET`.
No additional backend is required. Publisher audit/source files are not exposed.
The adapter is never included in a production web or Android build.

## Prepare the publication directory

In the course-library authoring checkout, build the candidate course directories
and publish the resulting archives to an operator-owned local directory:

```sh
node scripts/revise-curated-camera.mjs --authoring authoring/rectangle-area-from-tiles/candidates/candidate-005/course.authoring.json --plan authoring/reviews/rectangle-area-explicit-camera-plan.json --source courses/revisions/rectangle-area-from-tiles/0.1.2 --output courses/revisions/rectangle-area-from-tiles/0.1.3 --archive /tmp/rectangle-area-from-tiles-0.1.3.ocpack --version 0.1.3 --player-root /path/to/octos-learn
node scripts/revise-curated-camera.mjs --authoring authoring/slope-and-intercept/candidates/candidate-004/course.authoring.json --plan authoring/reviews/slope-and-intercept-explicit-camera-plan.json --source courses/revisions/slope-and-intercept/0.1.2 --output courses/revisions/slope-and-intercept/0.1.3 --archive /tmp/slope-and-intercept-0.1.3.ocpack --version 0.1.3 --player-root /path/to/octos-learn

pnpm --dir /path/to/octos-learn course-pack:verify-parity -- --archive /tmp/rectangle-area-from-tiles-0.1.3.ocpack
pnpm --dir /path/to/octos-learn course-pack:verify-parity -- --archive /tmp/slope-and-intercept-0.1.3.ocpack

pnpm course-pack:publish publish /tmp/rectangle-area-from-tiles-0.1.3.ocpack --root /tmp/octos-reviewed-course-publication
pnpm course-pack:publish publish /tmp/slope-and-intercept-0.1.3.ocpack --root /tmp/octos-reviewed-course-publication
```

Do not publish a different archive under an existing pack identity/version.
Changing content requires a new version. Camera-only revisions are generated
from the original authoring candidates with exhaustive focus review plans in
`octos-course-library/authoring/reviews/`, without regenerating audio. `0.1.1`
reduced authored focus actions but failed human review because the Runtime still
synthesized focus from Beat composition and boundaries. `0.1.2` proved that a
small explicit focus timeline solved the presentation issue, but its Canonical
events were edited outside the live materialization boundary.

`0.1.3` carries the reviewed Authoring lesson, declares its camera policy and
portable course region in `board.json`, and generates Canonical OLL only by
calling the same materializer used by live lessons. The player rebuilds that
Authoring lesson and rejects the archive unless the complete Canonical event
stream is byte-for-byte identical. Never edit packaged Canonical events
directly. To test a revision, return to the course launcher and select the
`v0.1.3` card; reloading an already-open version URL stays pinned to that
immutable version.

## Manual browser verification

Stop your existing frontend before starting its replacement in your own terminal:

```sh
OCTOS_LOCAL_COURSE_PACK_ROOT=/tmp/octos-reviewed-course-publication OCTOS_LOCAL_OLL_PATH=/tmp/oll-ink-hydration-geometry pnpm exec vite --mode android --host 0.0.0.0
```

Use HTTPS, including when checking the Android presentation on a computer.
For desktop presentation, replace `android` with `local-https`.
Keep the currently running Octos backend; this command starts only the frontend.
Stop it with Ctrl-C. Omit `OCTOS_LOCAL_COURSE_PACK_ROOT` to restore server discovery.

## Automated verification

```sh
OCTOS_LOCAL_COURSE_PACK_ROOT=/tmp/octos-reviewed-course-publication OCTOS_LOCAL_OLL_PATH=/tmp/oll-ink-hydration-geometry pnpm exec playwright test --config playwright.course-packs.config.ts
OCTOS_LOCAL_COURSE_PACK_ROOT=/tmp/octos-reviewed-course-publication OCTOS_LOCAL_OLL_PATH=/tmp/oll-ink-hydration-geometry OCTOS_COURSE_TEST_ANDROID=1 pnpm exec playwright test --config playwright.course-packs.config.ts
```

The test runner owns a temporary HTTPS frontend on port 5175 (desktop) or 5176
(Android mode), rejects reuse of
an existing process, and shuts down its frontend after completion. It does not
launch or stop Octos Server. Non-course APIs are mocked in the browser tests.
Tests cover real archive discovery and integrity, full narration playback,
no online TTS/RPC dependency, cached reopening after course-server failure,
explicit learner instances and ink restoration after return/reload.
Optional live-voice readiness requests receive HTTP 503 throughout playback;
they are not counted as synthesis requests and do not gate packaged narration.
Completion checks also reject intersections between host-rendered controls/tasks
and lesson cards.

Browser audio playback/decode assertions are not a subjective audio review.
Android browser mode is not a substitute for hardware performance checks.

## Ink hydration regression found during integration

The pinned OLL runtime can cache empty content bounds at revision zero before
restoring its saved SVG. Restore suppresses learner command notifications, so
the content revision stays zero and the geometry cache continues reporting no
strokes even though the SVG was loaded. This affects restored count/bounds,
not the integrity of the saved SVG.

A narrow fix lives on OLL branch `codex/ink-hydration-geometry`: invalidate
geometry once after hydration without inventing a learner command or changing
the saved document version. The regression covers empty-cache hydration and
preserves reuse for subsequent non-content notifications. Until that change is
reviewed and pinned, use its development worktree with the existing
`OCTOS_LOCAL_OLL_PATH` option when running the tests or manually checking resume.
The production dependency pin is intentionally unchanged in this branch.

## Host attachment layout regression

Realtime lessons receive a composer question region, but prebuilt lessons do
not. Previously, layout constraints returned early without a question region,
leaving the host slider/task overlay outside deterministic collision layout.
An authored formula below its visual could therefore occupy the same space as
the task overlay.

For a standalone, unplaced lesson, the package now declares a portable course
region and the frontend submits it through the same region-constraint interface
used by composed lessons. It does not derive coordinates from current camera
bounds, move the lesson in response to zoom, or change the generation prompt.
Realtime lessons retain their existing question-region layout and the default
`automatic` camera policy; therefore this integration does not opt live lessons
into the curated package camera behavior.

`reservedWidth: 1300` is a whiteboard-world layout reservation, not a fixed
screen or physical-pixel width. It matches the existing minimum reading width
used by realtime lessons, participates in deterministic flow/collision layout,
and is subsequently scaled by the normal camera to fit the available viewport.

## Remaining release gates

- Human review of both lessons, including teaching accuracy and audio.
- Physical meeting-display playback, focus, controls and handwriting checks.
- Publish approved immutable archives to the production course server.
- Implement a separate locked Spotlight build and verify clean logged-out
  installation with no network, including all narration and interactions.
- Do not merge this branch merely because automated checks pass.

## Integration verification — 2026-09-16

Both suites passed against the real immutable archives, with unrelated backend
APIs mocked unavailable. This is frontend integration verification, not a live
production-server or physical-display test.

| Presentation | Interactive return/reload | Full 13-segment narration | Cached reopening | Host-card collision |
| --- | --- | --- | --- | --- |
| Desktop HTTPS, both lessons | Pass | Pass | Pass | Pass |
| Android-mode HTTPS, both lessons | Pass | Pass | Pass | Pass |

- Desktop browser E2E: 4/4, 6.3 minutes.
- Android-mode browser E2E: 4/4, 5.7 minutes.
- Frontend focused unit suites: 116/116.
- OLL ink-runtime unit suite on the hydration-fix branch: 49/49.
- TypeScript build and focused ESLint passed; the existing component-export
  Fast Refresh warning remains unchanged.
- Completion screenshots were inspected for both lessons. Each narration segment
  decoded and ended; subjective listening/teaching approval remains outstanding.
- Temporary HTTPS ports 5175/5176 stopped after the suites. The operator's
  pre-existing frontend on port 5173 was left running and unchanged.

Working branches remain separate and unmerged:

- `octos-learn`: `codex/first-course-collections-e2e`.
- OLL: `codex/ink-hydration-geometry` (development alias, production pin unchanged).
- Course library: `codex/first-course-collections`.
- Learning coach: `codex/rectangle-unit-square-array`.

No production publication, APK rebuild, commit, push or merge was performed as
part of this integration verification.
