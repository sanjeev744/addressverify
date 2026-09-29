import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
try {
  const rows = await p.session.findMany({ take: 1 });
  console.log("OK rows=", rows.length, "delegate=", typeof p.session);
} catch (e) {
  console.error("FAIL", e?.code || "", e?.message || e);
  process.exitCode = 1;
} finally {
  await p.$disconnect();
}
