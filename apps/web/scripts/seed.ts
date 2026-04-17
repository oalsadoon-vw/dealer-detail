/**
 * Multi-tenant seed script.
 *
 * Creates realistic test data:
 *   - 2 organizations (Acme Auto Group + Prestige Motors)
 *   - 2-3 stores per org
 *   - Placeholder profiles + memberships at various roles
 *   - Pending invites
 *
 * Profiles are created with well-known IDs so you can manually create
 * matching Supabase Auth users for testing. The IDs below are arbitrary
 * UUIDs — replace them or create Supabase users with these IDs.
 *
 * Run: npm run seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ACME_ORG_ID = "10000000-0000-0000-0000-000000000001";
const PRESTIGE_ORG_ID = "10000000-0000-0000-0000-000000000002";

const ALICE_ID = "20000000-0000-0000-0000-000000000001";
const BOB_ID = "20000000-0000-0000-0000-000000000002";
const CAROL_ID = "20000000-0000-0000-0000-000000000003";
const DAN_ID = "20000000-0000-0000-0000-000000000004";
const EVE_ID = "20000000-0000-0000-0000-000000000005";

async function main() {
  console.log("Seeding multi-tenant test data...\n");

  // -- Organizations --
  const acme = await prisma.organization.upsert({
    where: { id: ACME_ORG_ID },
    update: {},
    create: { id: ACME_ORG_ID, name: "Acme Auto Group", slug: "acme-auto" },
  });
  const prestige = await prisma.organization.upsert({
    where: { id: PRESTIGE_ORG_ID },
    update: {},
    create: { id: PRESTIGE_ORG_ID, name: "Prestige Motors", slug: "prestige-motors" },
  });
  console.log(`  Orgs: ${acme.name}, ${prestige.name}`);

  // -- Stores --
  const acmeStores = await Promise.all([
    prisma.store.upsert({
      where: { id: "30000000-0000-0000-0000-000000000001" },
      update: {},
      create: {
        id: "30000000-0000-0000-0000-000000000001",
        organizationId: ACME_ORG_ID,
        name: "Acme BMW Springfield",
        abbreviation: "ABS",
        timezone: "America/Chicago",
      },
    }),
    prisma.store.upsert({
      where: { id: "30000000-0000-0000-0000-000000000002" },
      update: {},
      create: {
        id: "30000000-0000-0000-0000-000000000002",
        organizationId: ACME_ORG_ID,
        name: "Acme VW Capital City",
        abbreviation: "AVCC",
        timezone: "America/Chicago",
      },
    }),
  ]);
  const prestigeStores = await Promise.all([
    prisma.store.upsert({
      where: { id: "30000000-0000-0000-0000-000000000003" },
      update: {},
      create: {
        id: "30000000-0000-0000-0000-000000000003",
        organizationId: PRESTIGE_ORG_ID,
        name: "Prestige Porsche Westside",
        abbreviation: "PPW",
        timezone: "America/Los_Angeles",
      },
    }),
    prisma.store.upsert({
      where: { id: "30000000-0000-0000-0000-000000000004" },
      update: {},
      create: {
        id: "30000000-0000-0000-0000-000000000004",
        organizationId: PRESTIGE_ORG_ID,
        name: "Prestige Audi Downtown",
        abbreviation: "PAD",
        timezone: "America/Los_Angeles",
      },
    }),
    prisma.store.upsert({
      where: { id: "30000000-0000-0000-0000-000000000005" },
      update: {},
      create: {
        id: "30000000-0000-0000-0000-000000000005",
        organizationId: PRESTIGE_ORG_ID,
        name: "Prestige Land Rover Eastside",
        abbreviation: "PLRE",
        timezone: "America/Los_Angeles",
      },
    }),
  ]);
  console.log(`  Stores: ${acmeStores.length} (Acme) + ${prestigeStores.length} (Prestige)`);

  // -- Profiles --
  const profiles = await Promise.all([
    prisma.profile.upsert({
      where: { id: ALICE_ID },
      update: {},
      create: { id: ALICE_ID, email: "alice@acme-auto.com", fullName: "Alice Johnson" },
    }),
    prisma.profile.upsert({
      where: { id: BOB_ID },
      update: {},
      create: { id: BOB_ID, email: "bob@acme-auto.com", fullName: "Bob Smith" },
    }),
    prisma.profile.upsert({
      where: { id: CAROL_ID },
      update: {},
      create: { id: CAROL_ID, email: "carol@prestige.com", fullName: "Carol Davis" },
    }),
    prisma.profile.upsert({
      where: { id: DAN_ID },
      update: {},
      create: { id: DAN_ID, email: "dan@prestige.com", fullName: "Dan Wilson" },
    }),
    prisma.profile.upsert({
      where: { id: EVE_ID },
      update: {},
      create: { id: EVE_ID, email: "eve@dealerdetail.com", fullName: "Eve Platform" },
    }),
  ]);
  console.log(`  Profiles: ${profiles.length}`);

  // -- Platform admin (Eve) --
  await prisma.platformAdmin.upsert({
    where: { profileId: EVE_ID },
    update: {},
    create: { profileId: EVE_ID, grantedBy: "seed", notes: "Seed platform admin" },
  });
  console.log("  Platform admin: Eve");

  // -- Memberships --
  const acmeAlice = await prisma.membership.upsert({
    where: { organizationId_profileId: { organizationId: ACME_ORG_ID, profileId: ALICE_ID } },
    update: {},
    create: { organizationId: ACME_ORG_ID, profileId: ALICE_ID, role: "org_admin" },
  });
  const acmeBob = await prisma.membership.upsert({
    where: { organizationId_profileId: { organizationId: ACME_ORG_ID, profileId: BOB_ID } },
    update: {},
    create: { organizationId: ACME_ORG_ID, profileId: BOB_ID, role: "store_admin" },
  });
  const prestigeCarol = await prisma.membership.upsert({
    where: { organizationId_profileId: { organizationId: PRESTIGE_ORG_ID, profileId: CAROL_ID } },
    update: {},
    create: { organizationId: PRESTIGE_ORG_ID, profileId: CAROL_ID, role: "org_admin" },
  });
  const prestigeDan = await prisma.membership.upsert({
    where: { organizationId_profileId: { organizationId: PRESTIGE_ORG_ID, profileId: DAN_ID } },
    update: {},
    create: { organizationId: PRESTIGE_ORG_ID, profileId: DAN_ID, role: "viewer" },
  });
  console.log("  Memberships: Alice (acme org_admin), Bob (acme store_admin), Carol (prestige org_admin), Dan (prestige viewer)");

  // -- Store memberships (Bob only sees Acme BMW, Dan sees Porsche + Audi) --
  await prisma.storeMembership.upsert({
    where: { membershipId_storeId: { membershipId: acmeBob.id, storeId: acmeStores[0].id } },
    update: {},
    create: { membershipId: acmeBob.id, storeId: acmeStores[0].id },
  });
  await prisma.storeMembership.upsert({
    where: { membershipId_storeId: { membershipId: prestigeDan.id, storeId: prestigeStores[0].id } },
    update: {},
    create: { membershipId: prestigeDan.id, storeId: prestigeStores[0].id },
  });
  await prisma.storeMembership.upsert({
    where: { membershipId_storeId: { membershipId: prestigeDan.id, storeId: prestigeStores[1].id } },
    update: {},
    create: { membershipId: prestigeDan.id, storeId: prestigeStores[1].id },
  });
  console.log("  Store assignments: Bob→ABS, Dan→PPW+PAD");

  // -- Pending invites --
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await prisma.invite.upsert({
    where: { id: "40000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "40000000-0000-0000-0000-000000000001",
      organizationId: ACME_ORG_ID,
      email: "newguy@acme-auto.com",
      role: "manager",
      storeIds: [acmeStores[0].id],
      invitedById: ALICE_ID,
      expiresAt,
    },
  });
  await prisma.invite.upsert({
    where: { id: "40000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "40000000-0000-0000-0000-000000000002",
      organizationId: PRESTIGE_ORG_ID,
      email: "newmanager@prestige.com",
      role: "store_admin",
      storeIds: [prestigeStores[2].id],
      invitedById: CAROL_ID,
      expiresAt,
    },
  });
  console.log("  Pending invites: 2\n");

  console.log("Seed complete.");
  console.log("\nTo test, create Supabase Auth users with these emails:");
  console.log("  alice@acme-auto.com     (Acme org_admin)");
  console.log("  bob@acme-auto.com       (Acme store_admin, ABS only)");
  console.log("  carol@prestige.com      (Prestige org_admin)");
  console.log("  dan@prestige.com        (Prestige viewer, PPW+PAD)");
  console.log("  eve@dealerdetail.com    (Platform admin)");
  console.log("  newguy@acme-auto.com    (Pending invite → Acme manager)");
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
