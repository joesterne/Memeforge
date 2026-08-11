# Security spec

## Data invariants

- Memes are owner-readable and owner-writable. Canvas objects and user-controlled strings are bounded.
- Favorites belong to the authenticated user who creates or deletes them.
- Templates and submissions have explicit typed schemas, bounded fields, and immutable owner IDs.
- Public vote aggregates are server-managed counters. A user's private vote record is readable only by that user and writable only through the validated API.
- Entitlements, collaboration snapshots, billing events, and AI usage records are server-managed.
- Media writes are restricted to user-scoped Storage paths, approved MIME types, and a 10 MB maximum.

## Adversarial coverage

The emulator suite in `tests/rules/security-rules.test.ts` covers unauthorized reads and writes, ownership changes, extra fields, malformed document DTOs, vote tampering, public/private media access, and cross-user Storage paths.

Run it with `npm run test:rules` or as part of `npm run check`.
