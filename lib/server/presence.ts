import type { RedisLike } from '../redis.js';
import type { Logger } from 'pino';

export const REDIS_PRESENCE_PREFIX = 'sketchgit:presence:';

/**
 * P035 – Return the merged list of clients from all server instances for a room.
 * Falls back to the local client list when Redis is unavailable.
 */
export async function getGlobalPresence(
  roomId: string,
  localClients: Array<{ clientId: string; name: string; color: string; userId: string | null; branch: string; headSha: string | null }>,
  redisPub: RedisLike | null,
  redisReady: boolean,
  logger: Logger
): Promise<Array<{ clientId: string; name: string; color: string; userId: string | null; branch: string; headSha: string | null }>> {
  if (!redisPub || !redisReady) return localClients;

  try {
    const key = `${REDIS_PRESENCE_PREFIX}${roomId}`;
    const allFields = await redisPub.hgetall(key);
    if (!allFields) return localClients;

    const seen = new Set<string>();
    const merged: Array<{ clientId: string; name: string; color: string; userId: string | null; branch: string; headSha: string | null }> = [];
    for (const value of Object.values(allFields)) {
      const clients = JSON.parse(value) as Array<{ clientId: string; name: string; color: string; userId: string | null; branch?: string; headSha?: string | null }>;
      for (const c of clients) {
        if (!seen.has(c.clientId)) {
          seen.add(c.clientId);
          merged.push({ ...c, branch: c.branch ?? 'main', headSha: c.headSha ?? null });
        }
      }
    }
    return merged;
  } catch (err) {
    logger.warn({ roomId, err }, "redis: getGlobalPresence failed, falling back to local");
    return localClients;
  }
}
