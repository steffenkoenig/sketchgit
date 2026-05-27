# P093 - Room Password Protection

## Goal
To allow room creators to set an optional password on their SketchGit whiteboards, restricting access exclusively to individuals who possess the password, regardless of whether they have the room's URL.

## Problem
Currently, access to a SketchGit room is governed entirely by URL obscurity (unlisted links). If a URL is leaked or accidentally shared publicly, anyone can view or interact with the whiteboard. For users dealing with sensitive information—such as internal company brainstorming, confidential designs, or private tutoring sessions—URL obscurity is insufficient. There is no mechanism to explicitly lock down a room to unauthorized visitors.

## Proposed Changes
1. **Schema Update**: Update the database schema to store an optional, securely hashed password (e.g., using bcrypt or Argon2) for each room.
2. **Authentication Flow**: Implement an interstitial password prompt page that intercepts users attempting to join a password-protected room.
3. **Session Management**: Issue secure, HttpOnly, signed cookies or short-lived JWTs to authenticate a user's session specifically for the accessed room. To support multi-room sessions seamlessly (e.g. opening different rooms in multiple browser tabs), cookies must be path-scoped (e.g., `Path=/rooms/[roomId]`) or the JWT/session token must store a map of authorized room IDs, preventing tabs from overwriting each other's sessions.
4. **UI Enhancements**: Add options in the room creation and settings interfaces to enable, disable, or change the room password.
5. **API & WebSocket Security**: Ensure all HTTP API routes and WebSocket connections strictly validate the room-specific authentication token before permitting any data exchange.

## Future Press Release
Security just got an upgrade in SketchGit! We are introducing Room Password Protection, giving you absolute control over who enters your creative space. We understand that not all whiteboards are meant for the public eye. Now, you can add a sturdy lock to your rooms with a custom password. Even if your room link gets shared around, only those with the secret key will be able to join, view, or edit. Secure your sensitive brainstorming sessions, protect your confidential designs, and collaborate with confidence. Set a password on your next room and experience a safer way to create!

## Definitions of Done

### Implementation
- Database schema updated to support storing hashed passwords.
- Interstitial password prompt UI developed.
- Backend logic implemented to hash incoming passwords and verify them against stored hashes.
- Session management implemented to persist access to the specific room, utilizing path-scoped cookies or multi-room token mappings to support concurrent multi-room sessions.
- Room settings UI updated to allow setting/removing the password.

### Testing
- Unit tests written for password hashing, verification, and session token generation.
- Integration tests ensuring protected API endpoints and WebSockets reject unauthorized access without a valid session token.
- E2E tests validating the user flow: attempting to access a room -> getting prompted for password -> successfully entering and accessing the room.
- Coverage remains at or above the required project threshold.

### Documentation
- User documentation updated to explain how to secure a room with a password.
- Developer documentation updated detailing the authentication flow and token usage.

### Security
- Passwords must be securely hashed and salted (e.g., using bcrypt) in the database; raw passwords must never be stored.
- Implement rate limiting on the password prompt endpoint to mitigate brute-force guessing attacks.
- Ensure authentication tokens are tightly scoped to the specific room and are cryptographically signed.

### Reliability
- The authentication check must be performant, specifically during the initial WebSocket handshake, to avoid delaying room entry for valid users.

### Accessibility
- The password prompt interstitial page must be fully keyboard navigable.
- Appropriate ARIA attributes and focus management must be implemented so screen readers can easily interact with the password input and submit buttons.

### GDPR compliance
- Since passwords are an authentication mechanism, their storage and processing must be secured. Ensure hashed passwords are treated as sensitive data.
- The privacy policy should clarify that room passwords are not linked to personal user accounts (if applicable) but are strictly for access control to the room entity.
