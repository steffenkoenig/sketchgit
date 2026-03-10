# SketchGit

[![CI](https://github.com/steffenkoenig/sketchgit/actions/workflows/ci.yml/badge.svg)](https://github.com/steffenkoenig/sketchgit/actions/workflows/ci.yml)

SketchGit is a Next.js 16 collaborative whiteboard that feels like a lightweight Git client for drawings.
It combines freeform sketching with version control concepts such as commits, branches, checkout, rollback, and merges.

## What It Does

- Draw on a shared canvas with pen, lines, arrows, rectangles, ellipses, text, and eraser tools.
- Create commits from your drawing state with a custom commit message.
- Create and switch branches to explore ideas without losing previous work.
- Visualize history in a timeline with branch labels and merge nodes.
- Checkout old commits in detached HEAD mode and branch from any point in history.
- Merge branches using a 3-way merge engine with conflict resolution at property level.
- Collaborate live across multiple users using WebSocket rooms (presence, cursor updates, canvas sync).

## Tech Stack

- Next.js 16 (App Router)
- React 19
- Custom Node server with `ws` WebSocket server
- Fabric.js for canvas rendering and object editing
- Component-based UI under `components/` with app logic modularized under `lib/`

## Project Structure

- `app/layout.tsx`: global layout
- `app/page.tsx`: page entry rendering the app component
- `components/SketchGitApp.tsx`: React UI component tree
- `lib/sketchgit/createSketchGitApp.ts`: app engine initializer
- `server.ts`: Next + WebSocket room server

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Open http://localhost:3000 in your browser.

4. Optional: share a room by adding `?room=my-session` to the URL.

## Typical Workflow

1. Draw or edit objects on the canvas.
2. Commit your changes.
3. Create a branch for an experiment.
4. Continue drawing and commit again.
5. Merge your branch back and resolve conflicts if needed.

## Keyboard Shortcuts

- `S` Select
- `P` Pen
- `L` Line
- `A` Arrow
- `R` Rectangle
- `E` Ellipse
- `T` Text
- `X` Eraser
- `+` Zoom in
- `-` Zoom out
- `0` Reset zoom
- `Delete` or `Backspace` Remove selected object

## Live Collaboration Model

- Every user connects to `/ws` and joins a room ID.
- Server broadcasts presence, cursor movement, draw updates, and commits to room members.
- New users request a full state sync from existing room participants.
- Invite sharing is link-based (`?room=<id>`), no account setup required.

## Merge Model

SketchGit tracks canvas objects with stable internal IDs.
During merge, it compares base, target, and source snapshots (3-way merge):

- Non-overlapping edits are merged automatically.
- Conflicting object properties are presented in a conflict modal.
- You choose per property whether to keep `ours` or `theirs`.

## Current Limitations

- Project state is currently in memory only and is not persisted to disk.
- Collaboration has no authentication or access control yet.
- No remote Git repository integration yet.

## Project Goal

SketchGit is an interactive prototype to make version-control ideas tangible for visual work.
It is ideal for demos, experiments, and learning Git-like workflows through drawing.