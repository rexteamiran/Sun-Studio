import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone server bundled into the Electron NSIS app by prepare-electron.mjs.
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
