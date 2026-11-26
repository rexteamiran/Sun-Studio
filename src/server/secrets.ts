import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { dataDir, ensureDataDir } from "./paths";

/**
 * Secrets file — the Hermes pattern: API keys never live in the main config.
 * `secrets.env` holds one KEY=VALUE per line and is re-read on every lookup so
 * a freshly saved key applies without restarting the server.
 */

export function secretsFile(): string {
  return path.join(dataDir(), "secrets.env");
}

function parse(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

/** Read every secret currently on disk (fresh on each call, like Hermes). */
export function readSecrets(): Record<string, string> {
  try {
    return parse(fs.readFileSync(secretsFile(), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return {};
    throw new Error("Credential storage could not be read. Existing data was kept.");
  }
}

export function getSecret(key: string): string | null {
  const secrets = readSecrets();
  return secrets[key] || null;
}

/** Insert or remove (value = null) one KEY=VALUE line, keeping 0600 perms. */
export async function upsertSecret(key: string, value: string | null): Promise<void> {
  const file = secretsFile();
  await ensureDataDir();
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  } catch {
    lines = [];
  }
  const kept = lines.filter(
    (l) => l.trim() && !l.trim().startsWith("#") && l.split("=", 1)[0].trim() !== key
  );
  if (value !== null && value !== "") kept.push(`${key}=${value}`);
  const body =
    "# Sun Studio API keys — this file never leaves this machine.\n" +
    kept.join("\n") +
    "\n";
  await fsp.writeFile(file, body, "utf8");
  await fsp.chmod(file, 0o600);
}
