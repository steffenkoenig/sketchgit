# P020 – Memory Leak Prevention and Resource Cleanup

## Title
Prevent Memory Leaks by Implementing Proper Resource Cleanup Throughout the Application

## Brief Summary
Several modules register event listeners, timers, and DOM elements but never clean them up when the component unmounts or the collaboration session ends. The React `useEffect` in `SketchGitApp.tsx` initializes the engine but has no cleanup return function. The canvas engine registers two `window` event listeners with no corresponding `removeEventListener`. The server has a heartbeat `setInterval` with no `clearInterval` on process termination. These leaks cause accumulating memory usage, duplicate event handling, and unexpected behavior after reconnects. A targeted cleanup pass across three files resolves all identified leaks.

## Current Situation

### 1. No cleanup in the React component
`SketchGitApp.tsx` initializes the app engine but never destroys it:
```typescript
// components/SketchGitApp.tsx
useEffect(() => {
  if (!fabricReady || appRef.current) return;
  appRef.current = createSketchGitApp();
}, [fabricReady]);
// No cleanup return function → engine, WebSocket, and timers are never stopped
```
When React's strict mode double-invokes effects (development), or when the component is unmounted and remounted (e.g., during navigation), a second app instance is created without destroying the first. The first instance's WebSocket connection, Fabric.js canvas, and all event listeners remain active alongside the new instance.

### 2. Unremoved `window` event listeners in the canvas engine
`canvasEngine.ts` registers two global listeners in `init()`:
```typescript
// lib/sketchgit/canvas/canvasEngine.ts
window.addEventListener('resize', () => { ... });  // line 69
window.addEventListener('keydown', (e) => this.onKey(e));  // line 75
```
Neither has a corresponding `removeEventListener`. If the canvas is re-initialized (e.g., after hot-reload or room change), both listeners stack: after two inits there are four active listeners, after three there are six, etc. This causes duplicate tool activations and resize events.

### 3. No `destroy()` method on the app orchestrator
`lib/sketchgit/app.ts` and `lib/sketchgit/createSketchGitApp.ts` expose no method to tear down the application. Callers have no way to stop the WebSocket client, clear collaboration timers, or dispose of the Fabric.js canvas instance.

### 4. Heartbeat interval never cleared on server shutdown
`server.mjs` starts a global ping interval but never stops it:
```js
// server.mjs
const pingInterval = setInterval(() => { ... }, 25_000);
// No clearInterval(pingInterval) on SIGTERM/SIGINT
```
On a graceful shutdown (`kill -15 <pid>` or `docker stop`), Node.js exits after the `close` event but the interval keeps the event loop alive, delaying shutdown for up to 25 seconds and potentially causing Prisma to miss its `$disconnect()` call.

### 5. Orphaned cursor DOM nodes in the collaboration manager
`collaborationManager.ts` creates `<div>` elements for remote cursors:
```typescript
const el = document.createElement('div');
el.className = 'cursor';
// ...
document.body.appendChild(el);
```
When a peer disconnects, the cursor element is removed by ID. However, if the entire collaboration session ends (e.g., the local user navigates away or closes the panel), all remaining cursor elements stay in the DOM. On re-open, duplicate cursors accumulate.

## Problem with Current Situation
1. **Memory growth**: Each re-initialization leaks one WebSocket connection, one Fabric.js canvas, and multiple event listeners. In long-running browser sessions, this causes gradual memory growth visible in browser devtools.
2. **Duplicate events**: Stacked `keydown` listeners cause tool shortcuts to fire multiple times per keypress, creating multiple canvas objects from a single action.
3. **Delayed server shutdown**: The un-cleared heartbeat interval delays `docker stop` or Kubernetes pod termination by up to 25 seconds, violating Kubernetes's default `terminationGracePeriodSeconds`.
4. **Incorrect state after reconnect**: When a WebSocket reconnects after a network drop, the old collaboration manager still holds stale cursor positions and last-broadcast snapshots. A proper destroy-and-recreate cycle would reset this state correctly.
5. **React strict mode incompatibility**: React 18/19 strict mode runs every effect twice in development to detect side effects. Without a cleanup function, `createSketchGitApp()` is called twice and two engines run simultaneously, producing duplicate WebSocket connections.

