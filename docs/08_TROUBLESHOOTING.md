### Troubleshooting

### Prisma migrate fails: `Environment variable not found: DATABASE_URL`

Prisma reads `.env` by default (not `.env.local`).

- Ensure `apps/web/.env` exists and contains:
  - `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dealerdetail?schema=public"`

### Upload returns an error / UI shows JSON parse errors

- The ingestion route is wrapped to always return JSON on errors, and the Upload UI reads `res.text()` then parses JSON.
- If you still see issues, check terminal logs from `next dev` for Prisma/parse exceptions.

### Duplicate file uploads

Ingestion skips duplicates for the same store/date by checking `(storeId, businessDate, sha256)`.

- If you upload the same file again, it will be marked as `skipped` in the run summary.

### Parsing problems (unknown type / wrong type)

Use the run detail page:

- Navigate to `/runs/[runId]`
- Inspect:
  - chosen sheet name
  - header row offset
  - headers
  - detector notes
- Use raw preview:
  - `/api/files/[fileId]/preview?limit=15`

Then update:

- Detector rules: `apps/web/lib/parsing/detectors.ts`
- Parser logic: `apps/web/lib/parsing/parsers/*`

### Daily performance report missing

Daily parsing supports both formats:

- Old: `Name`, `Pay Type` (must be `ALL`), `Labor Gross`, `Parts Gross`
- New: `Service Advisor`, `Labor Gross`, `Parts Gross`

If a Tekion variant changes header labels, extend fuzzy column matching in:

- `apps/web/lib/parsing/parsers/dailyData.ts`


