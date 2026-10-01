# Dream Journal App

A full-stack web application that allows users to record their dreams and receive AI-powered interpretations using Claude.

## Features

- Record dreams with timestamp
- Get AI interpretations of your dreams
- View all past dreams and their interpretations
- Delete dreams
- SQLite database for persistent storage
- Vanilla JavaScript frontend
- Express backend with RESTful API

## Tech Stack

- **Backend**: Node.js, Express
- **Database**: SQLite (better-sqlite3)
- **Frontend**: HTML, CSS, Vanilla JavaScript
- **AI**: Anthropic Claude API

## Project Structure

```
dream-journal/
├── server.js           # Express server and API routes
├── package.json        # Dependencies and scripts
├── .env               # Environment variables (create this)
├── .env.example       # Example env file
├── dreams.db          # SQLite database (auto-created)
└── public/
    ├── index.html     # Frontend HTML
    ├── styles.css     # Styles
    └── app.js         # Frontend JavaScript
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=your_api_key_here
PORT=3000
```

Get your API key from: https://console.anthropic.com/

### 3. Run the Application

Development mode (with auto-restart):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The app will be available at `http://localhost:3000`

## API Endpoints

- `GET /api/dreams` - Get all dreams
- `GET /api/dreams/:id` - Get a specific dream
- `POST /api/dreams` - Create a new dream (requires `dream_text` in body)
- `DELETE /api/dreams/:id` - Delete a dream

## Deployment to Render

### 1. Prepare Your Repository

Make sure your code is in a Git repository (GitHub, GitLab, etc.)

### 2. Create a New Web Service on Render

1. Go to https://render.com and sign in
2. Click "New +" and select "Web Service"
3. Connect your repository
4. Configure the service:
   - **Name**: dream-journal (or your choice)
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### 3. Add Environment Variables

In the Render dashboard, add:
- `ANTHROPIC_API_KEY`: Your Anthropic API key

### 4. Deploy

Click "Create Web Service" and Render will deploy your app automatically.

### 5. Database Persistence

Note: The SQLite database file will be stored in Render's ephemeral filesystem. For production, consider:
- Using Render's persistent disk feature
- Migrating to PostgreSQL for better persistence
- Backing up data regularly

## Usage

1. Enter your dream in the text area
2. Click "Get Interpretation" to save the dream and receive an AI interpretation
3. View all your dreams below, sorted by most recent
4. Click "Delete" to remove a dream

## License

MIT
## Deploying to Render

This repo is deployed to Render two ways from the same GitHub repository, so the
two build strategies can be compared:

| Method | Render runtime | How the app is built | Live URL |
|---|---|---|---|
| Native GitHub build | `node` | Render buildpack runs `npm install`, then `node server.js` | https://dream-catcher-github.onrender.com |
| Docker | `docker` | Render runs `docker build` on `./Dockerfile` | https://dream-catcher-5355.onrender.com |

Both have auto-deploy enabled on `main`: one `git push` rebuilds both services.

### Method A - native GitHub build (no Docker)

1. Render dashboard -> **New** -> **Web Service** -> connect the GitHub repo
2. **Language:** `Node`
3. **Build Command:** `npm install`
4. **Start Command:** `node server.js`
5. Add env vars `GEMINI_API_KEY`, `GEMINI_MODEL`, `NODE_VERSION=22`, and
   `npm_config_build_from_source=true`

The last variable matters: the prebuilt `sqlite3` binary npm downloads needs
glibc 2.38, which Render's Node image doesn't have, so the app crashes with
`ERR_DLOPEN_FAILED`. Building from source compiles it against Render's own
glibc. If you add the variable after a failed deploy, redeploy with
**Clear build cache** - otherwise Render restores the old `node_modules` and
npm skips the rebuild. The SQLite file lands at `./dreams.db`
in the project directory, so leave `DATABASE_PATH` unset here.

### Method B - Docker

The app ships a multi-stage `Dockerfile` and a `render.yaml` blueprint, so Render
builds the container straight from GitHub on every push to `main`.

### 1. Push to GitHub

```bash
git remote add origin https://github.com/<your-username>/dream-catcher.git
git push -u origin main
```

`.env` and `*.db` are gitignored - no keys or local data leave your machine.

### 2. Create the service on Render

Either option works; the blueprint is less clicking.

**Blueprint (uses `render.yaml`)**
1. Render dashboard -> **New** -> **Blueprint**
2. Connect the GitHub repo and approve the detected `dream-catcher` web service
3. Paste your `GEMINI_API_KEY` when prompted (it is marked `sync: false`)

**Manual**
1. Render dashboard -> **New** -> **Web Service** -> connect the repo
2. **Language:** `Docker` (Render reads the `Dockerfile`; leave build/start commands empty)
3. Add environment variables `GEMINI_API_KEY` and `GEMINI_MODEL`

### 3. Notes

- Render injects `PORT`; `server.js` already reads it, so no change is needed.
- `DATABASE_PATH` points at `/app/data`. On the free plan that directory is
  **ephemeral** - dreams are wiped on each deploy or restart. To keep them,
  attach a Render Disk mounted at `/app/data` (paid plans) or move to Postgres.
- Free instances sleep after ~15 minutes idle; the first request then takes
  roughly 50 seconds to wake.

### Running the container locally

```bash
docker build -t dream-catcher .
docker run --rm -p 3001:3001 --env-file .env dream-catcher
# open http://localhost:3001
```
