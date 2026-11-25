import { Store } from "./store";
import { Gallery } from "./gallery";
import { ProviderError } from "./providers/types";
import { readSecrets } from "./secrets";

export const APP_VERSION = "0.0.13";

export const store = new Store();
export const gallery = new Gallery();

const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i;

/** Parse a browser data URL into { mime, data(base64) }. */
export function parseDataUrl(s: unknown): { mime: string; data: string } | null {
  if (typeof s !== "string") return null;
  const m = DATA_URL_RE.exec(s.trim());
  if (!m) return null;
  return { mime: m[1].toLowerCase(), data: m[2] };
}

/** Preserve useful provider messages without reflecting credentials into the UI. */
export function publicErrorMessage(e: unknown): string {
  const fallback = "The request failed. Please check the provider settings and try again.";
  let message = e instanceof Error ? e.message : typeof e === "string" ? e : fallback;
  try {
    const values = [
      ...Object.values(readSecrets()),
      process.env.SUN_LOCAL_API_TOKEN || "",
      process.env.SUN_SECRETS_KEY || "",
      process.env.SUN_LOCAL_API_READY_KEY || "",
    ].filter((value): value is string => typeof value === "string" && value.length > 0);
    const variants = new Set(values.flatMap((value) => [
      value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1),
    ]));
    for (const secret of [...variants].sort((a, b) => b.length - a.length)) {
      message = message.split(secret).join("[REDACTED]");
    }
  } catch {
    return fallback;
  }
  message = message
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:key|api[_-]?key|token|access_token)=)[^\s&#"<>]+/gi, "$1[REDACTED]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  return message.trim().slice(0, 1000) || fallback;
}

export function jsonError(e: unknown, fallbackStatus = 500): { error: string; status: number } {
  const err = e as ProviderError | null | undefined;
  const status = typeof err?.status === "number" && Number.isInteger(err.status)
    && err.status >= 400 && err.status <= 599 ? err.status : fallbackStatus;
  return { error: publicErrorMessage(e), status };
}

/** Resolve quality/imageSize depending on what the provider supports. */
export function qualityParams(
  meta: { qualities: string[] | null; resolutions: string[] | null },
  body: { quality?: string; imageSize?: string },
  settings: { quality: string; imageSize: string }
): { quality?: string; imageSize?: string; label: string } {
  if (meta.resolutions) {
    const imageSize = meta.resolutions.includes(body.imageSize || settings.imageSize)
      ? body.imageSize || settings.imageSize
      : settings.imageSize;
    return { imageSize, label: imageSize };
  }
  const q = meta.qualities && meta.qualities.includes(body.quality || settings.quality)
    ? body.quality || settings.quality
    : settings.quality;
  return { quality: q, label: q };
}

export function clampN(n: unknown): number {
  return Math.min(4, Math.max(1, Number(n) || 1));
}
