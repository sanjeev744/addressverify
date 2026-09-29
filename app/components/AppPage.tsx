import type { ComponentProps } from "react";
import { Page } from "@shopify/polaris";

type PageProps = ComponentProps<typeof Page>;

/** Shared full-width page shell for all AddressVerify admin screens. */
export function AppPage({ fullWidth = true, ...props }: PageProps) {
  return (
    <div className="av-page-block">
      <Page fullWidth={fullWidth} {...props} />
    </div>
  );
}
