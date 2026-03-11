# P039 – Canvas Export REST API (PNG/SVG)

## Title
Add a REST Endpoint to Export the Current Room's Canvas as a PNG or SVG File

## Brief Summary
There is no way to extract a SketchGit drawing in a format usable outside the application. Users who want to include a sketch in a document, share it as an image, or archive a version must take screenshots — losing resolution, including browser chrome, and capturing no metadata. Fabric.js natively supports rasterisation to a data URL (`canvas.toDataURL()`) and SVG serialisation (`canvas.toSVG()`). Exposing a `GET /api/rooms/[roomId]/export` endpoint that renders any commit's canvas server-side (using `fabric` in a Node.js context) enables high-fidelity, programmatic exports with zero additional dependencies beyond what is already in the project.

## Current Situation
The only way to access a room's canvas content today is:
1. Inside the browser via the Fabric.js canvas element (no export button).
2. Via the WebSocket `fullsync` message (JSON format only, requires a live connection).
3. Via the raw JSONB column in the database (Prisma, developer-only).

There is no API endpoint for canvas data, and no client-side export button. `Commit.canvasJson` is stored as JSONB but never served in a rendered format.

## Problem with Current Situation
1. **No export path for non-technical users**: Screenshots are the only option. They include browser chrome, are not reproducible at arbitrary resolutions, and don't support transparent backgrounds.
2. **SVG is lossless and accessible**: Fabric.js produces clean, structured SVG output that scales infinitely and is readable by vector editors (Illustrator, Inkscape, Figma import). This is not available at all today.
3. **No historical snapshots**: A user cannot export the state of the canvas at a specific commit (e.g. the design from last week). The live canvas only shows the current HEAD.
4. **Integration friction**: Any downstream tool (documentation systems, email clients, Notion embeds) that wants to include a SketchGit drawing must either use the app interactively or go through the database directly.

## Goal to Achieve
1. Expose `GET /api/rooms/[roomId]/export?format=png|svg&commitSha=<sha>` that returns a rendered image or SVG document.
2. Default to the room's HEAD commit when `commitSha` is not specified.
3. Return PNG at 2× device pixel ratio for retina-quality output.
4. Support SVG format for lossless vector export.
5. Require no additional npm dependencies; use the already-bundled `fabric` package in a Node.js context.
6. For public rooms, no authentication required. For private rooms, require at least VIEWER membership (aligned with P034).

## What Needs to Be Done

### 1. Create `app/api/rooms/[roomId]/export/route.ts`
```typescript
// GET /api/rooms/:roomId/export?format=png|svg&sha=<commitSha>
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { validate } from '@/lib/api/validate';

const QuerySchema = z.object({
  format: z.enum(['png', 'svg']).default('png'),
  sha:    z.string().max(64).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const v = validate(QuerySchema, searchParams);
  if (!v.success) return v.response;

  const { format, sha } = v.data;
  const { roomId } = params;

  // Resolve the target commit
  let canvasJson: object;
  if (sha) {
    const commit = await prisma.commit.findUnique({ where: { sha } });
    if (!commit) return NextResponse.json({ error: 'Commit not found' }, { status: 404 });
    canvasJson = commit.canvasJson as object;
  } else {
    const state = await prisma.roomState.findUnique({ where: { roomId } });
    if (!state?.headSha) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    const commit = await prisma.commit.findUnique({ where: { sha: state.headSha } });
    if (!commit) return NextResponse.json({ error: 'No commits' }, { status: 404 });
    canvasJson = commit.canvasJson as object;
  }

  if (format === 'svg') {
    const svg = await renderToSVG(canvasJson);
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Content-Disposition': `attachment; filename="canvas-${roomId}.svg"`,
      },
    });
  }

  const png = await renderToPNG(canvasJson);
  return new NextResponse(png, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="canvas-${roomId}.png"`,
    },
  });
}
```

### 2. Implement `renderToSVG` and `renderToPNG` in `lib/export/canvasRenderer.ts`
Fabric.js supports headless rendering in Node.js via the `node-canvas` package (or via the `StaticCanvas` class which doesn't require a DOM):
```typescript
import { StaticCanvas } from 'fabric';

export async function renderToSVG(json: object): Promise<string> {
  const canvas = new StaticCanvas(undefined, {
    width: 1920,
    height: 1080,
    backgroundColor: '#0a0a0f',
  });
  await canvas.loadFromJSON(json);
  const svg = canvas.toSVG();
  canvas.dispose();
  return svg;
}

export async function renderToPNG(json: object): Promise<Buffer> {
  const canvas = new StaticCanvas(undefined, {
    width: 1920,
    height: 1080,
    backgroundColor: '#0a0a0f',
    multiplier: 2, // 2× for retina quality
  });
  await canvas.loadFromJSON(json);
  const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 });
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  canvas.dispose();
  return Buffer.from(base64, 'base64');
}
```

Note: `fabric.StaticCanvas` in Fabric.js v7 is documented to work in Node.js without a DOM environment. However, text rendering (Fira Code font) may need the `canvas` npm package for correct glyph metrics. Verify behavior in Node.js and document any text-rendering limitations.

### 3. Add a "Download" button in the UI (AppTopbar or Canvas action menu)
A simple anchor tag pointing to the API endpoint provides the client-side hook:
```typescript
<a
  href={`/api/rooms/${roomId}/export?format=png`}
  download={`canvas-${roomId}.png`}
  className="…"
>
  Export PNG
</a>
```
The format toggle (PNG/SVG) can be implemented as a dropdown with minimal new UI code.

### 4. Tests in `app/api/rooms/[roomId]/export/route.test.ts`
- GET with missing `roomId` → 404.
- GET with valid room, no SHA → resolves HEAD commit → 200 with `Content-Type: image/png`.
- GET with `format=svg` → 200 with `Content-Type: image/svg+xml`.
- GET with invalid `sha` → 404.
- GET with unknown `format` value → 422 (Zod validation failure).

## Components Affected
| Component | Change |
|-----------|--------|
| `app/api/rooms/[roomId]/export/route.ts` | **New file** – GET endpoint |
| `lib/export/canvasRenderer.ts` | **New file** – headless Fabric.js rendering helpers |
| `lib/export/canvasRenderer.test.ts` | **New file** – unit tests for rendering (mock Fabric.js) |
| `components/sketchgit/AppTopbar.tsx` | Add Export PNG/SVG download links |
| `app/api/rooms/[roomId]/export/route.test.ts` | **New file** – route integration tests |

## Data & Database Model
No schema changes. The endpoint reads `Commit.canvasJson` (already JSONB) and `RoomState.headSha`. No writes.

## Testing Requirements
- Unit: `renderToSVG` returns a string starting with `<svg`.
- Unit: `renderToPNG` returns a non-empty Buffer.
- Route: invalid query params return 422 with Zod error details.
- Route: commit-not-found returns 404.
- Route: PNG response has correct `Content-Type` and `Content-Disposition`.

## Linting and Type Requirements
- `canvasJson` from Prisma is `JsonValue` (Prisma type); cast to `object` before passing to Fabric.js.
- `renderToPNG` return type is `Promise<Buffer>` (server-side Node.js; not a browser API).
- The renderer module is excluded from browser-targeted ESLint globals (it is a server-side `lib/export/` module).

## Dependency Map
- Depends on: P011 ✅ (JSONB canvasJson), P014 ✅ (Zod validation), P018 ✅ (Fabric.js as npm package)
- Benefits from: P034 (room access control can gate private room exports)
- Enables: image-embed links in external tools (Notion, Confluence), email previews, archiving
