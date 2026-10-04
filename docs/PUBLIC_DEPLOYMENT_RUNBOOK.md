# Octos Learn public deployment runbook

This runbook deploys the public BYOK release on a dedicated Linux VPS. It uses
email-verified self-registration and connects to the separately operated
private ASR service through short-lived browser grants.

## 1. Server layout

Use a dedicated, non-login service account and keep code, configuration, and
persistent data separate:

```text
/opt/octos-learn/bin/octos          Octos binary
/opt/octos-learn/web/               contents of octos-learn/dist
/opt/octos-learn/skills/learning-coach/  product-owned learning runtime
/opt/octos-learn/services/hosted-tts/    optional public hosted-TTS service
/opt/octos-learn/course-packs/           reviewed immutable CoursePack releases
/etc/octos-learn/config.json        non-secret Octos configuration
/etc/octos-learn/octos-learn.env    SMTP and service secrets (0600)
/etc/octos-learn/hosted-tts.env     platform TTS credential (0600)
/var/lib/octos-learn/hosted-tts/audio-cache/  private persistent narration cache
/var/lib/octos-learn/octos/         users, profiles, sessions, whiteboards
/var/lib/octos-learn/hosted-tts/    hosted-TTS quota and usage database
/var/lib/octos-learn/runtime/       process working directory only
```

The Octos process listens only on `127.0.0.1:50080`; the optional hosted-TTS
service listens only on `127.0.0.1:50081`. Nginx is the only public listener.

## 2. Build artifacts

Build the web application from a clean `octos-learn` checkout:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build:public
```

Build Octos from a clean `octos` checkout. The `api` feature is required for
`octos serve`:

```bash
cargo build --release -p octos-cli --features api
```

Deploy `dist/` and `target/release/octos`; do not run Vite on the VPS. For a
public release with platform-funded narration, also deploy
`services/hosted-tts/` unchanged. It uses only Node.js built-ins and does not
require `npm install`.

CoursePacks are published separately from the web build. Build and validate
them from a clean `octos-course-library` checkout, then run its publication CLI
against `/opt/octos-learn/course-packs`. Never copy an unreviewed source
directory or an Octos learner session into this public location. The
publication procedure is documented in the library's
`docs/SERVER_PUBLISHING.md`.

## 3. Install configuration

1. Copy `deploy/octos/config.json.example` to
   `/etc/octos-learn/config.json`.
2. Copy `deploy/octos/octos-learn.env.example` to
   `/etc/octos-learn/octos-learn.env`.
3. Replace `learn.example.com`, SMTP fields, the SMTP password, the private-ASR
   control URL, and its server-to-server service token.
4. Deploy the tested `learning-coach` package to
   `/opt/octos-learn/skills/learning-coach`, keep it root-owned and executable,
   and set `OCTOS_SKILLS_PATH=/opt/octos-learn/skills`. Do not install a copy in
   each user's profile: this is a product runtime dependency, not a user-managed
   extension.
5. Each user selects the lesson model in Settings. Do not set `OLL_PROVIDER`
   or `OLL_MODEL` in the product service environment. User model API keys
   remain profile-scoped. Verify that the service environment contains no
   `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `VERTEX_*`, or `OCTOS_AUTH_TOKEN`;
   administrator tokens belong in the server `config.json`.
6. Set `allow_self_registration` to `true` for public email-verified signup.
   Set it to `false` to return to invite-only access. Never add `--solo` on a public server.
7. Create `/var/lib/octos-learn/runtime`, owned by the Octos Learn service
   account with mode `0700`. Do not configure `appui.default_session_cwd` for
   this multi-user deployment. Octos must derive a separate workspace under
   each profile and session so generated lessons remain visible to
   `session/files.list` and isolated from other users.
8. Set ownership to the Octos Learn service account for persistent data. Keep
   the environment file root-owned and mode `0600`.
9. Copy the systemd unit and Nginx configuration, update hostnames and TLS
   paths, then validate them before reload. The hosted Learn proxy should return
   `404` for `/api/my/profile/skills` and `/api/my/profile/skills/*`; the generic
   Octos backend retains those routes for other products, but Octos Learn does
   not expose user Skill installation.
