-- P091 – Granular share links: room, branch, and commit sharing with role-based permissions

-- ─── Add COMMITTER to MemberRole enum ────────────────────────────────────────
ALTER TYPE "MemberRole" ADD VALUE IF NOT EXISTS 'COMMITTER';

-- ─── ShareScope enum ─────────────────────────────────────────────────────────
CREATE TYPE "ShareScope" AS ENUM (
  'ROOM',
  'BRANCH',
  'COMMIT'
);

-- ─── SharePermission enum ────────────────────────────────────────────────────
CREATE TYPE "SharePermission" AS ENUM (
  'ADMIN',
  'BRANCH_CREATE',
  'WRITE',
  'VIEW'
);

-- ─── ShareLink table ─────────────────────────────────────────────────────────
CREATE TABLE "ShareLink" (
  "id"         TEXT              NOT NULL,
  "token"      TEXT              NOT NULL,
  "roomId"     TEXT              NOT NULL,
  "label"      TEXT,
  "scope"      "ShareScope"      NOT NULL DEFAULT 'ROOM',
  "branches"   TEXT[]            NOT NULL DEFAULT '{}',
  "commitSha"  TEXT,
  "permission" "SharePermission" NOT NULL DEFAULT 'VIEW',
  "createdBy"  TEXT,
  "expiresAt"  TIMESTAMP(3),
  "maxUses"    INTEGER,
  "useCount"   INTEGER           NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ShareLink"
  ADD CONSTRAINT "ShareLink_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShareLink"
  ADD CONSTRAINT "ShareLink_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ShareLink_token_key"      ON "ShareLink"("token");
CREATE        INDEX "ShareLink_roomId_idx"     ON "ShareLink"("roomId");
CREATE        INDEX "ShareLink_expiresAt_idx"  ON "ShareLink"("expiresAt");
CREATE        INDEX "ShareLink_commitSha_idx"  ON "ShareLink"("commitSha");
