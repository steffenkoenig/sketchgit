# P013 – Migrate server.mjs to TypeScript

## Title
Migrate the Custom WebSocket Server from JavaScript to TypeScript

## Brief Summary
`server.mjs` is the only significant file in the repository written in plain JavaScript. It contains 369 lines of server-side business logic—database persistence, WebSocket message routing, room management, and heartbeat handling—entirely without type safety. Migrating it to TypeScript aligns it with the rest of the codebase, surfaces latent bugs, and allows shared type definitions to be imported directly from `lib/`.

## Current Situation
The repository's `tsconfig.json` enforces strict TypeScript across all `lib/`, `components/`, and `app/` directories. `server.mjs` is explicitly excluded from TypeScript compilation because it uses the `.mjs` extension and is executed directly by Node.js at startup (`node server.mjs`).

Examples of type-unsafe patterns in the current file:

```js
// No type on 'data' – could be anything
ws.on('message', (data) => {
  let parsed;
  try { parsed = JSON.parse(data); } catch { return; }
  // parsed.type is accessed without type narrowing
  if (parsed.type === 'commit') { ... }
});

// Room map has no generic type – values assumed but never checked
const rooms = new Map(); // Map<any, any>

// DB functions return raw Prisma results without type assertions
async function dbSaveCommit(roomId, sha, parentSha, ...) { ... }
```

The `lib/sketchgit/types.ts` file defines shared types such as `Commit`, `Branch`, and WebSocket message payloads. Because `server.mjs` cannot import TypeScript files, these types are duplicated as JSDoc comments or simply not used, creating a drift risk between client and server message contracts.

## Problem with Current Situation
1. **No type safety on WebSocket messages**: Any property access on a parsed JSON message is unchecked. A misspelled field name or a schema change on the client side silently goes undetected until a runtime error.
2. **No shared message contract**: The client-side `collaborationManager.ts` defines message interfaces in TypeScript; the server handles the same messages in untyped JavaScript. These two views of the protocol can diverge without any compiler warning.
3. **Latent bugs hidden by lack of types**: Calls such as `rooms.get(roomId)` return `any`, making it easy to forget to handle the `undefined` case, pass wrong argument types to helper functions, or misuse Prisma return values.
4. **Inconsistency in the developer experience**: Contributors who are accustomed to TypeScript's tooling (autocompletion, inline errors, refactoring) find `server.mjs` opaque and risky to change.
5. **Maintenance overhead**: Any schema change (e.g., adding a field to the `Commit` model) must be manually reflected in `server.mjs` with no compiler enforcement.

## Goal to Achieve
1. Type all WebSocket message payloads using shared interfaces from `lib/sketchgit/types.ts`.
2. Type all database access via Prisma-generated types.
3. Eliminate `any` types in all server-side code.
4. Compile `server.ts` as part of the standard TypeScript build.
5. Maintain identical runtime behavior after the migration.

## What Needs to Be Done

### 1. Rename `server.mjs` to `server.ts`
Move the file and update `package.json` scripts:
```json
"build:server": "tsc -p tsconfig.server.json",
"start": "node dist/server.js",
"dev": "tsx watch server.ts"
```

### 2. Add `tsx` for development hot-reload
```bash
npm install --save-dev tsx
```
`tsx` transpiles TypeScript on the fly for the development server without requiring a separate build step.

### 3. Add `server.ts` to `tsconfig.json` compilation
Either include `server.ts` in the root `tsconfig.json`, or create a dedicated `tsconfig.server.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "node16",
    "outDir": "dist"
  },
  "include": ["server.ts", "lib/**/*.ts"]
}
```

### 4. Define a shared WebSocket message type in `lib/sketchgit/types.ts`
```typescript
export type WsMessageType =
  | 'welcome' | 'presence' | 'profile' | 'draw' | 'draw-delta'
  | 'commit' | 'cursor' | 'ping' | 'pong'
  | 'fullsync-request' | 'fullsync' | 'user-left';

export interface WsMessage {
  type: WsMessageType;
  [key: string]: unknown;
}
```
Import this type in both `server.ts` and `collaborationManager.ts` so that both sides of the WebSocket protocol share the same definition.

### 5. Type the room state map
```typescript
import type { WebSocket } from 'ws';

interface ClientInfo {
  ws: WebSocket;
  name: string;
  color: string;
}

const rooms = new Map<string, Map<string, ClientInfo>>();
```

### 6. Type all database helper functions
```typescript
async function dbSaveCommit(
  roomId: string,
  sha: string,
  parentSha: string | null,
  parents: string[],
  branch: string,
  message: string,
  canvasJson: string,
  isMerge: boolean,
  authorId: string | null,
): Promise<void> { ... }
```

### 7. Add type guards for incoming WebSocket messages
```typescript
function isWsMessage(data: unknown): data is WsMessage {
  return typeof data === 'object' && data !== null && 'type' in data;
}
```
Use these guards at all message-handling boundaries.

### 8. Update CI/build scripts
Ensure the TypeScript build step runs before starting the server in production:
```json
"build:server": "tsc -p tsconfig.server.json",
"start": "node dist/server.js"
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `server.mjs` | Renamed to `server.ts`; fully typed |
| `lib/sketchgit/types.ts` | Add shared `WsMessage` type and `WsMessageType` union |
| `tsconfig.json` / `tsconfig.server.json` | Include `server.ts` in compilation |
| `package.json` | Update `start` / `dev` scripts; add `tsx` dev dependency |
| `components/SketchGitApp.tsx` | No change (already TypeScript) |

## Additional Considerations

### Build output for production
The compiled `dist/server.js` should be committed to `.gitignore`. The production Docker image should run `npm run build:server && node dist/server.js` rather than running TypeScript source directly.

### ESM compatibility
`server.mjs` uses ES module syntax (`import`, `export`). The TypeScript compiler must emit ES modules. Set `"module": "ESNext"` and `"moduleResolution": "node16"` in the server TypeScript config.

### Incremental migration
If the full migration is too large for a single PR, a two-step approach works:
1. Rename to `.ts`, add `// @ts-nocheck` temporarily to unblock the build.
2. Remove `@ts-nocheck` file-by-file as types are added.

This mirrors the strategy successfully used in P005.
