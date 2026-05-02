/** @type {import('next').NextConfig} */
// @ducanh2912/next-pwa — compatible with App Router
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  fallbacks: {
    document: "/offline",
  },
  runtimeCaching: [
    {
      // /api/generate — never cache (LLM responses are unique)
      urlPattern: /\/api\/generate/i,
      handler: "NetworkOnly",
    },
    {
      // /api/models — stale-while-revalidate, 1 hour
      urlPattern: /\/api\/models/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "api-models-cache",
        expiration: { maxEntries: 5, maxAgeSeconds: 3600 },
      },
    },
    {
      // Other API routes — network only
      urlPattern: /\/api\//i,
      handler: "NetworkOnly",
    },
    {
      // JS/CSS static assets — cache first
      urlPattern: /\/_next\/static\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "static-assets",
        expiration: { maxEntries: 200, maxAgeSeconds: 30 * 86400 },
      },
    },
    {
      // Fonts + images
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico|webp|woff2?|ttf|eot)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "media-cache",
        expiration: { maxEntries: 100, maxAgeSeconds: 30 * 86400 },
      },
    },
    {
      // HTML pages — network first with 10s timeout
      urlPattern: /^https?.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "pages-cache",
        expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
        networkTimeoutSeconds: 10,
      },
    },
  ],
});

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@anthropic-ai/sdk", "sharp"],
  },
};

module.exports = withPWA(nextConfig);
