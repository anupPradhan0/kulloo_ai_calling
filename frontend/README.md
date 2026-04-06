# Kulloo frontend

React + TypeScript + [Vite](https://vite.dev/). In development, `/api` is proxied to the Kulloo backend at `http://localhost:5000` (see `vite.config.ts`).

## Environment variables

| Variable | When | Purpose |
|----------|------|---------|
| **`API_UPSTREAM`** | **Docker only** (runtime on the container) | Nginx forwards browser requests from **`/api/*`** to this URL. Default in the Dockerfile: `http://api:5000` (your API service name + port on the same Docker network). Set at **`docker run`** / Compose / your platform’s env UI — **not** in `.env` for `pnpm build`. |
| **`VITE_API_BASE_URL`** | **Optional build-time** | Only if the UI is hosted on a **different origin** than the API **and** you are **not** putting a reverse proxy in front that serves both under one host. Example: `https://api.yourdomain.com` (no trailing slash). Must be present when you run **`pnpm build`** (or as a build-arg in CI) so the client bundle embeds it. If unset, the app uses **relative** `/api/...` (works with Vite dev proxy, Docker nginx, or Traefik/Caddy routing `/api` to the backend). |

See [`.env.example`](.env.example) for copy-paste comments. **You do not need any env vars** for a typical setup: same Compose stack with an `api` service on port 5000, or one reverse proxy terminating TLS and routing `/api` to the backend.

```bash
pnpm install
pnpm dev
```

```bash
pnpm build    # output in dist/
pnpm preview  # serve production build locally
```

## Docker

Build and run the image (serves the static app on port **80**). Nginx proxies **`/api`** to the backend; default upstream is **`http://api:5000`** (use the same service name in Docker Compose as your API container).

The Dockerfile supports **two** setups:

**A — Build context is `frontend/`** (typical Dokploy: context = `./frontend` or the frontend directory, Dockerfile = `Dockerfile`):

```bash
cd frontend && docker build --target production -t kulloo-frontend .
```

Do **not** set `SRC_PREFIX` (leave unset or empty).

**B — Build context is the repo root:**

```bash
docker build -f frontend/Dockerfile --build-arg SRC_PREFIX=frontend/ --target production -t kulloo-frontend .
```

`SRC_PREFIX` must include the trailing slash (`frontend/`).

Nginx config is built at container start from `docker/nginx/default.conf.in` (placeholder `__API_UPSTREAM__`) so normal `$uri` / `$host` are not broken by image `envsubst`.

## Nixpacks (Dokploy buildpack)

**Vite 8 requires Node 20.19+** (not 18). This repo pins Node **22** via [`nixpacks.toml`](nixpacks.toml) (`NIXPACKS_NODE_VERSION`). If your host ignores it, set the same variable in the service **Environment** for the build.

```bash
docker run --rm -p 8080:80 kulloo-frontend
```

Point the browser at `http://localhost:8080`. If the API runs elsewhere, set **`API_UPSTREAM`** (full URL including scheme, no path):

```bash
docker run --rm -p 8080:80 -e API_UPSTREAM=http://host.docker.internal:5000 kulloo-frontend
```

For `pnpm preview` without Docker, there is no `/api` proxy unless you add one; use Docker or a reverse proxy in front of both services.
