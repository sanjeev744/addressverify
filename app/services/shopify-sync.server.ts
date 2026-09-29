import prisma from "../db.server";
import { runtimeConfig, type ShopBundle } from "./shop.server";

type AdminClient = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export async function bootstrapShopRuntime(admin: AdminClient, shop: string) {
  const bundle = await (await import("./shop.server")).ensureShopDefaults(shop);

  // Always refresh checkout metafields so the tunnel / app URL stays current.
  try {
    await syncShopConfig(admin, shop, bundle);
  } catch (error) {
    console.warn("AddressVerify config sync skipped", error);
  }

  // Always verify: a saved validation can disappear (e.g. dev-preview extensions go away when `app dev` stops).
  try {
    await ensureValidationFunction(admin, shop);
  } catch (error) {
    console.warn("AddressVerify function sync skipped", error);
  }
  return prisma.shopSettings.findUnique({ where: { shop } });
}

export async function syncShopConfig(admin: AdminClient, shop: string, bundle?: ShopBundle) {
  const resolved = bundle || (await (await import("./shop.server")).getShopBundle(shop));
  const config = runtimeConfig(resolved);
  const ownerId = await shopId(admin);
  const response = await admin.graphql(
    `#graphql
      mutation AddressVerifyConfig($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }
    `,
    {
      variables: {
        metafields: [
          {
            ownerId,
            namespace: "$app:addressverify",
            key: "config",
            type: "json",
            value: JSON.stringify(config),
          },
        ],
      },
    },
  );
  const json = await response.json();
  const userError = json.data?.metafieldsSet?.userErrors?.[0]?.message || json.errors?.[0]?.message;
  if (userError) {
    throw new Error(userError);
  }
  await prisma.$executeRaw`UPDATE shopsettings SET shopGid = ${ownerId} WHERE shop = ${shop}`;
  return json;
}

export async function getOrderShippingAddress(admin: AdminClient, orderId: string) {
  const id = orderGid(orderId);
  const response = await admin.graphql(
    `#graphql
      query AddressVerifyOrderShipping($id: ID!) {
        order(id: $id) {
          id
          shippingAddress {
            address1
            address2
            city
            provinceCode
            zip
            countryCodeV2
          }
        }
      }
    `,
    { variables: { id } },
  );
  const json = await response.json();
  const shipping = json.data?.order?.shippingAddress;
  if (!shipping) return null;
  return {
    address1: shipping.address1 || "",
    address2: shipping.address2 || "",
    city: shipping.city || "",
    province: shipping.provinceCode || "",
    zip: shipping.zip || "",
    country: shipping.countryCodeV2 || "",
  };
}

async function shopId(admin: AdminClient) {
  const response = await admin.graphql(
    `#graphql
      query AddressVerifyShopId {
        shop { id }
      }
    `,
  );
  const json = await response.json();
  const id = json.data?.shop?.id as string | undefined;
  if (!id) {
    throw new Error(json.errors?.[0]?.message || "Could not load shop id");
  }
  return id;
}

export async function ensureValidationFunction(admin: AdminClient, shop: string) {
  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  const listed = await admin.graphql(
    `#graphql
      query AddressVerifyFunctions {
        shopifyFunctions(first: 25) {
          nodes { id title apiType }
        }
      }
    `,
  );
  const listedJson = await listed.json();
  const fn = (listedJson.data?.shopifyFunctions?.nodes || []).find(
    (item: { apiType?: string; title?: string }) => {
      const title = `${item.title || ""}`.toLowerCase();
      return (
        item.apiType === "cart_checkout_validation" &&
        (title.includes("addressverify") || title.includes("address-verify"))
      );
    },
  );
  if (!fn?.id) {
    // Function isn't in the active app version; forget stale ids so it is re-created after the next deploy.
    if (settings?.validationGid || settings?.functionId) {
      return prisma.shopSettings.update({
        where: { shop },
        data: { functionId: null, validationGid: null },
      });
    }
    return settings;
  }

  if (settings?.validationGid && settings.functionId === fn.id) {
    const updated = await admin.graphql(
      `#graphql
        mutation AddressVerifyEnable($id: ID!, $validation: ValidationUpdateInput!) {
          validationUpdate(id: $id, validation: $validation) {
            validation { id enabled }
            userErrors { field message }
          }
        }
      `,
      {
        variables: {
          id: settings.validationGid,
          validation: { enable: settings.validationEnabled },
        },
      },
    );
    const updatedJson = await updated.json();
    if (updatedJson.data?.validationUpdate?.validation?.id) {
      return settings;
    }
    // Saved validation no longer exists on the shop — fall through and create a new one.
  }

  const created = await admin.graphql(
    `#graphql
      mutation AddressVerifyCreate($validation: ValidationCreateInput!) {
        validationCreate(validation: $validation) {
          validation { id enabled }
          userErrors { field message }
        }
      }
    `,
    {
      variables: {
        validation: {
          functionId: fn.id,
          enable: settings?.validationEnabled ?? true,
        },
      },
    },
  );
  const createdJson = await created.json();
  const gid = createdJson.data?.validationCreate?.validation?.id;
  return prisma.shopSettings.update({
    where: { shop },
    data: { functionId: fn.id, validationGid: gid || null },
  });
}

