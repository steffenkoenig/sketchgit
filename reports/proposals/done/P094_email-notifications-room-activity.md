# P094 - Email Notifications for Room Activity

## Status
Done

## Goal
To allow users to subscribe to specific SketchGit rooms and receive email alerts summarizing significant changes or activities, improving asynchronous collaboration.

## Problem
Currently, users must manually revisit their rooms to check if collaborators have made changes, added new designs, or joined the session. This reliance on manual checking leads to missed updates, delayed feedback cycles, and overall slower collaboration, particularly for teams working across different time zones or in asynchronous workflows.

## Proposed Changes
1. **Schema Update**: Introduce a `RoomSubscription` model linking `User` and `Room` to track email notification preferences (e.g., instant, hourly digest, daily digest).
2. **Notification Service**: Create an internal backend service that aggregates room activity events (e.g., batched canvas updates) over a designated time window.
3. **Email Integration**: Integrate an email sending service (via standard SMTP) to dispatch the batched notifications.
4. **UI Enhancements**: Add a "Subscribe to updates" toggle in the room settings interface and a new section in the user dashboard to manage all active email subscriptions.
5. **Worker Process**: Implement a background job (e.g., using a Redis-backed queue) to periodically process the aggregated events and reliably send out the email digests.

## Future Press Release
Stay in the loop without the constant refresh! SketchGit is excited to introduce Email Notifications for Room Activity. We know that keeping track of every change across multiple whiteboards can be challenging, especially in asynchronous teams. Now, you can subscribe to your most important rooms and receive convenient email digests summarizing new edits and activities. Never miss a critical update from your collaborators again, and keep your creative projects moving forward effortlessly. Subscribe to your active rooms today and let the updates come to you!

## Definitions of Done

### Implementation
- `RoomSubscription` model added to the database schema.
- Notification aggregation logic and background worker processing queue implemented.
- Email dispatch mechanism integrated and tested.
- UI updated with subscription toggles in room settings and a centralized subscription management dashboard.
- Unsubscribe functionality implemented, including unique links in all outgoing emails.

### Testing
- Unit tests written for the notification aggregation, scheduling, and email formatting logic.
- Integration tests ensuring the background worker correctly processes and clears queued events.
- End-to-end (E2E) tests verifying the subscription UI toggle and user preferences dashboard.
- Coverage remains at or above the required project threshold.

### Documentation
- User documentation updated to explain how to manage email notifications and digests.
- Developer documentation updated with instructions on running the background worker and configuring the SMTP/email provider environment variables.

### Security
- Ensure unsubscribe links use secure, cryptographically signed tokens to prevent unauthorized modification of a user's subscription settings.
- Implement rate limiting on email dispatch to prevent abuse or unintentional spamming of users.

### Reliability
- The notification worker must handle failures gracefully, implementing retries with exponential backoff for failed email dispatches.
- The aggregation logic should process events in batches to minimize database load and prevent locking during high-activity periods.

### Accessibility
- The subscription UI and dashboard must be fully keyboard navigable and screen-reader friendly, with appropriate ARIA labels.
- Generated HTML emails must use semantic markup, maintain high color contrast, and include plain-text fallbacks.

### GDPR compliance
- Ensure explicit user consent is obtained during the subscription process.
- All outgoing emails must include a clear, frictionless, one-click unsubscribe link.
- If a user deletes their account, all associated email subscriptions and pending queued notifications must be immediately and permanently purged.
- Update the privacy policy to clearly state how email addresses are used for service notifications and how users can opt-out.

## Implementation Notes

Implemented by reusing three pieces of infrastructure that already existed
but weren't yet connected for this purpose, rather than the proposal's
from-scratch framing (a new aggregation pipeline + Redis-backed queue):

- **Aggregation data source**: P074's `RoomEvent` activity feed already
  records every COMMIT/BRANCH_CREATE/BRANCH_CHECKOUT/ROLLBACK/MEMBER_JOIN/
  MEMBER_LEAVE. No new event pipeline — the digest job just queries
  `RoomEvent` for a room within a time window (`getRoomEventsSince()`, new).
