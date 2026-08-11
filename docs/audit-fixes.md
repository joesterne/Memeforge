# Audit issue implementation map

| Issue | Draft implementation |
|---|---|
| #8 | One Tenor v2 client, safe filtering, server secret, bounded provider policy, regression tests, vulnerable scraper removal. |
| #9 | Shared typed document DTOs, rules-aligned writes, changed-background precedence, dirty state, Storage URLs, regression tests. |
| #10 | TTL/LRU caches, no public bypass, strict origins, bounded rooms/payloads/users, sanitized presence, empty-room release. |
| #11 | Authenticated recurring checkout, reusable customers, verified/idempotent webhooks, authoritative entitlements, billing portal/UI. |
| #12 | Firebase token and Pro gates, shared per-user quotas/concurrency/idempotency, bounded prompts/work queues, stable errors, paid test-route removal. |
| #13 | Clean-install GitHub Actions workflow plus deterministic provider, cache, DTO, origin, native, telemetry, and regression tests. |
| #14 | Correlated structured API/provider/client telemetry, redaction, slow thresholds, AI usage fields, and operations runbook. |
| #15 | Upstream deadlines, cancellation, bounded responses/queues, safe read retries, circuit breakers, disconnect signals, typed client wrapper. |
| #16 | Bounded ordered queries, shared first-page history cache, cursor profile pagination, private per-user votes and server aggregates. |
| #17 | User-scoped object storage/rules, Storage references in documents, server-side AI storage, delete cleanup, resumable idempotent migration. |
| #18 | Transferable Web Worker GIF export, input/frame/pixel limits, progress/cancel/cleanup, and capped URL-only undo snapshots. |
| #19 | Visible autosave/retry state, one-tap native-share/download, secondary advanced/publish actions, shared rendering, corrected shortcuts/preferences. |
| #20 | Debounced/cancelled progressive still search, one GIF provider path, shared API client, automatic results, and always-reachable opt-in AI. |
| #21 | Removed unused/debug dependencies, strict unused checks, route/vendor splitting, lazy feature libraries, runtime PWA code caching, CI budgets. |
| #22 | Versioned Capacitor iOS project, HashRouter, deployed API/WebSocket routing, native CORS, clean sync CI gate, release checklist. |
| #23 | Removed fabricated views/shares and unused billing placeholders; only source-backed count/entitlement states remain. |
| #24 | Typed revisioned events, visible presence/status, coalesced acknowledged updates, reconnect rejoin/resync, Firestore snapshots, Redis/single topology. |

External enablement remains intentionally outside the code diff: provider secrets/prices, Firebase/Stripe deployment, Redis provisioning when horizontally scaled, Cloud Logging alerts, GitHub branch protection, and signed Xcode release validation.
