## DealerDetail (web)

Next.js + Postgres + Prisma app for ingesting Tekion Excel exports, storing raw rows + normalized metrics, and rendering advisor dashboards.

### Local setup

- **Start Postgres**:

```bash
cd apps/web
docker compose up -d
```

- **Environment**:
  - **Prisma needs `.env`** (it won’t read `.env.local` by default).
  - Copy `env.example` → `.env`
  - Optional: also copy `env.example` → `.env.local` for Next.js (Next will read `.env` too, so this is optional)

- **Install + migrate** (run locally):

```bash
cd apps/web
npm i
npx prisma generate
npx prisma migrate dev
npm run seed
npm run dev
```

### Key architecture

- **Raw layer**: `IngestedFile` + `RawReportRow` store the entire file rows (JSON) + metadata.
- **Normalized layer**: `AdvisorDailyMetrics` and `AdvisorDailyCommodity` store the tracked KPI parity fields.
- **Additive merges**: multiple files per store/day sum into the same advisor-day records.

### Adding a new report type

- Add a detector rule in `lib/parsing/detectors.ts`
- Add a parser in `lib/parsing/parsers/*`
- Add mapping in `lib/parsing/parsingPipeline.ts`
- Extend `Accumulator` + `applyParsedResult` if it produces new normalized fields


