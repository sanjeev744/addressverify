import { reactExtension } from "@shopify/ui-extensions-react/checkout";
import { ThankYouAddressWidget } from "./ThankYouAddressWidget.jsx";

export default reactExtension("purchase.thank-you.customer-information.render-after", () => (
  <ThankYouAddressWidget />
));
