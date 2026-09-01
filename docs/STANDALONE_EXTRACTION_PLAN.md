# Octos Learn standalone extraction plan

This document defines the controlled extraction of the learning canvas from `octos-web` into the standalone `octos-learn` product. The first release preserves the working lesson behavior. It does not change the OLL language, lesson-generation prompts, model routing, mathematics capabilities, or Octos server APIs.

## Implementation status

As of 2026-09-01:

- Slices 0-4 are implemented on `codex/standalone-product`.
- Slice 5 automated verification is complete: 745 unit tests, lint with no errors, a production build, and two browser smoke tests pass.
- The local Octos server's real `/api/auth/status` endpoint responds successfully.
- The manual release checklist against the real learning-coach service is still required before retiring `/learn` from `octos-web`.
- Slice 6 has not started. The stable `octos-web` implementation remains unchanged.

The pre-pruning entry bundle was 3,945.97 kB (1,103.80 kB gzip) with 390.17 kB of CSS (73.55 kB gzip). The current entry bundle is 3,256.95 kB (917.26 kB gzip) with 330.09 kB of CSS (58.59 kB gzip).

## Release rule

Every slice below must keep the repository buildable and must pass the relevant automated tests before it is committed. A later slice may remove code only after imports and user flows prove that the code is not required by Octos Learn.

## Slice 0: establish the product baseline

Exact issue: the fork still identifies and deploys itself as the general-purpose `octos-web` application.

User-visible result: browser title, installed-app metadata, documentation, package name, and GitHub Pages path identify the product as Octos Learn.

Proof:

- the existing learning and voice regression suite passes;
- `pnpm run build` succeeds;
- generated metadata contains `Octos Learn` and the `/octos-learn/` base path.

## Slice 1: make the learning canvas the product entry point

Exact issue: opening the product currently lands on the Octos home application and exposes unrelated routes.

User-visible result:

- `/` opens the learning canvas;
- existing `/learn` links continue to work through a redirect;
- login and the settings required by learning remain available;
- chat, slides, sites, studio, smart-home, and general voice-assistant routes are no longer reachable.

Proof:

- route tests cover `/`, `/learn`, `/login`, and the retained settings route;
- removed routes fall back to the learning canvas;
- learning-page tests and the production build pass.

## Slice 2: remove unrelated product modules

Exact issue: the repository still ships source code, tests, and assets for products that Octos Learn does not expose.

User-visible result: no visible behavior changes inside the learning canvas; the repository and build contain only the learning product and the shared code it actually uses.

Removal candidates include general chat shells, slides, sites, studio, smart-home, onboarding, and their product-specific tests and assets. Shared auth, sessions, file upload, runtime transport, projections, voice capture, camera capture, markdown/LaTeX rendering, OLL playback, and learning settings are retained.

Proof:

- an import-closure check confirms all retained learning imports resolve;
- searches show no route or production import for removed products;
- unit tests, TypeScript, lint, and production build pass.

## Slice 3: reduce settings and dependencies

Exact issue: the inherited settings application and dependency list expose features unrelated to learning.

User-visible result: settings contain only the controls needed to connect and run Octos Learn: authentication/profile, model and provider credentials, learning skill availability, and voice-related settings used by the canvas.

Dependencies are removed only when both source search and the build prove they are unused.

Proof:

- settings tests cover every retained tab and redirect unknown tabs safely;
- `pnpm install --frozen-lockfile`, lint, unit tests, and build pass;
- the lockfile has no packages used only by deleted products.

## Slice 4: independent development and deployment

Exact issue: the new product must run without relying on the octos-web repository layout.

User-visible result:

- local HTTP and HTTPS commands run Octos Learn directly;
- development proxies `/api` and WebSocket traffic to the Octos server;
- the production build works under both `/` and a configured base path;
- deployment documentation states that production hosting must preserve same-origin API and WebSocket routing.

Proof:

- local production preview loads the learning canvas;
- an automated browser smoke test reaches the product entry point;
- GitHub Pages artifact generation succeeds as a UI preview, while documentation clearly states that live lessons require an Octos backend.

## Slice 5: full regression and handoff

Exact issue: extraction is complete only when the real product path behaves like the stable `/learn` implementation.

User-visible result: text lessons, image questions, handwriting selection assistance, voice input, camera input, lesson playback/replay, multiple course regions, controls, and failure states behave as before.

Proof:

- all retained automated tests pass;
- the agreed Octos Learn E2E checklist passes against a real Octos server and learning-coach;
- bundle contents and size are recorded against the pre-pruning baseline;
- no old `octos-web` route is removed until this release candidate is accepted.

## Slice 6: retire the old entry point

Exact issue: after Octos Learn is accepted, `/learn` in `octos-web` must not silently diverge into a second implementation.

User-visible result: the old application either links to the deployed Octos Learn product or carries a clearly time-bounded compatibility entry, chosen at release time.

Proof:

- the chosen transition is documented in both repositories;
- direct and upgraded-user navigation is tested;
- rollback instructions identify the last stable commits in both repositories.

## Explicitly out of scope for this extraction

- new teaching or visualization capabilities;
- mathematics capability-package extraction;
- OLL or runtime redesign;
- model, prompt, or latency experiments;
- electronic-whiteboard SDK integration;
- automatic migration of browser-local data between different origins.
