# syntax=docker/dockerfile:1
# Works with two build contexts:
#
# 1) Context = frontend/ (common in Dokploy: set "Context" to ./frontend or the frontend subfolder)
#    docker build -f Dockerfile --target production .
#
# 2) Context = repo root (pass prefix so COPY finds files under frontend/)
#    docker build -f frontend/Dockerfile --build-arg SRC_PREFIX=frontend/ --target production .
#
# SRC_PREFIX must include a trailing slash when non-empty (e.g. frontend/).

FROM node:20-alpine AS builder

ARG SRC_PREFIX

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY ${SRC_PREFIX}package.json ${SRC_PREFIX}pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY ${SRC_PREFIX}tsconfig.json ${SRC_PREFIX}tsconfig.app.json ${SRC_PREFIX}tsconfig.node.json ${SRC_PREFIX}vite.config.ts ${SRC_PREFIX}index.html ./
COPY ${SRC_PREFIX}public ./public
COPY ${SRC_PREFIX}src ./src
COPY ${SRC_PREFIX}docker/nginx/default.conf.template /tmp/nginx-default.conf.template

RUN pnpm run build

FROM nginx:1.27-alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /tmp/nginx-default.conf.template /etc/nginx/templates/default.conf.template

ENV API_UPSTREAM=http://api:5000

EXPOSE 80
