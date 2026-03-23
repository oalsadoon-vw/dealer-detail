### Dev workflow

### Prereqs

- Node.js (any modern LTS works; project uses Next.js 14)
- Docker (for local Postgres)

### Local setup (web app)

From repo root:

```bash
cd apps/web
docker compose up -d
cp env.example .env
npm i
npx prisma generate
npx prisma migrate dev
npm run seed
npm run dev
```

App runs at `http://localhost:3000`.

### Useful npm scripts

From repo root:

- **Run Next dev server**:

```bash
npm run dev:web
```

- **Run Excel classification sweep** (validates detection across your corpus):

```bash
npm run classify:excels
```

From `apps/web`:

- `npm run dev`
- `npm run seed`
- `npm run test`
- `npm run classify:excels`

### Excel corpus workflow (recommended)

1. Add new real-world Tekion exports into `/Users/omaralsadoon/Desktop/excels` (organized by folder/type)
2. Run:

```bash
npm run classify:excels
```

3. If mismatches appear, tighten:
   - `apps/web/lib/parsing/detectors.ts`
   - relevant parser in `apps/web/lib/parsing/parsers/*`

### Adding a new report type

1. Add/extend detection in `apps/web/lib/parsing/detectors.ts`
2. Implement parser in `apps/web/lib/parsing/parsers/`
3. Wire it up in `apps/web/lib/parsing/parsingPipeline.ts`
4. Update accumulator in `apps/web/lib/parsing/accumulator.ts` if it contributes new normalized metrics
5. Add unit tests in `apps/web/tests/parsing.test.ts`


