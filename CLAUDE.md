# Chef Donn's Web — agent notes

Web M1: receipts → categorised payments, three-state opening budget, roadmap, price-search
hook. Phone-first PWA for a first-time owner in **Port Barton, San Vicente, Palawan** (the Drive
specs say El Nido — the pilot moved; don't reintroduce El Nido facts).

## Toolchain

- Node 22, pnpm 10. Next **16.4** — read `node_modules/next/dist/docs/` before using an API;
  it differs from older Next. `cacheComponents` is **off** (every screen is per-user).
- Postgres 16: `pnpm pg:start` (127.0.0.1:54329; runs as the `postgres` user when root;
  restart it after a container restart). Migrations: `pnpm db:generate` then `pnpm db:migrate`.
- Playwright is pinned to **1.56.1** to match the preinstalled Chromium. Never run
  `playwright install`.
- `pnpm check` = lint + typecheck + unit + DB integration + e2e. Run it before pushing.

## Invariants

- **Money is integer centavos** (`bigint`, `Cents`), percentages in basis points. No floats —
  AI amounts arrive as decimal strings and go through `parsePeso`; what people type ("2.5m",
  "3 000 000") goes through `parsePesoInput` (form helpers in `src/server/actions/form.ts`).
- Forms use `ActionForm` (manual dispatch, so a refusal keeps what was typed); field errors
  are re-keyed to input names by `toFormState` (`totalBudgetCents` → `totalBudget`).
- **Paid is never stored**: it's `SUM(payment)` (non-voided). Effective committed =
  `max(committed, paid)`. Overspend is always shown as drawn from contingency.
- **`src/domain` is pure** — no IO, framework or clock (ESLint enforces). Pass `today`
  (Manila, `manilaToday(now)`) in.
- **Every write goes through `runAction`** (role check → zod → one transaction → audit row).
  Rejections carry a human reason (and HTTP status for the API) — never fail silently.
- **AI never writes a payment or an estimate.** Receipt fields stay unconfirmed until a person
  confirms payee, date, total, method and line. Price-search results are applied only by a
  person; API keys can trigger and read searches, never apply them.
- **Locked lines follow their source** (roadmap task, contingency rule). Edit the task.
- **Local rules are data** with verified-by/date/source; seeds ship `unverified` with
  placeholder costs labelled as such. The AI never generates requirements.
- **Client ids are never regenerated on retry** (outbox, `clientId` on API calls).
  `client_mutation` dedupes — same contract as the Android hub's commandId.
- Price observations must cite a URL that came back from that search; others are dropped.
  Summaries are computed by `summarisePrices`, never by the model.
- Callbacks: https + public addresses only (SSRF guard), HMAC-signed with the workspace secret.

## Design system

Day scheme ported from the Android `core/designsystem` (`src/app/globals.css`, `src/ui`).
Status = glyph + colour + label, never colour alone; tap targets ≥ 56px; thick borders over
shadows; no emoji; Archivo display, Barlow body, Barlow Condensed labels, IBM Plex Mono for
every number. Fonts are local files in `src/fonts`.

## AI

`claude-opus-5-5` by default (`RECEIPT_MODEL`, `PRICE_MODEL`), effort medium, server-side refusal
fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). Check
`stop_reason` (`refusal`, `max_tokens`, `pause_turn`). Tests use `AI_EXTRACTOR=fake` /
`PRICE_PROVIDER=fake`; without `ANTHROPIC_API_KEY` both are off and say so.

## Out of scope

No POS, sales invoices/ORs, BIR filing or payments to anyone — this app records the owner's
own spending. Deploying to Railway needs the user's go-ahead.
