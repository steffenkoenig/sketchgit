## Milestone 2.0 - Two-Factor Authentication (2FA) via Email

**Current State Audit:** Verified the codebase. The `User` model currently lacks 2FA fields, and there's no `TwoFactorToken` model. The authentication flow uses NextAuth with standard credentials and GitHub OAuth. There are no API endpoints for 2FA.

**Completed Items:**
- [ ] Implement Prisma schema changes (User fields, TwoFactorToken model).
- [ ] Create API endpoints for 2FA enable/verify (`/api/auth/2fa/enable`, `/api/auth/2fa/verify`).
- [ ] Integrate 2FA challenge into NextAuth login flow.
- [ ] Add "Security" tab to the user dashboard for managing 2FA.
- [ ] Create 2FA verification challenge screen during login.
- [ ] Implement email sending via Resend for 2FA OTP codes.
- [ ] Update documentation (README.md, /docs/customer, /docs/technical, /docs/support).

**Active Step:** Planning.
**Blockers/Constraints:** None.

## Milestone 1.1 - Object Grouping and Alignment

**Current State Audit:** Verified the codebase. The canvas currently handles `ActiveSelection` inherently via Fabric, but lacks generic Grouping UI or methods. Fabric 7 lacks `toGroup()` and `toActiveSelection()` so groups must be constructed/destructed manually. Merge engine handles standard properties but needs updates for deep `_groupObjects` handling during a 3-way merge.

**Completed Items:**

**Active Step:** Implementing Grouping and Alignment logic.
**Blockers/Constraints:** None.
