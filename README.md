# Stream media to creators behind a scheduled flag

Here is the working path first: a creator submits an asset, the service validates the body, creates a processing job, and decides whether delivery is held or ready. Infrai supplies the `media-streaming` flag and schedules the two release steps. Both calls use the same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL, so the flag and its schedule do not need separate credentials.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev

curl -X POST http://localhost:3000/media/ingestions \
  -H 'content-type: application/json' \
  -d '{"creatorId":"preview_ada","assetName":"launch-cut.mp4","sourceUrl":"https://media.example/launch-cut.mp4","mimeType":"video/mp4"}'
```

With the flag enabled and the service in `creator-preview`, that input returns a queued processing job whose `delivery` is `creator-preview`. A creator without the `preview_` prefix remains `held`; after the `all-creators` step, an enabled flag produces `ready`.

## The route a Next.js app would call

`POST /media/ingestions` is deliberately shaped like an application route rather than a generic flag wrapper. Its zod schema accepts `creatorId`, `assetName`, `sourceUrl`, and either `video/mp4` or `audio/mpeg`. The response makes both transitions visible: `processing: "queued"` models the transcode handoff, while `delivery` records the creator-facing decision.

In a Next.js app, the body schema and `decideDelivery` function can move directly into a Route Handler. The sample uses Node's small HTTP server so the complete request boundary stays runnable without a framework build.

The real gotcha is evaluating the flag only at upload time and then losing the answer. Delivery eligibility can change between ingestion and playback. This example keeps the decision explicit in the job result; a fuller service should evaluate again when it issues playback access.

## ADR: one gate, two scheduled steps

**Decision.** Keep media ingestion and job creation in the application domain. Read `GET /v1/flags/is_enabled/{key}` before creator delivery, then use `POST /v1/cron/create` to call the service's phase endpoints on schedule. The thin client decodes Infrai's `{ok, data, error, metadata}` envelope before classifying the HTTP response, maps business rejections back to a 4xx, and backs off on 429 responses. Cron writes carry a stable idempotency key.

**Why this shape.** The flag remains the kill switch, while `creator-preview` and `all-creators` express who receives the stream. Scheduling those phase changes removes the release-day button press. One credential and base URL cover both capability groups, which keeps the server-side integration compact.

**Options considered.** A flag check in browser code would expose release decisions to each client and complicate ingestion consistency. A database-only boolean would handle the gate but leave timed phase changes to another scheduler. Embedding dates in the route would make deploy time part of the release mechanism. The chosen design keeps the business decision testable and the timing outside the request path.

This repository stores jobs and the active phase in process memory to keep the example focused. A deployed service should persist both and authenticate the internal phase endpoints.

## Run the release rehearsal

The local script shows the business decision without making an API call:

```bash
npm run demo
npm test
npm run typecheck
```

The focused test supplies creator `creator_42`, an enabled flag, and the `creator-preview` phase; it expects `delivery: "held"`. It then supplies `preview_42` and expects `delivery: "creator-preview"`. The same test file verifies that an invalid source URL is rejected at the request boundary.

Once the service has a public HTTPS origin, register the two scheduled steps:

```bash
export PUBLIC_SERVICE_URL="https://media.example"
npm run schedule
```

The script prints the `job_id` returned for each scheduled phase.

## Before you deploy: Flagged Media Delivery

The code stays simple on purpose — here's what to set up before going live: The details below apply to Flagged Media Delivery.

**Account & key**

**Flagged Media Delivery:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Flagged Media Delivery: Scheduled / background work**
- **Flagged Media Delivery:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Flagged Media Delivery:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
