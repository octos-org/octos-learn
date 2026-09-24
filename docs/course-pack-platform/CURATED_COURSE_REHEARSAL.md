# Curated course rehearsal

## Scope

The first vertical slices are `rectangle-area-from-tiles` and
`slope-and-intercept`. The current reviewed local revisions are immutable
`0.1.5` CoursePacks; earlier releases remain available for comparison.
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

In the course-library authoring checkout, validate the existing `0.1.5`
revisions, build archives outside their source directories, and publish only to
an operator-owned local review directory:

```sh
pnpm course-pack:verify-camera
pnpm course-pack build courses/revisions/rectangle-area-from-tiles/0.1.5 --out /tmp/rectangle-area-from-tiles-0.1.5.ocpack
pnpm course-pack build courses/revisions/slope-and-intercept/0.1.5 --out /tmp/slope-and-intercept-0.1.5.ocpack
pnpm --dir /path/to/octos-learn course-pack:verify-parity -- --archive /tmp/rectangle-area-from-tiles-0.1.5.ocpack
pnpm --dir /path/to/octos-learn course-pack:verify-parity -- --archive /tmp/slope-and-intercept-0.1.5.ocpack
pnpm course-pack:publish publish /tmp/rectangle-area-from-tiles-0.1.5.ocpack --root /tmp/octos-reviewed-course-publication
pnpm course-pack:publish publish /tmp/slope-and-intercept-0.1.5.ocpack --root /tmp/octos-reviewed-course-publication
```

Do not publish a different archive under an existing pack identity/version.
Changing content requires a new version. Revisions are generated from the
reviewed Authoring candidates with exhaustive `board.focus` review plans in
`octos-course-library/authoring/reviews/`, without regenerating audio. These
focus actions are teaching intent shared by prebuilt and live lessons; the
player always uses the same automatic camera semantics. Historical archives
may contain `playback.camera-policy` metadata, but the player ignores it and
new publication tools do not emit it. The portable course region remains in
`board.json`. The player rebuilds the Authoring lesson and rejects the archive
unless its Canonical event stream is byte-for-byte identical. Never edit
packaged Canonical events directly or replace an existing immutable version.

## Manual browser verification

Stop your existing frontend before starting its replacement in your own terminal:

```sh
OCTOS_LOCAL_COURSE_PACK_ROOT=/tmp/octos-reviewed-course-publication pnpm exec vite --mode android --host 0.0.0.0
```

Use HTTPS, including when checking the Android presentation on a computer.
For desktop presentation, replace `android` with `local-https`.
Keep the currently running Octos backend; this command starts only the frontend.
Stop it with Ctrl-C. Omit `OCTOS_LOCAL_COURSE_PACK_ROOT` to restore server discovery.

## Automated verification

```sh
OCTOS_LOCAL_COURSE_PACK_ROOT=/tmp/octos-reviewed-course-publication pnpm exec playwright test --config playwright.course-packs.config.ts
OCTOS_LOCAL_COURSE_PACK_ROOT=/tmp/octos-reviewed-course-publication OCTOS_COURSE_TEST_ANDROID=1 pnpm exec playwright test --config playwright.course-packs.config.ts
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

An older OLL runtime could cache empty content bounds at revision zero before
restoring its saved SVG. Restore suppresses learner command notifications, so
the content revision stays zero and the geometry cache continues reporting no
strokes even though the SVG was loaded. This affects restored count/bounds,
not the integrity of the saved SVG.

The fix invalidates geometry once after hydration without inventing a learner
command or changing the saved document version. Keep the return/reload browser
regression when updating the OLL dependency.

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
Realtime lessons retain their existing question-region layout. Both sources
use the same automatic camera behavior.

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
