# P095 - Custom Templates and Shape Library

## Goal
To enable users to save selections of objects or entire canvas layouts as reusable custom templates within a personalized shape library, speeding up the creation process for recurring diagrams and structures.

## Problem
Currently, users who frequently create similar diagrams (like flowcharts, UI wireframes, or specific architectural models) must manually reconstruct these complex grouped objects from scratch every time, or tediously copy-paste them from older rooms. This repetition reduces efficiency and disrupts the creative workflow, lacking the component reusability expected in modern whiteboard tools.

## Proposed Changes
1. **Schema Update**: Introduce a `ShapeTemplate` model to store the serialized JSON of grouped objects (or full canvas states) associated with a `User`.
2. **Library UI Panel**: Add a new "Shape Library" sidebar panel to the canvas interface, allowing users to view, search, and manage their saved templates.
3. **Save/Load Logic**: Implement a "Save as Template" action in the context menu for selected canvas objects. When dragged from the library, the system will instantiate the stored JSON onto the canvas.
4. **Thumbnail Generation**: Automatically generate and store a lightweight SVG or PNG thumbnail representation of the template upon creation for display in the library sidebar.
5. **API Endpoints**: Create CRUD API endpoints to manage a user's collection of saved templates.

## Future Press Release
Stop reinventing the wheel on every new whiteboard! SketchGit introduces the Custom Templates and Shape Library. We know that many workflows require reusing the same complex diagrams, custom UI components, and tailored flowcharts. Now, you can simply select any group of objects on your canvas and save them as a custom template with a single click. Access your personalized Shape Library at any time to instantly drag and drop your frequently used structures right back into the action. Build faster, stay consistent, and save time with SketchGit!

## Definitions of Done

### Implementation
- `ShapeTemplate` database schema created to store object metadata, serialized state, and user associations.
- Canvas context menu updated with a "Save as Template" option for active selections.
- Backend logic implemented to sanitize and strip unique IDs from serialized objects before saving as a template.
- Thumbnail generation process implemented (either client-side before upload or server-side).
- "Shape Library" sidebar panel developed and integrated into the main canvas UI, supporting drag-and-drop instantiation.

### Testing
- Unit tests written for the template serialization/deserialization logic, ensuring robust handling of all supported Fabric.js object types.
- Integration tests validating the template CRUD API endpoints.
- End-to-end (E2E) tests simulating the saving of an object group and subsequently dragging it from the library back onto the canvas.
- Coverage remains at or above the required project threshold.

### Documentation
- User guide updated with tutorials on how to create, manage, and use custom templates.
- Developer documentation updated describing the serialization format and storage mechanism for templates.

### Security
- The JSON serialization and deserialization process must strictly validate inputs to prevent malicious payloads or XSS injection when rendering templates.
- Ensure proper access controls so a user can only read, update, or delete their own templates.

### Reliability
- The template loading mechanism must efficiently handle instantiating complex groupings without blocking the main browser thread or causing significant frame drops.
- Implement pagination and lazy loading in the Shape Library sidebar to maintain performance when a user has a large number of saved templates.

### Accessibility
- The Shape Library sidebar must be fully keyboard navigable, allowing users to browse and insert templates without a mouse.
- Meaningful ARIA labels and descriptions must be associated with the template thumbnails for screen readers.

### GDPR compliance
- Custom templates represent user-generated content; they must be fully included when a user initiates a data export request.
- All stored templates must be permanently deleted if the associated user requests account deletion.

## Implementation Notes

