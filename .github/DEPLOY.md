# GitHub Actions — deploy to your VPS

Pushing to **`main`** runs **CI** (backend + frontend `pnpm build`), then **CD** (SSH into the server, `git reset` to `origin/main`, `docker compose build api`, `docker compose build web`, then `docker compose up -d`). Images build **one at a time** so small VPS hosts do not run out of RAM.

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

## 2. GitHub repository secrets

**Settings → Secrets and variables → Actions → New repository secret**

| Name | Example |
|------|---------|
| `DEPLOY_HOST` | `187.127.150.91`, or any hostname whose **A** record points at the same VPS (e.g. `kulloocall.anuppradhan.in`) — SSH accepts either |
| `DEPLOY_USER` | `root` or `deploy` |
| `DEPLOY_SSH_KEY` | Contents of **private** key file (multiline) |
| `DEPLOY_PATH` | `/root/kulloo_ai_calling` (must match **absolute** path to the clone on the server) |

## 3. Server clone

The directory in `DEPLOY_PATH` must be a **git** clone of this repo with `origin` pointing at GitHub (HTTPS or SSH). Example:

```bash
cd /root
git clone https://github.com/anupPradhan0/kulloo_ai_calling.git
```

If the repo is **private**, use a [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) on the server for `git fetch`, or clone over SSH.

## 4. Manual run

**Actions → CI / Deploy → Run workflow** runs the same pipeline (useful to redeploy without a new commit).

## 5. Optional: approval before deploy

Add `environment: production` under the `deploy` job in `.github/workflows/ci-deploy.yml`, then create a **production** environment under repo **Settings → Environments** and add protection rules (e.g. required reviewers).

## Troubleshooting

- **SSH permission denied** — wrong key, user, or `authorized_keys`.
- **`docker: command not found`** — install Docker Engine + Compose plugin on the server; ensure the SSH user can run `docker` (e.g. `usermod -aG docker deploy`).
- **`git reset` fails** — avoid editing files by hand on the server; CI expects a clean tracking of `origin/main`.
- **Long builds** — `command_timeout` is 45 minutes; increase in `.github/workflows/ci-deploy.yml` if VEXYL or images need more time.
