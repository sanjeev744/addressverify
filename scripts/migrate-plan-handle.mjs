import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$executeRaw`
    UPDATE shopsettings
    SET planHandle = 'usage_tier_1'
    WHERE planHandle = 'usage' OR planHandle IS NULL OR planHandle = ''
  `;
  console.log("migrated rows", result);
  const rows = await prisma.$queryRaw`
    SELECT shop, planHandle, billingOrderCountOverride FROM shopsettings
  `;
  console.log(rows);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