10. Optional hosted narration: copy `deploy/hosted-tts/hosted-tts.env.example`
    to `/etc/octos-learn/hosted-tts.env`, fill the dedicated platform TTS
    credential, and keep it root-owned mode `0600`. Install
    `deploy/systemd/octos-learn-hosted-tts.service.example`; create
    `/var/lib/octos-learn/hosted-tts` owned by the service account. Do not place
    this credential in the Octos environment or an administrator profile.
    The temporary public deployment policy (2026-10-04) explicitly sets
    `OCTOS_LEARN_TTS_PLATFORM_TOKEN_DISTRIBUTE=1` to preserve Android direct
    synthesis and avoid the Singapore audio round trip. Preserve this value
    when upgrading the service, then verify native narration after restart;
    do not replace the existing environment file with an unfilled example.
    This opt-in distributes the shared platform credential to authenticated
    clients outside hosted quota enforcement. See
    [the TTS policy](PUBLIC_ONBOARDING_AND_TTS.md) before changing it.
11. For CoursePacks, create `/opt/octos-learn/course-packs` on the publication
    filesystem, owned by a dedicated operator or the non-login service
    account. Nginx needs read/traverse access to `catalog.json` and
    `releases/`, including `/opt` and `/opt/octos-learn` parent directories;
    the publisher keeps `catalog.source.json` and `audit.ndjson` mode `0600`.
    The example Nginx config exposes only the public catalog and releases,
    ahead of the generic `/api/` proxy. Do not enable directory indexing or
    point the alias at the entire CoursePack root. Run the library publisher's
    `init` command once so an empty `200` catalog exists before the first
    approved release.

The first administrator must already exist in the Octos data directory. After
login, public registration admits a new user after email verification; it does
not grant administrator privileges or copy model credentials. In invite-only
mode, manage invitations at **Settings → Access → Authentication → Allowed
Emails**. See [Public onboarding and platform TTS](PUBLIC_ONBOARDING_AND_TTS.md)
for setup cards, optional services, shared voice budgets, and migration.

## 4. Start and verify

