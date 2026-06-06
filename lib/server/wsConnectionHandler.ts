import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import type pino from "pino";
import type { PrismaClient } from "@prisma/client";

import type { Env } from "../env.js";
import { checkRoomAccess, addRoomMember, resolveRoomId, appendRoomEvent, type ClientRole, type RoomAccessResult } from "../db/roomRepository.js";
import type { WsMessage } from "../sketchgit/types.js";
import type { RoomSnapshot } from "../db/dbLoadSnapshot.js";

import { parseCookies } from "./cookieHelpers.js";
import { verifyScopeCookie, mapPermissionToRole } from "./shareLinkTokens.js";
import { InboundWsMessageSchema } from "../api/wsSchemas.js";

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
  sendTo: (ws: ClientState, payload: WsMessage) => void;
  schedulePushPresence: (roomId: string) => void;
  dbLoadSnapshot: (roomId: string, prisma: PrismaClient, logger: pino.Logger) => Promise<RoomSnapshot | null>;
  ROOM_CLEANUP_DELAY_MS: number;
  broadcastRoom: (roomId: string, payload: WsMessage, excludeClientId?: string | null) => void;
}

export function createWsConnectionHandler(deps: ConnectionHandlerDeps) {
  return (ws: WebSocket, reqUrl: URL) => {
    void (async () => {
      try {
        await processConnection(ws as ClientState, reqUrl, deps);
      } catch (err: unknown) {
        deps.logger.error({ err }, `ws:connection: unhandled error`);
      }
    })();
  };
}

async function authorizeClient(prisma: PrismaClient, client: ClientState, roomId: string, inviteToken?: string | null): Promise<RoomAccessResult> {
  let access: RoomAccessResult = await checkRoomAccess(roomId, client.userId);
  if (!access.allowed && inviteToken) {
    const invitation = await prisma.roomInvitation.findUnique({ where: { token: inviteToken }, select: { roomId: true, expiresAt: true, maxUses: true, useCount: true } });
    if (invitation && invitation.roomId === roomId && invitation.expiresAt > new Date() && (invitation.maxUses === null || invitation.useCount < invitation.maxUses)) {
      if (client.userId) await prisma.roomMembership.upsert({ where: { roomId_userId: { roomId, userId: client.userId } }, update: {}, create: { roomId, userId: client.userId, role: "EDITOR" } });
      access = { allowed: true, role: "EDITOR" };
    }
  }
  if (!access.allowed) {
    const cookies = parseCookies(client._cookieHeader);
    const scopeValue = cookies["sketchgit_share_scope"];
    if (scopeValue) {
      const payload = verifyScopeCookie(scopeValue);
      if (payload && payload.roomId === roomId) {
        const role = mapPermissionToRole(payload.permission);
        client.shareScope = payload.scope; client.allowedBranches = payload.scope === "BRANCH" ? payload.branches : null; client.allowedCommitSha = payload.scope === "COMMIT" ? payload.commitSha : null;
        if (payload.scope === "COMMIT") access = { allowed: true, role: "VIEWER" };
        else {
          if (client.userId && payload.scope === "ROOM" && payload.permission !== "VIEW") await addRoomMember(roomId, client.userId, role);
          access = { allowed: true, role };
        }
      }
    }
  }
  return access;
}

export async function handleWsMessage(client: ClientState, message: WsMessage, roomId: string, clientId: string, logger: pino.Logger, sendTo: (ws: ClientState, payload: WsMessage) => void, broadcastRoom: (roomId: string, payload: WsMessage, excludeClientId?: string | null) => void): Promise<void> {
  if (message.type === "ping" || message.type === "pong") return;
  if (client.shareScope === "COMMIT") {
    if (message.type !== "fullsync-request") { sendTo(client, { type: "error", code: "SHARE_LINK_FORBIDDEN", detail: "Share link grants read-only commit access" } as unknown as WsMessage); return; }
  }
  if (message.type === "fullsync-request" || message.type === "fullsync") {
    const relay: WsMessage = { ...message, senderId: client.clientId, senderName: client.displayName, senderColor: client.displayColor, roomId };
    broadcastRoom(roomId, relay, client.clientId); return;
  }
  logger.warn({ clientId, roomId, type: message.type }, "ws: ignoring legacy inbound message (use REST API)");
}

async function processConnection(client: ClientState, reqUrl: URL, deps: ConnectionHandlerDeps) {
  const { logger, prisma, safeRoomId, safeName, safeColor } = deps;
  const rawRoom = reqUrl.searchParams.get("room");
  const roomId = (rawRoom ? await resolveRoomId(rawRoom) : null) ?? safeRoomId(rawRoom);
  const clientId = randomUUID().slice(0, 8);
  const connectionStartMs = Date.now();

  client.clientId = clientId; client.roomId = roomId; client.userId = client._userId ?? null;
  client.displayName = safeName(reqUrl.searchParams.get("name")); client.displayColor = safeColor(reqUrl.searchParams.get("color"));
  client.currentBranch = 'main'; client.currentHeadSha = null; client.shareScope = null; client.allowedBranches = null; client.allowedCommitSha = null;

  const access = await authorizeClient(prisma, client, roomId, reqUrl.searchParams.get("invite"));
  if (!access.allowed) {
    logger.warn({ roomId, userId: client.userId, reason: access.reason }, "ws: access denied");
    deps.sendTo(client, { type: "error", code: "ACCESS_DENIED", reason: access.reason } as unknown as WsMessage);
    client.close(1008, "Access denied"); return;
  }
  client.role = access.role as ClientRole;

  if (await checkRoomCapacityAndRegister(client, roomId, clientId, deps)) return;
  await finalizeConnection(client, roomId, clientId, connectionStartMs, deps);
}

