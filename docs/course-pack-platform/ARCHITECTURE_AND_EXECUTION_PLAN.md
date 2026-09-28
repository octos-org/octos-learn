# Octos Learn Course Pack Platform

## Architecture and Execution Plan

**Status:** Proposed

**Date:** 2026-09-15

**Scope:** Web, standard Android APK, and Spotlight Android APK

## 1. Decision Summary

Octos Learn will use one product experience and one course player across the
web application and both Android build variants.

Published course packs will live on the server as immutable, versioned
artifacts. The server is the source of truth for course discovery and updates.

The three clients consume those artifacts differently:

| Client | Course pack source | Offline behavior |
| --- | --- | --- |
| Web | Loads the catalog and packs from the server | May reuse browser cache, but permanent offline support is not guaranteed |
| Standard APK | Downloads packs from the server on demand | Downloaded and verified packs remain available offline |
| Spotlight APK | Embeds a locked snapshot of selected server packs at build time | Embedded packs and narration play without login or network access |

The Spotlight APK is not a separate implementation. It is a special build of
the same application, with selected course packs bundled into its assets.

The existing persistent TTS cache is an independent work item and must remain
separate from the course pack platform changes.

Course content, the CoursePack contract, authoring inputs, validation tools,
and publication workflow will be owned by a dedicated repository:

```text
https://github.com/alan0x/octos-course-library
```

This repository will initially remain under the maintainer's personal GitHub
account. Moving it or the related repositories into a shared organization is
explicitly outside the scope of this plan for now.

## 1.1 Repository Boundaries

| Repository | Responsibility |
| --- | --- |
| `octos` | General agent runtime, sessions, profiles, and server infrastructure |
| `octos-learn` | Product UI, launcher, interactive whiteboard, pack download/cache adapters, course instances, and Android builds |
| `octos-lesson-language` | OLL schemas, validation, compilation, and reusable playback runtimes |
| `learning-coach` | Generated lesson planning and OLL authoring assistance |
| `octos-course-library` | Curated course sources, CoursePack contract, pack validator, narration/assets, catalog source, and publication tooling |

The published output of `octos-course-library` is an immutable CoursePack. A
published pack must not depend on `learning-coach`, an Octos server session, or
an authoring environment at playback time.

The initial `octos-course-library` layout should be:

```text
octos-course-library/
|-- packages/
|   `-- course-pack/
|       |-- schema/
|       |-- src/
|       `-- tests/
|-- courses/
|   `-- grade-3-math/
|       |-- course.yaml
|       |-- board.json
|       |-- lesson.oll.jsonl
|       |-- narration/
|       |-- assets/
|       `-- licenses.json
|-- catalog/
|   `-- catalog.source.json
|-- tools/
|   |-- export/
|   |-- validate/
|   |-- preview/
|   `-- publish/
`-- package.json
```

Generated `.ocpack` archives and other release artifacts should be published
to the course pack server or object storage. They should not be committed to
Git by default. Large authoring assets may use Git LFS only when source-level
versioning is required.

## 2. Goals

1. Add a common start page to the web application and Android APKs.
2. Present curated course packs and a **New blank whiteboard** action on that
   page.
3. Keep published course packs on the server as the canonical versions.
4. Allow the standard APK to download and persist course packs for later use.
5. Allow a Spotlight APK to embed explicitly selected versions for reliable
   offline demonstrations.
6. Open a course pack in the normal interactive whiteboard rather than in a
   separate read-only player.
7. Prevent learner changes from modifying the published course template.
8. Validate every pack before publication and every embedded pack before an
   APK can be built.

## 3. Non-Goals

The first implementation will not:

- build a complete in-product course authoring environment;
- turn an unreviewed server session directly into a published course pack;
- guarantee that live AI generation, ASR, camera analysis, or follow-up
  questions work offline;
- silently update a course while a learner is using it;
- maintain a separate Spotlight frontend or a forked course player.

## 4. System Overview

```text
Course creation and review
            |
            v
Course pack exporter and validator
            |
            v
