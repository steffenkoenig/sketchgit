/**
 * lib/server/digestJob.ts
 *
 * P094 – Room activity email digests.
 *
 * Aggregation data source: the existing RoomEvent activity feed (P074) —
 * no new event-aggregation pipeline needed, just a time-windowed query.
 *
 * Scheduling: this module only contains the "what to do" logic (compose and
 * send digests for subscriptions due right now). The "when to run it" is a
 * setInterval in server.ts, following the exact same pattern already
 * established for the room-pruning job (P032) rather than introducing a
 * new Redis-backed queue system — this app has no distributed job queue
 * infrastructure today, and one setInterval-based job more doesn't
 * introduce a new architectural pattern to maintain.
 *
 * Multi-instance safety: claimSubscriptionForDigest() does an atomic
 * conditional UPDATE (only succeeds if the subscription hasn't already been
 * claimed/sent for this window), so running this job on multiple server
 * replicas at once cannot double-send a digest — no Redis lock needed.
 */
import {
  getDueSubscriptions,
  claimSubscriptionForDigest,
  revertDigestClaim,
  getRoomEventsSince,
  type RoomEventType,
} from "@/lib/db/roomRepository";
import { sendEmail } from "@/lib/server/email";
import { signUnsubscribeToken } from "@/lib/server/subscriptionTokens";
import type { DigestFrequency } from "@prisma/client";

const WINDOW_MS: Record<DigestFrequency, number> = {
  HOURLY: 60 * 60 * 1000,
  DAILY: 24 * 60 * 60 * 1000,
};

const EVENT_LABELS: Record<RoomEventType, string> = {
  COMMIT: "New commit",
  BRANCH_CREATE: "New branch created",
  BRANCH_CHECKOUT: "Branch switched",
  ROLLBACK: "Rolled back to an earlier commit",
  MEMBER_JOIN: "Someone joined the room",
  MEMBER_LEAVE: "Someone left the room",
};

export interface DigestRunResult {
  /** Digests actually emailed. */
  sent: number;
  /** Subscriptions that had no new activity in the window — no email sent, but lastSentAt still advanced. */
  quiet: number;
  /** Subscriptions another concurrent job run already claimed this cycle (multi-instance safety, not an error). */
  skipped: number;
}

function baseUrl(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

function roomLabel(roomId: string, roomSlug: string | null): string {
  return roomSlug ?? roomId;
}

function renderDigestEmail(
  roomId: string,
  roomSlug: string | null,
  events: Array<{ eventType: RoomEventType; createdAt: Date }>,
  unsubscribeUrl: string,
): { html: string; text: string } {
  const label = roomLabel(roomId, roomSlug);
  const roomUrl = `${baseUrl()}/?room=${encodeURIComponent(roomId)}`;

  const itemsHtml = events
    .map((e) => `<li>${EVENT_LABELS[e.eventType]} — <time datetime="${e.createdAt.toISOString()}">${e.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</time></li>`)
    .join("\n");

  // Semantic markup (heading, list, links with real text), inline styles for
  // color-contrast (email clients don't reliably support external CSS),
  // dark-on-light text meeting WCAG AA contrast.
  const html = `<!DOCTYPE html>
<html lang="en">
<body style="font-family: -apple-system, sans-serif; color: #1a1a2e; background: #ffffff; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 18px;">Activity in "${label}"</h1>
  <p>Here's what happened since your last update:</p>
  <ul style="padding-left: 20px; line-height: 1.6;">
${itemsHtml}
  </ul>
  <p><a href="${roomUrl}" style="color: #6d28d9;">Open the room →</a></p>
  <hr style="border: none; border-top: 1px solid #e2e2ef; margin: 24px 0;" />
  <p style="font-size: 12px; color: #475569;">
    You're receiving this because you subscribed to updates for this room.
    <a href="${unsubscribeUrl}" style="color: #475569;">Unsubscribe</a> at any time.
  </p>
</body>
</html>`;

  const text = `Activity in "${label}"\n\n${events
    .map((e) => `- ${EVENT_LABELS[e.eventType]} (${e.createdAt.toISOString()})`)
    .join("\n")}\n\nOpen the room: ${roomUrl}\n\nUnsubscribe: ${unsubscribeUrl}`;

  return { html, text };
}

/**
 * Processes all subscriptions of one frequency tier that are due for a
 * digest as of `now`. Called once per tier per job tick from server.ts.
 */
export async function runDigestTier(frequency: DigestFrequency, now: Date = new Date()): Promise<DigestRunResult> {
  const windowStart = new Date(now.getTime() - WINDOW_MS[frequency]);
  const due = await getDueSubscriptions(frequency, windowStart);

  const result: DigestRunResult = { sent: 0, quiet: 0, skipped: 0 };

  for (const sub of due) {
    const claimed = await claimSubscriptionForDigest(sub.id, windowStart, now);
    if (!claimed) {
      result.skipped++;
      continue;
    }

    const events = await getRoomEventsSince(sub.roomId, windowStart);
    if (events.length === 0) {
      // Nothing to report — lastSentAt already advanced by the claim above,
      // so the next window starts from here. No email for an empty digest.
      result.quiet++;
      continue;
    }

    const unsubscribeUrl = `${baseUrl()}/api/subscriptions/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(sub.id))}`;
    const { html, text } = renderDigestEmail(sub.roomId, sub.roomSlug, events, unsubscribeUrl);

    const sendResult = await sendEmail({
      to: sub.userEmail,
      subject: `Activity in "${roomLabel(sub.roomId, sub.roomSlug)}" (${events.length} update${events.length === 1 ? "" : "s"})`,
      html,
      text,
    });
    if (sendResult.sent) {
      result.sent++;
    } else if (sendResult.reason === "error") {
      // P094 reliability requirement — a genuine send failure (provider
      // error, not "no provider configured") reverts the claim so this
      // subscription is due again on the *next* job tick rather than
      // silently losing the digest until the next full window (an
      // hour/day later). Not true exponential backoff — retried at the
      // job's own fixed interval — but a real retry rather than a drop.
      await revertDigestClaim(sub.id, now, sub.lastSentAt);
    }
  }

  return result;
}

/** Runs both frequency tiers once. Called on each job tick from server.ts. */
export async function runDigestJob(now: Date = new Date()): Promise<Record<DigestFrequency, DigestRunResult>> {
  const [hourly, daily] = await Promise.all([runDigestTier("HOURLY", now), runDigestTier("DAILY", now)]);
  return { HOURLY: hourly, DAILY: daily };
}
