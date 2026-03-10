# ─────────────────────────────────────────────────────────────────────────────
# Dockerfile – multi-stage build for SketchGit
#
# Stage 1 (deps):    Install all Node.js dependencies including devDependencies
#                    needed for the build step.
# Stage 2 (builder): Generate Prisma client and build the Next.js app.
#                    Prune devDependencies and add tsx back for production use.
# Stage 3 (runner):  Minimal production image – only built artefacts and
#                    the pruned runtime node_modules.
#
# Build:  docker build -t sketchgit .
# Run:    docker compose up
# ─────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: Install all dependencies ───────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
# Install all dependencies (dev + prod) needed for Prisma generate and next build
RUN npm ci

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma client against the schema
RUN npx prisma generate

# Build the Next.js application (outputs to .next/standalone/ with standalone mode)
RUN npm run build

# Prune devDependencies to reduce the runtime image size, then re-add tsx.
# tsx is declared as a devDependency but used in the production start command
# ("start": "NODE_ENV=production tsx server.ts"), so it must be present at runtime.
RUN npm prune --omit=dev && npm install tsx --no-package-lock --no-save

# ─── Stage 3: Production runtime ─────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 sketchgit

# ── Copy Next.js build artefacts (standalone output) ─────────────────────────
# `output: 'standalone'` in next.config.mjs produces a self-contained directory
# that includes a trimmed node_modules for the Next.js runtime.
COPY --from=builder --chown=sketchgit:nodejs /app/.next/standalone ./
COPY --from=builder --chown=sketchgit:nodejs /app/.next/static     ./.next/static
COPY --from=builder --chown=sketchgit:nodejs /app/public           ./public

# ── Custom WebSocket server and TypeScript source ─────────────────────────────
# server.ts is the combined Next.js + WebSocket entrypoint (P013).
COPY --from=builder --chown=sketchgit:nodejs /app/server.ts             ./
COPY --from=builder --chown=sketchgit:nodejs /app/lib                   ./lib
COPY --from=builder --chown=sketchgit:nodejs /app/tsconfig.json         ./
COPY --from=builder --chown=sketchgit:nodejs /app/tsconfig.server.json  ./
COPY --from=builder --chown=sketchgit:nodejs /app/package.json          ./

# ── Prisma schema (needed for `prisma migrate deploy` on startup) ─────────────
COPY --from=builder --chown=sketchgit:nodejs /app/prisma ./prisma

# ── Pruned production node_modules (includes tsx + all runtime deps) ─────────
# These are the full production deps from the builder stage after `npm prune`.
# The standalone node_modules covers Next.js internals; we overlay the full set
# so that server.ts can import ws, pino, next-auth, prisma, tsx, etc.
COPY --from=builder --chown=sketchgit:nodejs /app/node_modules ./node_modules

USER sketchgit
EXPOSE 3000
ENV PORT=3000

# Health check – polls the /api/health endpoint added in P023.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node_modules/.bin/tsx", "server.ts"]
