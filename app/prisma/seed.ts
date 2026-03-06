import { PrismaClient, MembershipRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const defaultDimensions = [
  { name: "Clinical risk", type: "yesno", weight: 1.5, order: 0, tag: "Medical" },
  { name: "Requires SOP update", type: "yesno", weight: 1.2, order: 1, tag: "Medical" },
  { name: "Retraining required", type: "yesno", weight: 1.3, order: 2, tag: "Medical" },
  { name: "Rollout complexity", type: "scale", weight: 1.2, order: 3, tag: "Ops" },
  { name: "Staff roles affected", type: "scale", weight: 1.0, order: 4, tag: "Ops" },
  { name: "Affects regulated flow", type: "yesno", weight: 1.5, order: 5, tag: "Medical" },
  { name: "Engineering effort", type: "scale", weight: 1.0, order: 6, tag: "Engineering" },
  { name: "Deal impact", type: "yesno", weight: 1.1, order: 7, tag: "Bids" },
];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  const bootstrapOrgName = process.env.BOOTSTRAP_ORG_NAME || "Cera Care";
  const bootstrapOrgSlug = process.env.BOOTSTRAP_ORG_SLUG || slugify(bootstrapOrgName) || "default-org";
  const bootstrapOwnerEmail = (process.env.BOOTSTRAP_OWNER_EMAIL || "tibi.iorga@ceracare.co.uk").toLowerCase();

  const organization = await prisma.organization.upsert({
    where: { slug: bootstrapOrgSlug },
    update: { name: bootstrapOrgName },
    create: { name: bootstrapOrgName, slug: bootstrapOrgSlug },
  });

  const owner = await prisma.user.upsert({
    where: { email: bootstrapOwnerEmail },
    update: {},
    create: {
      email: bootstrapOwnerEmail,
      passwordHash: await bcrypt.hash("changeme", 10),
      name: bootstrapOwnerEmail,
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: owner.id,
        organizationId: organization.id,
      },
    },
    update: { role: MembershipRole.owner },
    create: {
      userId: owner.id,
      organizationId: organization.id,
      role: MembershipRole.owner,
    },
  });

  const dimCount = await prisma.dimension.count({
    where: { organizationId: organization.id },
  });

  if (dimCount === 0) {
    await prisma.dimension.createMany({
      data: defaultDimensions.map((d) => ({ ...d, organizationId: organization.id })),
    });
    console.log("Seeded default scoring dimensions.");
  }

  const manualEntry = await prisma.importRecord.findFirst({
    where: { organizationId: organization.id, filename: "Manual entry" },
  });

  if (!manualEntry) {
    await prisma.importRecord.create({
      data: { filename: "Manual entry", productId: null, organizationId: organization.id },
    });
    console.log('Seeded "Manual entry" ImportRecord.');
  }

  console.log(`Bootstrap owner: ${bootstrapOwnerEmail}`);
  console.log(`Bootstrap organization: ${bootstrapOrgName} (${bootstrapOrgSlug})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
