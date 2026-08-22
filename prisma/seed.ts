/**
 * P090 – Seeds initial feature flags.
 *
 * Idempotent (upsert by unique name) — safe to re-run. These are placeholder
 * flags for features that don't check them yet (canvas-schema-v2, read-replica,
 * sentry-client — P085/P088/P084 respectively); each becomes load-bearing
 * only once its feature's code path calls isEnabled() on it. presenter-mode
 * ships unconditionally today (P080), included here as the pattern's example
 * of a flag defaulting to enabled=true.
 *
 * Run with: npx tsx prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const seedFlags: Array<{ name: string; description: string; enabled: boolean }> = [
  { name: "canvas-schema-v2", description: "Enable canvas JSON schema v2 writes (P085)", enabled: false },
  { name: "read-replica", description: "Route reads to the database replica (P088)", enabled: false },
  { name: "sentry-client", description: "Enable the Sentry browser SDK (P084)", enabled: false },
  { name: "presenter-mode", description: "Enable presenter follow-view (P080)", enabled: true },
];

async function main() {
  for (const flag of seedFlags) {
    await prisma.featureFlag.upsert({
      where: { name: flag.name },
      create: { name: flag.name, description: flag.description, enabled: flag.enabled },
      update: {}, // don't overwrite an operator's runtime toggle on re-seed
    });
  }
  console.info(`[seed] Upserted ${seedFlags.length} feature flags.`);
}

main()
  .catch((err) => {
    console.error("[seed] Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
