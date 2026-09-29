import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = process.env.SHOPIFY_FLAG_LOCALHOST_PORT || "3458";
const cloudflared =
  process.env.SHOPIFY_CLI_CLOUDFLARED_PATH ||
  path.join(
    process.env.APPDATA || "",
    "npm/node_modules/@shopify/cli/bin/cloudflared.exe",
  );

if (!existsSync(cloudflared)) {
  console.error(`cloudflared not found at ${cloudflared}`);
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
const tunnel = spawn(
  cloudflared,
  ["tunnel", "--protocol", "http2", "--url", `http://localhost:${PORT}`, "--no-autoupdate"],
  { stdio: ["ignore", "pipe", "pipe"] },
);

let started = false;
const onData = (chunk) => {
  const text = chunk.toString();
  process.stderr.write(text);
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (!match || started) return;
  started = true;
  const child = spawn(
    "npx",
    [
      "shopify",
      "app",
      "dev",
      "--skip-dependencies-installation",
      "--tunnel-url",
      `${match[0]}:${PORT}`,
      ...extraArgs,
    ],
    { stdio: "inherit", shell: true },
  );
  child.on("exit", (code) => {
    tunnel.kill();
    process.exit(code ?? 0);
  });
};

tunnel.stdout.on("data", onData);
tunnel.stderr.on("data", onData);
tunnel.on("exit", (code) => {
  if (!started) process.exit(code ?? 1);
});
