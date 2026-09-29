/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />

declare module "*.css?url" {
  const href: string;
  export default href;
}
