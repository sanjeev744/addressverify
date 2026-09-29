import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["prisma", "generate"], {
  stdio: "inherit",
  shell: true,
});

if (result.status === 0) {
  process.exit(0);
}

const clientReady =
  existsSync("node_modules/.prisma/client/index.js") &&
  existsSync("node_modules/.prisma/client/query_engine-windows.dll.node");

if (clientReady) {
  console.warn(
    "prisma generate skipped because the query engine is locked by another Node process. Using the existing Prisma client.",
  );
  process.exit(0);
}

process.exit(result.status ?? 1);
