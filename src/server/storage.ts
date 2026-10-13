/**
 * Where receipt photos live. `fs` for dev/tests; `s3` for production (Railway buckets are
 * S3-compatible). Files are private — they're only ever served through an authenticated route.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { env } from "./env";

export interface StorageDriver {
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}

class FsStorage implements StorageDriver {
  constructor(private readonly root: string) {}
  private path(key: string) {
    const p = resolve(this.root, key);
    if (!p.startsWith(resolve(this.root))) throw new Error("bad storage key");
    return p;
  }
  async put(key: string, bytes: Uint8Array) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, bytes);
  }
  async get(key: string) {
    return new Uint8Array(await readFile(this.path(key)));
  }
}

class S3Storage implements StorageDriver {
  private clientPromise: Promise<import("@aws-sdk/client-s3").S3Client> | null = null;
  private client() {
    this.clientPromise ??= import("@aws-sdk/client-s3").then(
      ({ S3Client }) =>
        new S3Client({
          endpoint: env.s3.endpoint,
          region: env.s3.region,
          forcePathStyle: env.s3.forcePathStyle,
          credentials: env.s3.accessKeyId && env.s3.secretAccessKey ? { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey } : undefined,
        }),
    );
    return this.clientPromise;
  }
  async put(key: string, bytes: Uint8Array, mime: string) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.client()).send(new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, Body: bytes, ContentType: mime }));
  }
  async get(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const out = await (await this.client()).send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    if (!out.Body) throw new Error(`missing object ${key}`);
    return out.Body.transformToByteArray();
  }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  driver ??= env.storageDriver === "s3" ? new S3Storage() : new FsStorage(join(process.cwd(), env.storageDir));
  return driver;
}
