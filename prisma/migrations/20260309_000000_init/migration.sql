-- Initial database schema for SketchGit
-- Creates all tables as of the P013/P014/P015/P016/P027 implementation.
-- The canvasJson column is TEXT here; migration 20260310_p011_performance
-- will later convert it to JSONB.

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- ── Auth tables ───────────────────────────────────────────────────────────────

CREATE TABLE "User" (
    "id"            TEXT NOT NULL,
    "name"          TEXT,
    "email"         TEXT,
    "emailVerified" TIMESTAMP(3),
    "image"         TEXT,
    "passwordHash"  TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Account" (
    "id"                TEXT NOT NULL,
    "userId"            TEXT NOT NULL,
    "type"              TEXT NOT NULL,
    "provider"          TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token"     TEXT,
    "access_token"      TEXT,
    "expires_at"        INTEGER,
    "token_type"        TEXT,
    "scope"             TEXT,
    "id_token"          TEXT,
    "session_state"     TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key"
    ON "Account"("provider", "providerAccountId");

ALTER TABLE "Account"
    ADD CONSTRAINT "Account_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token"      TEXT NOT NULL,
    "expires"    TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key"
    ON "VerificationToken"("identifier", "token");

-- ── Room tables ───────────────────────────────────────────────────────────────

CREATE TABLE "Room" (
    "id"        TEXT NOT NULL,
    "slug"      TEXT,
    "ownerId"   TEXT,
    "isPublic"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Room_slug_key" ON "Room"("slug");

ALTER TABLE "Room"
    ADD CONSTRAINT "Room_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RoomMembership" (
    "roomId"   TEXT NOT NULL,
    "userId"   TEXT NOT NULL,
    "role"     "MemberRole" NOT NULL DEFAULT 'EDITOR',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomMembership_pkey" PRIMARY KEY ("roomId", "userId")
);

ALTER TABLE "RoomMembership"
    ADD CONSTRAINT "RoomMembership_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoomMembership"
    ADD CONSTRAINT "RoomMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Git model tables ──────────────────────────────────────────────────────────

CREATE TABLE "Commit" (
    "sha"        TEXT NOT NULL,
    "roomId"     TEXT NOT NULL,
    "parentSha"  TEXT,
    "parents"    TEXT[],
    "branch"     TEXT NOT NULL,
    "message"    TEXT NOT NULL,
    "canvasJson" TEXT NOT NULL,
    "isMerge"    BOOLEAN NOT NULL DEFAULT false,
    "authorId"   TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commit_pkey" PRIMARY KEY ("sha")
);

ALTER TABLE "Commit"
    ADD CONSTRAINT "Commit_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Commit"
    ADD CONSTRAINT "Commit_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Branch" (
    "roomId"  TEXT NOT NULL,
    "name"    TEXT NOT NULL,
    "headSha" TEXT NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("roomId", "name")
);

ALTER TABLE "Branch"
    ADD CONSTRAINT "Branch_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RoomState" (
    "roomId"     TEXT NOT NULL,
    "headSha"    TEXT,
    "headBranch" TEXT,
    "isDetached" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomState_pkey" PRIMARY KEY ("roomId")
);

ALTER TABLE "RoomState"
    ADD CONSTRAINT "RoomState_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
