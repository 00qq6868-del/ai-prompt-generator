/** @type {import('next').NextConfig} */
// [S5 FIX] Switched from next-pwa (incompatible with App Router) to @ducanh2912/next-pwa
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  register: true,
  skipWaiting: true,
  // Enable in dev too so phones can install PWA while testing on LAN
  disable: false,
  runtimeCaching: [
    {
      // API routes: always network-first, never cache — responses depend on API keys
      urlPattern: /^https?:\/\/[^/]+\/api\/.*/i,
      handler: "NetworkOnly",
    },
    {
      // Everything else: network-first with 10s timeout, then serve cache
      urlPattern: /^https?.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "ai-prompt-cache",
        expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
        networkTimeoutSeconds: 10,
      },
    },
  ],
});

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // [S4 FIX] Next.js 14 uses experimental.serverComponentsExternalPackages
  experimental: {
    serverComponentsExternalPackages: ["@anthropic-ai/sdk", "sharp"],
  },
  // [C4 FIX] Do NOT inject a placeholder MODELS_REGISTRY_URL here.
  // When the env var is unset, model-cache.ts falls back to the bundled list automatically.
};

module.exports = withPWA(nextConfig);