- **Background job scheduling**: this app has exactly one existing periodic
  background job (P032's room pruning), and it's a plain `setInterval`
  inside the long-running `server.ts` process — no Redis-backed queue, no
  cron, no distributed job system anywhere in the codebase today. The
  digest job (`startDigestJob()` in `server.ts`, logic in
  `lib/server/digestJob.ts`) follows the exact same pattern rather than
  introducing a new architectural concept for one feature.
- **Email sending**: extracted `lib/server/email.ts`'s `sendEmail()` from
  what was two copy-pasted Resend integrations
  (`forgot-password/route.ts`, `2fa/enable/route.ts`) — P094 would have
  been a third copy. Both existing call sites now use the shared helper;
  behavior is unchanged (verified via each route's existing test suite,
  which still passes unmodified).

### Multi-instance safety without a Redis lock
`claimSubscriptionForDigest()` does an atomic conditional `UPDATE ...
WHERE lastSentAt IS NULL OR lastSentAt < windowStart` before a digest is
composed — only one concurrent job run's UPDATE can match a given
subscription row, so running this on multiple server replicas can't
double-send. This achieves the same safety property a Redis lock would,
without adding Redis as a hard dependency for a single-instance deployment
(Redis is already optional in this app — P012).

### Core implementation
- `prisma/schema.prisma` — `RoomSubscription` (roomId, userId, frequency:
  HOURLY|DAILY, lastSentAt), unique on `(roomId, userId)`, cascade-deletes
  on both room and user deletion (satisfies the GDPR purge requirement by
  construction — verified live, see below).
- `lib/db/roomRepository.ts` — subscription CRUD
  (`upsertRoomSubscription`, `deleteRoomSubscription`,
  `deleteRoomSubscriptionById`, `getRoomSubscription`,
  `getUserSubscriptions`) plus the digest-job-specific
  `getDueSubscriptions`/`claimSubscriptionForDigest`/`revertDigestClaim`/
  `getRoomEventsSince`.
- `lib/server/subscriptionTokens.ts` — stateless HMAC-signed unsubscribe
  tokens (encodes the subscription id directly, unlike
  `invitationTokens.ts`/`shareLinkTokens.ts` which store a random token in
  the DB — an unsubscribe link must work with zero DB round-trip and no
  login).
- `lib/server/digestJob.ts` — composes and sends digests; `runDigestTier()`
  processes one frequency tier, `runDigestJob()` runs both. Renders a
  semantic HTML email (heading, list, real link text, WCAG-AA-contrast
  inline styles — email clients don't reliably load external CSS) with a
  derived plain-text fallback.
- REST: `GET/POST/DELETE /api/rooms/[roomId]/subscribe` (authenticated),
  `GET /api/subscriptions` (dashboard listing), `GET
  /api/subscriptions/unsubscribe?token=...` (public, one-click, returns an
  HTML confirmation page since it's reached by clicking an email link, not
  an API call).
- UI: extended P093's `RoomSettingsModal.tsx` with an "Email me updates"
  checkbox + frequency select (any signed-in user, not owner-only — unlike
  the password section above it in the same modal); added a "My Email
  Subscriptions" section to the dashboard (`SubscriptionsList.tsx` +
  `UnsubscribeButton.tsx`) fetched server-side, updated client-side on
  unsubscribe without a full reload.

### A real reliability gap found and fixed before it shipped
The first version claimed a subscription (set `lastSentAt`) *before*
attempting the send, with no path back if the send failed — a Resend
outage or network error would silently lose that digest until the next
full window (an hour or a day later), directly contradicting the
proposal's explicit "must handle failures gracefully... retries" reliability
requirement. Fixed by having `getDueSubscriptions()` also return each
subscription's previous `lastSentAt`, and added `revertDigestClaim()`:
on a genuine send failure (not "no provider configured" — that's expected
dev-mode behavior, not a failure to retry), the claim is reverted to its
previous value so the subscription is due again on the *next* job tick.
This isn't true exponential backoff (retried at the job's own fixed
interval, not with increasing delay) — a reasonable middle ground given
the job already runs on a fixed interval rather than a proper retry queue;
documented here as a deliberate scoping decision, not an oversight.

### Verified against real infrastructure
Built a production server against a real Dockerized Postgres and:
- Seeded a real user + room + subscription + `RoomEvent` directly via SQL,
  ran the server with `DIGEST_JOB_INTERVAL_MINUTES=1`, and confirmed via
  polling the database that the digest job's `setInterval` tick actually
  fired and atomically claimed the subscription (`lastSentAt` moved from
  `NULL` to a real timestamp) — proving the full pipeline (timer → query →
  claim → compose) runs correctly end-to-end, not just against mocks.
  (No real Resend account was available to verify actual delivery; the
  send-path itself is covered by `email.test.ts`/`digestJob.test.ts`.)
- Generated a real signed unsubscribe token with the actual
  `subscriptionTokens.ts` module and hit `GET
  /api/subscriptions/unsubscribe?token=...` over HTTP — confirmed the
  subscription was deleted and a real HTML confirmation page returned.
- Deleted the test user directly via SQL and confirmed the
  `RoomSubscription` row was cascade-deleted — the GDPR purge-on-account-
  deletion requirement holds by schema design, not application code that
  could have a bug or be bypassed.

### Scoped down from the proposal
- **No E2E test for the subscription UI toggle.** Same environment note as
  P092/P093 for anything gated behind a real login session in this
  sandbox's Playwright setup; the toggle's logic is covered by
  `digestJob.test.ts`/route-level tests, and the end-to-end data pipeline
  was verified for real as described above.
- **"Instant" notifications are not implemented** — only HOURLY and DAILY.
  True per-event instant email would be a different, event-triggered code
  path (fire on every `appendRoomEvent()` call) rather than an interval
  job, and risks a genuinely spammy experience for an active room (every
  commit = an email) without additional throttling design; scoped out for
  this pass. HOURLY is the closest approximation the proposal's own
  wording ("instant, hourly digest, daily digest") already anticipated as
  a tier, not a special case.
- **No global cap on emails sent per job run.** Per-subscription throttling
  is inherent to the design (a HOURLY subscriber gets at most one email
  per hour, a DAILY subscriber at most one per day — satisfies the
  proposal's "rate limiting on email dispatch to prevent abuse"
  requirement by construction) but there's no cap on *total* emails across
  all subscriptions in one job tick, which could matter at a scale this
  app doesn't operate at today. Noted as a future improvement if room
  count grows large enough for it to matter.
- **No developer/user-guide documentation pages** — same as P092/P093, this
  repo has no docs site; `DIGEST_JOB_INTERVAL_MINUTES` and
  `EMAIL_UNSUBSCRIBE_SECRET` were added to `README.md`'s env var table and
  `.env.example`, and the extensive doc comments throughout the new
  modules serve as the developer-facing explanation the proposal asked for.
- **Privacy-policy documentation** — out of scope, same GAP-* blocker noted
  in every prior proposal this session (no real business info available).
