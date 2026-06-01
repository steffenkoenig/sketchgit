import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import pino from "pino";
import type { PrismaClient } from "@prisma/client";

import type { Env } from "../env.js";
import { InboundWsMessageSchema } from "../api/wsSchemas.js";
import { checkRoomAccess, resolveRoomId, appendRoomEvent, addRoomMember, type CommitRecord, type ClientRole } from "../db/roomRepository.js";
import { verifyScopeCookie, mapPermissionToRole } from "./shareLinkTokens.js";
import { parseCookies } from "./cookieHelpers.js";

import type { WsMessage } from "../sketchgit/types.js";
import type { RoomSnapshot } from "../db/roomRepository.js";

// ClientState must match what is used in server.ts exactly
export type ClientState = WebSocket & {
  clientId: string;
  roomId: string;
  userId: string | null;
  role: ClientRole;
  displayName: string;
  displayColor: string;
  currentBranch: string;
  currentHeadSha: string | null;
  shareScope: "ROOM" | "BRANCH" | "COMMIT" | null;
  allowedBranches: string[] | null;
  allowedCommitSha: string | null;
  _userId?: string | null;
  _ip: string;
  _cookieHeader?: string | undefined;
};

export interface ConnectionHandlerDeps {
  logger: pino.Logger;
  prisma: PrismaClient;
  env: Env;
  rooms: Map<string, Map<string, ClientState>>;
  roomCache: { get: (roomId: string) => RoomSnapshot | undefined; set: (roomId: string, snapshot: RoomSnapshot) => void };
  roomCleanupTimers: Map<string, ReturnType<typeof setTimeout>>;
  connectionsPerIp: Map<string, number>;
  safeRoomId: (value: string | null) => string;
  safeName: (value: string | null) => string;
  safeColor: (value: string | null) => string;
  getRoom: (roomId: string) => Map<string, ClientState>;
  dbEnsureRoom: (roomId: string, ownerId: string | null) => Promise<void>;
  sendTo: (ws: WebSocket, payload: WsMessage) => void;
  schedulePushPresence: (roomId: string) => void;
  dbLoadSnapshot: (roomId: string) => Promise<RoomSnapshot | null>;
  handleWsMessage: (client: ClientState, message: WsMessage, roomId: string, clientId: string) => Promise<void>;
  ROOM_CLEANUP_DELAY_MS: number;
  broadcastRoom: (roomId: string, payload: WsMessage, excludeClientId?: string | null) => void;
}

/**
 * P042 – Helper to wrap an async event-handler in a synchronous callback.
 */
function asyncHandler<T extends unknown[]>(
  logger: pino.Logger,
  label: string,
  fn: (...args: T) => Promise<void>,
): (...args: T) => void {
  return (...args: T) => {
    fn(...args).catch((err: unknown) => {
      logger.error({ err }, `${label}: unhandled error`);
    });
  };
}

