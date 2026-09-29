import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigate } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { Button, Card, FormLayout, Page, Text, TextField } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { useEffect, useState } from "react";
import { readEmbeddedShopContext } from "../../components/SessionKeepAlive";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || "";
  const errors = loginErrorMessage(await login(request));
  return {
    errors,
    shop: shopParam,
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors,
    shop: "",
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const { errors } = actionData || loaderData;
  const [shop, setShop] = useState(loaderData.shop || "");
  const [recovering, setRecovering] = useState(false);

  // After idle iframe reloads, Shopify may open /auth/login without shop.
  // Recover from sessionStorage and bounce back into the embedded app.
  useEffect(() => {
    if (loaderData.shop || shop) return;
    const stored = readEmbeddedShopContext();
    if (!stored.shop) return;

    setShop(stored.shop);
    setRecovering(true);
    const params = new URLSearchParams();
    params.set("shop", stored.shop);
    if (stored.host) params.set("host", stored.host);
    navigate(`/app?${params.toString()}`, { replace: true });
  }, [loaderData.shop, shop, navigate]);

  return (
    <AppProvider isEmbeddedApp apiKey={loaderData.apiKey || ""}>
      <Page title="AddressVerify">
        <Card>
          {recovering ? (
            <Text as="p" variant="bodyMd">
              Restoring your session…
            </Text>
          ) : (
            <Form method="post">
              <FormLayout>
                <Text as="p" variant="bodyMd">
                  Enter your shop domain to install or open AddressVerify.
                </Text>
                <TextField
                  type="text"
                  name="shop"
                  label="Shop domain"
                  helpText="example.myshopify.com"
                  value={shop}
                  onChange={setShop}
                  autoComplete="on"
                  error={errors.shop}
                />
                <Button submit variant="primary">
                  Continue
                </Button>
              </FormLayout>
            </Form>
          )}
        </Card>
      </Page>
    </AppProvider>
  );
}
