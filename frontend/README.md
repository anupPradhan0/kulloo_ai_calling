# Kulloo frontend

React + TypeScript + [Vite](https://vite.dev/). In development, `/api` is proxied to the Kulloo backend at `http://localhost:5000` (see `vite.config.ts`).

## Environment variables

| Variable | When | Purpose |
|----------|------|---------|
| **`VITE_API_BASE_URL`** | **Build-time** (Nixpacks / `pnpm build`) | API origin, no trailing slash, e.g. `https://kulloocall.anuppradhan.in`. Baked into the JS bundle. |
| **`PUBLIC_URL`** | **Runtime** (optional, Nixpacks deploy) | Printed in [`scripts/nixpacks-start.sh`](scripts/nixpacks-start.sh) logs so you see your public URL in the container log, e.g. `https://app.anuppradhan.in`. |

See [`.env.example`](.env.example).

```bash
pnpm install
pnpm dev
```

```bash
pnpm build    # output in dist/
pnpm preview  # serve production build locally
```

## Deploy with Nixpacks (Dokploy / Railway / Coolify)

1. **App root:** `frontend/` (or monorepo equivalent in your panel).
2. **Build env:** `VITE_API_BASE_URL=https://kulloocall.anuppradhan.in`
3. **Node:** [`nixpacks.toml`](nixpacks.toml) sets `NIXPACKS_NODE_VERSION = "22"`. If the builder still uses Node 18, add `NIXPACKS_NODE_VERSION=22` to the service environment.
4. **Runtime (optional):** `PUBLIC_URL=https://app.anuppradhan.in` for clearer startup logs.

Map your domain to the **container port** your platform assigns (often `PORT` or **80** — not Vite’s **5173**).

**Logs:** The Kulloo banner is from `nixpacks-start.sh`. JSON lines after it are **normal Caddy logs** (`server running` = healthy).

For `pnpm preview` locally, there is no `/api` proxy unless you add one; use `pnpm dev` or point `VITE_API_BASE_URL` at a reachable API.
