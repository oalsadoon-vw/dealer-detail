/**
 * One-off audit script: scans every user-schema table for RLS state and
 * potentially-sensitive column names. Mirrors the checks Supabase's
 * Security Advisor runs.
 *
 * Run with:
 *   npx tsx scripts/check-rls.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api_?key/i,
  /ssn/i,
  /credit_?card/i,
  /\bemail\b/i,
  /sender_?email/i,
  /actor_?email/i,
  /phone/i,
  /\bdob\b/i,
];

type RlsRow = {
  schemaname: string;
  tablename: string;
  rls_enabled: boolean;
  policy_count: bigint;
};

type ColRow = { column_name: string; data_type: string };

async function main() {
  // Only user-defined schemas. Skip system + Supabase-managed schemas.
  const rows = await prisma.$queryRawUnsafe<RlsRow[]>(`
    SELECT
      n.nspname                         AS schemaname,
      c.relname                         AS tablename,
      c.relrowsecurity                  AS rls_enabled,
      COALESCE(p.cnt, 0)::bigint        AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN (
      SELECT polrelid, COUNT(*) AS cnt
      FROM pg_policy
      GROUP BY polrelid
    ) p ON p.polrelid = c.oid
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN (
        'pg_catalog','information_schema','auth','storage','realtime',
        'extensions','graphql','graphql_public','pgsodium','pgsodium_masks',
        'vault','net','supabase_functions','supabase_migrations','cron'
      )
    ORDER BY n.nspname, c.relname;
  `);

  console.log("\nschema.table                              RLS   #pol  flagged-cols");
  console.log("-".repeat(80));

  const missing: { schema: string; table: string }[] = [];
  for (const r of rows) {
    const cols = await prisma.$queryRawUnsafe<ColRow[]>(
      `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
      r.schemaname,
      r.tablename
    );
    const flagged = cols
      .map((c) => c.column_name)
      .filter((n) => SENSITIVE_PATTERNS.some((p) => p.test(n)));

    const flag = r.rls_enabled ? "ON " : "OFF";
    const label = `${r.schemaname}.${r.tablename}`.padEnd(40);
    console.log(
      label,
      flag.padEnd(5),
      String(r.policy_count).padEnd(5),
      flagged.join(", ") || "-"
    );
    if (!r.rls_enabled) missing.push({ schema: r.schemaname, table: r.tablename });
  }
  console.log("-".repeat(80));
  console.log(`Tables without RLS: ${missing.length}`);
  if (missing.length) {
    for (const m of missing) console.log(`  • ${m.schema}.${m.table}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