Immutable server course pack releases
            |
            +----------------------+----------------------+
            |                      |                      |
            v                      v                      v
           Web               Standard APK          Spotlight build
      online loading       download + cache       locked download
                                                         |
                                                         v
                                                  APK asset bundle

All paths use the same launcher, course importer, whiteboard, OLL runtime,
camera controller, interaction runtime, and learner-instance model.
```

## 5. User Experience

### 5.1 Routes

The current root route opens the authenticated learning whiteboard directly.
The target routing model is:

| Route | Purpose | Authentication |
| --- | --- | --- |
| `/` | Course start page | Not required for catalog browsing or offline Spotlight playback |
| `/course/:packId` | Resolve a pack version and open or create an instance | Depends on requested capabilities |
| `/board/:sessionId` | Interactive whiteboard instance | Required for normal online sessions |
| `/setup` | First-time learner setup | Required where profile settings are stored remotely |
| `/login` | Authentication | Not applicable |

Existing bookmarks and legacy routes must redirect without losing their query
parameters.

### 5.2 Start Page

The start page contains:

- curated course cards with thumbnail, title, grade, subject, description,
  duration, and capability tags;
- download, update, offline-ready, or embedded status where appropriate;
- a **Start course** or **Continue** action;
- a **Restart course** action for an existing instance;
- a prominent **New blank whiteboard** action;
- a clear offline state that does not block access to available local packs.

The standard APK and web application should preserve the same information
architecture. Android-specific CSS may adjust density without changing the
meaning or ordering of controls.

### 5.3 Authentication Boundary

Recommended initial policy:

- viewing the catalog does not require authentication;
- playing a public prebuilt course does not require authentication;
- creating a normal blank whiteboard requires authentication;
- live AI, ASR, cloud saves, and other server-backed actions require a valid
  account and network connection;
- unavailable online actions fail immediately with an explicit offline message
  instead of waiting for a long network timeout.

This policy must be confirmed before implementation because it affects server
authorization and anonymous instance storage.

## 6. Course Pack Contract

### 6.1 Directory Layout

```text
course-pack/
|-- manifest.json
|-- course.oll.jsonl
|-- board.json
|-- thumbnail.webp
|-- audio/
|   |-- narration-001.mp3
|   `-- narration-002.mp3
`-- assets/
    `-- ...
```

The pack must contain everything required for deterministic base playback.
Remote URLs are not allowed for required playback resources.

### 6.2 Manifest

`manifest.json` should include at least:

```json
{
  "schemaVersion": 1,
  "packId": "grade-3-math-example",
  "version": "1.0.0",
  "title": "Grade 3 Mathematics",
  "description": "A curated interactive mathematics course",
  "subject": "mathematics",
  "grade": "3",
  "durationSeconds": 420,
  "minimumPlayerVersion": "0.2.0",
  "entry": "course.oll.jsonl",
  "board": "board.json",
  "thumbnail": "thumbnail.webp",
  "files": [],
  "licenses": []
}
```

The final schema must also define:

- locale and curriculum metadata;
- capability requirements;
- narration voice and timing metadata;
- file byte length, media type, and SHA-256 digest;
- pack-level digest and signature;
- source attribution and licensing;
- optional authoring provenance that is excluded from runtime identity data.

### 6.3 Immutability

`packId + version` must always identify the same bytes. A correction produces a
new version; it never overwrites a published version.

The catalog can change which version is recommended, but clients with an
existing instance continue using its pinned version until the learner chooses
to update or restart.

### 6.4 Validation

A pack is invalid if any of the following is true:

- the manifest or OLL program does not satisfy its schema;
- the course contains an empty topic or an invalid timeline;
- an action references a missing node, beat, narration, asset, or variable;
- the player does not support a required card or interaction type;
- a required file is missing or has the wrong digest;
- a narration line has no valid local audio file;
- a required resource points to a temporary or remote URL;
- a runtime RPC, task state, user ID, account ID, or server session ID remains;
- the pack requires a newer player than the client provides.

