# Skill: New Test Factory

## Purpose
Add a factory function for a Prisma model to `lib/test/factories.ts`, following
the P077 conventions, so tests use `makeX({ overrides })` instead of inline
literal mock objects.

## When to Use
A new Prisma model was added to `prisma/schema.prisma` and tests need to
construct instances of it, or an existing model has no factory yet and a test
you're writing needs one.

## Canonical Pattern

Study the existing factories in `lib/test/factories.ts`
(`makeUser`, `makeRoom`, `makeMembership`, `makeCommit`, `makeShareLink`)
before writing a new one — they establish the exact conventions below.

```typescript
export function make<ModelName>(overrides: Partial<ModelName> = {}): ModelName {
  const id = overrides.id ?? `<prefix>_${seq()}`;
  return {
    id,
    // Every required field on the Prisma model gets a deterministic,
    // human-readable default. Do NOT use Math.random() or crypto.randomUUID()
    // for defaults — the seq() counter keeps output reproducible across runs.
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}
```

Rules, verified from the existing factories:
- **Import the Prisma-generated type** from `@prisma/client` (e.g.
  `import type { RoomInvitation } from "@prisma/client"`) and return exactly
  that type — the factory's return type is the contract, so a schema change
  that adds a required field will fail `tsc` here until the factory is updated.
- **Use `seq()`** (already defined at the top of `factories.ts`) for any ID or
  otherwise-unique field, prefixed to be recognizable (`usr_`, `room_`, etc. —
  pick a short prefix consistent with the model name).
- **Fixed dates**, never `new Date()` / `Date.now()` — tests must not be
  time-dependent.
- **Foreign keys as function parameters, not overridable defaults**, when the
  factory clearly depends on a parent record — see `makeMembership(roomId,
  userId, role)` and `makeCommit(roomId, overrides)`, which take the parent ID
  positionally rather than defaulting it, since a membership/commit without a
  real room ID is rarely a meaningful test fixture.
- **Placeholder/deliberately-invalid values are commented** when a field needs
  to look real but isn't meant to be cryptographically valid (see `makeUser`'s
  `passwordHash` comment) — copy that pattern rather than silently using a
  valid-looking fake secret.

## Companion Test

Add a `describe('make<ModelName>', ...)` block to `lib/test/factories.test.ts`
verifying:
- Calling with no arguments returns an object with every required field
  populated and correctly typed (spot-check a few fields, not every one).
- Calling with `overrides` merges correctly (an overridden field wins; other
  fields keep their defaults).
- If the factory uses `seq()`, calling it twice produces different IDs, and
  `resetFactorySequence()` resets the counter (see the existing `makeUser`
  tests for the exact assertions to mirror).

## Output Checklist
- [ ] `make<ModelName>()` added to `lib/test/factories.ts`, exported.
- [ ] Return type imported from `@prisma/client`, not hand-written.
- [ ] Test case added to `lib/test/factories.test.ts`.
- [ ] `npx tsc --noEmit`, `npm run lint`, and `npm test` all pass.
