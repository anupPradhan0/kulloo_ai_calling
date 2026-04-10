# Build stage: compile TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

RUN pnpm run build

# Runtime stage: production dependencies + compiled JS only
# Dokploy (and some CI) use: docker build --target production
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
# AI voice system prompts (loaded at runtime — see prompt-loader.ts)
COPY --from=builder /app/src/prompts ./prompts

EXPOSE 5000

USER node

CMD ["node", "dist/server.js"]
