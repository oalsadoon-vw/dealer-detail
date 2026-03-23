### Ingestion and parsing pipeline

### High-level flow

1. User selects **Store** + **Business Date** + uploads multiple `.xlsx` files on `/upload`
2. `POST /api/ingest`:
   - creates a new `IngestionRun` (batch) with a per-store serial `batchNo`
   - for each file:
     - computes **sha256**
     - skips duplicates already ingested for the same store+date (prevents double-counting)
     - parses and classifies the Excel export
     - stores `IngestedFile` metadata
     - stores all rows as `RawReportRow` (JSON)
   - applies parsed results to an in-memory accumulator
   - upserts and **increments** normalized day tables:
     - `AdvisorDailyMetrics`
     - `AdvisorDailyCommodity`
   - writes run `status`, `warnings`, `errors`, `summary`

### Where the code lives

- **Ingestion route**: `apps/web/app/api/ingest/route.ts`
- **Excel reader**: `apps/web/lib/parsing/xlsxReader.ts`
- **Detector**: `apps/web/lib/parsing/detectors.ts`
- **Parsers**: `apps/web/lib/parsing/parsers/*.ts`
- **Pipeline**: `apps/web/lib/parsing/parsingPipeline.ts`
- **Accumulator**: `apps/web/lib/parsing/accumulator.ts`
- **Hashing**: `apps/web/lib/hash.ts`

### Parsing strategy (robustness)

Tekion exports vary in:

- sheet names
- header row offsets
- exact column names

To handle this, `parseExcelFile()`:

- scans **all sheets** in the workbook
- tries multiple header offsets (`rangeStartRow` in `[0,1,2,3]`)
- runs `detectReportType()` on each candidate table
- selects the candidate with highest confidence (preferring non-unknown)

### Detection strategy

`detectReportType()` combines:

- **Filename hints** (strong signals: “menu”, “advisor performance”, “recommendation”, “open ro count”, “tire sales”, “alignment”)
- **Sheet name hints** (backup signals)
- **Header heuristics** (when filename is ambiguous or inconsistent)

Important special cases:

- **Alignment**: title override (`alignment/alignments` in title ⇒ `alignment` report type). In normalized storage, alignment is treated as commodity key `alignments`.
- **Daily performance**: old vs new is selected by headers:
  - old: `Name` + `Pay Type` + `Labor Gross` + `Parts Gross` with `Pay Type == ALL`
  - new: `Service Advisor` + `Labor Gross` + `Parts Gross`

### Parsers (what they output)

Each parser returns a typed `ParsedResult` which is applied via `applyParsedResult()`:

- **`menuSales`**: unique RO count + labor/parts gross by advisor
- **`alaCarte`**: count + labor/parts gross by advisor
- **`roCount`**: unique open RO count by advisor
- **`recommendations`**: rec counts + amounts + sold amounts
- **`dailyDataOld` / `dailyDataNew`**: daily labor/parts gross by advisor
- **`commodity`**: `commodityKey` + qty + gross by advisor
- **`alignment`**: qty by advisor → stored under `commodityKey="alignments"`
- **`tires`**: qty + gross by advisor (qty may be inferred by row count if missing a qty column)

### Commodity key mapping

For generic commodity files, we infer `commodityKey` from filename in `inferCommodityKeyFromFilename()`:

- `air_filters`, `cabin_filters`, `batteries`, `brakes`, `belts`, `wipers`, `fluids`, `factory_chemicals`, `tires`, `alignments`

### De-duplication rules

- **Within a run**: `IngestedFile` has unique `(runId, sha256)`.
- **Across batches, same store+date**: ingestion checks `(storeId, businessDate, sha256)` and skips duplicates to prevent double-counting.

### Debugging visibility

For every ingested file we store:

- selected sheet name
- selected header-row offset
- extracted headers
- detector notes

And expose raw previews via:

- `GET /api/files/[fileId]/preview?limit=15`