async function finalizeConnection(client: ClientState, roomId: string, clientId: string, connectionStartMs: number, deps: ConnectionHandlerDeps) {
  deps.logger.info({ clientId, roomId, userId: client.userId ?? null }, "ws: client connected");
  void appendRoomEvent(roomId, "MEMBER_JOIN", client.userId, { displayName: client.displayName }).catch((err: unknown) => deps.logger.warn({ err }, "events: failed to append MEMBER_JOIN"));

  deps.sendTo(client, { type: "welcome", roomId, clientId } as unknown as WsMessage);
  deps.schedulePushPresence(roomId);

  let snapshot: RoomSnapshot | undefined | null = deps.roomCache.get(roomId);
  if (!snapshot) { snapshot = await deps.dbLoadSnapshot(roomId, deps.prisma, deps.logger); if (snapshot) deps.roomCache.set(roomId, snapshot); }
  if (snapshot) {
    if (client.shareScope === "COMMIT" && client.allowedCommitSha) deps.sendTo(client, { type: "fullsync", targetId: clientId, commits: { [client.allowedCommitSha]: snapshot.commits[client.allowedCommitSha] }, branches: {}, HEAD: client.allowedCommitSha, detached: client.allowedCommitSha } as unknown as WsMessage);
    else deps.sendTo(client, { type: "fullsync", targetId: clientId, commits: snapshot.commits, branches: snapshot.branches, HEAD: snapshot.HEAD, detached: snapshot.detached } as unknown as WsMessage);
  }

  client.on("message", (raw: unknown) => {
    void (async () => {
      try {
        const rawStr = String(raw);
        if (rawStr.length > deps.env.MAX_WS_PAYLOAD_BYTES) { deps.logger.warn({ clientId, roomId, size: rawStr.length }, "ws: message exceeds size limit"); deps.sendTo(client, { type: "error", code: "PAYLOAD_TOO_LARGE" } as unknown as WsMessage); client.close(1009, "Message too large"); return; }
        const parsed = JSON.parse(rawStr);
        const messages: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
        for (const msg of messages) {
          const validated = InboundWsMessageSchema.safeParse(msg);
          if (!validated.success) { deps.logger.warn({ clientId, roomId, errors: validated.error.issues }, "ws: invalid message schema"); deps.sendTo(client, { type: "error", code: "INVALID_PAYLOAD" } as unknown as WsMessage); continue; }
          await handleWsMessage(client, validated.data as unknown as WsMessage, roomId, clientId, deps.logger, deps.sendTo, deps.broadcastRoom);
        }
      } catch (err: unknown) { deps.logger.error({ err }, `ws:message: unhandled error`); }
    })();
  });

  client.on("close", () => {
    deps.logger.info({ clientId, roomId }, "ws: client disconnected");
    void appendRoomEvent(roomId, "MEMBER_LEAVE", client.userId, { displayName: client.displayName, durationMs: Date.now() - connectionStartMs }).catch((err: unknown) => deps.logger.warn({ err }, "events: failed to append MEMBER_LEAVE"));
    const ip = client._ip ?? "unknown";
    const remaining = (deps.connectionsPerIp.get(ip) ?? 1) - 1;
    remaining > 0 ? deps.connectionsPerIp.set(ip, remaining) : deps.connectionsPerIp.delete(ip);
    const currentRoom = deps.rooms.get(roomId);
    if (!currentRoom) return;
    currentRoom.delete(clientId);
    if (currentRoom.size === 0) {
      const timer = setTimeout(() => { if (deps.rooms.get(roomId)?.size === 0) deps.rooms.delete(roomId); deps.roomCleanupTimers.delete(roomId); }, deps.ROOM_CLEANUP_DELAY_MS);
      timer.unref(); deps.roomCleanupTimers.set(roomId, timer); return;
    }
    deps.schedulePushPresence(roomId); deps.broadcastRoom(roomId, { type: "user-left", clientId } as unknown as WsMessage, clientId);
  });
}

async function checkRoomCapacityAndRegister(client: ClientState, roomId: string, clientId: string, deps: ConnectionHandlerDeps): Promise<boolean> {
  const existingRoom = deps.rooms.get(roomId);
  if (existingRoom && existingRoom.size >= deps.env.MAX_CLIENTS_PER_ROOM) {
    deps.logger.warn({ roomId, currentSize: existingRoom.size, limit: deps.env.MAX_CLIENTS_PER_ROOM }, "ws: room at capacity, rejecting new connection");
    deps.sendTo(client, { type: "error", code: "ROOM_FULL", message: "This room is at capacity." } as unknown as WsMessage);
    client.close(1008, "Room at capacity"); return true;
  }
  const ip = client._ip ?? "unknown"; deps.connectionsPerIp.set(ip, (deps.connectionsPerIp.get(ip) ?? 0) + 1);
  const room = deps.getRoom(roomId); room.set(clientId, client);
  if (deps.roomCleanupTimers.has(roomId)) { clearTimeout(deps.roomCleanupTimers.get(roomId)!); deps.roomCleanupTimers.delete(roomId); }
  await deps.dbEnsureRoom(roomId, client.userId); return false;
}
