import prisma from "../db.server";
import { logEvent } from "./monitor.server";
import { processOrderCreated } from "./orders.server";

const MAX_ATTEMPTS = 5;

export async function enqueueJob(shop: string, type: string, payload: unknown) {
  const body = payload as { admin_graphql_api_id?: string; id?: string | number };
  // Match the exact serialized key so order 123 is not mistaken for order 1234.
  const orderKey =
    type === "order_created"
      ? body.admin_graphql_api_id
        ? `"admin_graphql_api_id":${JSON.stringify(String(body.admin_graphql_api_id))}`
        : body.id != null
          ? `"id":${JSON.stringify(body.id)},`
          : ""
      : "";
  if (orderKey) {
    const existing = await prisma.backgroundJob.findFirst({
      where: {
        shop,
        type,
        status: { in: ["queued", "running", "retry", "done"] },
        payload: { contains: orderKey },
      },
    });
    if (existing) return existing;
  }
  return prisma.backgroundJob.create({
    data: {
      shop,
      type,
      payload: JSON.stringify(payload),
      status: "queued",
      nextRunAt: new Date(),
    },
  });
}

/** A job left "running" this long was interrupted (process restart) and is retried. */
const STALE_RUNNING_MS = 15 * 60_000;

export async function processDueJobs(limit = 8) {
  await prisma.backgroundJob.updateMany({
    where: { status: "running", updatedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) } },
    data: { status: "retry", nextRunAt: new Date() },
  });

  const jobs = await prisma.backgroundJob.findMany({
    where: { status: { in: ["queued", "retry"] }, nextRunAt: { lte: new Date() } },
    orderBy: { nextRunAt: "asc" },
    take: limit,
  });

  let processed = 0;
  for (const job of jobs) {
    // Claim atomically: concurrent webhook drains must not run the same job twice.
    const claimed = await prisma.backgroundJob.updateMany({
      where: { id: job.id, status: job.status },
      data: { status: "running", attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;
    processed += 1;
    try {
      if (job.type === "order_created") {
        await processOrderCreated(job.shop, JSON.parse(job.payload));
      }
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: { status: "done", lastError: null },
      });
    } catch (error) {
      const attempts = job.attempts + 1;
      const retry = attempts < MAX_ATTEMPTS;
      const delay = Math.min(60_000 * 2 ** attempts, 30 * 60_000);
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: retry ? "retry" : "failed",
          lastError: error instanceof Error ? error.message : String(error),
          nextRunAt: new Date(Date.now() + delay),
        },
      });
      await logEvent(job.shop, retry ? "warn" : "error", `Job ${job.type} failed`, {
        attempts,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return processed;
}
