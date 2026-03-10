# P023 – Health Check Endpoint and Graceful Shutdown

## Title
Add a Health Check Endpoint and Implement Graceful Shutdown for Production Readiness

## Brief Summary
The application has no HTTP health check endpoint and no graceful shutdown handler. Container orchestrators (Kubernetes, Docker Swarm, Railway, Render) require a health check endpoint to determine whether a pod is ready to serve traffic and whether a running pod is still alive. Without a shutdown handler, terminating the process disconnects all WebSocket clients abruptly and leaves Prisma database connections open. Adding a `/api/health` endpoint and a `SIGTERM` handler makes the application first-class for any container-based deployment.

## Current Situation
`server.mjs` handles HTTP requests by forwarding them all to the Next.js request handler:
```js
// server.mjs
server.on('request', async (req, res) => {
  // Intercept WebSocket heartbeat pings first
  if (req.url === '/__ws_ping') { res.end('ok'); return; }
  // All other requests go to Next.js
  handle(req, res);
});
```
There is no dedicated health check path. The `/__ws_ping` route serves only as an internal WebSocket connectivity probe and is not suitable for use as a container liveness/readiness probe (it does not check database connectivity or application state).

There is also no `SIGTERM` or `SIGINT` handler. When a container is stopped (`docker stop` or Kubernetes pod eviction), Node.js receives `SIGTERM` and exits immediately, which:
1. Drops all active WebSocket connections without sending a close frame.
2. Abandons in-flight database writes (Prisma transactions that started but have not committed).
3. Leaves Prisma's connection pool open on the database side until the idle timeout.

## Problem with Current Situation
1. **Container orchestration fails**: Kubernetes marks a pod as "Running" only after liveness and readiness probes pass. Without a probe endpoint, the orchestrator cannot distinguish a healthy pod from one that is starting up, booting slowly, or silently broken.
2. **Deployment downtime**: Rolling deployments replace old pods with new ones. Without a readiness probe, traffic is routed to new pods before they are fully initialized (Fabric.js CDN loaded, database connection pool warmed up), causing brief errors for users.
3. **Abrupt WebSocket disconnections**: When a pod is stopped for a rolling update, all connected users see a sudden `WebSocket connection closed` error rather than being gracefully redirected to a new instance.
4. **Database connection leaks**: Without `prisma.$disconnect()`, the PostgreSQL connection pool keeps connections open for the idle timeout period (typically 10–30 minutes per connection). Under frequent deployments, this exhausts the database's `max_connections` limit.
5. **Data loss risk**: An in-flight `dbSaveCommit()` call that is interrupted mid-transaction leaves the commit row in an undefined state.

## Goal to Achieve
1. Add `GET /api/health` that returns `200 OK` when the application is healthy and `503 Service Unavailable` when critical dependencies (database) are unreachable.
2. Add `GET /api/ready` (or include readiness in `/api/health`) that only returns `200` after initialization is complete (Prisma connection established, WebSocket server listening).
3. Implement a `SIGTERM` handler that:
   a. Stops accepting new WebSocket connections.
   b. Sends a close frame to all connected WebSocket clients with a short grace period.
   c. Waits for in-flight database transactions to complete.
   d. Calls `prisma.$disconnect()`.
   e. Exits cleanly within 10 seconds (hard kill after timeout).

## What Needs to Be Done

### 1. Add `/api/health` to `server.mjs`
```js
// server.mjs
server.on('request', async (req, res) => {
  if (req.url === '/api/health') {
    const isDbHealthy = await checkDbHealth();
    const status = isDbHealthy ? 200 : 503;
    const payload = JSON.stringify({
      status:   isDbHealthy ? 'ok' : 'degraded',
      uptime:   process.uptime(),
      rooms:    rooms.size,
      clients:  wss.clients.size,
      database: isDbHealthy ? 'ok' : 'unreachable',
    });
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(payload);
    return;
  }
  handle(req, res);
});

async function checkDbHealth() {
  if (!prisma) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
```

### 2. Add a separate `/api/ready` readiness probe
The readiness probe should return `503` during startup (before the WebSocket server is listening) and `200` once fully ready:
```js
let isReady = false;

wss.on('listening', () => { isReady = true; });

// In request handler:
if (req.url === '/api/ready') {
  res.writeHead(isReady ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ready: isReady }));
  return;
}
```

### 3. Implement graceful shutdown
```js
// server.mjs
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'Shutdown initiated');

  // 1. Stop new WebSocket connections
  isReady = false;

  // 2. Notify all clients and allow 3s for them to reconnect elsewhere
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1001, 'Server is shutting down');
    }
  });

  // 3. Close WebSocket server (stops new upgrades)
  await new Promise((resolve) => wss.close(resolve));

  // 4. Close HTTP server (stops new HTTP requests)
  await new Promise((resolve) => server.close(resolve));

  // 5. Clear timers
  clearInterval(pingInterval);

  // 6. Disconnect Prisma
  if (prisma) await prisma.$disconnect();

  logger.info('Shutdown complete');
  process.exit(0);
}

// Force-exit if graceful shutdown takes too long
const SHUTDOWN_TIMEOUT_MS = 10_000;
['SIGTERM', 'SIGINT'].forEach((sig) => {
  process.on(sig, () => {
    setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    shutdown(sig);
  });
});
```

### 4. Configure health check in `docker-compose.yml`
```yaml
services:
  app:
    image: sketchgit:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### 5. Add Kubernetes probes (when deploying to Kubernetes)
```yaml
# Kubernetes Deployment manifest
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 15

readinessProbe:
  httpGet:
    path: /api/ready
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `server.mjs` | Add `/api/health` and `/api/ready` routes; add `SIGTERM`/`SIGINT` handler; add graceful shutdown logic |
| `docker-compose.yml` | Add `healthcheck` config when app service is added (see P031) |

## Additional Considerations

### Liveness vs. readiness
- **Readiness** (`/api/ready`): Should the load balancer send traffic here? Returns `503` during startup and whenever the app is temporarily unable to serve (e.g., database connection lost).
- **Liveness** (`/api/health`): Is the process still alive and not deadlocked? Should almost always return `200`. Only return `503` for truly unrecoverable states that require a pod restart.

Using separate endpoints for liveness and readiness prevents the orchestrator from restarting a pod just because the database is temporarily unavailable (which is a readiness concern, not a liveness concern).

### Database health check cost
`SELECT 1` is extremely cheap (sub-millisecond). However, calling it on every health check poll (every 30 seconds) adds a small but consistent load. If the health check frequency is increased (e.g., every 5 seconds), consider using a connection pool ping (`prisma.$connect()` is idempotent if already connected) instead of a raw query.

### Response caching
To protect against health check endpoints becoming a DDoS target, cache the health result for 5 seconds:
```js
let cachedHealth = null;
let cacheExpiry  = 0;

async function getHealth() {
  if (Date.now() < cacheExpiry) return cachedHealth;
  cachedHealth = { database: await checkDbHealth(), uptime: process.uptime() };
  cacheExpiry  = Date.now() + 5_000;
  return cachedHealth;
}
```
