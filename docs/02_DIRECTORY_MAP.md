### Directory map (precise)

Paths below are relative to repo root:

- **Repo root**: `/Users/omaralsadoon/Desktop/Dealerdetail/dealer_detail_mvp`

### Top-level

```
dealer_detail_mvp/
  apps/
  docs/
  package.json
  README.md
  streamlit_app.py
```

- **`apps/`**: monorepo-style container (currently only `web`)
- **`docs/`**: onboarding documentation (this folder)
- **`streamlit_app.py`**: legacy reference implementation (source-of-truth logic during porting)

### Web app (`apps/web`)

```
apps/web/
  app/
  components/
  docker-compose.yml
  env.example
  lib/
  prisma/
  scripts/
  tests/
  package.json
  README.md
  tailwind.config.ts
  tsconfig.json
  vitest.config.ts
```

#### Next.js app router (`apps/web/app`)

```
apps/web/app/
  api/
    dashboard/route.ts
    files/[fileId]/preview/route.ts
    ingest/route.ts
    runs/route.ts
    runs/[runId]/route.ts
    stores/route.ts
  dashboard/
    page.tsx
    ui.tsx
  runs/
    page.tsx
    [runId]/page.tsx
  upload/page.tsx
  layout.tsx
  page.tsx
  globals.css
```

- **Pages**
  - `upload/page.tsx`: file upload + ingestion UX
  - `runs/page.tsx`: run history table
  - `runs/[runId]/page.tsx`: run details, per-file metadata + raw previews
  - `dashboard/page.tsx` + `dashboard/ui.tsx`: dashboard UI (client component)

- **API routes**
  - `api/ingest`: multipart upload ingestion
  - `api/files/[fileId]/preview`: view first N raw rows for debugging
  - `api/runs`: list runs by store
  - `api/runs/[runId]`: run detail (JSON)
  - `api/stores`: list/create stores
  - `api/dashboard`: dashboard data fetch (runId or storeId+date)

#### Shared libraries (`apps/web/lib`)

```
apps/web/lib/
  db.ts
  fullPicture.ts
  hash.ts
  parsing/
    accumulator.ts
    cleaners.ts
    detectors.ts
    index.ts
    parsingPipeline.ts
    types.ts
    xlsxReader.ts
    parsers/
      alaCarte.ts
      alignment.ts
      commodity.ts
      dailyData.ts
      menuSales.ts
      recommendations.ts
      roCount.ts
      tires.ts
```

- **`db.ts`**: Prisma client
- **`hash.ts`**: sha256 hashing + stable JSON stringify (row hashing)
- **`fullPicture.ts`**: KPI derivations (percentages, totals)
- **`parsing/`**: report detection + parsing pipeline + accumulation into normalized metrics

#### Prisma (`apps/web/prisma`)

```
apps/web/prisma/
  schema.prisma
  migrations/
    20251223175020_initial_schema/migration.sql
    20251223193000_add_batch_no_multi_runs/migration.sql
    migration_lock.toml
```

#### Scripts (`apps/web/scripts`)

```
apps/web/scripts/
  seed.ts
  classifyExcels.ts
```

- **`seed.ts`**: seed initial store(s)
- **`classifyExcels.ts`**: offline classification sweep across `/Users/omaralsadoon/Desktop/excels`

#### Tests (`apps/web/tests`)

```
apps/web/tests/
  parsing.test.ts
```


