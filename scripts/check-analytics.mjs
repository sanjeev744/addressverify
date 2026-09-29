import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRawUnsafe("SHOW TABLES");
  console.log("tables", tables);

  const count = await prisma.validationLog.count();
  console.log("validationLog.count", count);

  const byShop = await prisma.validationLog.groupBy({
    by: ["shop"],
    _count: true,
  });
  console.log("byShop", byShop);

  const recent = await prisma.validationLog.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
  });
  console.log(
    "recent",
    recent.map((row) => ({
      id: row.id,
      shop: row.shop,
      source: row.source,
      result: row.result,
      actionTaken: row.actionTaken,
      createdAt: row.createdAt,
      correctedAutomatically: row.correctedAutomatically,
      held: row.held,
    })),
  );

  const sessions = await prisma.session.findMany({ take: 5, select: { shop: true } });
  console.log("sessions", sessions);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
