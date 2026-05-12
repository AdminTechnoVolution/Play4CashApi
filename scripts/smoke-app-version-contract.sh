#!/usr/bin/env bash
# Smoke test del contrato PWA <-> Gateway <-> API para versionado de la app.
#
# Uso:
#   GATEWAY_URL=https://gateway.tu-dominio.com [HEALTH_PATH=/api/health] [PWA_ORIGIN=https://tu-pwa.com] \
#     bash scripts/smoke-app-version-contract.sh
#
# Exit codes:
#   0  todo OK
#   1  configuración faltante
#   2  el Gateway no responde
#   3  CORS no expone X-App-Min-Version (la PWA nunca verá el header forzado)
#   4  el Gateway rechaza X-App-Version en preflight (PWA no puede llamar al API)

set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:-}"
HEALTH_PATH="${HEALTH_PATH:-/api/health}"
PWA_ORIGIN="${PWA_ORIGIN:-https://example.com}"

if [ -z "$GATEWAY_URL" ]; then
  echo "ERROR: GATEWAY_URL is required (e.g. https://gateway.tu-dominio.com)" >&2
  exit 1
fi

URL="${GATEWAY_URL%/}${HEALTH_PATH}"
echo "→ Gateway URL:  $URL"
echo "→ PWA Origin:   $PWA_ORIGIN"
echo

echo "[1/3] HEAD ${URL} — sanity check"
HEAD_OUT=$(curl -sS -i -o - -X GET "$URL" -H "Origin: $PWA_ORIGIN" -H "X-App-Version: 0.0.1-smoke" || true)
HEAD_STATUS=$(printf '%s' "$HEAD_OUT" | head -n1 | awk '{print $2}')

if [ -z "$HEAD_STATUS" ]; then
  echo "  ✗ no response from gateway" >&2
  exit 2
fi
echo "  status: $HEAD_STATUS"

echo
echo "[2/3] Inspect response headers"
if printf '%s' "$HEAD_OUT" | grep -i -q '^x-app-min-version:'; then
  MIN_VERSION=$(printf '%s' "$HEAD_OUT" | grep -i '^x-app-min-version:' | head -n1 | awk -F': ' '{print $2}' | tr -d '\r\n')
  echo "  ✓ X-App-Min-Version present: ${MIN_VERSION:-<empty>}"
else
  echo "  ⚠ X-App-Min-Version NOT present (PWA_MIN_VERSION may be unset on API — non-blocking)."
fi

# CORS exposes the header? The Gateway must list it in Access-Control-Expose-Headers
# OR the API's response (forwarded) must — but the browser only sees the Gateway's.
if printf '%s' "$HEAD_OUT" | grep -i -q '^access-control-expose-headers:.*x-app-min-version'; then
  echo "  ✓ Access-Control-Expose-Headers includes X-App-Min-Version"
else
  echo "  ✗ Access-Control-Expose-Headers does NOT include X-App-Min-Version" >&2
  echo "    The PWA will not be able to read the forced-update header from JS." >&2
  exit 3
fi

echo
echo "[3/3] OPTIONS preflight — request with X-App-Version"
PREFLIGHT_OUT=$(curl -sS -i -X OPTIONS "$URL" \
  -H "Origin: $PWA_ORIGIN" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-app-version, authorization" || true)
PREFLIGHT_STATUS=$(printf '%s' "$PREFLIGHT_OUT" | head -n1 | awk '{print $2}')

case "$PREFLIGHT_STATUS" in
  200|204)
    if printf '%s' "$PREFLIGHT_OUT" | grep -i -q '^access-control-allow-headers:.*x-app-version'; then
      echo "  ✓ Preflight allows X-App-Version (status=$PREFLIGHT_STATUS)"
    else
      echo "  ✗ Preflight $PREFLIGHT_STATUS but Access-Control-Allow-Headers does not list X-App-Version" >&2
      exit 4
    fi
    ;;
  *)
    echo "  ✗ Preflight returned status=$PREFLIGHT_STATUS (expected 200 or 204)" >&2
    exit 4
    ;;
esac

echo
echo "✅ All checks passed."
