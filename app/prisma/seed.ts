import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const defaultDimensions = [
  { name: "Requires SOP update", type: "yesno", weight: 1.2, order: 0 },
  { name: "Touches regulated workflow", type: "yesno", weight: 1.5, order: 1 },
  { name: "Staff roles affected (1–3 scale)", type: "scale", weight: 1, order: 2 },
  { name: "Requires retraining", type: "yesno", weight: 1.3, order: 3 },
  { name: "Creates or modifies operational process", type: "yesno", weight: 1.1, order: 4 },
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