## Goal to Achieve
1. Every module that allocates resources (event listeners, timers, DOM nodes, WebSocket connections) provides a `destroy()` method that releases them all.
2. The React `useEffect` returns a cleanup function that calls `app.destroy()`.
3. The server shuts down cleanly within 5 seconds of receiving `SIGTERM`, closing all WebSocket connections and disconnecting Prisma.
4. Re-initializing any module produces exactly the same number of active listeners and timers as the first initialization.

## What Needs to Be Done

### 1. Add `destroy()` to `CanvasEngine`
```typescript
// lib/sketchgit/canvas/canvasEngine.ts
class CanvasEngine {
  private boundResize: () => void;
  private boundKeydown: (e: KeyboardEvent) => void;

  init(canvasElementId: string): void {
    this.boundResize   = () => this.onResize();
    this.boundKeydown  = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener('resize', this.boundResize);
    window.addEventListener('keydown', this.boundKeydown);
    // ...existing Fabric.js setup...
  }

  destroy(): void {
    window.removeEventListener('resize', this.boundResize);
    window.removeEventListener('keydown', this.boundKeydown);
    this.canvas?.dispose(); // Fabric.js built-in cleanup
  }
}
```

### 2. Add `destroy()` to `CollaborationManager`
```typescript
// lib/sketchgit/realtime/collaborationManager.ts
destroy(): void {
  clearTimeout(this.drawFlushTimer);
  // Remove all cursor elements
  for (const el of Object.values(this.cursorEls)) {
    el.remove();
  }
  this.cursorEls = {};
  this.lastBroadcastSnapshot = {};
}
```

### 3. Add `destroy()` to the app orchestrator
```typescript
// lib/sketchgit/app.ts (or createSketchGitApp.ts)
export function createSketchGitApp(): SketchGitAppApi {
  // ...existing initialization...
  return {
    // ...existing methods...
    destroy(): void {
      canvasEngine.destroy();
      wsClient.disconnect();
      collaborationManager.destroy();
    },
  };
}
```

### 4. Return cleanup from `useEffect` in `SketchGitApp.tsx`
```typescript
// components/SketchGitApp.tsx
useEffect(() => {
  if (!fabricReady || appRef.current) return;
  const app = createSketchGitApp();
  appRef.current = app;
  return () => {
    app.destroy();
    appRef.current = null;
  };
}, [fabricReady]);
```

### 5. Add `SIGTERM` / `SIGINT` handler to `server.mjs`
```js
// server.mjs
async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  clearInterval(pingInterval);
  wss.clients.forEach(client => client.close(1001, 'Server shutting down'));
  wss.close(() => {
    server.close(async () => {
      if (prisma) await prisma.$disconnect();
      process.exit(0);
    });
  });
  // Force-exit if cleanup takes longer than 10 seconds
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/sketchgit/canvas/canvasEngine.ts` | Store bound listener references; add `destroy()` method |
| `lib/sketchgit/realtime/collaborationManager.ts` | Add `destroy()` to clear timers and cursor elements |
| `lib/sketchgit/app.ts` | Add `destroy()` to the public API; call subsystem destroys |
| `lib/sketchgit/createSketchGitApp.ts` | Export `destroy` in the return type |
| `components/SketchGitApp.tsx` | Return cleanup function from `useEffect` |
| `server.mjs` | Add `SIGTERM`/`SIGINT` handlers; clear `pingInterval` |

## Additional Considerations

### Fabric.js `canvas.dispose()`
`fabric.Canvas.dispose()` removes all Fabric.js internal event listeners, clears the canvas element, and nullifies internal references. Call it in `CanvasEngine.destroy()` to ensure Fabric.js does not hold references to the DOM canvas element after unmount.

### WeakRef for cursor elements
Alternatively, store cursor DOM elements in a `WeakMap<string, WeakRef<HTMLDivElement>>` so the garbage collector can reclaim them automatically when they are no longer referenced. This is a minor ergonomic improvement over explicit cleanup.

### Testing cleanup
Add tests that:
1. Call `init()` followed by `destroy()` and verify that `window.eventListeners` (using a spy) are removed.
2. Initialize two `SketchGitApp` instances sequentially and verify only one set of timers is active.
These tests can be added to the existing Vitest suite alongside the git model tests.

### React strict mode verification
After implementing cleanup, enable React strict mode (it is already on via `next.config.mjs`) and verify that no double-initialization errors appear in the browser console. The double-invoke behavior in development will now correctly create and immediately destroy the first instance before creating the permanent second one.
