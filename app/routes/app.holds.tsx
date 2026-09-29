import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit } from "@remix-run/react";
import { Badge, Banner, BlockStack, Button, Card, InlineStack, Text } from "@shopify/polaris";
import { AppPage } from "../components/AppPage";
import { holdTitle } from "../lib/savings";
import prisma from "../db.server";
import { resolveHold } from "../services/orders.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const holds = await prisma.orderHold.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return { holds };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  try {
    await resolveHold(session.shop, String(form.get("holdId")), form.get("apply") === "true");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update this hold." };
  }
  return redirect("/app/holds");
};

export default function HoldsPage() {
  const { holds } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  return (
    <AppPage title="Order holds" subtitle="Serious address issues can pause fulfillment until you fix or release them.">
      <BlockStack gap="400">
        {actionData?.error ? (
          <Banner tone="critical" title="Hold not updated">
            <p>{actionData.error}</p>
          </Banner>
        ) : null}
        {holds.length === 0 ? (
          <Card>
            <Text as="p" tone="subdued">No holds yet.</Text>
          </Card>
        ) : null}
        {holds.map((hold) => (
          <Card key={hold.id}>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">{holdTitle(hold.orderName)}</Text>
                <Badge tone={hold.status === "open" ? "warning" : "success"}>{hold.status}</Badge>
              </InlineStack>
              <Text as="p">Reason: {hold.reason}</Text>
              <Text as="p" tone="subdued">Original: {hold.originalAddress}</Text>
              {hold.suggestedAddress ? <Text as="p">Suggested: {hold.suggestedAddress}</Text> : null}
              {hold.status === "open" ? (
                <InlineStack gap="200">
                  <Button
                    variant="primary"
                    onClick={() => {
                      const data = new FormData();
                      data.set("holdId", hold.id);
                      data.set("apply", hold.suggestedAddress ? "true" : "false");
                      submit(data, { method: "post" });
                    }}
                  >
                    {hold.suggestedAddress ? "Apply suggestion and release" : "Release hold"}
                  </Button>
                  {hold.suggestedAddress ? (
                    <Button
                      onClick={() => {
                        const data = new FormData();
                        data.set("holdId", hold.id);
                        data.set("apply", "false");
                        submit(data, { method: "post" });
                      }}
                    >
                      Release without changing address
                    </Button>
                  ) : null}
                </InlineStack>
              ) : null}
            </BlockStack>
          </Card>
        ))}
      </BlockStack>
    </AppPage>
  );
}
