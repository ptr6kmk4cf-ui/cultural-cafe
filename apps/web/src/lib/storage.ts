import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { randomToken } from './crypto';
import { HttpError } from './http';

/**
 * Private photo storage. Files live outside the public web root and are only
 * served through an authenticated route that checks ownership.
 * Swap `LocalStorage` for an S3/R2/GCS implementation with private buckets +
 * short-lived signed URLs in production.
 */
interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalStorage implements StorageDriver {
  constructor(private root: string) {}
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Invalid storage key');
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data, { mode: 0o600 });
  }
  get(key: string) {
    return readFile(this.resolve(key));
  }
  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

export const storage: StorageDriver = new LocalStorage(path.resolve(process.cwd(), process.env.PHOTO_STORAGE_DIR || './storage/photos'));

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

/**
 * Validates by decoding (not by trusting the filename / MIME header), re-encodes,
 * auto-rotates and strips ALL metadata (EXIF incl. GPS location, XMP, IPTC).
 */
export async function processUpload(userId: string, input: Buffer) {
  if (input.length > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Photo is larger than 10 MB');
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new HttpError(415, 'File is not a valid image');
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new HttpError(415, 'Only JPEG, PNG and WebP images are supported');
  }
  const pipeline = sharp(input).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true });
  const out =
    meta.format === 'png'
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
      : meta.format === 'webp'
        ? await pipeline.webp({ quality: 86 }).toBuffer({ resolveWithObject: true })
        : await pipeline.jpeg({ quality: 86, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const ext = meta.format === 'jpeg' ? 'jpg' : meta.format;
  const key = `${userId}/${randomToken(16)}.${ext}`;
  await storage.put(key, out.data);
  return {
    storageKey: key,
    mimeType: `image/${meta.format}`,
    width: out.info.width,
    height: out.info.height,
    sizeBytes: out.data.length,
  };
}
