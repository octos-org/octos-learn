#!/usr/bin/env bash
# Deploy the public web build (dist/) to the VPS as a complete mirror of the
# local dist, then verify that every asset referenced by the served
# index.html and its entry bundle actually returns 200.
#
# This exists because a partial deploy (index.html uploaded without its JS
# chunks) once took https://learn.pitun.cc/ down with a 404 on the entry
# bundle. The mirror + verify pattern makes that failure mode impossible to
# miss.
#
# Usage:
#   scripts/deploy-public-web.sh            # deploy and verify
#   scripts/deploy-public-web.sh --verify   # verify only, no deploy
#
# Requires: passwordless sudo for the deploy user on the server (used via
# rsync --rsync-path so root-owned files in the web root can be replaced and
# deleted). The Octos binary, hosted-tts, skills and course packs are NOT
# touched; see docs/PUBLIC_DEPLOYMENT_RUNBOOK.md for those.
set -euo pipefail

HOST="${DEPLOY_HOST:-learn.pitun.cc}"
USER="${DEPLOY_USER:-ubuntu}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/octos_learn_vps_ed25519}"
WEB_ROOT="${DEPLOY_WEB_ROOT:-/opt/octos-learn/web}"
PUBLIC_URL="${PUBLIC_URL:-https://learn.pitun.cc}"
DIST_DIR="$(cd "$(dirname "$0")/.." && pwd)/dist"

SSH_OPTS=(-i "$KEY" -o BatchMode=yes -o ConnectTimeout=15)
RSYNC_SSH="ssh ${SSH_OPTS[*]}"

fail() { echo "FAIL: $*" >&2; exit 1; }

verify() {
  local html paths path code failed=0
  echo "==> verifying $PUBLIC_URL/"
  html=$(curl -fsS -m 20 "$PUBLIC_URL/") || fail "index.html not reachable"

  # Assets referenced directly by index.html, plus every js/css file in the
  # local dist (lazy chunks included — they all must exist on the server).
  paths=$(
    {
      printf '%s' "$html" | grep -oE '/assets/[^"]+'
      (cd "$DIST_DIR" && find assets fonts models vad images course-packs -type f \( -name '*.js' -o -name '*.css' \) 2>/dev/null | sed 's|^|/|')
    } | sort -u
  )

  # HEAD requests only: the point is reachability, not content (rsync already
  # guarantees content; downloading bundles through a slow link does not).
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    code=$(curl -s -o /dev/null -I -w '%{http_code}' -m 20 "$PUBLIC_URL$path")
    if [ "$code" != "200" ]; then
      echo "  MISSING $path -> HTTP $code" >&2
      failed=1
    fi
  done <<< "$paths"
  [ "$failed" -eq 0 ] || fail "one or more assets are not reachable"
  echo "    OK ($(printf '%s\n' "$paths" | grep -c .) assets checked)"
}

if [ "${1:-}" = "--verify" ]; then
  verify
  exit 0
fi
[ "${1:-}" = "" ] || fail "unknown argument: $1 (use --verify to skip deploy)"

[ -d "$DIST_DIR" ] || fail "dist/ not found; build first: pnpm build:public"

echo "==> backing up $HOST:$WEB_ROOT to ${WEB_ROOT}.bak-pre-deploy"
ssh "${SSH_OPTS[@]}" "$USER@$HOST" \
  "sudo rm -rf '$WEB_ROOT.bak-pre-deploy' && sudo cp -a '$WEB_ROOT' '$WEB_ROOT.bak-pre-deploy'"

echo "==> rsync dist/ -> $HOST:$WEB_ROOT/ (mirror, --delete)"
rsync -avz --delete \
  --exclude='.DS_Store' --exclude='._*' \
  --rsync-path="sudo rsync" \
  -e "$RSYNC_SSH" \
  "$DIST_DIR/" "$USER@$HOST:$WEB_ROOT/"

verify

echo "==> done. Rollback on server: sudo rm -rf $WEB_ROOT && sudo mv $WEB_ROOT.bak-pre-deploy $WEB_ROOT"
