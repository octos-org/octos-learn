# Octos Learn

Octos Learn is an AI learning canvas that turns a learner's question, speech, camera image, or handwriting selection into an interactive lesson on an infinite whiteboard.

The frontend connects to an [Octos](https://github.com/octos-org/octos) server
and uses the product-owned
[learning-coach](https://github.com/octos-org/learning-coach) runtime plus
[Octos Lesson Language](https://github.com/octos-org/octos-lesson-language) to
generate and play deterministic lesson visuals. Learning Coach is built into
the deployed product; end users do not install or manage it.

## Current scope

This repository is the standalone Octos Learn product. The initial extraction
from `octos-web` is complete, and the public deployment is available at
[learn.pitun.cc](https://learn.pitun.cc). The extraction history remains in
[docs/STANDALONE_EXTRACTION_PLAN.md](docs/STANDALONE_EXTRACTION_PLAN.md).

## Requirements

- Node.js 22 or newer
- pnpm 11.5.2
- a running Octos server that provides the built-in `learning-coach` runtime
  through `OCTOS_SKILLS_PATH`

## Develop locally

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Run the normal development server:

```bash
pnpm dev
```

For microphone and camera testing on another device, create the local HTTPS certificate once and start the HTTPS server:

```bash
pnpm setup:https
pnpm dev:https
```

The Vite development server proxies `/api` and WebSocket requests to the Octos server. The default target is `http://127.0.0.1:50080`. To use a different server, copy `.env.example` to `.env.local` and change `OCTOS_API_TARGET`.

## Verify changes

```bash
pnpm test:unit
pnpm lint
pnpm build
```

Before a release, run the [product E2E checklist](docs/RELEASE_E2E_CHECKLIST.md)
against a real Octos server and its built-in Learning Coach runtime.

## Production hosting

`pnpm build` creates the static frontend in `dist/`. A live deployment must
route the frontend, `/api`, and the Octos WebSocket endpoint through the same
public origin. The GitHub Pages workflow is useful for reviewing the static UI,
but it does not provide the Octos backend required to generate lessons. See the
[public deployment runbook](docs/PUBLIC_DEPLOYMENT_RUNBOOK.md) for the complete
server layout, configuration, verification, upgrade, and rollback process.

## Documentation

The [documentation index](docs/README.md) separates current operating guides
from historical design plans.

## Related repositories

- [octos](https://github.com/octos-org/octos): server, sessions, model providers, and skill runtime
- [learning-coach](https://github.com/octos-org/learning-coach): lesson planning and compilation skill
- [octos-lesson-language](https://github.com/octos-org/octos-lesson-language): lesson language and player/runtime contracts
