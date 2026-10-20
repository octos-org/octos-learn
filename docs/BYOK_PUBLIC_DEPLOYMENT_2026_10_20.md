# BYOK public deployment — 2026-10-20

The user explicitly requested the public upgrade before performing TV E2E.
Deployed application source: `d875d51` on `codex/full-byok`; no main merge.
PR #59 remains Draft. This record supersedes earlier “not deployed” statements.

## Public services

- `https://learn.pitun.cc`: full BYOK frontend, mirrored exclusively with
  `scripts/deploy-public-web.sh`; all 60 referenced JS/CSS assets returned 200.
- Octos: official stable `2.0.3+fca32c4`, replacing `2.0.3-rc.13+d6905a9`.
  Official Linux bundle SHA-256 verified before installation; no Octos patches.
- Existing accounts, profiles, courses and installed Learning Coach retained.
  Existing core authentication token retained with its original value, moved
  from process environment to protected config (`root:octos-learn`, 0640).
- `octos-learn-hosted-tts.service` now runs `services/byok/start.mjs` on 50081
  as the existing service account, with the profile registry read-only.
  `/etc/octos-learn/byok.env` (0600) contains only addresses/paths, no Keys.
- Nginx forwards `/api/learn/byok` to that adapter. Old platform speech/Jev,
  private-ASR proxy and raw client-service routes return 410. The legacy native
  configuration returns `enabled: false`. Legacy hosted-ASR unit is stopped and
  disabled. The separately operated ASR host was not changed.

Verified publicly: health reports `2.0.3+fca32c4`; anonymous BYOK returns 401;
authenticated BYOK metadata succeeds without key fields, ignores forged
`X-Profile-Id`, and returns `cache-control: no-store, max-age=0`. CoursePack and
auth-status endpoints return 200. Browser visibly reaches the email-code login
page, without the temporary passwordless preview mode.

No real supplier calls were triggered during deployment. Disabling platform
routes does not revoke previously issued vendor credentials; no vendor-console
Key rotation was performed in this deployment.

## TV delivery

- Device: M3G2, Android 13 / API 33, `192.168.1.63:5555`.
- Package: `cc.pitun.learn`, 0.1.5 / 36, minimum API 26, v2 APK signature.
- APK: `delivery/byok/2026-10-20/octos-learn-byok-d875d51-public-debug.apk`.
- SHA-256: `fc512eb89dc44a49a908b2e38cd5e3fff8f5b21ac5c85816d25b39f4dee2622c`.
- Installed with `adb install -r`; no user data reset. Installed base APK hash
  matches the artifact. Original APK retained in the same delivery directory.
- Seven `NativeByokStoreTest` instrumented tests passed on the real device,
  using isolated synthetic credentials and test preferences. They cover
  encryption, a new store instance reading persisted data, account isolation,
  logout/deletion, remote replacement, account-save failure and corruption.

This APK uses the normal public origin, with no local service, tunnel or TLS
bypass. Users enter their own Speech Key once on the TV, even if their account
already has a server copy. Real provider ASR/TTS, course narration, actual
process-restart persistence and optional Jev are pending the user's TV E2E.
Android 8.0 real-device acceptance and fresh latency measurements remain pending.

## Backup and rollback

Root-only backup directory on the VPS:
`/opt/octos-learn/backups/byok-cutover-20261020`.
It contains the old binary, Nginx/unit files and web tree, plus an encrypted
data/config archive whose decryption and archive readability were verified.
An additional encrypted mutable-state snapshot was captured with services
stopped immediately before the cutover. Keep its private encryption key out of
logs and Git. Do not overwrite current user data as a routine rollback step.

Rollback must coordinate the old binary, old service unit, old Nginx and web
tree. Restore the old config/env files from the encrypted backup together if
reverting the auth-token move. Re-enable legacy hosted-ASR only when reverting
to the old frontend/routes. Never print secret-bearing config while restoring.
The frontend deployment script also retained `web.bak-pre-deploy`.
