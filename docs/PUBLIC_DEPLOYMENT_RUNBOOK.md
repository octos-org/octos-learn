# Octos Learn public deployment runbook

This runbook deploys the controlled BYOK release on a dedicated Linux VPS and
connects it to the separately operated private ASR service through short-lived
browser grants.

## 1. Server layout

Use a dedicated, non-login service account and keep code, configuration, and
persistent data separate:

```text
/opt/octos-learn/bin/octos          Octos binary
/opt/octos-learn/web/               contents of octos-learn/dist
/etc/octos-learn/config.json        non-secret Octos configuration
/etc/octos-learn/octos-learn.env    SMTP and service secrets (0600)
/var/lib/octos-learn/octos/         users, profiles, sessions, whiteboards
/var/lib/octos-learn/runtime/       process working directory only
```

The Octos process listens only on `127.0.0.1:50080`. Nginx is the only public
listener.

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

Deploy `dist/` and `target/release/octos`; do not run Vite on the VPS.

## 3. Install configuration

1. Copy `deploy/octos/config.json.example` to
   `/etc/octos-learn/config.json`.
2. Copy `deploy/octos/octos-learn.env.example` to
   `/etc/octos-learn/octos-learn.env`.
3. Replace `learn.example.com`, SMTP fields, the SMTP password, the private-ASR
   control URL, and its server-to-server service token.
4. Set `OLL_PROVIDER` and `OLL_MODEL` to the provider and model exposed by this
   deployment. User API keys remain profile-scoped and must not be copied into
   the server environment file.
5. Set `allow_self_registration` to `true` for public email-verified signup.
   Set it to `false` to return to invite-only access. Never add `--solo` on a public server.
6. Create `/var/lib/octos-learn/runtime`, owned by the Octos Learn service
   account with mode `0700`. Do not configure `appui.default_session_cwd` for
   this multi-user deployment. Octos must derive a separate workspace under
   each profile and session so generated lessons remain visible to
   `session/files.list` and isolated from other users.
7. Set ownership to the Octos Learn service account for persistent data. Keep
   the environment file root-owned and mode `0600`.
8. Copy the systemd unit and Nginx configuration, update hostnames and TLS
   paths, then validate them before reload.

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
sudo nginx -t
sudo systemctl reload nginx
curl --fail https://learn.example.com/health
```

Then verify in a private browser window:

1. An uninvited email receives the same public response as an invited email,
   but cannot finish login.
2. An invited email can finish OTP login exactly once and receives its own
   profile.
3. Credentials for the deployment's configured model provider can be saved and
   tested in Settings, then used to generate a lesson. Confirm that
   `OLL_PROVIDER` and `OLL_MODEL` match that Settings option.
4. Refreshing the page preserves the current whiteboard and course history.
5. A second user cannot see the first user's courses, files, or model settings.
6. Enabling voice obtains a one-time ASR grant, creates an Agora session, and
   produces a lesson from the returned final transcript without exposing the
   long-lived service token in browser storage or network responses.
   Confirm the session response sets its HttpOnly cookie with
   `Path=/private-asr/` and the subsequent
   `/private-asr/ws/client/<session-id>` request upgrades with HTTP `101`.
   HTTP `201` from session creation alone is not sufficient: HTTP `403` on the
   event WebSocket usually means the proxy did not translate the trusted Learn
   origin to the ASR control plane origin; HTTP `401` means the session cookie
   was not sent to the WebSocket path.
7. During lesson narration the private-ASR publisher is disabled; after the
   lesson the first intentional utterance is handled exactly once.
8. Send a camera image, confirm its question-card preview and enlarged view
   load, then refresh and check again. The `/api/` and `/private-asr/` proxy
   locations must use `^~`: otherwise the static-asset regex intercepts API
   file URLs ending in `.jpg` or `.png`, returning an Nginx 404 even when the
   uploaded file exists. Confirm an image response is `200 image/jpeg` (or
   `image/png`) and does not receive the static assets' public cache policy.
   Keep configuration backups outside `sites-enabled/`; Nginx may load every
   file there, including `.orig` backups.

## 5. Upgrade and rollback

Before every upgrade, back up `/var/lib/octos-learn/octos` with encryption.
Keep the previous Octos binary and previous web directory next to the new
artifacts. Upgrade the binary and static files without replacing the data
directory, restart Octos, check `/health`, then reload Nginx.

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