After installing the unit:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now octos-learn
curl --fail http://127.0.0.1:50080/health
sudo systemctl enable --now octos-learn-hosted-tts
curl --fail http://127.0.0.1:50081/health
sudo nginx -t
sudo systemctl reload nginx
curl --fail https://learn.example.com/health
```

Then verify in a private browser window:

1. With `allow_self_registration=true`, a new email can complete OTP login and
   receives one normal user account and one isolated profile. It must not gain
   administrator access or inherit another user's credentials.
2. A second new email receives a different profile and cannot see the first
   user's courses, files, handwriting, images, or model settings. If the server
   is deliberately returned to invite-only mode, separately verify that an
   uninvited email cannot finish registration.
3. Save and test a user-owned Gemini key and primary model in Settings, then
   generate a lesson. Verify the trace uses that model and `route_source=profile`.
   Change the saved model and confirm the next lesson follows the new selection;
   an in-flight lesson keeps its original model.
4. A newly registered user can generate a lesson without installing
   `learning-coach`; Settings has no Skills page and the hosted user Skill API
   returns `404`.
5. Refreshing the page preserves the current whiteboard and course history.
6. A second user cannot see the first user's courses, files, or model settings.
7. Without personal TTS, narration uses the hosted pool and increments only
   that user's usage. With personal TTS configured, narration uses the personal
   route and hosted usage does not increase. A normal user cannot update limits
   or read platform-wide usage.
8. Enabling voice obtains a one-time ASR grant, creates an Agora session, and
   produces a lesson from the returned final transcript without exposing the
   long-lived service token in browser storage or network responses.
   Confirm the session response sets its HttpOnly cookie with
   `Path=/private-asr/` and the subsequent
   `/private-asr/ws/client/<session-id>` request upgrades with HTTP `101`.
   HTTP `201` from session creation alone is not sufficient: HTTP `403` on the
   event WebSocket usually means the proxy did not translate the trusted Learn
   origin to the ASR control plane origin; HTTP `401` means the session cookie
   was not sent to the WebSocket path.
9. During lesson narration the private-ASR publisher is disabled; after the
   lesson the first intentional utterance is handled exactly once.
10. Send a camera image, confirm its question-card preview and enlarged view
   load, then refresh and check again. The `/api/` and `/private-asr/` proxy
   locations must use `^~`: otherwise the static-asset regex intercepts API
   file URLs ending in `.jpg` or `.png`, returning an Nginx 404 even when the
   uploaded file exists. Confirm an image response is `200 image/jpeg` (or
   `image/png`) and does not receive the static assets' public cache policy.
   Keep configuration backups outside `sites-enabled/`; Nginx may load every
   file there, including `.orig` backups.
11. After publishing a reviewed CoursePack, confirm its catalog metadata,
    archive digest, file URLs, cache headers, and pinned older-version URL.
    A withdrawn version should disappear from the catalog but remain
    byte-identical at its immutable archive URL.

## 5. Upgrade and rollback

For the web frontend, use `scripts/deploy-public-web.sh` from a clean
`octos-learn` checkout after `pnpm build:public`. It mirrors `dist/` onto the
server with `rsync --delete` (via `sudo rsync` so root-owned files can be
replaced), keeps a single `web.bak-pre-deploy` rollback directory, and then
verifies that every referenced asset in `dist/` returns `200` on the public
URL — this catches partial deploys (e.g. `index.html` uploaded without its JS
chunks) immediately. Use `--verify` to re-check without deploying.

Before every upgrade, back up `/var/lib/octos-learn/octos` and
`/var/lib/octos-learn/hosted-tts` with encryption. Back up the root-only
hosted-TTS environment separately; never place it in source control.
Keep the previous Octos binary and previous web directory next to the new
artifacts. Upgrade the binary, static files and hosted-TTS service source
without replacing either data directory. Restart both services, check both
loopback health endpoints, then reload Nginx.

Keep skill rollback copies outside every directory named by
`OCTOS_SKILLS_PATH`. Each immediate child containing `manifest.json` is scanned
as an active skill, regardless of suffixes such as `.rollback` or `.backup`.
Two children declaring the same manifest ID make Octos reject that skill
entirely. For this deployment, store Learning Coach rollback copies under
`/opt/octos-learn/backups/skills/`, never alongside the active
`/opt/octos-learn/skills/learning-coach/` directory. Before restarting, verify
that the active root contains exactly one Learning Coach manifest:

```bash
find /opt/octos-learn/skills -mindepth 2 -maxdepth 2 -name manifest.json -print
```

If verification fails, restore the previous binary and web directory and
restart the service. Do not roll back or overwrite the data directory unless a
documented data migration explicitly requires it.

## 6. Operational checks

- Alert when disk usage exceeds 75%, the Octos service restarts repeatedly, or
  `/health` fails.
- Search logs after every release for credential-shaped values. API keys,
  session tokens, OTP codes, and SMTP passwords must not appear.
- Keep ports other than SSH, HTTP, and HTTPS closed at the firewall.
- Keep the existing Agora service independent. Do not copy its App Certificate,
  Bridge secret, service token, or shared operator token into the public
  frontend. The service token belongs only in Octos's root-owned environment
  file.

The profile-model lesson change requires Learning Coach commit `a37c9eb` or later
(on `codex/profile-model-lessons` until reviewed). The code is not yet deployed.
For startup-pinned local profiles, saved model changes require a service restart.


For the profile-model feature, upgrade **Octos → Learning Coach → frontend**.
Remove `OLL_*` at any time; profile-mode Coach ignores these overrides. Before
upgrading Octos, confirm the actual live commit: this branch starts at
`ae230ce0`; an older deployed version also brings intervening upstream changes,
which need a separate review. The feature itself only needs an Octos that
includes #2227 (`25ff2734`), which exports the profile model to skills.

Strict BYOK is a deployment requirement, not Octos code: Octos falls back to
the service process environment when a profile has no key. The service
environment must therefore contain no model credentials (`GEMINI_API_KEY`,
`GOOGLE_API_KEY`, `VERTEX_*`, `OPENAI_API_KEY`, ...) and no `OCTOS_AUTH_TOKEN`
(keep the admin token in `config.json`). Check this before every start.
