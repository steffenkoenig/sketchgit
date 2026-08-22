/**
 * P090 – Feature flag evaluation.
 *
 * Flags are stored in the FeatureFlag table (lib/db/featureFlagRepository.ts)
 * and evaluated per-request via isEnabled(), with results cached in-process
 * (LRU, 30s TTL) to avoid a DB round-trip on every call.
 */
import { LRUCache } from "lru-cache";
import { getFeatureFlag, type TargetScope } from "../db/featureFlagRepository";
import type { FeatureFlag } from "@prisma/client";

/** Known flag names. Add new flags here to catch typos at compile time. */
export type FeatureFlagName =
  | "canvas-schema-v2"
  | "read-replica"
  | "sentry-client"
  | "presenter-mode";

export interface EvaluationContext {
  userId?: string | null;
  roomId?: string | null;
}

const FLAG_CACHE_TTL_MS = 30_000;

// LRUCache values must satisfy `{}` (non-nullish), so a DB miss is cached as
// `{ flag: null }` rather than `null` directly — still distinguishable from
// "not cached yet" via LRUCache.get() returning `undefined`.
interface CacheEntry {
  flag: FeatureFlag | null;
}

const cache = new LRUCache<string, CacheEntry>({
  max: 500,
  ttl: FLAG_CACHE_TTL_MS,
});

async function loadFlag(name: string): Promise<FeatureFlag | null> {
  const cached = cache.get(name);
  if (cached !== undefined) return cached.flag;
  const flag = await getFeatureFlag(name);
  cache.set(name, { flag });
  return flag;
}

/** Invalidates the cached value for `name` — call after an admin write so the change takes effect immediately rather than waiting out the TTL. */
export function invalidateFeatureFlagCache(name: string): void {
  cache.delete(name);
}

/**
 * Evaluates whether `flagName` is enabled for the given context.
 *
 * Evaluation order: unknown flag → false; globally enabled → true; disabled
 * but the context's userId/roomId is in targetScope → true; otherwise false.
 */
export async function isEnabled(flagName: FeatureFlagName, context: EvaluationContext = {}): Promise<boolean> {
  const flag = await loadFlag(flagName);
  if (!flag) return false;
  if (flag.enabled) return true;

  const scope = flag.targetScope as TargetScope;
  if (context.userId && scope.userIds?.includes(context.userId)) return true;
  if (context.roomId && scope.roomIds?.includes(context.roomId)) return true;

  return false;
}
