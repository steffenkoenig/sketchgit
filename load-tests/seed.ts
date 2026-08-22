/**
 * P083 – Seeds a room with commit history for the k6 load test suite.
 *
 * Scaled down from the proposal's "5 rooms with 100-500 commits, 20 users"
 * to one room with 50 commits and one user — enough to exercise pagination
 * and realistic response sizes without a multi-minute seeding step before
 * every local run. Increase COMMIT_COUNT for a closer-to-production dataset
 * when actually measuring performance, not just validating the scripts.
 *
 * Run with: npx tsx load-tests/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ensureRoom, saveCommit, type CommitRecord } from "../lib/db/roomRepository";
import { CANVAS_JSON_SCHEMA_VERSION } from "../lib/sketchgit/git/canvasSchemaVersion";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ROOM_ID = process.env.SEED_ROOM_ID || "load-test-room";
const COMMIT_COUNT = 50;

function makeCanvasJson(objectCount: number): string {
  const objects = Array.from({ length: objectCount }, (_, i) => ({
    type: "rect",
    _id: `obj_${i}`,
    left: i * 10,
    top: i * 10,
    width: 50,
    height: 50,
    fill: "#7c6eff",
  }));
  return JSON.stringify({ schemaVersion: CANVAS_JSON_SCHEMA_VERSION, version: "7.4.0", objects });
}

async function main() {
  console.info(`[seed] Ensuring room ${ROOM_ID}...`);
  await ensureRoom(ROOM_ID, null);
  // Load tests hit this room anonymously/publicly — matches the
  // anonymous-first UX (P007) so k6 doesn't need session cookies.
  await prisma.room.update({ where: { id: ROOM_ID }, data: { isPublic: true } });

  let parent: string | null = null;
  for (let i = 0; i < COMMIT_COUNT; i++) {
    const sha = `loadtest${String(i).padStart(8, "0")}${"0".repeat(24)}`.slice(0, 40);
    const commit: CommitRecord = {
      sha,
      parent,
      parents: parent ? [parent] : [],
      message: `Load test commit ${i + 1}/${COMMIT_COUNT}`,
      ts: Date.now() - (COMMIT_COUNT - i) * 60_000,
      canvas: makeCanvasJson((i % 10) + 1),
      branch: "main",
      isMerge: false,
    };
    await saveCommit(ROOM_ID, commit, null);
    parent = sha;
  }

  console.info(`[seed] Created ${COMMIT_COUNT} commits in room ${ROOM_ID}.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
