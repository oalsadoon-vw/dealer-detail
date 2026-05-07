import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const r = await prisma.$queryRawUnsafe(`
    SELECT c.relname, n.nspname, pg_get_userbyid(c.relowner) AS owner,
           current_user AS connected_as
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = '_prisma_migrations'
  `);
  console.log(JSON.stringify(r, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
