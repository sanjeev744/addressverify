import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const usage = await prisma.$queryRaw`SELECT COUNT(*) AS c FROM billingusage`;
  const logs = await prisma.$queryRaw`SELECT COUNT(*) AS c FROM validationlog`;
  const rows = await prisma.$queryRaw`
    SELECT orderId, period, billable, chargeAmount, billingStatus, source
    FROM billingusage
    ORDER BY createdAt DESC
    LIMIT 20
  `;
  console.log(JSON.stringify({ usage, logs, rows }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
