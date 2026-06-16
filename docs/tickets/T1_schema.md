# TICKET T1 — Additive Prisma schema for the Tekion API pipeline

## Context
This is the DealerDetail Next.js app (apps/web). It currently ingests Tekion data from
Excel files emailed to a Gmail inbox, parses them, and stores normalized advisor metrics
that feed the dashboard. We are building a SECOND, parallel data path that pulls the same
advisor metrics directly from the Tekion OpenAPI — starting with ONE store (Stevens Creek
Toyota) — to compare against the existing email path.

**This ticket is SCHEMA ONLY. Do NOT touch any existing models, routes, or the dashboard.**
The change must be purely ADDITIVE so the existing email/Excel pipeline keeps working
unchanged for Stevens Creek VW (the control store).

## Scope (do exactly this, nothing more)
Edit `apps/web/prisma/schema.prisma` to add the models/fields below, then create a Prisma
migration named `add_tekion_api_pipeline` and apply it.

### 1. Extend the existing `Store` model — ADD these fields only (do not remove anything):
```
  tekionDealerId String?  // Tekion OpenAPI dealer_id, e.g. "americanmotorscorporation_876_0"
  apiSyncEnabled Boolean  @default(false)  // true = this store uses the API pipeline
```
Also add to Store's relations list (alongside existing ones):
```
  syncRuns       SyncRun[]
  rawRepairOrders RawRepairOrder[]
```

### 2. Extend the existing `Advisor` model — ADD this field only:
```
  tekionUserId String?  // Tekion user id from assignee.advisor.id, for id->name joins
```

### 3. NEW model `SyncRun` — orchestration record for an API pull:
```prisma
model SyncRun {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())

  storeId String
  store   Store  @relation(fields: [storeId], references: [id], onDelete: Cascade)

  kind        String   // FULL_BACKFILL | INCREMENTAL | MANUAL
  windowStart DateTime
  windowEnd   DateTime
  cursor      String?  // modifiedTime watermark (epoch-ms string) for next incremental

  status       String   @default("RUNNING") // RUNNING | COMPLETED | COMPLETED_WITH_WARNINGS | FAILED
  apiCallCount Int      @default(0)
  rosFetched   Int      @default(0)

  warnings Json?
  errors   Json?
  summary  Json?

  startedAt  DateTime  @default(now())
  finishedAt DateTime?

  rawRepairOrders RawRepairOrder[]

  @@index([storeId, windowStart])
  @@index([storeId, status])
}
```

### 4. NEW model `RawRepairOrder` — immutable RO snapshot (one row per RO, upserted):
```prisma
model RawRepairOrder {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  fetchedAt DateTime @default(now())

  storeId String
  store   Store  @relation(fields: [storeId], references: [id], onDelete: Cascade)

  syncRunId String?
  syncRun   SyncRun? @relation(fields: [syncRunId], references: [id], onDelete: SetNull)

  documentId     String   // Tekion internal RO id (stable natural key)
  documentNumber String   // RO number shown to users
  status         String?
  payType        String?
  advisorTekionId String?
  vin            String?

  openDate     DateTime?
  closeDate    DateTime?
  businessDate DateTime    // date dimension (midnight UTC) for daily aggregation

  payload     Json    // full RO incl. nested jobs/operations/parts snapshot
  contentHash String  // sha256 of payload for idempotent upsert / change detection

  @@unique([storeId, documentId])
  @@index([storeId, businessDate])
  @@index([syncRunId])
}
```

### 5. NEW model `OpcodeCategory` — maps opcodes to KPI buckets (menu/ALA/rec/commodity):
```prisma
model OpcodeCategory {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // storeId NULL = global default; non-null = store-specific override
  storeId String?
  store   Store?  @relation(fields: [storeId], references: [id], onDelete: Cascade)

  opcode   String
  category String  // MENU | ALA | REC | COMMODITY
  commodityKey String?  // when category=COMMODITY, e.g. "tires", "alignment"

  @@unique([storeId, opcode])
  @@index([category])
}
```
Add to Store relations: `opcodeCategories OpcodeCategory[]`

## Constraints
- Do NOT modify, rename, or delete: EmailSource, IngestionRun, IngestedFile, RawReportRow,
  AdvisorDailyMetrics, AdvisorDailyCommodity, or any auth/identity models.
- Keep all existing `@@unique`, `@@index`, and relations intact.
- Use the existing datasource/generator blocks as-is.

## How to run the migration
The DB is Supabase Postgres. Env is in `apps/web/.env` (DATABASE_URL is the pooler;
DIRECT_URL is the direct connection used for migrations). From `apps/web`:
```
set -a && . ./.env && set +a
npx prisma migrate dev --name add_tekion_api_pipeline --skip-generate
npx prisma generate
```
If `migrate dev` refuses on the pooled URL, ensure DIRECT_URL is set (it is) — Prisma uses it.

## Acceptance criteria
1. `npx prisma validate` passes.
2. Migration file created under `prisma/migrations/*_add_tekion_api_pipeline/`.
3. `npx prisma migrate status` shows the new migration applied, DB up to date.
4. The 6 existing tables still exist and are unchanged.
5. New tables exist: SyncRun, RawRepairOrder, OpcodeCategory; Store has tekionDealerId,
   apiSyncEnabled; Advisor has tekionUserId.
6. Report exactly which files changed and the migration name.
