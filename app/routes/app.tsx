import type { HeadersFunction, LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError, useSearchParams } from "@remix-run/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { SessionKeepAlive } from "../components/SessionKeepAlive";
import { bootstrapShopRuntime } from "../services/shopify-sync.server";
import { authenticate } from "../shopify.server";
import appShellStyles from "../styles/app-shell.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appShellStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    await bootstrapShopRuntime(admin, session.shop);
  } catch (error) {
    console.error("AddressVerify config sync failed", error);
  }
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
  };
};

// The layout only provides apiKey/shop and a one-time runtime bootstrap. Re-running it on every
// client navigation or keep-alive revalidation added several Admin API calls to each page view.
export const shouldRevalidate = () => false;

function appPath(path: string, shop: string | null, host: string | null) {
  if (!shop || !host) return path;
  const params = new URLSearchParams({ shop, host });
  return `${path}?${params.toString()}`;
}

export default function App() {
  const { apiKey, shop } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const shopParam = searchParams.get("shop") || shop;
  const hostParam = searchParams.get("host");

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <SessionKeepAlive shop={shop} />
      <NavMenu>
        <Link to={appPath("/app", shopParam, hostParam)} rel="home">
          Dashboard
        </Link>
        <Link to={appPath("/app/setup", shopParam, hostParam)}>Setup</Link>
        <Link to={appPath("/app/rules", shopParam, hostParam)}>Validation Rules</Link>
        <Link to={appPath("/app/settings", shopParam, hostParam)}>Settings</Link>
        <Link to={appPath("/app/analytics", shopParam, hostParam)}>Analytics</Link>
        <Link to={appPath("/app/billing", shopParam, hostParam)}>Billing</Link>
        <Link to={appPath("/app/help", shopParam, hostParam)}>Help</Link>
      </NavMenu>
      <div className="av-app">
        <Outlet />
      </div>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
