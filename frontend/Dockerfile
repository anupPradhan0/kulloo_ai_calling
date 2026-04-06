# syntax=docker/dockerfile:1
# Build from the **repository root** (Kulloo monorepo):
#   docker build -f frontend/Dockerfile --target production .
# In Dokploy: Docker file path = frontend/Dockerfile, context = . (repo root).

FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json frontend/vite.config.ts frontend/index.html ./
COPY frontend/public ./public
COPY frontend/src ./src

RUN pnpm run build

FROM nginx:1.27-alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html
COPY frontend/docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template

ENV API_UPSTREAM=http://api:5000

EXPOSE 80
