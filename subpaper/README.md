# SubPaper (MVP scaffold)

AI checks subcontractor certificates of insurance against a general contractor's requirements.

```
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
npm test                     # rules engine tests
```

Flow: upload PDF/image → `src/lib/extract.ts` (Claude) → `src/lib/rules.ts` (pure checks) → dashboard.

Next steps: Postgres + auth (`db/schema.sql`), email-in ingestion, expiry reminders, W-9 / lien-waiver rules, Stripe.
