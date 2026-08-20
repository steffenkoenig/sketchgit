# SketchGit Platform Improvements

## 1. Interactive Laser Pointer Tool

### Goal
Provide an interactive, temporary "Laser Pointer" tool that allows users to highlight areas or trace paths on the canvas during real-time collaboration without modifying the actual document state or creating permanent objects.

### Problem
During collaborative sessions, such as brainstorming or architectural reviews, participants frequently need to direct others' attention to specific parts of the canvas. Currently, they either have to verbally describe the location or draw temporary shapes/lines that they must remember to delete later. This clutters the canvas, generates unnecessary commits, and slows down the natural flow of conversation.

### Proposed Changes
- **Canvas Engine**: Introduce a new `LaserPointer` tool within the Fabric.js integration. When active, dragging the mouse creates a temporary, fading trail (e.g., using a glowing stroke effect) that is not added to the core canvas object stack.
- **Backend API & WebSockets**:
  - Add a new low-latency WebSocket message type (`LASER_MOVE`) to broadcast the pointer's coordinates to other clients in the room.
  - Ensure laser pointer data is ephemeral and never persisted to the PostgreSQL database or included in commit histories.
- **Frontend UI**:
  - Add a "Laser Pointer" icon to the main drawing toolbar.
  - When the tool is selected, render incoming laser trails from other users with distinct colors corresponding to their presence indicators.

### Definitions of Done
- **Docs**: Update `/docs/customer` to explain how to select and use the Laser Pointer tool. Update `/docs/technical` to document the new `LASER_MOVE` WebSocket event payload structure.
- **Testing**: Vitest unit tests to verify that laser pointer events are correctly ignored by the canvas state serialization and history engines. Playwright E2E tests to confirm the tool can be selected and visually renders a path on the canvas.
- **Security**: WebSocket payloads for the laser pointer are strictly validated using Zod to ensure they contain only valid coordinate data and do not exceed rate limits, preventing potential denial-of-service via coordinate flooding.
- **Reliability**: Laser pointer rendering utilizes optimized `requestAnimationFrame` and canvas context operations to ensure 60fps performance without lagging the main drawing thread, even with multiple concurrent users.
- **Accessibility**: The tool button in the toolbar is fully keyboard-accessible with appropriate `aria-label` tags. The visual trails must use high-contrast colors to be visible against various canvas backgrounds.
- **GDPR compliance**: The laser pointer feature generates strictly ephemeral interaction data that is broadcast live and immediately discarded. No personal data is stored or logged, ensuring full GDPR compliance by default.

### Future Press Release
**Guide the Conversation with the SketchGit Laser Pointer**
Collaboration is about more than just drawing; it is about communicating intent. Today, we are excited to introduce the Interactive Laser Pointer Tool to SketchGit. Whether you are leading a sprint retrospective, presenting an architectural diagram, or just brainstorming with your team, you can now effortlessly guide everyone's attention without permanently cluttering the canvas. Simply select the laser tool, and your movements will be broadcast instantly to everyone in the room as a beautiful, fading trail. No more drawing temporary circles or saying "look at the top left." Keep your diagrams clean and your meetings focused with the SketchGit Laser Pointer, available in your toolbar today!

---

## 2. Interactive Session Timers

### Goal
Implement a synchronized, visible countdown timer within the canvas room to facilitate timeboxed activities like agile retrospectives, brainstorming exercises, and voting sessions.

### Problem
Timeboxing is a crucial technique in collaborative exercises, but SketchGit currently lacks any native time management tools. Teams are forced to rely on external timer applications or browser tabs, which fragments attention and pulls users away from the canvas. When a facilitator starts a timer externally, participants often lose track of how much time remains, leading to disorganized and inefficient meetings.

### Proposed Changes
- **Backend API & WebSockets**:
  - Add a new `RoomTimer` model to the Prisma schema (or manage strictly in-memory via Redis for ephemeral state) to track the timer's end time and status (running, paused, stopped).
  - Implement WebSocket events (`TIMER_START`, `TIMER_PAUSE`, `TIMER_UPDATE`, `TIMER_END`) to synchronize the countdown across all connected clients.
- **Frontend UI**:
  - Introduce a sleek, unobtrusive Timer widget in the top navigation bar of the room interface.
  - Provide controls for room owners and editors to set a duration (e.g., 5 minutes, 10 minutes), start, pause, and reset the timer.
  - Add an optional audio chime and a subtle visual pulse when the timer reaches zero.
- **Email Notifications**: Allow facilitators to optionally trigger an automated email summary of the session to participants once the timer concludes.

### Definitions of Done
- **Docs**: Add a new section in `/docs/customer` explaining how facilitators can manage session timers. Update `/docs/technical` with details on how time synchronization handles varying client-server latencies.
- **Testing**: Vitest unit tests verifying the timer duration and offset calculations. Playwright E2E tests ensuring the timer UI updates correctly across multiple simulated clients and correctly transitions states.
- **Security**: API endpoints and WebSocket handlers enforce role-based access control, ensuring only users with `EDITOR` or `OWNER` permissions can start, stop, or modify the timer.
- **Reliability**: The timer logic uses an absolute server timestamp (`endTime`) rather than continuous tick broadcasts, ensuring that temporary network disconnections do not cause the timer to drift out of sync for any client.
- **Accessibility**: The timer widget's current time is periodically announced to screen readers via an `aria-live` region. The visual alert upon timer completion provides a clear, high-contrast indication alongside the optional audio chime.
- **GDPR compliance**: Timer session data is strictly functional and temporary. Any optional email summaries generated rely entirely on existing, user-consented notification preferences, with no new permanent tracking introduced.

### Future Press Release
**Keep Your Meetings on Track with SketchGit Session Timers**
Great ideas take time, but the best meetings stay on schedule. We are thrilled to announce the arrival of Interactive Session Timers directly within SketchGit rooms. Facilitators can now start synchronized countdowns for brainstorming, voting, or design critiques without anyone having to leave the canvas. Every participant sees the exact same time remaining, keeping your team perfectly aligned and focused on the task at hand. When time is up, a gentle chime and visual alert let everyone know it is time to move to the next phase. Stop juggling multiple apps and start running seamless, timeboxed workshops with SketchGit Session Timers!
