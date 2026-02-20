import { PrismaClient } from "@prisma/client";
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

async function main() {
  const dimCount = await prisma.dimension.count();
  if (dimCount === 0) {
    await prisma.dimension.createMany({ data: defaultDimensions });
    console.log("Seeded default scoring dimensions.");
  }
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    const hash = await bcrypt.hash("changeme", 10);
    await prisma.user.create({
      data: { email: "admin@example.com", passwordHash: hash },
    });
    console.log("Seeded admin user: admin@example.com / changeme");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
