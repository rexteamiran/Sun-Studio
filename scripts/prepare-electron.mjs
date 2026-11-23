#!/usr/bin/env node
/**
 * Assemble the Electron payload: copy the Next.js standalone server into
 * server/ (packed by electron-builder as resources/app/server).
 *
 *   .next/standalone/.   → server/            (server.js + node_modules + .next/server)
 *   .next/static         → server/.next/static (client chunks — must sit next to the server build)
 */
import { rmSync, cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const staticDir = path.join(root, ".next", "static");
const out = path.join(root, "server");

if (!existsSync(standalone)) {
  console.error("server/: missing .next/standalone — run `npm run build` first.");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
cpSync(standalone, out, { recursive: true });
if (existsSync(staticDir)) {
  cpSync(staticDir, path.join(out, ".next", "static"), { recursive: true });
}
mkdirSync(path.join(out, "data"), { recursive: true });
console.log("server/ assembled:", existsSync(path.join(out, "server.js")) ? "server.js ok" : "MISSING server.js");
