### API reference (Next.js route handlers)

All endpoints live under `apps/web/app/api/**/route.ts`.

### Conventions

- Responses are JSON.
- Most routes run with `export const runtime = "nodejs"` so we can use Node APIs and `xlsx`.

### Stores

#### `GET /api/stores`

- **Returns**: list of stores

#### `POST /api/stores`

- **Body**:
  - `name` (string)
  - `timezone` (optional string)
- **Returns**: created store

### Ingestion

#### `POST /api/ingest`

- **Content-Type**: `multipart/form-data`
- **Form fields**:
  - `storeId` (uuid string)
  - `businessDate` (`YYYY-MM-DD`)
  - `files` (one or more `.xlsx`)
- **Behavior**:
  - Creates a new `IngestionRun` batch with `batchNo`
  - Skips duplicates already ingested for the same store+date
  - Stores raw rows + normalized metrics (additive)
- **Returns**: run summary JSON including:
  - `runId`, `batchNo`, `storeId`, `businessDate`
  - `filesIngested[]`
  - `warnings[]`, `errors[]`

### Runs

#### `GET /api/runs?storeId=<uuid>`

- **Returns**: list of runs for a store (latest first), includes `files`

#### `GET /api/runs/[runId]`

- **Returns**: run detail (includes `store`, `files`)

### Raw file preview

#### `GET /api/files/[fileId]/preview?limit=N`

- **Returns**: first N raw JSON rows from `RawReportRow` for that file
- **Use**: debugging detection/parsing on real files

### Dashboard data

#### `GET /api/dashboard?runId=<uuid>`

- **Returns**: dashboard data for the run’s store/date (combined day totals)

#### `GET /api/dashboard?storeId=<uuid>&businessDate=YYYY-MM-DD`

- **Returns**: dashboard data for the latest run on that store/date (combined day totals)

Response shape includes:

- `store`
- `businessDate`
- `run` (run metadata + file list)
- `commodityKeys[]`
- `advisors[]` with:
  - `metrics` (normalized KPIs)
  - `commodities` map keyed by `commodityKey`


