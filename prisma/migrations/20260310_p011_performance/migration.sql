-- P011: Database performance optimizations
--
-- 1. Migrate canvasJson from plain TEXT to JSONB.
--    The USING cast validates that every existing row contains valid JSON.
--    If any row contains invalid JSON, this migration will fail – validate
--    data integrity before applying in production.
--
-- 2. Add composite and single-column indices on the most frequently queried
--    columns: Commit.roomId, Commit.authorId, Commit.(roomId, createdAt),
--    and RoomMembership.userId.
--
-- Migration generated manually because Prisma does not emit USING casts for
-- column type changes. Run with: npx prisma migrate deploy

-- ── 1. Convert canvasJson TEXT → JSONB ───────────────────────────────────────
ALTER TABLE "Commit"
  ALTER COLUMN "canvasJson" TYPE jsonb
  USING "canvasJson"::jsonb;

-- ── 2. Add missing indices ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Commit_roomId_idx"
  ON "Commit"("roomId");

CREATE INDEX IF NOT EXISTS "Commit_authorId_idx"
  ON "Commit"("authorId");

CREATE INDEX IF NOT EXISTS "Commit_roomId_createdAt_idx"
  ON "Commit"("roomId", "createdAt");

CREATE INDEX IF NOT EXISTS "RoomMembership_userId_idx"
  ON "RoomMembership"("userId");
