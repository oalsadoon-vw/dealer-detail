import { prisma } from "@/lib/db";

async function main() {
  const existing = await prisma.store.findFirst();
  if (existing) return;

  await prisma.store.create({
    data: {
      name: "Demo Store",
      timezone: "America/Los_Angeles"
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });


