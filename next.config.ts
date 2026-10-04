import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone: the server plus only the node_modules it actually
  // reaches. It is what makes a sane container image possible — without it the
  // runtime stage must carry the full dependency tree, build toolchain and all,
  // to run one server.
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "imapflow", "mailparser"],
  // The dev badge defaults to bottom-left, where it covers the theme toggle.
  devIndicators: { position: "bottom-right" },
  experimental: {
    // Keeps the SQLite handle a true singleton across dev hot reloads.
    serverComponentsHmrCache: true,
  },
};

export default nextConfig;