export const createWsConnectionHandler = (deps: ConnectionHandlerDeps) => {
  const {
    logger,
    prisma,
    env,
    rooms,
    roomCache,
    roomCleanupTimers,
    connectionsPerIp,
    safeRoomId,
    safeName,
    safeColor,
    getRoom,
    dbEnsureRoom,
    sendTo,
    schedulePushPresence,
    dbLoadSnapshot,
    handleWsMessage,
    ROOM_CLEANUP_DELAY_MS,
    broadcastRoom
  } = deps;

  return asyncHandler(logger, "ws:connection", async (ws: WebSocket, reqUrl: URL) => {
      const client = ws as ClientState;
      // P049 – resolve slug to canonical room ID before assigning.
      const rawRoom = reqUrl.searchParams.get("room");
      const resolvedId = rawRoom ? await resolveRoomId(rawRoom) : null;
      const roomId = resolvedId ?? safeRoomId(rawRoom);
      const clientId = randomUUID().slice(0, 8);
      const connectionStartMs = Date.now(); // P074 – for MEMBER_LEAVE durationMs

      client.clientId = clientId;
      client.roomId = roomId;
      client.userId = client._userId ?? null;
      client.displayName = safeName(reqUrl.searchParams.get("name"));
      client.displayColor = safeColor(reqUrl.searchParams.get("color"));
      // P079 – initialise branch position to 'main'; updated via profile/branch-update
      client.currentBranch = 'main';
      client.currentHeadSha = null;
      // P091 – initialise scope fields (no restriction by default)
      client.shareScope = null;
      client.allowedBranches = null;
      client.allowedCommitSha = null;

      // P034 – Enforce room access control before adding the client to the room.
      // P066 – If access is denied but the client presents a valid invitation
      //         token, grant access as EDITOR for the duration of the session.
      let access = await checkRoomAccess(roomId, client.userId);
      if (!access.allowed) {
        const inviteToken = reqUrl.searchParams.get("invite");
        if (inviteToken) {
          // First fetch the invitation to validate it (expiry, roomId).
          const invitation = await prisma.roomInvitation.findUnique({
            where: { token: inviteToken },
            select: { roomId: true, expiresAt: true, maxUses: true, useCount: true },
          });
          if (
            invitation &&
            invitation.roomId === roomId &&
            invitation.expiresAt > new Date() &&
            invitation.useCount < invitation.maxUses
          ) {
            // BUG-004 – use updateMany with a conditional WHERE to atomically
            // increment useCount only when still below maxUses, preventing a
            // TOCTOU race where concurrent connections could both pass the
            // useCount < maxUses guard and each increment, exceeding the limit.
            const updated = await prisma.roomInvitation.updateMany({
              where: { token: inviteToken, useCount: { lt: invitation.maxUses } },
              data: { useCount: { increment: 1 } },
            });
            if (updated.count === 0) {
              // Another concurrent connection consumed the last use; deny access
              sendTo(client, { type: "error", code: "INVITATION_EXHAUSTED", detail: "Invitation limit reached" } as unknown as WsMessage);
              ws.close(1008, "Invitation exhausted");
              return;
            }

            // Also add as a room member so future connections don't need the token
            if (client.userId) {
              await prisma.roomMembership.upsert({
                where: { roomId_userId: { roomId, userId: client.userId } },
                update: {},
                create: { roomId, userId: client.userId, role: "EDITOR" },
              });
            }
            access = { allowed: true, role: "EDITOR" };
          }
        }

        // P091 – If access is still denied, check for a scope cookie set by
        // GET /api/share/[token]. The cookie encodes scope metadata and grants
        // access to BRANCH/COMMIT-scoped links without a full membership record.
        if (!access.allowed) {
          const cookies = parseCookies(client._cookieHeader);
          const scopeValue = cookies["sketchgit_share_scope"];
          if (scopeValue) {
            const payload = verifyScopeCookie(scopeValue);
            if (payload && payload.roomId === roomId) {
              const role = mapPermissionToRole(payload.permission);
              access = { allowed: true, role };
              client.shareScope = payload.scope;
              client.allowedBranches = payload.scope === "BRANCH" ? payload.branches : null;
              client.allowedCommitSha = payload.scope === "COMMIT" ? payload.commitSha : null;
              // For COMMIT scope force VIEWER role regardless of permission
              if (payload.scope === "COMMIT") {
                access = { allowed: true, role: "VIEWER" };
              }
              // Add room membership for authenticated users with write access
              if (
                client.userId &&
                payload.scope === "ROOM" &&
                payload.permission !== "VIEW"
              ) {
                await addRoomMember(roomId, client.userId, role);
              }
            }
          }
        }
      }
      if (!access.allowed) {
        logger.warn({ roomId, userId: client.userId, reason: access.reason }, "ws: access denied");
        sendTo(client, { type: "error", code: "ACCESS_DENIED", reason: access.reason } as unknown as WsMessage);
        ws.close(1008, "Access denied");
        return;
      }
      client.role = access.role;

      // P069 – enforce per-room client capacity limit.
      const existingRoom = rooms.get(roomId);
      if (existingRoom && existingRoom.size >= env.MAX_CLIENTS_PER_ROOM) {
        logger.warn(
          { roomId, currentSize: existingRoom.size, limit: env.MAX_CLIENTS_PER_ROOM },
          "ws: room at capacity, rejecting new connection",
        );
        sendTo(client, { type: "error", code: "ROOM_FULL", message: "This room is at capacity." } as unknown as WsMessage);
        ws.close(1008, "Room at capacity");
        return;
      }

      // P015 – increment per-IP connection counter
      const ip = client._ip ?? "unknown";
      connectionsPerIp.set(ip, (connectionsPerIp.get(ip) ?? 0) + 1);

      const room = getRoom(roomId);
      room.set(clientId, client);

      // Cancel any pending cleanup timer for this room (a client just rejoined)
      if (roomCleanupTimers.has(roomId)) {
        clearTimeout(roomCleanupTimers.get(roomId)!);
        roomCleanupTimers.delete(roomId);
      }

      // Ensure the room is registered in the database
      await dbEnsureRoom(roomId, client.userId);

      logger.info({ clientId, roomId, userId: client.userId ?? null }, "ws: client connected");

      // P074 – append MEMBER_JOIN event (non-blocking)
      void appendRoomEvent(roomId, "MEMBER_JOIN", client.userId, {
        displayName: client.displayName,
      }).catch((err: unknown) => logger.warn({ err }, "events: failed to append MEMBER_JOIN"));

      sendTo(client, { type: "welcome", roomId, clientId } as unknown as WsMessage);
      schedulePushPresence(roomId);

      // Serve historical state from DB (or cache). Always send to each connecting
      // client so they get the latest committed state even when rejoining a room.
      // P091 – Scope-aware fullsync: BRANCH and COMMIT scoped clients receive only
      // the subset of history their share link grants access to.
      let snapshot: RoomSnapshot | undefined | null = roomCache.get(roomId);
      if (!snapshot) {
        snapshot = await dbLoadSnapshot(roomId);
        if (snapshot) roomCache.set(roomId, snapshot);
      }
      if (snapshot) {
        if (client.shareScope === "COMMIT" && client.allowedCommitSha) {
          // COMMIT scope: send only the single requested commit in detached HEAD state.
          const sha = client.allowedCommitSha;
          const singleCommit = snapshot.commits[sha];
          sendTo(client, {
            type: "fullsync",
            targetId: clientId,
            commits: singleCommit ? { [sha]: singleCommit } : {},
            branches: {},
            HEAD: sha,
            detached: sha,
          } as unknown as WsMessage);
        } else if (client.shareScope === "BRANCH" && client.allowedBranches) {
          // BRANCH scope: filter commits and branches to those belonging to allowed branches.
          const allowed = new Set(client.allowedBranches);
          const filteredBranches: Record<string, string> = {};
          for (const [name, sha] of Object.entries(snapshot.branches)) {
            if (allowed.has(name)) filteredBranches[name] = sha as string;
          }
          // Include all commits reachable from allowed branch tips.
          const allowedShas = new Set(Object.values(filteredBranches));
          const filteredCommits: Record<string, CommitRecord> = {};
          for (const [sha, commit] of Object.entries(snapshot.commits)) {
            if (
              allowedShas.has(sha) ||
              (typeof (commit as CommitRecord & { branch?: string }).branch === "string" &&
                allowed.has((commit as CommitRecord & { branch?: string }).branch!))
            ) {
              filteredCommits[sha] = commit as CommitRecord;
            }
          }
          // Use the first allowed branch that exists in the filtered snapshot as HEAD,
          // falling back to the room HEAD only if it's already in the allowed set.
          const firstFilteredBranch = Object.keys(filteredBranches)[0];
          const head = allowed.has(snapshot.HEAD)
            ? snapshot.HEAD
            : (firstFilteredBranch ?? snapshot.HEAD);
          sendTo(client, {
            type: "fullsync",
            targetId: clientId,
            commits: filteredCommits,
            branches: filteredBranches,
            HEAD: head,
            detached: null,
          } as unknown as WsMessage);
        } else {
          sendTo(client, {
            type: "fullsync",
            targetId: clientId,
            commits: snapshot.commits,
            branches: snapshot.branches,
            HEAD: snapshot.HEAD,
            detached: snapshot.detached,
          } as unknown as WsMessage);
        }
      }

      client.on("message", asyncHandler(logger, "ws:message", async (raw: unknown) => {
        const rawStr = String(raw);
        if (rawStr.length > env.MAX_WS_PAYLOAD_BYTES) {
          logger.warn({ clientId, roomId, size: rawStr.length }, "ws: message exceeds size limit");
          sendTo(client, { type: "error", code: "PAYLOAD_TOO_LARGE" } as unknown as WsMessage);
          client.close(1009, "Message too large");
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawStr);
        } catch {
          logger.warn({ clientId, roomId }, "ws: failed to parse message");
          return;
        }

        // P073 – Batch support: client may send a JSON array of WsMessages.
        // Unwrap and process each message in order.  Single-message frames
        // remain backward-compatible (not wrapped in an array).
        const messages: unknown[] = Array.isArray(parsed) ? parsed : [parsed];

        for (const msg of messages) {
          const validated = InboundWsMessageSchema.safeParse(msg);
          if (!validated.success) {
            logger.warn({ clientId, roomId, errors: validated.error.issues }, "ws: invalid message schema");
            sendTo(client, { type: "error", code: "INVALID_PAYLOAD" } as unknown as WsMessage);
            continue;
          }
          try {
            await handleWsMessage(client, validated.data as unknown as WsMessage, roomId, clientId);
          } catch (err) {
            logger.error({ err, clientId, roomId }, "ws: error processing message in batch");
            sendTo(client, { type: "error", code: "INTERNAL_ERROR" } as unknown as WsMessage);
            continue;
          }
        }
      }));

      client.on("close", () => {
        logger.info({ clientId, roomId }, "ws: client disconnected");

        // P074 – append MEMBER_LEAVE event (non-blocking)
        void appendRoomEvent(roomId, "MEMBER_LEAVE", client.userId, {
          displayName: client.displayName,
          durationMs: Date.now() - connectionStartMs,
        }).catch((err: unknown) => logger.warn({ err }, "events: failed to append MEMBER_LEAVE"));

        // P015 – decrement per-IP connection counter
        const remaining = (connectionsPerIp.get(ip) ?? 1) - 1;
        remaining > 0
          ? connectionsPerIp.set(ip, remaining)
          : connectionsPerIp.delete(ip);

        const currentRoom = rooms.get(roomId);
        if (!currentRoom) return;

        currentRoom.delete(clientId);

        if (currentRoom.size === 0) {
          // Delay teardown – reconnecting clients can still receive a fullsync.
          const timer = setTimeout(() => {
            if (rooms.get(roomId)?.size === 0) {
              rooms.delete(roomId);
            }
            roomCleanupTimers.delete(roomId);
          }, ROOM_CLEANUP_DELAY_MS);
          // P051: unref the timer so it does not prevent process exit when
          // the event loop would otherwise be idle (e.g. during shutdown).
          timer.unref();
          roomCleanupTimers.set(roomId, timer);
          return;
        }

        schedulePushPresence(roomId);
        broadcastRoom(roomId, { type: "user-left", clientId } as unknown as WsMessage, clientId);
      });
  });
};
// trigger diff 2
