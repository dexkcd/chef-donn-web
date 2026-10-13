# Price-search hook — API

Trigger a price search from a script, an agent or a scheduled job; read the results; or get
them pushed to you. Searches look up current **Philippine** prices (PHP) with Claude web
search and keep only prices whose source page actually came back from the search.

**The API never changes the budget.** It can start searches and read results. Using a price
as an estimate is always a person's action in the app ("Use ₱X as the estimate").

## Authentication

Create a key in the app: **More → API keys & price hook** (Owner or Partner). It is shown
once. Send it as a bearer token:

```
Authorization: Bearer cdk_…
```

| Scope | Allows |
|---|---|
| `prices:search` | `POST /api/prices/search` (and reading results) |
| `prices:read` | `GET` endpoints only |

A signed-in Owner/Partner session (browser cookie) works too. Revoked keys get `403`.

## POST /api/prices/search

Queue a search. Returns immediately; the search runs in the background (usually 1–2 minutes).

```bash
curl -X POST https://<your-app>/api/prices/search \
  -H "Authorization: Bearer cdk_…" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "2-door commercial chiller",
    "subject": { "type": "task", "id": "<roadmap task id>" },
    "context": { "quantity": 1, "spec": "upright, 1,000 L" },
    "callbackUrl": "https://example.com/hooks/prices",
    "clientId": "6f1c1f4e-0c1e-4c8b-9a5e-3a2b1c0d9e8f"
  }'
```

| Field | Required | Notes |
|---|---|---|
| `query` | yes | 3–200 characters. What to price. |
| `subject` | no | `{type: "task" \| "money_line", id}` — attaches the results to a roadmap task or budget line so they show up there. |
| `context.quantity` | no | Prices are per unit; the suggested estimate is typical × quantity. |
| `context.unit`, `context.spec` | no | Extra detail for the search. |
| `context.location` | no | Defaults to the restaurant's location (e.g. "Port Barton, San Vicente, Palawan"). |
| `callbackUrl` | no | **https** only, public host. Receives the result when done or failed. |
| `clientId` | no | UUID. Repeating a request with the same `clientId` returns the same search (safe retries). |

Responses:

| Status | Body |
|---|---|
| `202` | `{ "id", "status": "queued", "pollUrl": "/api/prices/search/<id>" }` |
| `200` | Same, when `clientId` matched an existing search |
| `401` / `403` | `{ "error": { "reason" } }` — missing/unknown key, revoked key, or missing scope |
| `422` | `{ "error": { "reason", "fieldErrors" } }` — invalid input or unsafe `callbackUrl` |
| `429` | Daily limit reached (`PRICE_SEARCH_DAILY_LIMIT`, default 50 per workspace per 24h) |

## GET /api/prices/search/:id

```json
{
  "id": "…",
  "status": "done",                       // queued | running | done | failed
  "query": "2-door commercial chiller",
  "context": { "quantity": 1, "location": "Port Barton, San Vicente, Palawan" },
  "subject": { "type": "task", "id": "…" },
  "error": null,                          // reason, when failed or when nothing was found
  "summary": {
    "currency": "PHP",
    "lowCents": 4299900, "typicalCents": 4599900, "highCents": 5150000,
    "quantity": 1,
    "suggestedEstimateCents": 4600000,    // typical × quantity, rounded to ₱100
    "basis": "all",                       // "delivered" when ≥2 prices already include delivery to Palawan
    "observationsFound": 6, "observationsUsed": 5, "outliersDropped": 1
  },
  "observations": [
    {
      "item": "…", "vendor": "…", "unitPriceCents": 4599900, "unit": "piece",
      "priceKind": "listed",              // listed | quoted | delivered
      "sellerLocation": "Manila",
      "includesDeliveryToPalawan": "no",  // yes | no | unknown
      "sourceUrl": "https://…", "sourceTitle": "…", "seenOn": "2026-10-13",
      "confidence": "medium"
    }
  ],
  "verified": false,
  "provider": "claude_web_search",
  "createdAt": "…", "completedAt": "…"
}
```

Amounts are integer **centavos** (₱1.00 = 100). The summary is computed by the app from the
observations (median; prices more than 3× or under ⅓ of the median are left out) — never
taken from the model.

## GET /api/prices/searches

`?subjectType=task&subjectId=<id>&limit=20` — recent searches (summaries, no observations).

## Callbacks

When a search finishes (or fails for good), the app POSTs the same JSON as
`GET /api/prices/search/:id` to your `callbackUrl`:

```
Content-Type: application/json
X-ChefDonn-Event: price_search.done        (or price_search.failed)
X-ChefDonn-Signature: sha256=<hex HMAC-SHA256 of the raw body with your signing secret>
```

Verify the signature before trusting the body. The signing secret is in **More → API keys &
price hook** (rotate it there). Example (Node):

```js
import { createHmac, timingSafeEqual } from "node:crypto";
const expected = "sha256=" + createHmac("sha256", process.env.CHEFDONN_WEBHOOK_SECRET).update(rawBody).digest("hex");
const ok = expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
```

Delivery is retried 3 times (1s, 4s backoff). Targets must be https and resolve to public
addresses; redirects are not followed.

## Notes

- Results are labelled **Unverified**. Online prices for Port Barton are mostly Manila or
  online listings — check `includesDeliveryToPalawan` and add freight/boat costs.
- Each search makes at most 5 web searches. Without `ANTHROPIC_API_KEY` on the server,
  searches fail with "Price search is off".
