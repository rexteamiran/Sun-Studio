import { ProviderError, friendlyNetworkError } from "./types";

export interface ImageFailure { index: number; status: number; message: string; taskId?: string; }
export class ImageBatchError extends ProviderError {
  constructor(readonly images: string[], readonly failures: ImageFailure[], readonly taskIds: string[] = []) {
    super(failures[0]?.message || "The image request failed.", failures[0]?.status || 0);
    this.name = "ImageBatchError";
  }
}
export function imageFailure(error: unknown, index: number, taskId?: string): ImageFailure {
  const err = friendlyNetworkError(error);
  return { index, status: err instanceof ProviderError ? err.status : 0, message: err.message,
    ...(taskId ? { taskId } : {}) };
}
/** Persist each output before submitting more paid work; never retry an operation. */
export async function runSequentialImages(count: number | undefined, generateOne: () => Promise<string[]>,
  onImage?: (base64: string) => Promise<void>): Promise<string[]> {
  const total = Math.min(4, Math.max(1, Math.floor(Number(count) || 1)));
  const images: string[] = [];
  for (let index = 0; index < total; index++) {
    let one: string[];
    try { one = await generateOne(); }
    catch (error) { throw new ImageBatchError(images, [imageFailure(error, index)]); }
    for (const base64 of one) {
      images.push(base64);
      await onImage?.(base64);
    }
  }
  return images;
}
