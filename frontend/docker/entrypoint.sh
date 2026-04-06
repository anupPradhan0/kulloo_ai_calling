#!/bin/sh
set -e
UP="${API_UPSTREAM:-http://api:5000}"
mkdir -p /etc/nginx/conf.d
sed "s#__API_UPSTREAM__#${UP}#g" < /etc/nginx/app/default.conf.in > /etc/nginx/conf.d/default.conf

echo "[Kulloo] Frontend container (nginx) starting"
echo "[Kulloo] Listening on container port 80 — point your reverse proxy (e.g. app.example.com) to this port"
echo "[Kulloo] Same-origin /api proxy target: ${UP}"
echo "[Kulloo] If you use VITE_API_BASE_URL in the bundle, the browser calls that host directly (not this proxy)"

exec nginx -g 'daemon off;'
