# P076 – Canvas PDF Export

## Title
Add PDF Export for Canvas Drawings Using PDFKit or `@react-pdf/renderer` via a New `GET /api/rooms/[roomId]/export?format=pdf` Option

## Brief Summary
The existing export API (P039) supports PNG and SVG formats. PDF is the most requested portable format for sharing design assets, sending prints, and archiving drawings. Unlike SVG (which some email clients and document viewers do not support) and PNG (which is a raster format that loses quality when scaled), PDF preserves vector fidelity while being universally printable. This proposal adds `format=pdf` support to the existing export endpoint by embedding the SVG output from `renderToSVG()` into a PDF document using the `pdf-lib` npm package, which requires no native dependencies and works in a Node.js server-side rendering context.

## Current Situation
`GET /api/rooms/[roomId]/export?format=png|svg` is implemented in P039. The `renderToSVG()` and `renderToPNG()` functions in `lib/export/canvasRenderer.ts` use Fabric.js's `StaticCanvas.toSVG()` and `StaticCanvas.toDataURL()` respectively.

```typescript
// Current QuerySchema (app/api/rooms/[roomId]/export/route.ts)
const QuerySchema = z.object({
  format: z.enum(["png", "svg"]).default("png"),
  sha: z.string().max(64).optional(),
});
```

`pdf-lib` is a pure-JavaScript PDF creation library (no native bindings, no canvas dependency) that can embed SVG as a vector drawing inside a PDF document. It is widely used in Next.js API routes for server-side PDF generation.

### Relevant files
```
app/api/rooms/[roomId]/export/route.ts  ← format: z.enum(['png', 'svg'])
lib/export/canvasRenderer.ts            ← renderToSVG(), renderToPNG()
```

## Problem with Current Situation
1. **No vector-preserving printable format**: SVG is vector-preserving but not universally accepted by printers and document workflows. PDF is the universal print-ready format.
2. **PNG loses quality at print resolution**: A PNG at 1920×1080 is 96 dpi on a standard screen but only 25 dpi when printed on an A4 sheet. Scaling up introduces pixelation. PDF can embed the SVG at full vector resolution.
3. **No page metadata**: SVG and PNG have no document metadata (title, author, creation date). PDF supports these fields natively, which is important for archiving and document management.
4. **Missing common export workflow**: "Export to PDF, email to client" is a very common design workflow. Currently users must export SVG, open it in a vector editor, and then save as PDF — a multi-step process.

## Goal to Achieve
1. Add `format=pdf` to the `QuerySchema` enum in the export route.
2. Create `renderToPDF(json: object): Promise<Uint8Array>` in `lib/export/canvasRenderer.ts` that:
   - Calls `renderToSVG()` to obtain the SVG string.
   - Embeds the SVG into an A4 PDF page (landscape orientation for a 16:9 canvas) using `pdf-lib`.
   - Adds document metadata: title, creation date, author (room ID).
3. Return the PDF binary from the export route with `Content-Type: application/pdf`.
4. Add a "Download PDF" link to `AppTopbar.tsx` alongside the existing PNG/SVG links.

## What Needs to Be Done

### 1. Install `pdf-lib`
```bash
npm install pdf-lib
```
`pdf-lib` is a pure-JavaScript library with no native dependencies. It works in Node.js, browsers, and Next.js API routes without configuration.

### 2. Create `renderToPDF()` in `lib/export/canvasRenderer.ts`
```typescript
import { PDFDocument, PDFPage, rgb } from 'pdf-lib';

const A4_LANDSCAPE_WIDTH_PT = 841.89;   // 297mm at 72 dpi
const A4_LANDSCAPE_HEIGHT_PT = 595.28;  // 210mm at 72 dpi

/**
 * Render a canvas JSON snapshot to a PDF document.
 * The canvas SVG is embedded in an A4 landscape PDF page.
 * Returns a Uint8Array of the raw PDF bytes.
 */
export async function renderToPDF(json: object): Promise<Uint8Array> {
  // Obtain the SVG representation from the existing render pipeline.
  const svgString = await renderToSVG(json);

  const pdfDoc = await PDFDocument.create();

  // Set document metadata
  pdfDoc.setTitle('SketchGit Canvas Export');
  pdfDoc.setCreationDate(new Date());
  pdfDoc.setProducer('SketchGit');

  // Add an A4 landscape page
  const page = pdfDoc.addPage([A4_LANDSCAPE_WIDTH_PT, A4_LANDSCAPE_HEIGHT_PT]);

  // pdf-lib does not support SVG embedding natively. We have two options:
  //
  // Option A (recommended): Rasterize the SVG to PNG at high resolution and embed
  //   the PNG. This preserves visual fidelity without requiring an SVG-to-PDF
  //   library. Use the existing renderToPNG() with multiplier:3 for 300 dpi quality.
  //
  // Option B (vector): Use `svg2pdf.js` or convert SVG paths to pdf-lib path commands.
  //   This produces a true vector PDF but requires parsing the SVG DOM.
  //
  // This proposal implements Option A (PNG embedding) as the pragmatic first step.
  // Option B can be pursued as a follow-up once the feature is validated.

  const pngBytes = await renderToPNG(json, { multiplier: 3 }); // 3× = ~300 dpi for A4
  const pngImage = await pdfDoc.embedPng(pngBytes);

  const { width, height } = pngImage.scaleToFit(
    A4_LANDSCAPE_WIDTH_PT,
    A4_LANDSCAPE_HEIGHT_PT,
  );
  const x = (A4_LANDSCAPE_WIDTH_PT - width) / 2;
  const y = (A4_LANDSCAPE_HEIGHT_PT - height) / 2;
  page.drawImage(pngImage, { x, y, width, height });

  return pdfDoc.save();
}
```