## 7. Server Distribution

The course pack service should expose same-origin endpoints under
`learn.pitun.cc`:

```text
GET /api/learn/course-packs
GET /api/learn/course-packs/:packId/:version/manifest
GET /api/learn/course-packs/:packId/:version/files/:path
```

The catalog response contains metadata and version pointers, not complete
course contents.

Recommended properties:

- immutable URLs for versioned files;
- long-lived cache headers on immutable files;
- short-lived or revalidated caching on the catalog;
- ETag support;
- content length and media type validation;
- signed manifests;
- publication and withdrawal audit records;
- the ability to hide a release from the catalog without deleting its files.

Course packs should not be stored as ordinary learner sessions. Sessions are
mutable, identity-bound user state; published course packs are reviewed,
immutable distribution artifacts.

## 8. Client Storage and Resolution

### 8.1 Shared Interface

The player should depend on a platform-neutral `CoursePackStore` interface,
not directly on HTTP, browser storage, or Android files.

Conceptual operations:

```ts
interface CoursePackStore {
  listAvailable(): Promise<CoursePackSummary[]>;
  resolve(packId: string, version?: string): Promise<ResolvedCoursePack>;
  download(packId: string, version: string): Promise<void>;
  remove(packId: string, version: string): Promise<void>;
  verify(packId: string, version: string): Promise<VerificationResult>;
}
```

### 8.2 Web

The web store reads the server catalog and retrieves immutable resources over
HTTPS. Browser caching is an optimization, not the source of truth. The last
valid catalog may be retained to provide a useful degraded state during a
temporary outage.

### 8.3 Standard Android APK

The standard APK should use a native bridge backed by the application's private
`filesDir`, rather than relying on old Android WebView Cache Storage behavior.

Required behavior:

- download to a temporary directory;
- verify every file before activation;
- atomically rename a complete pack into place;
- retain packs across app upgrades;
- remove incomplete downloads on recovery;
- enforce configurable byte and pack-count limits with LRU eviction;
- never evict a pack used by an active course instance;
- expose local files through the existing trusted HTTPS asset-loading model.

### 8.4 Spotlight Android APK

The Spotlight store first resolves embedded packs, then downloaded packs, then
the server:

```text
embedded pack -> verified downloaded pack -> server
```

An embedded version is never silently replaced. A newer server version may be
shown separately, but the locked demonstration remains reproducible.

## 9. Learner Course Instances

Opening a pack creates or resumes a mutable course instance:

```text
Immutable CoursePack
        |
        v
Mutable CourseInstance
        |-- local/session identifier
        |-- source pack ID and version
        |-- student ink
        |-- playback cursor
        |-- variable and interaction state
        |-- task attempts
        `-- learner-created board content
```

The existing learning session model should be extended with fields such as:

```ts
type LearningSessionSource =
  | { kind: "blank" }
  | { kind: "course-pack"; packId: string; version: string };
