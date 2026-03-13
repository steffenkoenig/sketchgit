/**
 * wsRoomBroadcaster – shared singleton that allows Next.js API route handlers
 * to broadcast WebSocket messages to connected room clients.
 *
 * Because server.ts (which holds the WebSocket server and the rooms Map) and
 * Next.js API routes run in the same Node.js process, we can share state via
 * a module-level registry.  server.ts calls `initRoomBroadcaster()` once
 * during startup; API routes then call `broadcastToRoom()` freely.
 *
 * When the broadcaster has not been initialised (e.g. in unit tests) the
 * functions are no-ops so routes remain testable without a live WS server.
 */

import type { WsMessage } from "../sketchgit/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WsClientStateUpdate {
  displayName?: string;
  displayColor?: string;
  currentBranch?: string;
  currentHeadSha?: string | null;
}

export interface RoomBroadcasterHandlers {
  /** Broadcast a WS message to all clients in a room, optionally excluding one. */
  broadcast: (
    roomId: string,
    message: WsMessage,
    excludeClientId?: string | null,
  ) => void;
  /**
   * Update the in-memory WS client state (display name, color, branch, headSha).
   * Needed so presence broadcasts after a REST profile/branch update reflect the
   * new values.
   */
  updateClient: (
    roomId: string,
    clientId: string,
    updates: WsClientStateUpdate,
  ) => void;
  /** Schedule a debounced presence broadcast for the room. */
  schedulePresence: (roomId: string) => void;
}

// ─── Module-level registry ────────────────────────────────────────────────────

let _handlers: RoomBroadcasterHandlers | null = null;

/**
 * Register the broadcast handlers.  Called once from server.ts after the
 * WebSocket server and rooms Map are initialised.
 */
export function initRoomBroadcaster(handlers: RoomBroadcasterHandlers): void {
  _handlers = handlers;
}

/**
 * Broadcast a WebSocket message to all clients in a room.
 * `excludeClientId` – if supplied, the client with this ID is skipped
 * (prevents the originating client from echoing its own message back).
 */
export function broadcastToRoom(
  roomId: string,
  message: WsMessage,
  excludeClientId?: string | null,
): void {
  _handlers?.broadcast(roomId, message, excludeClientId);
}

/**
 * Update in-memory state for a specific WS client.
 * Call this before `schedulePresenceBroadcast` so the next presence push
 * reflects the updated display name, color, or branch.
 */
export function updateWsClientState(
  roomId: string,
  clientId: string,
  updates: WsClientStateUpdate,
): void {
  _handlers?.updateClient(roomId, clientId, updates);
}

/** Schedule a debounced presence broadcast for a room. */
export function schedulePresenceBroadcast(roomId: string): void {
  _handlers?.schedulePresence(roomId);
}
