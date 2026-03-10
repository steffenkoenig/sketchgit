# P026 – Dockerfile and Containerization

## Title
Add a Dockerfile and Multi-Stage Build for Reproducible, Production-Ready Container Deployments

## Brief Summary
The repository contains a `docker-compose.yml` that only starts a PostgreSQL database. The Next.js + Node.js application has no `Dockerfile`, making it impossible to build and run the app in a container without custom, undocumented steps. Adding a multi-stage `Dockerfile` ensures that the application can be built, tested, and deployed identically on any machine, CI runner, or cloud platform. It also dramatically reduces the final image size by separating the build environment from the runtime environment.

## Current Situation
`docker-compose.yml` defines only the database service:
```yaml
# docker-compose.yml (entire file)
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: sketchgit
      POSTGRES_USER: sketchgit
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```
There is no `app` service. To run the full stack, developers must:
1. Start the database with `docker-compose up -d`.
2. Install Node.js 22 locally (exact version not pinned in any `.nvmrc` or `.node-version` file).
3. Run `npm install`, `npx prisma migrate dev`, `npm run build`, `npm start` manually.

This multi-step manual process is fragile, undocumented, and not reproducible across different Node.js versions or operating systems.

`next.config.mjs` has no optimization settings:
```js
const nextConfig = { reactStrictMode: true };
```
There is no bundle analysis, no image compression configuration, and no `output: 'standalone'` mode (which is required to produce a minimal Next.js runtime image).

## Problem with Current Situation
1. **No reproducible build**: Different developers use different Node.js versions, producing builds with subtly different behavior or failing npm scripts. Without a pinned Node.js version in a `.nvmrc` or Dockerfile, CI and local environments diverge.
2. **Large deployment artifact**: A `node_modules` directory for a Next.js + Prisma project is typically 400–800 MB. Without multi-stage builds, a naive Dockerfile would include all dev dependencies, Prisma CLI, source TypeScript files, and test infrastructure in the production image.
3. **No container-based deployment path**: PaaS platforms (Railway, Render, Fly.io, Heroku), Kubernetes, and Docker Swarm all require a Docker image. Without a `Dockerfile`, the project cannot be deployed to any of these platforms without custom build instructions.
4. **Missing health check integration**: The proposed health check endpoint from P023 (`/api/health`) cannot be wired to `HEALTHCHECK` in a Dockerfile that does not exist.
5. **Security exposure**: Without a minimal runtime image, attack surface is larger (build tools, compilers, dev dependencies all present at runtime).

## Goal to Achieve
1. A multi-stage `Dockerfile` that produces a minimal, optimized production image (~200–300 MB vs ~800 MB for a naive build).
2. Next.js `output: 'standalone'` mode enabled to include only the files needed at runtime.
3. A `.dockerignore` file that excludes dev files, test files, and build caches.
4. An updated `docker-compose.yml` with an `app` service for running the full stack locally.
5. A pinned Node.js version in `.nvmrc` and the `Dockerfile` for environment consistency.

## What Needs to Be Done

### 1. Enable Next.js standalone output
```js
// next.config.mjs
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',  // Bundle only the necessary files for production
};
```
This changes `next build` to produce a self-contained `./next/standalone` directory that can run as `node .next/standalone/server.js` without a separate `npm install`.

### 2. Create a multi-stage `Dockerfile`
```dockerfile
# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Stage 2: Build the application
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client
RUN npx prisma generate
# Build Next.js in standalone mode
RUN npm run build

# Stage 3: Production runtime
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 sketchgit

# Copy only the built artifacts needed at runtime
COPY --from=builder --chown=sketchgit:nodejs /app/.next/standalone ./
COPY --from=builder --chown=sketchgit:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=sketchgit:nodejs /app/public ./public
# server.mjs is the custom Node.js entrypoint
COPY --from=builder --chown=sketchgit:nodejs /app/server.mjs ./

USER sketchgit
EXPOSE 3000
ENV PORT=3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.mjs"]
```

### 3. Create `.dockerignore`
```
node_modules
.next
.git
*.log
.env
.env.*
!.env.example
coverage
```

### 4. Update `docker-compose.yml` with the app service
```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: sketchgit
      POSTGRES_USER: sketchgit
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sketchgit"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://sketchgit:dev_password@db:5432/sketchgit
      NEXTAUTH_URL:  http://localhost:3000
      AUTH_SECRET:   dev-secret-change-in-production
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

volumes:
  pgdata:
```

### 5. Add `.nvmrc` to pin the Node.js version
```
22
```
This enables `nvm use` (or `fnm use`) to automatically switch to the correct version when entering the project directory, and serves as documentation for the required Node.js version.

### 6. Run database migrations on container startup
Add a migration step to the Docker entrypoint or compose command:
```yaml
# docker-compose.yml – app service
command: sh -c "npx prisma migrate deploy && node server.mjs"
```
Or use a separate init container:
```yaml
  migrate:
    build: .
    command: npx prisma migrate deploy
    environment:
      DATABASE_URL: postgres://sketchgit:dev_password@db:5432/sketchgit
    depends_on:
      db:
        condition: service_healthy
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `Dockerfile` | New file: multi-stage build for Next.js + custom server |
| `.dockerignore` | New file: exclude dev files from image |
| `docker-compose.yml` | Add `app` service with database dependency and health check |
| `next.config.mjs` | Add `output: 'standalone'` |
| `.nvmrc` | New file: pin Node.js version to 22 |

## Additional Considerations

### `output: 'standalone'` and custom server
Next.js standalone mode outputs a minimal server in `.next/standalone/server.js`. However, SketchGit uses a custom `server.mjs` that combines the Next.js request handler with a WebSocket server. The `server.mjs` must be updated to import from the standalone build path (`.next/standalone`) rather than using `next/dist/server/next`. Review the Next.js standalone mode documentation for custom server compatibility.

### Image size target
A well-optimized multi-stage build for a Next.js 16 app with Prisma should produce a runtime image of 180–300 MB on `node:22-alpine`. Run `docker images` after the build to verify the image size.

### Non-root user security
The `Dockerfile` above runs the app as a non-root user (`sketchgit`, uid 1001). This is a security best practice: if the app is compromised, the attacker cannot write to system directories or install packages. Verify that `server.mjs` does not require root privileges (e.g., binding to port 80 requires root; use port 3000 and let a reverse proxy handle port 80).

### Environment variable secrets in Docker
Never bake `AUTH_SECRET` or database credentials into the image. Use Docker secrets, Kubernetes secrets, or a secrets manager (AWS Secrets Manager, Vault) to inject sensitive values at runtime. The `docker-compose.yml` above uses plaintext for development convenience only; production deployments must use proper secret management.
