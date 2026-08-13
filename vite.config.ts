// Standalone Vite config — replaces @lovable.dev/vite-tanstack-config.
// Reproduces the plugin stack the Lovable wrapper composed internally:
//   tsConfigPaths, tailwindcss, TanStack Start (server entry -> src/server.ts),
//   Nitro (build-only, cloudflare-module preset + nodeCompat + deployConfig),
//   React. Plus React/TanStack dedupe. VITE_* env vars are injected by Vite
//   natively — no plugin needed. The Worker name is pinned to "kriterion".
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
  resolve: {
    alias: { "@": `${process.cwd()}/src` },
    // React 19 + TanStack must be single-instance to avoid duplicate-React bugs.
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
      // Redirect the bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    // Nitro is only needed for the production build (it emits the Cloudflare Worker
    // + wrangler.json). Skip it during `vite dev`.
    ...(command === "build"
      ? [
          nitro({
            preset: "cloudflare-module",
            cloudflare: {
              nodeCompat: true,
              deployConfig: true,
              wrangler: { name: "kriterion" },
            },
          }),
        ]
      : []),
    viteReact(),
  ],
}));