Implemented largely as proposed, adapted to what the codebase actually has
(no Redis queue, no existing pagination pattern, no existing "export my
data" mechanism to extend) and with two deliberate scope-downs.

**What was built:**
- `ShapeTemplate` Prisma model (`id, userId, name, canvasJson: Json,
  thumbnailPng: Bytes?`), cascade-deletes on the user relation like every
  other per-user table in this app.
- `lib/db/templateRepository.ts` — CRUD scoped by `userId`; `getShapeTemplate`
  and `getShapeTemplateThumbnail` return `null` (not a 403) for another
  user's template ID, matching the rest of the app's pattern of not
  confirming another user's resource IDs exist.
- `lib/server/templateSanitizer.ts` — validates the submitted canvas JSON
  (shape, size cap 300 KB, object-count cap 300) and strips two concrete
  attack surfaces before persisting: `_link` values with a non-http(s)/mailto
  scheme (`javascript:` XSS, same class of bug the client's double-click
  handler in `canvasEngine.ts` already guards against at click time — this
  is the save-time counterpart), and image `src` values that aren't
  `data:image/...` (an SSRF vector, since server-side thumbnail rendering
  uses `node-canvas`, which really does fetch a remote URL given one).
  `_id` is stripped everywhere including nested group members.
- `lib/export/canvasRenderer.ts` gained `renderShapeTemplateThumbnail()` —
  a variant of `renderToPNG()` that fits/centers the saved objects' bounding
  box into a small (320×240) viewport via a computed viewport transform,
  since a template's objects keep the absolute x/y they had on the room
  canvas they were copied from (unlike a full-room export, which renders at
  the canvas's own coordinates).
- `CanvasEngine.getSelectionData()` / `instantiateTemplate()` — selection
  serialization reuses the exact custom-properties list `getCanvasData()`
  uses; instantiation strips `_id`, offsets position by 24px so a repeated
  insert doesn't stack exactly on the last one, and uses Fabric v7's
  `util.enlivenObjects()` to create live objects without reloading the whole
  canvas (verified against a standalone script before writing the
  integration, per the established practice — see
  [[feedback_proposal_verification_practice]]). New objects get a fresh
  `_id` from the existing `object:added` → `ensureObjId()` listener, the
  same mechanism every other object-creation path in this app already
  relies on.
- Four REST routes: `GET/POST /api/templates`, `GET/DELETE
  /api/templates/[id]`, `GET /api/templates/[id]/thumbnail`, `GET
  /api/templates/export`. A 100-template-per-user cap replaces the
  proposal's "pagination and lazy loading" requirement (see deviations).
- UI: a "Save as Template" context-menu item and a "Shape Library" topbar
  button open the same `ShapeLibraryModal`, wired to `openModal`/`closeModal`
  for the same focus-trap/Escape-key accessibility the P093 modals use.

**Deviations from the proposal, and why:**
1. **Click-to-insert, not drag-and-drop.** The proposal's DoD explicitly
   asks for drag-and-drop instantiation from a sidebar panel. Given the
   scope of everything else in this proposal (schema, sanitizer, thumbnail
   fitting, selection serialization, instantiation, four REST routes) and
   that this repo has no existing drag-and-drop infrastructure to build on,
   templates are inserted by clicking a thumbnail in a modal instead. This
   is a real reduction in fidelity to the proposal, but it keeps the same
   keyboard-operable surface (plain focusable buttons) that pure
   drag-and-drop would have needed a fallback for anyway to satisfy the
   proposal's own accessibility DoD item.
2. **GDPR export is templates-only, not full account data.** This app has
   no general "export my account data" endpoint anywhere to extend — the
   only prior GDPR endpoint is `DELETE /api/auth/account` (right to
   erasure). Standing up a full account-data export was out of scope for
   this proposal; `GET /api/templates/export` satisfies the "templates must
   be included in a data export" requirement narrowly rather than not at
   all.
3. **No pagination/lazy loading.** Replaced with a 100-template
   per-user cap enforced in `POST /api/templates`. A dedicated
   pagination UI for a per-user collection this small (worst case: 100
   thumbnails in a scrollable grid) wasn't judged worth the added
   complexity; revisit if the cap turns out to be too low in practice.

**Real-infrastructure verification performed** (Docker Postgres, a real
build + `npm start`, real NextAuth credential registration/sign-in, curl):
- Created a template with a deliberately malicious payload
  (`_link: "javascript:alert(1)"`, `src` pointing at the AWS metadata IP
  `169.254.169.254`) and confirmed via `GET /api/templates/[id]` that both
  fields were stripped from the stored JSON while the rest of the object
  round-tripped intact.
- Confirmed the thumbnail endpoint returns a real, correctly-sized PNG
  (`file` reported `640x480` = the 320×240 default at the 2× multiplier).
- Registered a second user and confirmed `GET`/`DELETE` on the first user's
  template both return 404 (not 403 — consistent with the rest of the
  app's "don't confirm another user's resource IDs" pattern), and that the
  second user's own template list stays empty.
- Confirmed `GET /api/templates/export` returns a `Content-Disposition:
  attachment` JSON file scoped to the caller only.
- Confirmed the GDPR cascade end-to-end: created a template, checked the
  `ShapeTemplate` row existed via `psql`, called `DELETE
  /api/auth/account` with password confirmation, and confirmed via `psql`
  that the row was gone — the Prisma `onDelete: Cascade` relation works as
  intended, not just as configured.

No bugs were found during verification this time (unlike P088/P093/P094) —
the sanitizer and per-user scoping were designed up front specifically
because those three proposals kept surfacing exactly this class of gap
late.
