import { BlockStack, Card, Layout, List, Text } from "@shopify/polaris";
import { AppPage } from "../components/AppPage";
import { formatPlanPrice, getPlan } from "../lib/plans";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { ensureShopDefaults } from "../services/shop.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const bundle = await ensureShopDefaults(session.shop);
  return { plan: getPlan(bundle.settings.planHandle) };
};

export default function HelpPage() {
  const { plan } = useLoaderData<typeof loader>();
  return (
    <AppPage title="Help & support" subtitle="Documentation, troubleshooting, and the support included with your plan.">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Setup guide</Text>
              <List type="number">
                <List.Item>Open Setup after install.</List.Item>
                <List.Item>Add AddressVerify to the Thank You page and the Order Status page in the checkout editor.</List.Item>
                <List.Item>Add it to Checkout if you want in-checkout suggestions.</List.Item>
                <List.Item>Turn on in-checkout validation and choose Lite or Full checks.</List.Item>
                <List.Item>Approve the usage billing plan that matches your store’s order volume ($0.40 / $0.30 / $0.20 per unique order).</List.Item>
                <List.Item>Enable post-checkout validation and tag orders by error type.</List.Item>
                <List.Item>Save settings, then test an address. Klaviyo is optional.</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">FAQ</Text>
              <Text as="p" fontWeight="semibold">Does a provider outage stop checkout?</Text>
              <Text as="p">No, unless Fail closed is enabled. The app fails over to the built-in engine first.</Text>
              <Text as="p" fontWeight="semibold">Why was an order tagged but checkout was not blocked?</Text>
              <Text as="p">Review and Warn allow checkout. Post-checkout validation then tags, holds, or auto-fixes.</Text>
              <Text as="p" fontWeight="semibold">Are tags duplicated?</Text>
              <Text as="p">No. AddressVerify removes previous address_* tags it manages before adding the current set.</Text>
              <Text as="p" fontWeight="semibold">How does billing work?</Text>
              <Text as="p">Your rate is based on store order volume: $0.40 (1–500), $0.30 (501–1,500), or $0.20 (1,501+). Shopify charges once per unique order. Checkout and post-checkout for the same order count as one. Admin test addresses and provider outages are not billed.</Text>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Validation troubleshooting</Text>
              <List>
                <List.Item>Use Test Address with the same country and street the customer used.</List.Item>
                <List.Item>Check whether the rule action is Allow, which silently ignores the issue.</List.Item>
                <List.Item>Confirm the checkout Function is deployed and enabled.</List.Item>
                <List.Item>Look at Validation Logs for the error type and action taken.</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">API / provider troubleshooting</Text>
              <List>
                <List.Item>If Google, Loqate, or Smarty fails, AddressVerify tries your failover provider, then the built-in engine.</List.Item>
                <List.Item>Custom HTTP providers must return valid, status, confidence, errorTypes, suggested, and normalized.</List.Item>
                <List.Item>Background jobs retry automatically. Failed jobs appear in app events.</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Contact support</Text>
              <Text as="p">Pricing is {formatPlanPrice(plan.handle)}. Your current support tier is {plan.supportTier}.</Text>
              <Text as="p">Email support@addressverify.app with the shop domain, order name, and the validation log time. Do not send customer emails or phone numbers unless they are required to reproduce the issue.</Text>
              {plan.supportTier === "priority" || plan.supportTier === "guided" || plan.supportTier === "dedicated" ? (
                <List>
                  {plan.supportTier !== "priority" ? null : <List.Item>Priority support queue</List.Item>}
                  {plan.supportTier === "guided" || plan.supportTier === "dedicated" ? <List.Item>Guided onboarding</List.Item> : null}
                  {plan.supportTier === "dedicated" ? <List.Item>Dedicated success manager and a direct support channel</List.Item> : null}
                </List>
              ) : (
                <Text as="p" tone="subdued">Upgrade to Growth or higher for priority support and guided onboarding.</Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </AppPage>
  );
}
