import { reactExtension } from "@shopify/ui-extensions-react/checkout";
import { AddressBanner } from "./AddressBanner.jsx";

export default reactExtension("purchase.checkout.delivery-address.render-after", () => (
  <AddressBanner surface="checkout" />
));
