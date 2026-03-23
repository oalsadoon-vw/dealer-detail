### Database schema (Postgres + Prisma)

The Prisma schema is defined at `apps/web/prisma/schema.prisma`.

### Entities and relationships

### `Store`

- **Purpose**: A dealership/location.
- **Key fields**:
  - `id` (uuid)
  - `name`
  - `timezone` (optional; future-proofing)
- **Relations**:
  - `advisors`, `ingestionRuns`, `ingestedFiles`, `rawReportRows`
  - `dailyMetrics`, `dailyCommodity`

### `Advisor`

- **Purpose**: Normalized advisor identity per store.
- **Key fields**:
  - `storeId`
  - `nameNormalized` (UPPERCASE)
  - `nameRaw` (optional)
- **Uniqueness**: `(storeId, nameNormalized)`

### `IngestionRun` (batch)

- **Purpose**: One upload batch. Stores run status + summary metadata + links to files/rows.
- **Key fields**:
  - `storeId`
  - `businessDate` (stored as timestamp but conceptually a date)
  - `batchNo` (per-store serial integer; monotonic increasing)
  - `status` (`PROCESSING`, `COMPLETED`, `COMPLETED_WITH_WARNINGS`, `FAILED`)
  - `warnings`, `errors`, `summary` (JSON)
- **Uniqueness**: `(storeId, batchNo)`
- **Note**: multiple runs can share the same store + businessDate.

### `IngestedFile`

- **Purpose**: One uploaded file in a run.
- **Key fields**:
  - `runId`, `storeId`, `businessDate`
  - `originalFilename`
  - `sha256` (file-level de-duplication)
  - `detectedType`, `detectionConfidence`
  - `rawMeta` (sheet/header/debug)
  - `parseWarnings`, `parseErrors`
- **Uniqueness**: `(runId, sha256)` (prevents duplicates within a run)
- **Additional behavior**: ingestion also checks for duplicates across `(storeId, businessDate, sha256)` to prevent double-counting across batches for the same day.

### `RawReportRow`

- **Purpose**: Raw row staging for future analytics.
- **Key fields**:
  - `storeId`, `runId`, `ingestedFileId`, `businessDate`
  - `rowIndex` (0-based)
  - `rowHash` (sha256 of stable JSON)
  - `data` (JSON row)
- **Uniqueness**: `(ingestedFileId, rowIndex)`

### `AdvisorDailyMetrics` (normalized KPIs)

- **Purpose**: Advisor/day rollup metrics used by the dashboard.
- **Key fields**:
  - `openRos`
  - `menuCount`, `menuLaborGross`, `menuPartsGross`
  - `alaCount`, `alaLaborGross`, `alaPartsGross`
  - `recCount`, `recSoldCount`, `recAmount`, `recSoldAmount`
  - `dailyLaborGross`, `dailyPartsGross`
- **Uniqueness**: `(storeId, advisorId, businessDate)`
- **Combine behavior**: ingestion uses `increment`, so multiple batches/files for the same day accumulate.

### `AdvisorDailyCommodity` (commodity buckets)

- **Purpose**: Advisor/day commodity metrics by commodity key.
- **Key fields**:
  - `commodityKey` (e.g., `air_filters`, `wipers`, `tires`, `alignments`)
  - `qty`, `gross`
- **Uniqueness**: `(storeId, advisorId, businessDate, commodityKey)`
- **Combine behavior**: ingestion uses `increment`.

### Migrations

Located in `apps/web/prisma/migrations/`:

- `20251223175020_initial_schema`: initial tables + indexes
- `20251223193000_add_batch_no_multi_runs`: adds `batchNo`, backfills serials per store, drops old day-level uniqueness, adds `(storeId,batchNo)` unique index