> **Note**: Update `renderToPNG()` to accept an optional `options: { multiplier?: number }` parameter so the PDF renderer can request a higher-resolution raster.

### 3. Update `QuerySchema` in the export route
```typescript
const QuerySchema = z.object({
  format: z.enum(["png", "svg", "pdf"]).default("png"),
  sha: z.string().max(64).optional(),
});
```

### 4. Add PDF case to the export route handler
```typescript
if (format === "pdf") {
  const pdf = await renderToPDF(canvasJson);
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      ...(reqSha ? immutableHeaders(reqSha) : mutableHeaders()),
    },
  });
}
```

### 5. Add "Download PDF" link to `AppTopbar.tsx`
```tsx
// Alongside the existing PNG/SVG links:
<a href={`/api/rooms/${roomId}/export?format=pdf`} download>
  {t('toolbar.exportPdf')}
</a>
```

### 6. Add i18n key
`messages/en.json`:
```json
"toolbar": {
  ...
  "exportPdf": "Export as PDF"
}
```
`messages/de.json`:
```json
"exportPdf": "Als PDF exportieren"
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `package.json` | Add `pdf-lib` dependency |
| `lib/export/canvasRenderer.ts` | Add `renderToPDF()`; update `renderToPNG()` to accept multiplier option |
| `app/api/rooms/[roomId]/export/route.ts` | Add `"pdf"` to `QuerySchema`; add PDF response branch |
| `components/sketchgit/AppTopbar.tsx` | Add "Download PDF" link |
| `messages/en.json` | Add `toolbar.exportPdf` key |
| `messages/de.json` | Add `toolbar.exportPdf` key |

## Additional Considerations

### Vector PDF (Option B)
The current approach (Option A — PNG-in-PDF) produces a PDF where the drawing is a raster image embedded in a vector container. While the PDF scales without distortion at the embedded resolution (~300 dpi), it is not a true scalable-vector PDF. For a true vector PDF, the Fabric.js SVG output would need to be parsed and each SVG element converted to pdf-lib drawing commands. This is significantly more complex but produces infinitely scalable output. Implement Option A first; Option B can be a follow-up enhancement.

### File size
A 3× PNG-in-PDF for a complex canvas (100+ objects) will be approximately 3–10 MB. This is acceptable for a download but too large to cache in the browser for long. Use the same `Cache-Control` strategy as PNG exports (P070): `public, immutable` for SHA-addressed exports, `private, no-store` for HEAD exports.

### `pdf-lib` security
`pdf-lib` does not load external resources (no network requests). It operates purely on in-memory buffers. There is no XSS or SSRF risk from the library itself. The canvas JSON is already sanitized by P057's validation before it reaches the renderer.

### PDF metadata and privacy
The `setTitle` and `setProducer` calls add metadata to the PDF. Ensure no user-identifiable information (e.g., user email) is included in the metadata. Room ID in the title is acceptable (it is already visible in the download filename).

## Testing Requirements
- `renderToPDF({})` (empty canvas) returns a non-empty `Uint8Array` starting with `%PDF`.
- `GET /api/rooms/[roomId]/export?format=pdf` returns `Content-Type: application/pdf`.
- `GET /api/rooms/[roomId]/export?format=pdf&sha=abc123` returns `Cache-Control: public, immutable` (P070 integration).
- Existing `format=png` and `format=svg` behaviour is unchanged.
- `renderToPNG(json, { multiplier: 3 })` returns a PNG at 3× the base resolution.

## Dependency Map
- Builds on: P039 ✅ (existing PNG/SVG export), P070 (cache headers — PDF export uses same caching strategy)
- Complements: P062 (OpenAPI — new format added to the export endpoint spec)
- Independent of: Redis, database structure, WebSocket, auth
