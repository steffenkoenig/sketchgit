/**
 * Fallback HTTP handler for GET /ws.
 *
 * In self-hosted deployments the custom server.ts intercepts WebSocket upgrade
 * requests at this path before Next.js routing runs, so this handler is only
 * reached by plain HTTP GET requests (e.g. health checks or browser address-bar
 * navigation).
 *
 * On serverless platforms such as Vercel, server.ts is never started, so every
 * request to /ws lands here.  We return 503 with an actionable hint rather than
 * letting Next.js produce a generic 404.
 *
 * Note: the response body is intended for operators/developers (e.g. inspecting
 * the failed response in browser DevTools or deployment logs), not end users.
 * The WsClient in the browser will surface a toast message instead.
 */
import { apiError, ApiErrorCode } from "@/lib/api/errors";

export function GET() {
  return apiError(
    ApiErrorCode.WS_UNAVAILABLE,
    "WebSocket connections are not supported by this deployment. " +
      "Set the NEXT_PUBLIC_WS_URL environment variable to point the client " +
      "at a dedicated WebSocket server (e.g. wss://my-ws-server.railway.app/ws).",
    503,
  );
}
