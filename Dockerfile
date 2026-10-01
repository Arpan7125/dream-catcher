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
