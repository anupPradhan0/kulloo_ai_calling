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

## Deploy with Nixpacks (recommended on Dokploy if you use a buildpack)

1. **Repository / context:** use the `frontend/` directory as the app root (or the repo root with build path set to `frontend`, depending on your panel).
2. **Build environment:** set `VITE_API_BASE_URL=https://kulloocall.anuppradhan.in` (no trailing slash) so production bundles call your API.
3. **Node version:** [`nixpacks.toml`](nixpacks.toml) sets `NIXPACKS_NODE_VERSION = "22"` (Vite 8 does not run on Node 18). If the build still uses 18, add `NIXPACKS_NODE_VERSION=22` in the service **environment** for the build step.

After deploy, point your public domain (e.g. `app.anuppradhan.in`) at the **container port** your platform assigns for Caddy (often **`PORT`** from the platform, sometimes **80** — **not** Vite’s 5173).

**Runtime logs:** [`scripts/nixpacks-start.sh`](scripts/nixpacks-start.sh) prints a short **Kulloo** banner (listen port, optional `PUBLIC_URL` hint), then Caddy runs. Lines like `{"level":"info",...}` after that are **normal Caddy JSON logs**, not errors.

Optional env on the running service: **`PUBLIC_URL=https://app.anuppradhan.in`** so the banner shows your real URL.

```bash
docker run --rm -p 8080:80 kulloo-frontend
```

Point the browser at `http://localhost:8080`. If the API runs elsewhere, set **`API_UPSTREAM`** (full URL including scheme, no path):

```bash
docker run --rm -p 8080:80 -e API_UPSTREAM=http://host.docker.internal:5000 kulloo-frontend
```

For `pnpm preview` without Docker, there is no `/api` proxy unless you add one; use Docker or a reverse proxy in front of both services.
