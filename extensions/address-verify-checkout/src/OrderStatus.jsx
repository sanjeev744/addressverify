import { reactExtension } from "@shopify/ui-extensions-react/checkout";
import { ThankYouAddressWidget } from "./ThankYouAddressWidget.jsx";

export default reactExtension("customer-account.order-status.block.render", () => (
  <ThankYouAddressWidget />
));
