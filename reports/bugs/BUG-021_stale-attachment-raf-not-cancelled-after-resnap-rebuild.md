# BUG-021 – Stale `scheduleAttachmentUpdate` rAF not cancelled when `reSnapOnModified` rebuilds arrow

## Summary

After `reSnapOnModified` rebuilds an arrow group in response to `object:modified`, a
pending `requestAnimationFrame` callback registered by the last `object:moving` event is
never cancelled.  The stale rAF fires after the rebuild and calls `updateAttachedLines`
with a reference to the already-removed original arrow group.  In the common case this is
a harmless no-op, but it is a latent resource-leak / incorrect-behaviour defect that can
manifest if the removed object's `_id` happens to match an attachment target recorded on
any canvas object.

## Severity
`low`

## Category
`Resource Leak / Cleanup`

## Current Behaviour

1. User drags an existing arrow group.  Each `object:moving` event calls
   `scheduleAttachmentUpdate(arrowGroup)`, which sets `this._attachmentRafTarget = arrowGroup`
   and schedules a `requestAnimationFrame` callback (coalesced so at most one rAF is queued
   per frame).

2. User releases the mouse.  Fabric.js fires `object:modified` synchronously (before any
   pending rAF fires).  The `object:modified` handler calls `reSnapOnModified`, which
   detects a snap and calls `rebuildArrowForMove` → `buildArrowGroup`.  The original arrow
   group is removed from the canvas; a new group is added.

3. `reSnapOnModified` and the `object:modified` handler complete.  At this point:
   - `this._attachmentRafId` is still non-null (the rAF is still queued).
   - `this._attachmentRafTarget` still points to the **original, removed** arrow group
     reference, because `reSnapOnModified` never touches these fields.

4. The queued rAF fires.  It reads `this._attachmentRafTarget` (the removed arrow group),
   calls `updateAttachedLines(removedArrow)`, and proceeds to iterate all canvas objects
   looking for any whose `_attachedFrom` or `_attachedTo` equals `removedArrow._id`.

5. In typical usage, no canvas object uses an arrow group as its attachment target, so the
   iteration is a no-op and `changed` remains `false`.  However, if any connector happens
   to carry `_attachedFrom === removedArrow._id` (unusual but structurally possible —
   e.g., if the same ID was reused or the canvas was loaded from a serialised state with
   that attachment), `updateAttachedLines` will call `rebuildArrowForMove` on that
   connector, triggering an unexpected visual rebuild after the user interaction has
   already completed.

## Expected Behaviour

When `reSnapOnModified` successfully rebuilds an arrow group in response to
`object:modified`, any pending `scheduleAttachmentUpdate` rAF that targeted the original
arrow should be cancelled immediately.  No stale `updateAttachedLines` call should fire
after the rebuild.

## Steps to Reproduce

*(Common case is silent; the edge-case manifestation requires a crafted canvas state.)*

1. Create a canvas with at least two shapes (A and B) and an arrow connecting A to B.
2. Serialize the canvas JSON; manually edit the JSON so that a second connector has
   `_attachedFrom` equal to the arrow group's `_id` (simulating the pathological ID reuse).
3. Load the modified JSON.
4. Drag the arrow (not the shapes) near a third shape and release.
5. **Observed**: the second connector unexpectedly rebuilds at a position derived from the
   old arrow's `_id`-keyed anchor offsets, producing a visual glitch one animation frame
   after the drag completes.
6. **Expected**: the second connector is unaffected; only the dragged arrow is rebuilt.

## Affected Files and Sections

| File | Lines / Symbol | Notes |
|------|---------------|-------|
| `lib/sketchgit/canvas/canvasEngine.ts` | L2196–L2205 / `scheduleAttachmentUpdate()` | Sets `_attachmentRafTarget` and schedules rAF; not cancelled by rebuild path |
| `lib/sketchgit/canvas/canvasEngine.ts` | L1960–L2071 / `reSnapOnModified()` | Rebuilds arrow via `rebuildArrowForMove` but never cancels `_attachmentRafId` |
| `lib/sketchgit/canvas/canvasEngine.ts` | L263–L298 / `destroy()` | Correctly cancels the rAF on destroy (shows the pattern exists but is missing in the rebuild path) |

## Root Cause Analysis

`scheduleAttachmentUpdate` is designed for the `object:moving` (drag-in-progress) path: it
follows shapes that move, updating any attached connectors each animation frame.
`reSnapOnModified` is designed for the `object:modified` (drag-complete) path: it snaps and
rebuilds the connector itself after it is dropped near a shape.  The two paths were written
independently and neither cleans up the other's state.

When `object:modified` fires synchronously (before the rAF from the last `object:moving`
has run), `reSnapOnModified` rebuilds the connector and sets the new active object.  No code
in this path cancels the pending rAF or resets `_attachmentRafTarget`.  The rAF fires on
the next frame and calls `updateAttachedLines` with the stale reference.

The `destroy()` method correctly cancels the rAF (`cancelAnimationFrame(this._attachmentRafId);
this._attachmentRafId = null; this._attachmentRafTarget = null;`), confirming the cleanup
pattern is known and intentional — it was simply not applied in the rebuild path.

## Suggested Fix

At the beginning of the arrow-group branch of `reSnapOnModified` (after the `ag._isArrow`
check, before any snap computation), cancel and clear the pending attachment rAF:

- Call `cancelAnimationFrame(this._attachmentRafId)` if `this._attachmentRafId !== null`.
- Set `this._attachmentRafId = null` and `this._attachmentRafTarget = null`.

This follows the exact same pattern already used in `destroy()` and ensures that no stale
`updateAttachedLines` fires after the snap rebuild.

## Additional Notes

- This bug is **independent of BUG-020** (the re-entrancy crash) but is related to the same
  `object:moving` / `object:modified` interaction.  Both bugs should be fixed together.

- The severity is `low` because in practice arrow groups are never attachment *targets* for
  other connectors (only shapes are targets), so the stale rAF is a harmless no-op in all
  standard usage scenarios.  The risk is limited to unusual canvas states (e.g., crafted
  JSON or a future feature that allows arrows-to-arrows connections).

- The same stale-rAF pattern could theoretically occur when a sketch-path connector is
  rebuilt by the sketch-path branch of `reSnapOnModified` (L2148–L2159), although that path
  does not call `setActiveObject` and is therefore not involved in the BUG-020 re-entrancy
  chain.

## Status
`open`