```

The course template remains immutable. **Restart course** deletes or resets the
instance state, not the downloaded pack.

The instance must use the existing OLL runtime, whiteboard, camera controller,
ink runtime, layout logic, and course outline. A separate demo player would
duplicate the exact behaviors that have already been tuned for the meeting
display and must not be introduced.

## 10. Spotlight Build

The Android project currently has one application configuration and no product
flavors. Add two release variants:

```text
standardRelease
spotlightRelease
```

Recommended package identities:

```text
cc.pitun.learn
cc.pitun.learn.spotlight
```

Separate IDs allow both applications to be installed on the meeting display at
the same time and prevent a rehearsal build from replacing the standard app.

The Spotlight selection is defined by a committed lock file:

```json
{
  "schemaVersion": 1,
  "packs": [
    {
      "packId": "grade-3-math-example",
      "version": "1.0.0",
      "sha256": "..."
    }
  ]
}
```

The build pipeline must:

1. download exactly the locked versions from the production pack server;
2. verify signatures, digests, schemas, OLL references, assets, and narration;
3. run deterministic playback validation;
4. copy verified packs into the Spotlight Android asset source set;
5. fail if any required resource is missing or network-dependent;
6. record pack versions in build metadata for field diagnostics.

Normal source builds must not accidentally include Spotlight packs.

## 11. Course Authoring and Publication

Existing sessions may be used as authoring inputs but cannot be published
directly.

Proposed workflow:

1. Generate a candidate lesson in a development environment.
2. Export only the board and playback data required by the course.
3. Remove identity, task, RPC, temporary URL, and server-session state.
4. Review and edit topics, narration, cards, positions, focus actions,
   animations, sliders, and practice tasks.
5. Generate final narration audio using the selected production voice.
6. Validate and preview the pack on desktop and Android modes.
7. Play the complete course on the meeting display.
8. Publish an immutable version to the server.
9. Update the Spotlight lock file when the approved version should be embedded.

The first release can use command-line export and validation tools. A visual
course authoring application is a later, independent product decision.

## 12. Offline and Failure Behavior

| Condition | Expected behavior |
| --- | --- |
| Catalog server unavailable | Show embedded and verified local packs immediately |
| Pack download interrupted | Keep the previous valid version; discard the partial download |
| Pack verification fails | Do not expose the pack to the player |
| Embedded Spotlight pack valid | Play without authentication or network requests |
| Live AI requested offline | Fail immediately with a clear offline explanation |
| TTS audio missing in a Spotlight pack | Reject the APK build |
| TTS audio missing in a normal downloaded pack | Reject activation of that pack |
| Pack requires a newer player | Offer an application update; do not attempt playback |

## 13. Security and Licensing

- The APK must not contain service credentials solely to play an embedded
  course.
- Course manifests should be signed; individual files must be content-hashed.
- Paths must be normalized to prevent traversal outside the pack directory.
- HTML or Markdown content must continue through the existing sanitization
  path.
- Published packs must include source and license metadata.
- Third-party curricula or taxonomies must be reviewed for attribution,
  redistribution, and share-alike requirements before publication.

## 14. Implementation Workstreams

Each workstream should be developed and reviewed independently.

### Workstream 1: Course Pack Contract

Repository: `octos-course-library`

Suggested branch: `codex/course-pack-contract`

Deliverables:

- TypeScript types and JSON schemas;
- pack validator;
- path and digest validation;
- one small repository fixture;
- compatibility and failure tests.

Acceptance criteria:

- valid packs load deterministically;
- every invalid reference produces a useful validation error;
- no runtime network request is required for fixture playback.

### Workstream 2: Server Catalog and Publication

Primary repository: `octos-course-library`

Deployment integration: `octos-learn`

Suggested branch: `codex/course-pack-server`

Deliverables:

- catalog and immutable file endpoints;
- publisher command;
- withdrawal mechanism;
- cache headers and audit metadata;
- deployment documentation.

Acceptance criteria:

- published bytes cannot be overwritten under the same version;
- clients can pin and retrieve an older version;
- withdrawn releases disappear from discovery without breaking existing
  instances.

### Workstream 3: Shared Launcher

Repository: `octos-learn`

Suggested branch: `codex/course-launcher`

Deliverables:

- root start page;
- course cards and status states;
- new blank whiteboard entry;
- updated routing and authentication boundaries;
- desktop and Android density tests.

Acceptance criteria:

- web and APK present the same choices;
- offline local courses appear without waiting for the server;
- existing whiteboard links remain valid.

### Workstream 4: Course Instances

Repository: `octos-learn`

Suggested branch: `codex/course-instances`

Deliverables:

- pack-to-instance import;
- source pack identity in learning session records;
- continue, restart, and delete behavior;
- isolated learner state.

Acceptance criteria:

- learner changes never modify the pack;
- separate instances of one pack do not share ink or progress;
- restart reproduces the approved initial board.

### Workstream 5: Android Pack Cache

Repository: `octos-learn`

Suggested branch: `codex/course-pack-android-cache`

Deliverables:

- native pack storage bridge;
- atomic downloads and verification;
- recovery and LRU management;
- APK-upgrade retention tests.

Acceptance criteria:

- a downloaded pack plays after network removal and app restart;
- partial or corrupted packs are never opened;
- application upgrades retain valid packs.

### Workstream 6: Spotlight Build

Repository: `octos-learn`

Suggested branch: `codex/spotlight-build`

Deliverables:

- Android product flavor;
- Spotlight lock file;
- build-time downloader and validator;
- separate package name and application label;
- embedded-pack resolver;
- release checklist.

Acceptance criteria:

- a clean, logged-out, offline device can play every embedded course fully;
- standard builds do not contain Spotlight course assets;
- both APKs can coexist on one device.

## 15. Test and Release Gates

Before a course pack is published or embedded, verify:

- schema and digest validation;
- supported card and interaction types;
- complete narration audio coverage;
- audio decoding;
- all timeline targets and variables;
- no external required assets;
- no runtime RPC dependencies;
- full playback completion;
- restart and resume behavior;
- desktop browser layout;
- Android browser-mode layout;
- physical 4K meeting-display layout and performance;
- camera focus does not over-zoom, clip required cards, or enter excessive
  whitespace;
- controls and cards remain clear of the top toolbar, bottom composer, course
  outline, teacher avatar, and camera preview.

The Spotlight release gate additionally requires three complete offline runs on
the target meeting display after a clean installation.

## 16. Proposed Delivery Order

```text
1. Course pack contract and validator
2. Minimal local pack playback
3. Server catalog and publication
4. Shared start page
5. Mutable course instances
6. Standard APK persistent download cache
7. Spotlight build flavor and locked embedded packs
8. First curated mathematics pack
9. Physical-device rehearsal and release
```

The first mathematics pack should be designed after the course contract is
agreed but before the launcher visual design is finalized. Its contents will
provide the real metadata, interaction, asset, narration, and layout cases that
the platform must support.

## 17. Decisions Required Before Implementation

1. Can anonymous users play public prebuilt courses, or is login always
   required?
2. Does **New blank whiteboard** always require login?
3. Should a standard APK download a full pack on first open, or expose an
   explicit **Download** action?
4. Should course progress sync to the server or remain local in the first
   release?
5. Which online actions remain visible when an embedded course is played
   offline?
6. Should the Spotlight APK use a separate application ID so it can coexist
   with the standard APK?
7. What is the maximum supported pack size and number of cached packs?
8. What signing mechanism and release authority will publish official packs?
9. Which curriculum, grade-semester mapping, and attribution rules apply to the
   first mathematics pack?
10. What exact initial board state and scripted demonstration path should the
    first Spotlight course provide?

## 18. Current Repository Integration Points

The main implementation areas are expected to be:

- `octos-course-library/packages/course-pack/` for the shared manifest contract,
  schemas, validator, and pack reader utilities;
- `octos-course-library/courses/` for reviewed course sources, narration, and
  licensing metadata;
- `octos-course-library/tools/` for export, validation, preview, and immutable
  publication;
- `src/App.tsx` for launcher routing and authentication boundaries;
- `src/learning/learning-session-store.ts` for pack-derived instances;
- `src/learning/learning-workspace.tsx` for loading a packaged OLL program into
  the existing interactive whiteboard;
- `src/learning/oll/` for validation, playback, narration, and compatibility;
- `android/app/build.gradle` for standard and Spotlight product flavors;
- `android/app/src/main/java/cc/pitun/learn/` for persistent native course-pack
  storage and trusted local asset delivery;
- deployment configuration for the server catalog and immutable pack files;
- build scripts for pack download, validation, locking, and asset assembly.

These integration points should be refined during Workstream 1. The course pack
contract must remain independent of React components, Android APIs, server
sessions, and a specific storage backend.

`octos-learn` should consume a versioned release of the CoursePack contract
from `octos-course-library`; it should not copy schema files manually or import
course authoring sources directly. Spotlight builds consume published pack
artifacts selected by their lock file, not the mutable `courses/` working tree.
