import type { WsMessage } from "../sketchgit/types.js";

export function handleRedisPmessage(
  channel: string,
  data: string,
  redisChannelPrefix: string,
  serverInstanceId: string,
  logger: { warn: (obj: object, msg: string) => void },
  broadcastFn: (roomId: string, payload: WsMessage, excludeClientId?: string) => void
) {
  const roomId = channel.slice(redisChannelPrefix.length);
  let envelope: { from: string; instanceId: string; payload: WsMessage };
  try {
    envelope = JSON.parse(data) as { from: string; instanceId: string; payload: WsMessage };
  } catch {
    logger.warn({ channel }, "redis: failed to parse pmessage payload");
    return;
  }
  if (envelope.instanceId === serverInstanceId) return;
  broadcastFn(roomId, envelope.payload, envelope.from);
}
