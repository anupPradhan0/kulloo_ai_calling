# Production static UI + nginx reverse proxy to Kulloo API (same Docker network).
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Production: UI on kulloocall HTTPS; API on app (see frontend/.env.example)
ARG VITE_API_BASE_URL=http://app.anuppradhan.in
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN pnpm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
