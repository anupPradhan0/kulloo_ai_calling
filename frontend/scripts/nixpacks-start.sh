#!/bin/sh
set -e

# Nixpacks + Caddy (not Docker). Dokploy/Railway/Coolify usually set PORT.
PORT="${PORT:-80}"
PUBLIC_URL_HINT="${PUBLIC_URL:-}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[Kulloo] Frontend is running (Nixpacks → Caddy → Vite static dist/)"
echo "[Kulloo] Process:     Caddy serving files from the built app"
echo "[Kulloo] Listen port: ${PORT}  (set PORT in your platform if something else is required)"
if [ -n "$PUBLIC_URL_HINT" ]; then
  echo "[Kulloo] Public URL:  ${PUBLIC_URL_HINT}  (from PUBLIC_URL env)"
else
  echo "[Kulloo] Public URL:  set PUBLIC_URL in service env to print your real URL here"
fi
echo "[Kulloo] API (browser): configured at build time with VITE_API_BASE_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[Kulloo] Caddy runtime logs follow (JSON lines are normal for Caddy):"
echo ""

exec caddy run --config /assets/Caddyfile --adapter caddyfile
