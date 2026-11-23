import path from "path";
import fs from "fs";

/**
 * Data directory for everything the local server persists.
 * Override with SUN_STUDIO_DATA (e.g. to keep data out of the app folder).
 * Layout:  data/settings.json   — non-secret settings (no keys, Hermes-style)
 *          data/secrets.env     — API keys, one KEY=VALUE per line, mode 0600
 *          data/gallery/        — generated images + index.json
 */
export function dataDir(): string {
  const explicit = process.env.SUN_STUDIO_DATA;
  if (explicit && explicit.trim()) return path.resolve(explicit.trim());
  return path.resolve(process.cwd(), "data");
}

export function ensureDataDir(): string {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
