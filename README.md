# Memeforge

Memeforge is a React/Vite meme editor with server-side template/GIF search, Firebase persistence and media storage, Stripe subscriptions, paid Gemini generation, and WebSocket collaboration. The same web bundle can be packaged for iOS with Capacitor.

## Local development

Requirements: Node.js 22.14 or newer, npm, and a Firebase project.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Fill in the public `VITE_FIREBASE_*` values and the server-only Firebase, Tenor, Gemini, and Stripe values needed by the features you are testing. Never expose `GEMINI_API_KEY`, `TENOR_API_KEY`, `STRIPE_SECRET_KEY`, or `STRIPE_WEBHOOK_SECRET` through a `VITE_` variable.

## Validation

```sh
npm run check
npm audit --omit=dev --audit-level=high
npm run ios:sync
```

`npm run check` runs deterministic unit/regression tests, strict TypeScript checks, Firebase rules lint, production builds, and bundle-size budgets. CI runs the same checks from a clean lockfile and also verifies Capacitor sync.

## Firebase deployment

The repository includes Firestore rules, Storage rules, and composite indexes:

```sh
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
```

Application Default Credentials must be available to the server. Set `FIREBASE_PROJECT_ID`, optional `FIREBASE_DATABASE_ID`, and `FIREBASE_STORAGE_BUCKET`. New media is uploaded to user-scoped Storage paths; Firestore stores URLs and paths rather than image data.

For existing documents containing data URLs, first run a dry run and inspect the counts, then apply the idempotent migration:

```sh
npm run migrate:data-urls
npm run migrate:data-urls -- --apply
```

## Stripe subscriptions

Create a recurring Stripe Price and set `STRIPE_PRO_PRICE_ID`. Configure the webhook endpoint at `/api/stripe/webhook` for checkout session, customer subscription, and invoice payment events, then set `STRIPE_WEBHOOK_SECRET`. Pro state is derived from verified webhooks and stored in server-controlled entitlement documents; redirect query parameters are informational only.

## Collaboration topology

For one application instance, set `COLLABORATION_MODE=single` and `INSTANCE_COUNT=1`. For multiple instances, set `COLLABORATION_MODE=redis` and `REDIS_URL`; Redis pub/sub, expiring presence records, and the revision store then share room events/state. The server refuses a declared multi-instance deployment in single mode. Acknowledged room snapshots are periodically persisted to Firestore for restart recovery.

## Operations and native app

- [Observability runbook](docs/observability.md)
- [Deployment checklist](docs/deployment.md)
- [Audit issue implementation map](docs/audit-fixes.md)
- [iOS setup](IOS.md)
