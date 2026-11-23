import { Store } from "./store";
import { Gallery } from "./gallery";
import { ProviderError } from "./providers/types";

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

export function jsonError(e: unknown, fallbackStatus = 500): { error: string; status: number } {
  const err = e as ProviderError;
  const status = typeof err?.status === "number" && err.status >= 400 && err.status <= 599 ? err.status : fallbackStatus;
  return { error: err?.message || String(e), status };
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
