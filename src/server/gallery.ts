import fsp from "fs/promises";
import path from "path";
import { dataDir, ensureDataDir } from "./paths";

/**
 * Local gallery — generated images are saved server-side under data/gallery/
 * with an index.json of metadata. No Electron, no nativeImage: thumbnails are
 * handled by the browser (lazy-loaded full files, scaled by CSS).
 */

export interface GalleryMeta {
  kind: string;
  provider: string;
  prompt: string;
  model: string;
  aspect?: string;
  quality?: string;
  source?: string;
}

export interface GalleryItem extends GalleryMeta {
  id: string;
  file: string;
  ext: string;
  createdAt: number;
}

function sniffExt(buf: Buffer): "png" | "jpg" | "webp" | "bin" {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf.length > 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP")
    return "webp";
  return "bin";
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  bin: "application/octet-stream",
};

export class Gallery {
  dir: string;
  indexFile: string;
  index: GalleryItem[] = [];
  loaded = false;

  constructor() {
    this.dir = path.join(dataDir(), "gallery");
    this.indexFile = path.join(this.dir, "index.json");
  }

  async ensure(): Promise<void> {
    await ensureDataDir();
    await fsp.mkdir(this.dir, { recursive: true });
    if (!this.loaded) {
      try {
        const j = JSON.parse(await fsp.readFile(this.indexFile, "utf8"));
        this.index = Array.isArray(j) ? j : [];
      } catch {
        this.index = [];
      }
      this.loaded = true;
    }
  }

  async _writeIndex(): Promise<void> {
    await fsp.writeFile(this.indexFile, JSON.stringify(this.index, null, 2), "utf8");
  }

  async saveBuffer(buf: Buffer, meta: GalleryMeta): Promise<GalleryItem> {
    await this.ensure();
    const id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
    const ext = sniffExt(buf);
    const file = `${id}.${ext}`;
    await fsp.writeFile(path.join(this.dir, file), buf);
    const item: GalleryItem = { id, file, ext, createdAt: Date.now(), ...meta };
    this.index.unshift(item);
    await this._writeIndex();
    return item;
  }

  async list(): Promise<GalleryItem[]> {
    await this.ensure();
    return this.index.map((i) => ({ ...i }));
  }

  get(id: string): GalleryItem | null {
    return this.index.find((i) => i.id === id) || null;
  }

  filePath(item: GalleryItem): string {
    return path.join(this.dir, item.file);
  }

  mimeOf(item: GalleryItem): string {
    return MIME[item.ext] || MIME.bin;
  }

  async remove(id: string): Promise<void> {
    await this.ensure();
    const it = this.get(id);
    if (!it) return;
    try {
      await fsp.unlink(this.filePath(it));
    } catch {
      /* already gone */
    }
    this.index = this.index.filter((i) => i.id !== id);
    await this._writeIndex();
  }
}
