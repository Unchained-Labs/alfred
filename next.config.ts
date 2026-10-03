import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "imapflow", "mailparser"],
  // The dev badge defaults to bottom-left, where it covers the theme toggle.
  devIndicators: { position: "bottom-right" },
  experimental: {
    // Keeps the SQLite handle a true singleton across dev hot reloads.
    serverComponentsHmrCache: true,
  },
};

export default nextConfig;