export type ShopOrderSummary = {
  id: string;
  name: string;
  createdAt: string;
  cancelled: boolean;
  fulfillmentStatus: string;
};

/** Confirms an order id supplied by a storefront client really belongs to this shop. */
export async function getShopOrder(admin: AdminClient, orderId: string): Promise<ShopOrderSummary | null> {
  const response = await admin.graphql(
    `#graphql
      query AddressVerifyOrderLookup($id: ID!) {
        order(id: $id) {
          id
          name
          createdAt
          cancelledAt
          displayFulfillmentStatus
        }
      }
    `,
    { variables: { id: orderGid(orderId) } },
  );
  const json = await response.json();
  const order = json.data?.order;
  if (!order?.id) return null;
  return {
    id: order.id,
    name: order.name || "",
    createdAt: order.createdAt,
    cancelled: Boolean(order.cancelledAt),
    fulfillmentStatus: order.displayFulfillmentStatus || "",
  };
}

const COUNTRY_CODE = /^[A-Z]{2}$/;

export async function updateOrderAddress(
  admin: AdminClient,
  orderId: string,
  address: {
    address1: string;
    address2?: string;
    city: string;
    province?: string;
    zip: string;
    country: string;
  },
) {
  const id = orderGid(orderId);
  // orderUpdate replaces the whole shipping address, so start from the current one to keep
  // name, company and phone intact.
  const currentResponse = await admin.graphql(
    `#graphql
      query AddressVerifyOrderAddressFull($id: ID!) {
        order(id: $id) {
          shippingAddress {
            firstName
            lastName
            company
            phone
            address1
            address2
            city
            provinceCode
            zip
            countryCodeV2
          }
        }
      }
    `,
    { variables: { id } },
  );
  const currentJson = await currentResponse.json();
  const current = currentJson.data?.order?.shippingAddress || {};
  const country = (address.country || current.countryCodeV2 || "").toUpperCase();
  const province = address.province || current.provinceCode || "";

  const response = await admin.graphql(
    `#graphql
      mutation AddressVerifyOrderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order { id }
          userErrors { field message }
        }
      }
    `,
    {
      variables: {
        input: {
          id,
          shippingAddress: {
            firstName: current.firstName ?? undefined,
            lastName: current.lastName ?? undefined,
            company: current.company ?? undefined,
            phone: current.phone ?? undefined,
            address1: address.address1 || current.address1 || "",
            address2: address.address2 ?? current.address2 ?? "",
            city: address.city || current.city || "",
            zip: address.zip || current.zip || "",
            ...(COUNTRY_CODE.test(country) ? { countryCode: country } : { country }),
            ...(province ? { provinceCode: province } : {}),
          },
        },
      },
    },
  );
  const json = await response.json();
  const errors: Array<{ message?: string }> = json.data?.orderUpdate?.userErrors || json.errors || [];
  if (errors.length || !json.data?.orderUpdate?.order?.id) {
    return {
      ok: false as const,
      error: errors.map((error) => error.message || String(error)).join("; ") || "Order update failed",
    };
  }
  return { ok: true as const, orderId: json.data.orderUpdate.order.id as string };
}

export async function replaceAddressTags(
  admin: AdminClient,
  orderId: string,
  currentTags: string[],
  nextTags: string[],
) {
  const id = orderGid(orderId);
  const uniqueNext = [...new Set(nextTags.filter(Boolean))];
  const toRemove = currentTags.filter((tag) => tag.startsWith("address_") && !uniqueNext.includes(tag));
  const toAdd = uniqueNext.filter((tag) => !currentTags.includes(tag));
  if (toRemove.length) {
    await admin.graphql(
      `#graphql
        mutation AddressVerifyTagsRemove($id: ID!, $tags: [String!]!) {
          tagsRemove(id: $id, tags: $tags) { userErrors { message } }
        }
      `,
      { variables: { id, tags: toRemove } },
    );
  }
  if (toAdd.length) {
    await admin.graphql(
      `#graphql
        mutation AddressVerifyTagsAdd($id: ID!, $tags: [String!]!) {
          tagsAdd(id: $id, tags: $tags) { userErrors { message } }
        }
      `,
      { variables: { id, tags: toAdd } },
    );
  }
  return uniqueNext;
}

