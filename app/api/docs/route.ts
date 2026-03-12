/**
 * GET /api/docs
 *
 * P062 – Serve an interactive API documentation UI (Scalar) that loads the
 * OpenAPI 3.1 spec from /api/docs/openapi.json.
 *
 * Scalar is loaded from their official CDN; no npm package is required.
 * The page is not indexed (X-Robots-Tag: noindex) and is cache-controlled
 * to avoid stale documentation.
 */
import { NextResponse } from "next/server";

const SCALAR_CDN = "https://cdn.jsdelivr.net/npm/@scalar/api-reference";

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SketchGit API Reference</title>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/api/docs/openapi.json"
      src="${SCALAR_CDN}"
    ></script>
  </body>
</html>`;

export function GET(): NextResponse {
  return new NextResponse(HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      "X-Robots-Tag": "noindex",
    },
  });
}
