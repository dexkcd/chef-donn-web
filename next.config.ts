import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen in this app is per-user and per-request (session cookie), so we use the
  // classic dynamic-rendering model instead of Cache Components. See CLAUDE.md.
  cacheComponents: false,
  typedRoutes: true,
  // Receipts + the app shell are served to phones on patchy island signal; keep Server
  // Actions pending through drops and expose `useOffline()` for the sync indicator.
  experimental: {
    useOffline: true,
  },
  serverExternalPackages: ["postgres"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
