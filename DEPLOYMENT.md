# Deploying Dream Catcher on Render

This guide walks through deploying the Dream Catcher app on [Render](https://render.com)
in two ways, both starting from the same GitHub repository:

| | Method A: native GitHub build | Method B: Docker |
|---|---|---|
| Render runtime | `node` | `docker` |
| Who chooses the OS image | Render | You (in the `Dockerfile`) |
| Build step | `npm install` | `docker build` on `./Dockerfile` |
| Start step | `node server.js` | `CMD` in the `Dockerfile` |
| Live URL | https://dream-catcher-github.onrender.com | https://dream-catcher-5355.onrender.com |

**Repository:** https://github.com/Arpan7125/dream-catcher

---

## 1. About the app

- **Stack:** Node.js 22, Express, SQLite (`sqlite3` + `sqlite`), Google Gemini for dream interpretations
- **Entry point:** `server.js`. It serves `public/` as static files and the API at `/api/dreams`
- **Port:** reads `process.env.PORT`, falling back to `3001`. Render sets `PORT` itself, so no code change is needed
- **Database:** a SQLite file. Its location comes from `DATABASE_PATH`, falling back to `./dreams.db`

### Environment variables

| Variable | Needed by | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | both | Google AI Studio API key (secret) |
| `GEMINI_MODEL` | both | Gemini model name, e.g. `gemini-3.6-flash` |
| `NODE_VERSION` | Method A | Node version for Render's buildpack (`22`) |
| `npm_config_build_from_source` | Method A | Makes npm compile `sqlite3` from source (`true`), see section 4.2 |
| `DATABASE_PATH` | Method B | Where the SQLite file goes inside the container (`/app/data/dreams.db`) |

---

## 2. Prerequisites

- A GitHub account
- A Render account (the free plan is enough)
- Git, and Docker Desktop for testing the image locally
- A Gemini API key from https://aistudio.google.com/apikey

---

## 3. Prepare the repository and push it to GitHub

Both methods deploy from GitHub, so this part is shared.

### 3.1 Keep secrets and local files out of git

`.gitignore`:

```gitignore
# dependencies
node_modules

# secrets
.env

# local sqlite database
*.db

# logs
logs
*.log
```

> The original `.gitignore` spelled it `mode_modules`, which meant `node_modules`
> was never actually ignored. It also didn't ignore `dreams.db`.

Commit a `.env.example` with placeholder values so others know which variables to set.
**Never commit the real `.env`.**

### 3.2 Check for hardcoded secrets

Before your first push, search the source code for API keys:

```bash
git grep -nE "AIza|sk-proj|sk-[A-Za-z0-9]{20,}"
```

While preparing this project, GitHub **push protection** blocked the first push because
`utils/ai-openai.js` had a real OpenAI key written into the code as a fallback:

```js
// before: the key was committed to source control
apiKey: process.env.OPENAI_API_KEY || 'sk-proj-...'

// after: read it from the environment only
apiKey: process.env.OPENAI_API_KEY
```

The fix:

1. Delete the hardcoded key from the code.
2. Rewrite the unpushed commit so the key isn't in **any** commit. Push protection checks
   every commit in a push, so a later commit that deletes the key isn't enough.
3. **Revoke the key** with the provider. Once a key has been committed, treat it as leaked.

> Do not use GitHub's "allow this secret" link to get around push protection on a
> public repo. That publishes the key permanently in the repo's history.

### 3.3 Create the GitHub repo and push

With the GitHub CLI:

```bash
git init -b main
git add -A
git commit -m "Add Docker and Render deployment setup"
gh repo create dream-catcher --public --source=. --remote=origin --push
```

Or create an empty repo on github.com and then run:

```bash
git remote add origin https://github.com/<your-username>/dream-catcher.git
git push -u origin main
```

### 3.4 Connect GitHub to Render (required for auto-deploy)

1. In Render, open **Account Settings → Git Providers → GitHub → Connect / Configure**
2. Install the **Render GitHub App** and give it access to the `dream-catcher` repository

Render can deploy a **public** repo without this step, but your GitHub account isn't
linked, so GitHub doesn't notify Render when you push. The build log shows this message:

```
==> It looks like we don't have access to your repo, but we'll try to clone it anyway.
```

The service gets built once, but later pushes **don't** redeploy it.
Connect the GitHub App so that `git push` triggers a deploy.

---

## 4. Method A: native GitHub build

Render takes the code from GitHub and builds it with its own Node.js environment. There's no Dockerfile.

### 4.1 Create the web service

1. Render dashboard → **New +** → **Web Service**
2. **Connect a repository** → select `dream-catcher`
3. Fill in the settings:

   | Field | Value |
   |---|---|
   | Name | `dream-catcher-github` |
   | Region | Singapore (closest to India) |
   | Branch | `main` |
   | Root Directory | *(leave empty)* |
   | Language / Runtime | **Node** |
   | Build Command | `npm install` |
   | Start Command | `node server.js` |
   | Instance Type | Free |

4. Under **Environment Variables**, add:

   | Key | Value |
   |---|---|
   | `GEMINI_API_KEY` | *your key* |
   | `GEMINI_MODEL` | `gemini-3.6-flash` |
   | `NODE_VERSION` | `22` |
   | `npm_config_build_from_source` | `true` |

   Don't set `DATABASE_PATH`. The app falls back to `./dreams.db` in the project folder.

5. Check that **Auto-Deploy** is set to **On Commit**
6. Click **Create Web Service**

### 4.2 Problem we hit: `GLIBC_2.38 not found`

The first deploy built fine but crashed at startup:

```
Error: /lib/x86_64-linux-gnu/libm.so.6: version `GLIBC_2.38' not found
(required by /opt/render/project/src/node_modules/sqlite3/build/Release/node_sqlite3.node)
code: 'ERR_DLOPEN_FAILED'
==> Exited with status 1
```

**Why it happens:** `sqlite3` is a native module. When you run `npm install`, it downloads a
ready-made (prebuilt) binary, and that binary needs glibc 2.38. Render's Node image has an
older glibc, so Node can't load the binary when the app starts.

**Fix:** set `npm_config_build_from_source=true`. npm then compiles `sqlite3` on
Render's machine, so it works with the glibc Render actually has.

### 4.3 Second problem: the build cache

When we added the variable after the failed deploy, the next deploy failed the same way.
Its build log showed why:

```
==> Downloading cache...
==> Running build command 'npm install'...
up to date, audited 217 packages in 700ms
```

Render had restored the old `node_modules` from its cache, and npm decided there was
nothing to install, so it never recompiled `sqlite3`.

**Fix:** **Manual Deploy → Clear build cache & deploy**. With the cache cleared, `npm install`
starts from scratch, compiles `sqlite3`, and the app starts.

> If you set `npm_config_build_from_source=true` **before** the first deploy (as in step 4.1),
> you won't run into either problem.

### 4.4 Verify

The build log should end with:

```
==> Running 'node server.js'
Gemini key loaded: true
Gemini model: gemini-3.6-flash
Server running on http://localhost:10000
==> Your service is live 🎉
```

Then check it from a terminal:

```bash
curl -s https://dream-catcher-github.onrender.com/ | grep "<title>"
# <title>Dream Catcher</title>

curl -s -w " HTTP %{http_code}\n" https://dream-catcher-github.onrender.com/api/dreams
# [] HTTP 200
```

---

## 5. Method B: Docker

Render takes the code from GitHub and builds the image from our `Dockerfile`, so we choose
the OS, the Node version, and the system libraries ourselves.

### 5.1 The Dockerfile

```dockerfile
# ---------- Stage 1: build dependencies ----------
# sqlite3 is a native module, so give npm the toolchain it may need
# to compile it when no prebuilt binary matches this platform.
FROM node:22-trixie-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev


# ---------- Stage 2: runtime ----------
FROM node:22-trixie-slim AS runtime

ENV NODE_ENV=production \
    PORT=3001 \
    DATABASE_PATH=/app/data/dreams.db

WORKDIR /app

# Only the installed modules come across - no compilers in the final image
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js ./
COPY config ./config
COPY routes ./routes
COPY utils ./utils
COPY public ./public

# Writable location for the SQLite file (mount a Render disk here to persist it)
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3001

CMD ["node", "server.js"]
```

What each part does:

- **Two stages.** The `deps` stage has the compilers (`python3 make g++`) and runs
  `npm ci`. The `runtime` stage copies in only the finished `node_modules`, so the
  final image is smaller and contains no build tools.
- **`npm ci --omit=dev`.** Installs exactly the versions in `package-lock.json` and
  skips dev-only packages like `nodemon`.
- **`node:22-trixie-slim`.** Debian 13 (trixie) has glibc 2.41, which the prebuilt
  `sqlite3` binary can use. We started on `node:22-bookworm-slim` (glibc 2.36) and got
  the same `GLIBC_2.38 not found` crash described in section 4.2.
  With Docker, we fix that by **choosing a different base image**.
- **`USER node`.** Runs the app as a normal user instead of root.
- **`/app/data`.** A folder the `node` user can write to, used for the SQLite file.

### 5.2 `.dockerignore`

This keeps secrets and local files out of the build context:

```
node_modules
npm-debug.log
.git
.gitignore
.env
*.db
logs
*.log
README.md
Dockerfile
.dockerignore
render.yaml
```

The most important lines are `.env`, so your keys are never copied into the image, and
`node_modules`, so your local Windows build doesn't replace the Linux one.

### 5.3 Test the image locally first

```bash
docker build -t dream-catcher .
docker run --rm -p 3001:3001 --env-file .env dream-catcher
```

Open http://localhost:3001, or check from another terminal:

```bash
curl -s -w " HTTP %{http_code}\n" http://localhost:3001/api/dreams
# [] HTTP 200
```

If the container starts, connects to SQLite, and serves the page on your machine,
it will do the same on Render.

### 5.4 Create the web service

1. Render dashboard → **New +** → **Web Service**
2. **Connect a repository** → select `dream-catcher`
3. Fill in the settings:

   | Field | Value |
   |---|---|
   | Name | `dream-catcher` |
   | Region | Singapore |
   | Branch | `main` |
   | Language / Runtime | **Docker** |
   | Dockerfile Path | `./Dockerfile` |
   | Docker Build Context | `.` |
   | Docker Command | *(leave empty, so the Dockerfile's `CMD` is used)* |
   | Instance Type | Free |

   There's no Build Command or Start Command for a Docker service. The Dockerfile replaces both.

4. Under **Environment Variables**, add:

   | Key | Value |
   |---|---|
   | `GEMINI_API_KEY` | *your key* |
   | `GEMINI_MODEL` | `gemini-3.6-flash` |
   | `DATABASE_PATH` | `/app/data/dreams.db` |

5. Click **Create Web Service**

### 5.5 Optional: the Blueprint (`render.yaml`)

Instead of clicking through the form, you can describe the Docker service in a file. Render reads it via
**New + → Blueprint**:

```yaml
services:
  - type: web
    name: dream-catcher
    runtime: docker
    dockerfilePath: ./Dockerfile
    plan: free
    region: singapore
    branch: main
    healthCheckPath: /
    envVars:
      - key: GEMINI_API_KEY
        sync: false          # set this yourself in the Render dashboard
      - key: GEMINI_MODEL
        value: gemini-3.6-flash
      - key: DATABASE_PATH
        value: /app/data/dreams.db
```

`sync: false` makes Render ask for the key in the dashboard, so the secret never goes into git.

### 5.6 Verify

The build log shows Render running BuildKit on our two stages:

```
#18 [deps 5/5] RUN npm ci --omit=dev
#19 [runtime  7/10] COPY routes ./routes
#20 [runtime 10/10] RUN mkdir -p /app/data && chown -R node:node /app/data
#21 exporting to image
#21 pushing layers 0.2s done
```

`[deps …]` and `[runtime …]` are the two `FROM … AS` stages. Seeing them in the log
confirms Render built the image from our Dockerfile.

Then check it from a terminal:

```bash
curl -s https://dream-catcher-5355.onrender.com/ | grep "<title>"
# <title>Dream Catcher</title>

curl -s -w " HTTP %{http_code}\n" https://dream-catcher-5355.onrender.com/api/dreams
# [] HTTP 200
```

---

## 6. Continuous deployment

Once the Render GitHub App is connected (section 3.4) and Auto-Deploy is on, the whole
pipeline is:

```
git push origin main
      │
      ▼
GitHub notifies Render (webhook)
      │
      ├──► dream-catcher-github : clone → npm install → node server.js
      │
      └──► dream-catcher        : clone → docker build → run container
      │
      ▼
Both services rebuild and go live automatically
```

One push updates both deployments.

---

## 7. Comparing the two methods

| | Native GitHub build | Docker |
|---|---|---|
| Setup effort | Lower: two commands in a form | Higher: write a Dockerfile |
| Control over the OS | None: you get Render's image | Full: you pick the base image |
| `sqlite3` glibc problem | Worked around with an env var + clear cache | Fixed by picking `trixie` |
| Same result locally and in prod | No: Windows locally, Linux on Render | Yes: the same image runs everywhere |
| Portability | Tied to Render's buildpack | Runs on any host that supports Docker |
| Build speed | Slower here, because `sqlite3` is compiled every time | Faster rebuilds, because Docker caches each layer |

**Takeaway:** the same `GLIBC_2.38` error broke both deployments. With Docker,
we fixed it by changing the base image in the Dockerfile. With the native build,
we couldn't change Render's image, so we changed how npm builds `sqlite3`
and cleared the cache. Docker gives you the control; the native build is quicker to set up.

---

## 8. Limitations on the free plan

- **No persistent disk.** The SQLite file is deleted on every redeploy or restart, so saved
  dreams don't survive. To keep them, mount a Render Disk at `/app/data` (paid plans) or
  switch to Render Postgres.
- **Services sleep.** Free services stop after about 15 minutes without traffic. The first
  request after that takes around 50 seconds while the service wakes up.

---

## 9. Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| `GLIBC_2.38 not found`, `ERR_DLOPEN_FAILED` | The prebuilt `sqlite3` binary needs a newer glibc than the image has | Docker: use `node:22-trixie-slim`. Native: `npm_config_build_from_source=true` |
| Same error after adding the env var | `node_modules` was restored from the build cache | **Clear build cache & deploy** |
| `up to date, audited … packages` in a fresh deploy | Same as above | Same as above |
| Push rejected: `GH013 … repository rule violations` | GitHub push protection found a secret in a commit | Remove it from every commit in the push, then revoke the key |
| "we don't have access to your repo" | Render GitHub App not connected | Section 3.4 |
| Pushes don't redeploy | Same as above | Section 3.4 |
| `Gemini key loaded: false` | `GEMINI_API_KEY` not set on the service | Add it under **Environment**, then redeploy |
| Saved dreams disappear | No persistent disk on the free plan | See section 8 |
