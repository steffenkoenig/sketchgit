/**
 * Shared helpers for REST API endpoints that broadcast real-time events to
 * WebSocket room clients.
 *
 * Each endpoint accepts a `clientId` in the request body so the server can:
 *  1. Verify the client is currently connected to the room (ties REST auth to
 *     the existing WS session established on connect).
 *  2. Exclude the originating client from the broadcast (avoids echo).
 *  3. Look up the client's display name and colour for relay messages.
 *
 * Access for public-room anonymous users is granted via the WS session –
 * clientId presence in the rooms Map is the proof of access.  Private rooms
 * additionally require a valid NextAuth session.
 */

import { z } from "zod";

/** Every room-event POST body must include the WS-assigned clientId. */
export const ClientIdSchema = z.object({
  clientId: z.string().min(1).max(64),
});
