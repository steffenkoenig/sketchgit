/**
 * P085 – One-time backfill: stamp `schemaVersion` on legacy Commit rows.
 *
 * Legacy commits (created before P085) have no `schemaVersion` field inside
 * their `canvasJson` JSONB blob. The application already migrates these
 * transparently at read time (see lib/sketchgit/git/canvasSchemaMigrations.ts),
 * so this backfill is NOT required for correctness — it exists purely so an
 * operator can confirm zero legacy rows remain (observability), and so every
 * future read of an old commit skips the (cheap, but non-zero) migration step.
 *
 * Only SNAPSHOT rows are touched. DELTA rows store `{ added, modified, removed }`
 * — an operations list, not a canvas envelope — and inherit their schemaVersion
 * from the SNAPSHOT they replay against at read time; stamping a DELTA row
 * directly would corrupt it.
 *
 * Idempotent: re-running finds zero remaining rows to update.
 *
 * Usage: node scripts/backfill-canvas-schema-version.mjs [--dry-run]
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const legacyRows = await prisma.$queryRaw`
    SELECT sha, "canvasJson"
    FROM "Commit"
    WHERE "storageType" = 'SNAPSHOT'
      AND "canvasJson" ->> 'schemaVersion' IS NULL
  `;

  console.info(`[backfill] Found ${legacyRows.length} legacy SNAPSHOT commit(s) missing schemaVersion.`);

  if (dryRun) {
    console.info("[backfill] --dry-run: no changes made.");
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const row of legacyRows) {
    await prisma.commit.update({
      where: { sha: row.sha },
      data: { canvasJson: { ...row.canvasJson, schemaVersion: 1 } },
    });
    updated++;
  }

  console.info(`[backfill] Updated ${updated} commit(s).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[backfill] Failed:", err);
  process.exit(1);
});
