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

Project **chef-donn-web**: a `web` service (this repo, branch-deployed), `Postgres`, and a
private `receipts` bucket. Pre-deploy command: `pnpm db:migrate` (migrations + roadmap
templates). Health check: `/login`.

`web` variables (see `.env.example`):

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `APP_URL`, `BETTER_AUTH_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` |
| `BETTER_AUTH_SECRET` | 32+ random characters |
| `BOOTSTRAP_OWNER_EMAIL` | The first owner's email |
| `STORAGE_DRIVER` + `S3_*` | `s3` + references to the bucket (`${{receipts.ENDPOINT}}`, …) |
| `ANTHROPIC_API_KEY` | **Add your key here** to turn on receipt reading and price search |
| `ANTHROPIC_WORKSPACE_ID` | Only for a key not created inside a workspace: its `wrkspc_…` id (otherwise every AI call fails with 400) |
| `RESEND_API_KEY`, `MAIL_FROM` | Sign-in emails (needs a verified sending domain) |
| `SIGNIN_LINKS_TO_LOGS` | `1` until Resend is set up: sign-in links appear in the `web` deploy logs as `[sign-in] link for …` |

Never set `ENABLE_DEV_MAILBOX`, `AI_EXTRACTOR`, `PRICE_PROVIDER` or `ALLOW_INSECURE_CALLBACKS`
on a public deployment. Railway stages variable changes — press **Deploy** after editing.

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
