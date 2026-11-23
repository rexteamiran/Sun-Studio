import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for the release zip: .next/standalone + node server.js
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
