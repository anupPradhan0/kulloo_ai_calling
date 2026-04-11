# GitHub Actions — deploy to your VPS

Pushing to **`main`** runs **CI** (backend + frontend `pnpm build`), then **CD**: Docker **`api`** and **`web`** images are built on **GitHub Actions**, pushed to **GitHub Container Registry** (`ghcr.io/<owner>/kulloo-backend:main` and `kulloo-frontend:main`), then the VPS **SSH** script runs **`git pull`**, **`docker pull`** from GHCR, retags to `kulloo-backend:local` / `kulloo-frontend:local`, and **`docker compose up -d`**. The VPS does **not** compile during deploy (avoids OOM). Large image layers are pulled from Microsoft/GitHub CDN instead of uploaded over SCP (avoids **`dial tcp …:22: i/o timeout`** on flaky SSH paths).

## 1. One-time: SSH key for GitHub only

On your **laptop** (not the server):

```bash
ssh-keygen -t ed25519 -C "github-actions-kulloo" -f ./kulloo-deploy -N ""
```

- **Private key** → GitHub secret `DEPLOY_SSH_KEY` (entire contents of `kulloo-deploy`).
- **Public key** `kulloo-deploy.pub` → append to the deploy user on the server:

```bash
# on the VPS
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo 'PASTE_PUBLIC_KEY_LINE_HERE' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Use a **dedicated** user if you prefer; the user must run `docker` and `git` in `DEPLOY_PATH` (add user to `docker` group if not root).

## 2. GitHub Container Registry (first deploy)

After the first successful **`main`** deploy, open **GitHub → your repo → Packages** (or the package links in the Actions log). For each of **`kulloo-backend`** and **`kulloo-frontend`**, open **Package settings → Change visibility** and set to **Public** so your VPS can run **`docker pull`** without logging in.

If you keep packages **private**, create a **classic PAT** with `read:packages`, store it on the server (e.g. `/root/.docker/config.json` via `docker login ghcr.io`) or inject a short `echo "$TOKEN" | docker login ghcr.io -u USER --password-stdin` before `docker pull` in a server-side script (not committed).

## 3. GitHub repository secrets

**Settings → Secrets and variables → Actions → New repository secret**

| Name | Example |
|------|---------|
| `DEPLOY_HOST` | `187.127.150.91`, or any hostname whose **A** record points at the same VPS (e.g. `kulloocall.anuppradhan.in`) — SSH accepts either |
| `DEPLOY_USER` | `root` or `deploy` |
| `DEPLOY_SSH_KEY` | Contents of **private** key file (multiline) |
| `DEPLOY_PATH` | `/root/kulloo_ai_calling` (must match **absolute** path to the clone on the server) |

## 4. Server clone

The directory in `DEPLOY_PATH` must be a **git** clone of this repo with `origin` pointing at GitHub (HTTPS or SSH). Example:

```bash
cd /root
git clone https://github.com/anupPradhan0/kulloo_ai_calling.git
```

If the repo is **private**, use a [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) on the server for `git fetch`, or clone over SSH.

## 5. Manual run

**Actions → CI / Deploy → Run workflow** runs the same pipeline (useful to redeploy without a new commit).

## 6. Optional: approval before deploy

Add `environment: production` under the `deploy` job in `.github/workflows/ci-deploy.yml`, then create a **production** environment under repo **Settings → Environments** and add protection rules (e.g. required reviewers).

## Troubleshooting

- **SSH permission denied** — wrong key, user, or `authorized_keys`.
- **`docker: command not found`** — install Docker Engine + Compose plugin on the server; ensure the SSH user can run `docker` (e.g. `usermod -aG docker deploy`).
- **`git reset` fails** — avoid editing files by hand on the server; CI expects a clean tracking of `origin/main`.
- **`dial tcp …:22: i/o timeout` (SCP or SSH)** — the runner cannot reach your VPS SSH port. Check **`DEPLOY_HOST`**, server is up, firewall / cloud security group allows **inbound TCP 22** from the internet (GitHub Actions has no fixed IPs). Test from your laptop: `ssh -i key user@host`.
- **`docker pull` 401 from ghcr.io** — make both GHCR packages **public** (see §2) or **`docker login ghcr.io`** on the server with a read token.
- **Long deploy** — `command_timeout` is 45 minutes for SSH; increase in `.github/workflows/ci-deploy.yml` if pulls are slow.
- **`signal: killed` on manual VPS `docker compose build`** — use the default workflow (build on GitHub) or add swap on the VPS.
