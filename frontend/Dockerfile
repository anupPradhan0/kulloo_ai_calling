# syntax=docker/dockerfile:1
# 1) Context = frontend/ (typical Dokploy)
#    docker build -f Dockerfile --target production .
# 2) Context = repo root
#    docker build -f frontend/Dockerfile --build-arg SRC_PREFIX=frontend/ --target production .

FROM node:20-alpine AS builder

ARG SRC_PREFIX

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY ${SRC_PREFIX}package.json ${SRC_PREFIX}pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY ${SRC_PREFIX}tsconfig.json ${SRC_PREFIX}tsconfig.app.json ${SRC_PREFIX}tsconfig.node.json ${SRC_PREFIX}vite.config.ts ${SRC_PREFIX}index.html ./
COPY ${SRC_PREFIX}public ./public
COPY ${SRC_PREFIX}src ./src

RUN pnpm run build

FROM nginx:1.27-alpine AS production

ARG SRC_PREFIX

RUN mkdir -p /etc/nginx/app

COPY --from=builder /app/dist /usr/share/nginx/html
COPY ${SRC_PREFIX}docker/nginx/default.conf.in /etc/nginx/app/default.conf.in
COPY ${SRC_PREFIX}docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV API_UPSTREAM=http://api:5000

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
