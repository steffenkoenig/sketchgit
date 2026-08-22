/**
 * templateSanitizer – P095. Validates and sanitizes a Fabric.js selection
 * JSON payload before it is persisted as a ShapeTemplate.
 *
 * The client normally produces this JSON (CanvasEngine.getSelectionData()),
 * but the REST route cannot assume that — a malicious client could submit a
 * crafted payload directly. Two concrete risks this guards against:
 *
 *  - `_link` fields with a `javascript:` scheme (same class of attack the
 *    client-side double-click handler in canvasEngine.ts already guards
 *    against at click time — this is the save-time counterpart).
 *  - `src` fields on image objects pointing at an http(s) URL: the server
 *    renders thumbnails via node-canvas (StaticCanvas.loadFromJSON), which
 *    would fetch that URL server-side — an SSRF vector reachable by anyone
 *    who can save a template. Only `data:image/...` URLs are permitted,
 *    matching how this app actually produces images (mermaid rendering).
 *
 * `_id` fields are stripped everywhere (including nested group members) —
 * IDs are reassigned on instantiation by ensureObjId(), see
 * lib/sketchgit/git/objectIdTracker.ts.
 */

const MAX_JSON_BYTES = 300_000;
const MAX_OBJECT_COUNT = 300;
const ALLOWED_LINK_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);

export class TemplateValidationError extends Error {}

function isSafeLink(link: string): boolean {
  try {
    return ALLOWED_LINK_PROTOCOLS.has(new URL(link).protocol);
  } catch {
    return false;
  }
}

function isSafeImageSrc(src: string): boolean {
  return /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(src);
}

function countObjects(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  let count = 0;
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj.objects)) {
    for (const child of obj.objects) {
      count += 1 + countObjects(child);
    }
  }
  return count;
}

/** Recursively strips `_id` and neutralizes unsafe `_link`/`src` fields. */
function sanitizeNode(node: unknown): void {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  delete obj._id;

  if (typeof obj._link === "string" && obj._link && !isSafeLink(obj._link)) {
    delete obj._link;
  }
  if (typeof obj.src === "string" && obj.src && !isSafeImageSrc(obj.src)) {
    delete obj.src;
  }

  if (Array.isArray(obj.objects)) {
    for (const child of obj.objects) sanitizeNode(child);
  }
}

/**
 * Validates and sanitizes a raw canvas-selection JSON payload in place,
 * returning the same object. Throws TemplateValidationError for anything
 * too malformed or too large to accept.
 */
export function sanitizeTemplateCanvasJson(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TemplateValidationError("canvasJson must be an object");
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.objects)) {
    throw new TemplateValidationError("canvasJson.objects must be an array");
  }

  const serializedSize = Buffer.byteLength(JSON.stringify(obj), "utf8");
  if (serializedSize > MAX_JSON_BYTES) {
    throw new TemplateValidationError("canvasJson payload too large");
  }

  const objectCount = countObjects(obj);
  if (objectCount === 0) {
    throw new TemplateValidationError("canvasJson.objects must not be empty");
  }
  if (objectCount > MAX_OBJECT_COUNT) {
    throw new TemplateValidationError("canvasJson contains too many objects");
  }

  sanitizeNode(obj);
  return obj;
}
