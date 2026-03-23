### Tech stack

### App

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **UI**: React + Tailwind CSS

### Backend (inside Next.js)

- **API**: Next.js Route Handlers (`apps/web/app/api/**/route.ts`)
- **Excel parsing**: `xlsx` (SheetJS) in Node runtime (`export const runtime = "nodejs"`)
- **Validation**: `zod`

### Database

- **Database**: PostgreSQL (local via Docker)
- **ORM**: Prisma

### Testing

- **Unit tests**: Vitest (`apps/web/tests/parsing.test.ts`)
  - Focused on parsing/detection correctness and regression coverage

### Local infrastructure

- **Postgres**: `apps/web/docker-compose.yml`
- **Env**: `apps/web/.env` must contain `DATABASE_URL`


