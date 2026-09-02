# Octos Learn public deployment runbook

This runbook deploys the controlled BYOK release on a dedicated Linux VPS. It
does not deploy the private ASR integration; the `/private-asr` route remains a
disabled placeholder until short-lived service authorization is implemented.

## 1. Server layout

Use a dedicated, non-login service account and keep code, configuration, and
persistent data separate:

```text
/opt/octos-learn/bin/octos          Octos binary
/opt/octos-learn/web/               contents of octos-learn/dist
/etc/octos-learn/config.json        non-secret Octos configuration
/etc/octos-learn/octos-learn.env    SMTP and service secrets (0600)
/var/lib/octos-learn/octos/         users, profiles, sessions, whiteboards
/var/lib/octos-learn/workspace/     runtime workspace
```

The Octos process listens only on `127.0.0.1:50080`. Nginx is the only public
listener.

## 2. Build artifacts

Build the web application from a clean `octos-learn` checkout:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
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
3. Replace `learn.example.com`, SMTP fields, and the SMTP password.
4. Keep `allow_self_registration` set to `false` and do not add `--solo`.
5. Set ownership to the Octos Learn service account for persistent data. Keep
   the environment file root-owned and mode `0600`.
6. Copy the systemd unit and Nginx configuration, update hostnames and TLS
   paths, then validate them before reload.

The first administrator must already exist in the Octos data directory. After
login, manage invitations at **Settings → Access → Authentication → Allowed
Emails**. Adding an email authorizes its first OTP login; it does not store a
password or a model key.

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
3. Gemini or Ark credentials saved in Settings can be tested and used to
   generate a lesson.
4. Refreshing the page preserves the current whiteboard and course history.
5. A second user cannot see the first user's courses, files, or model settings.

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
  Bridge secret, or shared operator token into the public frontend.
