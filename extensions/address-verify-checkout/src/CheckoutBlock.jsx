import { reactExtension } from "@shopify/ui-extensions-react/checkout";
import { AddressBanner } from "./AddressBanner.jsx";

export default reactExtension("purchase.checkout.block.render", () => (
  <AddressBanner surface="checkout" />
));
