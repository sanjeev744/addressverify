import prisma from "../db.server";

export async function logEvent(shop: string, level: "info" | "warn" | "error", message: string, context?: unknown) {
  await prisma.appEvent.create({
    data: {
      shop,
      level,
      message,
      context: context ? JSON.stringify(context).slice(0, 4000) : null,
    },
  }).catch(() => undefined);
  if (level === "error") {
    console.error(`[AddressVerify] ${shop}: ${message}`, context);
  }
}

export async function recentEvents(shop: string, take = 20) {
  return prisma.appEvent.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take,
  });
}
