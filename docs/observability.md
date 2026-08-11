# Observability runbook

The server writes one-line structured JSON suitable for Cloud Run/Cloud Logging. Logs contain request IDs, route/method/status, duration, response bytes, a hashed actor identifier, rate-limit outcome, upstream operation metadata, AI model/token usage, collaboration counts/rejections, and sampled client-job timings. Raw prompts, bodies, tokens, emails, API keys, and data URLs are redacted.

Initial slow thresholds are 3 seconds for search/provider reads, 5 seconds for Stripe operations, 20 seconds for AI, 2 seconds for Firestore client pages, and 10 seconds for GIF export. Threshold crossings emit `slow_operation`; sampled browser work emits `client_operation`.

## Correlate a user-facing failure

Copy the `requestId` from the API error envelope and query:

```text
resource.type="cloud_run_revision"
jsonPayload.requestId="REQUEST_ID"
```

## Last 24 hours of slow/error-prone operations

Export the bounded window for analysis:

```sh
gcloud logging read 'resource.type="cloud_run_revision" AND (jsonPayload.event="operation_complete" OR jsonPayload.event="client_operation" OR jsonPayload.event="request_error")' --freshness=24h --format=json --limit=10000
```

In Log Analytics, group `operation_complete` and `client_operation` rows by `operation` and compute count, error count/rate, and p50/p95/p99 of `durationMs`; order once by p95 duration and once by error rate, each limited to five. Keep the 24-hour timestamp predicate so the query cost stays bounded.

For AI cost review, filter `operation` to `ai_chat_to_meme` and `ai_generate_image`, group by day/model, and sum `promptTokens`, `outputTokens`, and `totalTokens`. Apply the current provider price sheet outside the application; do not hard-code a price that can go stale.

## Alerts

Create log-based alerts for repeated `request_error`, `UPSTREAM_CIRCUIT_OPEN`, `UPSTREAM_QUEUE_FULL`, `media_cleanup_incomplete`, `collaboration_persist_failed`, Stripe webhook `status=failed`, and sustained AI quota rejections. Do not alert on a single retryable provider failure.
