# SubPaper (MVP)

AI checks subcontractor certificates of insurance against a general contractor's requirements.
Multi-tenant: each company signs up, gets its own requirements, and only ever sees its own documents.

## Run

```
cp .env.example .env.local        # set ANTHROPIC_API_KEY and DATABASE_URL
node --env-file=.env.local scripts/migrate.mjs
npm run dev                       # http://localhost:3000
```

## Test

```
npm test                                           # unit tests (rules, password hashing)
DATABASE_URL=postgres://... npm test               # also runs auth + tenant-isolation tests (needs migrated DB)
```

## How it fits together

- `db/migrations/*.sql` — schema, applied in order by `scripts/migrate.mjs` (tracked in `schema_migrations`).
- `src/lib/auth.ts` — scrypt password hashing, signup/login, sessions. Only a SHA-256 of the session token is stored.
- `src/lib/db.ts` — `withOrg(orgId, fn)` runs a transaction with `app.org_id` set; Postgres row-level security
  (forced, so it applies to the table owner too) restricts `documents` and `requirements` to that org.
  Always use `withOrg` for those tables.
- `src/middleware.ts` — redirects to `/login` when there is no session cookie; real checks are `requireUser()` in API routes.
- Upload flow: `src/app/api/documents/route.ts` → `extract.ts` (Claude) → `rules.ts` (pure checks) → stored in Postgres.

## Email-in

Each company has an unguessable address `<token>@INBOUND_DOMAIN`, shown on the dashboard. Forwarded PDF/PNG/JPEG
attachments are checked exactly like uploads and appear tagged "via email".

Setup (Postmark): add an inbound domain (MX to Postmark), then set the inbound webhook URL to
`https://user:<INBOUND_WEBHOOK_SECRET>@your-host/api/inbound/postmark` (Basic auth; any username).
The endpoint acknowledges immediately and processes after responding; retries are safe because each email is
recorded once per company by `MessageID` (`inbound_messages`). Limits: 10 attachments per email, 10MB each;
other file types (logos, signatures) are skipped. Mail to an unknown address is dropped.

## Not done yet

Reply emails to the sender with results, a per-company daily cap on extractions, login rate limiting, email verification and password reset, multiple users per company, email-in ingestion,
expiry reminders, W-9 and lien-waiver rules, Stripe, file storage (originals are not kept; only extracted data).
