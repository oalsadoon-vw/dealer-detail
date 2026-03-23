### What this project is

**DealerDetail** is a production-oriented Next.js web app that replaces a Streamlit + Google Sheets workflow.

You upload multiple Tekion Excel exports per **store** per **business date**. The app:

- **Classifies** each Excel file into a report type (menu, a‑la‑carte, commodities, tires, alignment, RO count, recommendations, daily performance)
- **Parses** each file into normalized advisor-day metrics
- **Stores**:
  - a raw/staging layer for future analytics (all rows as JSON)
  - a normalized layer for dashboards (advisor/day + commodity buckets)
- **Shows** ingestion runs (“batches”), run history, debugging visibility, and dashboards.

### Core concepts

- **Store**
  - A dealership/location (supports multiple stores; seeded with a demo store for MVP).

- **Business date**
  - Date dimension for advisor performance and daily KPIs.
  - Stored as midnight UTC (`YYYY-MM-DDT00:00:00.000Z`) for deterministic uniqueness.

- **Batch / Ingestion run**
  - Each upload action creates a new `IngestionRun` with a per-store increasing **`batchNo`** (serial number).
  - Multiple batches can exist for the same store + business date.

- **Two-layer storage**
  - **Raw layer**: keep everything (rows + metadata) so you never need to re-upload old history to add new analytics later.
  - **Normalized layer**: only the KPIs needed for parity with the previous workflow.

### How “combine for the day” works

Even though there are multiple batches per day, the **day totals combine** because normalized tables are keyed by:

- `AdvisorDailyMetrics`: `(storeId, advisorId, businessDate)`
- `AdvisorDailyCommodity`: `(storeId, advisorId, businessDate, commodityKey)`

Ingestion uses `increment` updates (additive merge), so the totals across all uploaded files for the day accumulate.

### What’s implemented vs. what’s next

- **Implemented**
  - Robust report classification across your real Excel corpus (`npm run classify:excels` → 0 mismatches)
  - Upload ingestion pipeline (sync processing)
  - Run history, run details, raw preview endpoint
  - Dashboard with tab-like sections + commodity pivot table
  - Batch serial numbering and per-batch run records

- **Next (likely)**
  - True “per-batch vs per-day” toggles in the dashboard (currently the dashboard displays combined day totals; run selection mainly changes metadata/context)
  - Background jobs for ingestion (BullMQ/Redis) if ingest time becomes large
  - Expanded commodity parsing (labor gross per commodity where available)
  - Additional report types / new KPIs


