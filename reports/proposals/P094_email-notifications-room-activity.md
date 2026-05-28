# P094 - Email Notifications for Room Activity

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