export async function holdOrderFulfillments(admin: AdminClient, orderId: string, reason: string) {
  const id = orderGid(orderId);
  const listed = await admin.graphql(
    `#graphql
      query AddressVerifyFulfillmentOrders($id: ID!) {
        order(id: $id) {
          fulfillmentOrders(first: 20) { nodes { id status } }
        }
      }
    `,
    { variables: { id } },
  );
  const json = await listed.json();
  const nodes = (json.data?.order?.fulfillmentOrders?.nodes || []) as Array<{ id: string; status: string }>;
  const held: string[] = [];
  for (const node of nodes) {
    if (node.status === "CLOSED" || node.status === "CANCELLED") continue;
    const result = await admin.graphql(
      `#graphql
        mutation AddressVerifyHold($id: ID!, $fulfillmentHold: FulfillmentOrderHoldInput!) {
          fulfillmentOrderHold(id: $id, fulfillmentHold: $fulfillmentHold) {
            userErrors { message }
          }
        }
      `,
      {
        variables: {
          id: node.id,
          fulfillmentHold: { reason: "INCORRECT_ADDRESS", reasonNotes: reason.slice(0, 240) },
        },
      },
    );
    const holdJson = await result.json();
    if (!holdJson.data?.fulfillmentOrderHold?.userErrors?.length) {
      held.push(node.id);
    }
  }
  return held;
}

export async function releaseOrderHolds(admin: AdminClient, fulfillmentIds: string[]) {
  for (const id of fulfillmentIds) {
    await admin.graphql(
      `#graphql
        mutation AddressVerifyRelease($id: ID!) {
          fulfillmentOrderReleaseHold(id: $id) { userErrors { message } }
        }
      `,
      { variables: { id } },
    );
  }
}

function orderGid(orderId: string) {
  const numeric = orderId.match(/(\d+)$/)?.[1];
  if (orderId.startsWith("gid://shopify/OrderIdentity/") && numeric) return `gid://shopify/Order/${numeric}`;
  return orderId.startsWith("gid://") ? orderId : `gid://shopify/Order/${orderId}`;
}

function isoDateQueryBound(date: Date) {
  return date.toISOString().slice(0, 19);
}

export async function getOrdersCountInRange(admin: AdminClient, from: Date, to: Date) {
  const query = `created_at:>='${isoDateQueryBound(from)}' created_at:<='${isoDateQueryBound(to)}'`;
  try {
    const response = await admin.graphql(
      `#graphql
        query AddressVerifyOrdersCount($query: String!) {
          ordersCount(query: $query) { count }
        }
      `,
      { variables: { query } },
    );
    const json = await response.json();
    const count = json.data?.ordersCount?.count;
    if (typeof count === "number") return count;
  } catch (error) {
    console.warn("AddressVerify ordersCount failed", error);
  }

  // Fallback for API versions without ordersCount
  try {
    const response = await admin.graphql(
      `#graphql
        query AddressVerifyOrdersPage($query: String!) {
          orders(first: 250, query: $query) {
            edges { node { id } }
          }
        }
      `,
      { variables: { query } },
    );
    const json = await response.json();
    return json.data?.orders?.edges?.length || 0;
  } catch (error) {
    console.warn("AddressVerify orders page count failed", error);
    return 0;
  }
}

export async function listOrdersForValidation(admin: AdminClient, from: Date, to: Date, first = 50) {
  const query = `created_at:>='${isoDateQueryBound(from)}' created_at:<='${isoDateQueryBound(to)}'`;
  const response = await admin.graphql(
    `#graphql
      query AddressVerifyOrdersForValidation($query: String!, $first: Int!) {
        orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              customer { id }
              shippingAddress {
                address1
                address2
                city
                provinceCode
                zip
                countryCodeV2
              }
            }
          }
        }
      }
    `,
    { variables: { query, first } },
  );
  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e: { message?: string }) => e.message || String(e)).join("; "));
  }
  const edges = json.data?.orders?.edges || [];
  return edges.map((edge: { node: Record<string, unknown> }) => edge.node);
}

export async function ensureOrdersCreateWebhook(admin: AdminClient, callbackUrl: string) {
  const response = await admin.graphql(
    `#graphql
      mutation AddressVerifyOrdersCreateWebhook($callbackUrl: URL!) {
        webhookSubscriptionCreate(
          topic: ORDERS_CREATE
          webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }
        ) {
          userErrors { field message }
          webhookSubscription { id }
        }
      }
    `,
    { variables: { callbackUrl } },
  );
  const json = await response.json();
  const errors = json.data?.webhookSubscriptionCreate?.userErrors || json.errors || [];
  if (errors.length) {
    const message = errors.map((e: { message?: string }) => e.message || String(e)).join("; ");
    throw new Error(message);
  }
  return json.data?.webhookSubscriptionCreate?.webhookSubscription?.id as string | undefined;
}
