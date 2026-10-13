# Chef Donn's — Web (Module 1)

Receipts, opening budget and roadmap for a **first-time restaurant owner**. Pilot: Donnrick,
opening in **Port Barton, San Vicente, Palawan**.

- **Receipts → categorised payments.** Photograph a receipt (OR, SI, handwritten resibo,
  GCash/Maya screenshot). Claude reads it and suggests the budget line; a person confirms every
  required field before it becomes a payment. Vendor choices are learned.
- **Opening budget, three states of money.** Planned → committed → paid, by category.
  Overspend is drawn from contingency, visibly. Cash on hand, runway to opening, what's due in
  the next 14 days.
- **Roadmap.** Plan → Build → Get ready, with the San Vicente / Port Barton permit chain.
  Task estimates drive budget lines. Every local rule and cost is marked *Unverified* until
  someone files it.
- **Price-search hook.** Look up current PH prices (with sources) from the app or via
  `POST /api/prices/search` with an API key — see [docs/api.md](docs/api.md).
- **Phone-first PWA.** Works with patchy signal: receipts and changes queue on the phone and
  send themselves later; the last Overview figures are readable offline.

The Android ticketing apps live in the sibling `chef-donn` repo; this is a separate product
line ("Web M1") and shares only the design system and money conventions.

## Run it locally

Requirements: Node 22, pnpm 10, Postgres 16 binaries (`/usr/lib/postgresql/16/bin`) or Docker.

```bash
pnpm install
pnpm pg:start                 # Postgres on 127.0.0.1:54329 (dev db `chefdonn`)
cp .env.example .env.local    # set BOOTSTRAP_OWNER_EMAIL to your email
pnpm db:migrate               # schema + roadmap templates
pnpm dev                      # http://localhost:3000
```

Sign in with `BOOTSTRAP_OWNER_EMAIL`. Without `RESEND_API_KEY`, the sign-in link is printed
in the terminal and listed at <http://localhost:3000/api/dev/mailbox>. The first owner creates
the workspace; everyone else is invited from **More → People**.

Without `ANTHROPIC_API_KEY`, receipt reading and price search are off and say so. For a demo
with clearly-labelled test data: `AI_EXTRACTOR=fake PRICE_PROVIDER=fake`.

## Check it

```bash
pnpm lint && pnpm typecheck
pnpm test        # domain rules (Vitest)
pnpm test:db     # services against real Postgres, one database per test file
pnpm e2e         # Playwright on a Pixel 7 viewport, production build, fake AI
pnpm check       # all of the above
```

## Deploy (Railway)

One web service + Postgres + a bucket. Pre-deploy command: `pnpm db:migrate`. Set the variables
in `.env.example` (`STORAGE_DRIVER=s3` with the bucket's credentials, `RESEND_API_KEY`,
`ANTHROPIC_API_KEY`, `BETTER_AUTH_SECRET`, `APP_URL`).

## Layout

| Path | What |
|---|---|
| `src/domain` | Pure rules — money, budget/contingency, cash/runway, roadmap, categorisation, duplicates, VAT, prices, permissions. No IO, no clock. |
| `src/db` | Drizzle schema, migrations, seeds (categories, roadmap templates) |
| `src/server` | Auth, `runAction` (role check → validation → transaction → audit), services, background jobs, storage, webhooks |
| `src/lib/ai` | Receipt extractor and price-search providers (Claude / fake / null) |
| `src/lib/offline` | IndexedDB outbox, Overview snapshot, image compression |
| `src/app` | Screens and API routes |
| `src/ui` | Design-system components (ported from the Android `core/designsystem`) |
