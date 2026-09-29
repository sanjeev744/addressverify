// pm2 process definition for the production server.
// Start/reload with: pm2 startOrReload ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: "addressvalidator",
      cwd: __dirname,
      script: "node_modules/@remix-run/serve/dist/cli.js",
      args: "./build/server/index.js",
      // Load SHOPIFY_*, DATABASE_URL, etc. from .env so restarts never depend on the shell's environment.
      node_args: "--env-file=.env",
      env: {
        PORT: "3001",
        NODE_ENV: "production",
      },
    },
  ],
};
