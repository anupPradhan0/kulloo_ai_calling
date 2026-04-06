#!/bin/sh
set -e
UP="${API_UPSTREAM:-http://api:5000}"
mkdir -p /etc/nginx/conf.d
sed "s#__API_UPSTREAM__#${UP}#g" < /etc/nginx/app/default.conf.in > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
