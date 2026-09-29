import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { webhookOk } from "../lib/webhook-response";
import { hashCustomerId, redactCustomer } from "../services/logs.server";
import { deleteShopData } from "../services/shop.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const data = payload as {
    customer?: { id?: number | string; email?: string };
    orders_to_redact?: Array<number | string>;
  };

  if (topic === "CUSTOMERS_DATA_REQUEST") {
    const customerHash = hashCustomerId(data.customer?.id ? String(data.customer.id) : null);
    const logs = await prisma.validationLog.findMany({
      where: { shop, customerId: customerHash ?? "__none__" },
      take: 200,
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        country: true,
        result: true,
        errorType: true,
        actionTaken: true,
        originalAddress: true,
        correctedAddress: true,
        orderRef: true,
      },
    });
    console.log(`AddressVerify data request for ${shop}`, {
      customerId: data.customer?.id,
      records: logs.length,
    });
    return webhookOk(
      JSON.stringify({ ok: true, records: logs.length }),
    );
  }

  if (topic === "CUSTOMERS_REDACT") {
    await redactCustomer(
      shop,
      data.customer?.id ? String(data.customer.id) : undefined,
      (data.orders_to_redact || []).map(String),
    );
    return webhookOk();
  }

  if (topic === "SHOP_REDACT") {
    await deleteShopData(shop);
    return webhookOk();
  }

  return webhookOk();
};
