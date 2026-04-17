/**
 * Runtime environment validation. Import this module early (e.g., from
 * lib/db.ts) so missing variables are caught at startup rather than on
 * the first request that happens to use them.
 */

const REQUIRED_SERVER = [
  "DATABASE_URL",
] as const;

const REQUIRED_PUBLIC = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const missing: string[] = [];

for (const key of REQUIRED_SERVER) {
  if (!process.env[key]) missing.push(key);
}

for (const key of REQUIRED_PUBLIC) {
  if (!process.env[key]) missing.push(key);
}

if (missing.length > 0 && process.env.NODE_ENV !== "test") {
  const msg = `Missing required environment variables:\n  ${missing.join("\n  ")}\n\nCheck your .env file or deployment config.`;
  if (process.env.NODE_ENV === "production") {
    throw new Error(msg);
  } else {
    console.warn(`\n⚠️  ${msg}\n`);
  }
}
