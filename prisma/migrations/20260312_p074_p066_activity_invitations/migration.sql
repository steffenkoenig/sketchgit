-- P074 – Room activity feed / audit log
-- P066 – Room invitation tokens

-- ─── RoomEventType enum ────────────────────────────────────────────────────────
CREATE TYPE "RoomEventType" AS ENUM (
  'COMMIT',
  'BRANCH_CREATE',
  'BRANCH_CHECKOUT',
  'ROLLBACK',
  'MEMBER_JOIN',
  'MEMBER_LEAVE'
);

-- ─── RoomEvent table ──────────────────────────────────────────────────────────
CREATE TABLE "RoomEvent" (
  "id"        TEXT         NOT NULL,
  "roomId"    TEXT         NOT NULL,
  "eventType" "RoomEventType" NOT NULL,
  "actorId"   TEXT,
  "payload"   JSONB        NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RoomEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RoomEvent"
  ADD CONSTRAINT "RoomEvent_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoomEvent"
  ADD CONSTRAINT "RoomEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "RoomEvent_roomId_createdAt_idx" ON "RoomEvent"("roomId", "createdAt");
CREATE INDEX "RoomEvent_actorId_idx"          ON "RoomEvent"("actorId");

-- ─── RoomInvitation table ─────────────────────────────────────────────────────
CREATE TABLE "RoomInvitation" (
  "id"        TEXT         NOT NULL,
  "token"     TEXT         NOT NULL,
  "roomId"    TEXT         NOT NULL,
  "createdBy" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "maxUses"   INTEGER      NOT NULL DEFAULT 1,
  "useCount"  INTEGER      NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RoomInvitation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RoomInvitation"
  ADD CONSTRAINT "RoomInvitation_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoomInvitation"
  ADD CONSTRAINT "RoomInvitation_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "RoomInvitation_token_key" ON "RoomInvitation"("token");
CREATE        INDEX "RoomInvitation_roomId_idx"    ON "RoomInvitation"("roomId");
CREATE        INDEX "RoomInvitation_expiresAt_idx" ON "RoomInvitation"("expiresAt");
