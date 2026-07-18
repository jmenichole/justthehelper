#!/usr/bin/env bash
# Push Ko-fi billing env vars to Fly.io from your local .env file.
# Usage: ./scripts/setup-kofi-fly.sh
set -euo pipefail

APP_NAME="${FLY_APP_NAME:-justthehelper}"
ENV_FILE="${ENV_FILE:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy .env.example and fill in values first."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

TOKEN="${KOFI_VERIFICATION_TOKEN:-${KOFI_API_KEY:-}}"
PAGE="${KOFI_PAGE_URL:-}"
PROVIDER="${BILLING_PROVIDER:-kofi}"

if [[ -z "$TOKEN" ]]; then
  echo "Set KOFI_VERIFICATION_TOKEN or KOFI_API_KEY in $ENV_FILE"
  exit 1
fi

if [[ -z "$PAGE" ]]; then
  echo "Set KOFI_PAGE_URL in $ENV_FILE (e.g. https://ko-fi.com/jmenichole)"
  exit 1
fi

if ! command -v flyctl >/dev/null 2>&1 && ! command -v fly >/dev/null 2>&1; then
  echo "Install Fly CLI: https://fly.io/docs/flyctl/install/"
  exit 1
fi

FLY="$(command -v flyctl || command -v fly)"

echo "Setting Ko-fi billing secrets on $APP_NAME..."
"$FLY" secrets set \
  BILLING_PROVIDER="$PROVIDER" \
  KOFI_VERIFICATION_TOKEN="$TOKEN" \
  KOFI_PAGE_URL="$PAGE" \
  ${KOFI_TIER_NAME:+KOFI_TIER_NAME="$KOFI_TIER_NAME"} \
  -a "$APP_NAME"

echo "Deploying $APP_NAME..."
"$FLY" deploy -a "$APP_NAME"

echo ""
echo "Done. Last step (Ko-fi dashboard — manual):"
echo "  1. Open https://ko-fi.com/manage/webhooks"
echo "  2. Set webhook URL to: https://${APP_NAME}.fly.dev/webhooks/kofi"
echo "  3. Send a test webhook"
echo "  4. In Discord: /subscribe → pay with your server link code → /subscribe status"
