### UI guide

All UI pages live in `apps/web/app/**`.

### Navigation

Top nav links:

- `/upload`
- `/runs`
- `/dashboard`

### Upload (`/upload`)

- Choose **Store**
- Choose **Business date**
- Select multiple `.xlsx` files
  - The picker supports selecting files from multiple folders (each selection appends)
  - The UI dedupes files by `(name, size, lastModified)`
- Click **Ingest**

After ingest completes:

- You see a JSON summary of what was ingested/skipped and any warnings/errors
- You get a link to **View run details** (`/runs/[runId]`)

### Runs (`/runs`)

Run history table:

- Business date
- **Batch #** (per-store serial)
- Status
- File count
- Created timestamp

### Run detail (`/runs/[runId]`)

Shows:

- Store, business date, batch number, status
- Files list with:
  - detected type + confidence
  - chosen sheet + header row offset
  - headers and detector notes
  - raw preview link (first 15 rows)
- Run summary JSON

### Dashboard (`/dashboard`)

The dashboard is a client UI that:

- Loads stores via `/api/stores`
- Loads runs for store via `/api/runs?storeId=...`
- Loads dashboard data via `/api/dashboard?runId=...`

Tab-like sections:

- **Full Picture**: top-level KPIs (counts, percentages, daily gross, etc.)
- **Menu Sales**: menu count + labor/parts gross
- **A‑La‑Carte**: count + labor/parts gross
- **Commodity Sales**: pivot-style table (advisor rows, commodity columns + totals)
- **Daily**: daily labor/parts gross extracted from performance reports
- **Closing %**: recommendation closing metrics

Formatting:

- Dashboard numbers are displayed with **2 decimal places** for consistency.


