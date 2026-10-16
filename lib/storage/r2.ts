import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { unstable_cache } from "next/cache";

// Server-only access to the R2 bucket behind NEXT_PUBLIC_CDN_BASE. Everything
// in it is public through the CDN, and every key is immutable: a changed file
// gets a new key (a book's text goes in a new v<n>/ folder), so nothing here
// ever invalidates a cache. Layout:
//   books/<slug>/{v<n>/book.json, v<n>/manifest.json, images/…, cover.<ext>, thumbnail.<ext>, source.<ext>, article.html}
//   uploads/<reader>/<uploadId>/…   an upload in flight, moved into books/<slug>/ on finalize
//   avatars/<reader>/…, voice-notes/…, site/…

let client: S3Client | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

export function r2Client(): S3Client {
  client ??= new S3Client({
    endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    region: "auto",
    credentials: { accessKeyId: requireEnv("R2_ACCESS_KEY_ID"), secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY") },
    // The SDK otherwise adds CRC32 checksum headers, which a presigned PUT
    // from the browser can't match.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

export const r2Bucket = () => requireEnv("R2_BUCKET");

const CDN_BASE = (process.env.NEXT_PUBLIC_CDN_BASE ?? "").replace(/\/$/, "");
export const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";

const isUrl = (value: string) => /^https?:\/\//.test(value);

/** Public CDN URL of a key; a full URL (an OpenLibrary cover, say) passes through. */
export function cdnUrl(keyOrUrl: string): string {
  return isUrl(keyOrUrl) ? keyOrUrl : `${CDN_BASE}/${keyOrUrl}`;
}

/** The key behind one of our CDN URLs, or null for anything else. */
export function keyFromCdnUrl(url: string): string | null {
  return url.startsWith(`${CDN_BASE}/`) ? url.slice(CDN_BASE.length + 1) : null;
}

export async function putObject(key: string, body: string | Uint8Array, contentType: string): Promise<void> {
  await r2Client().send(new PutObjectCommand({ Bucket: r2Bucket(), Key: key, Body: body, ContentType: contentType, CacheControl: CACHE_IMMUTABLE }));
}

export async function copyObject(from: string, to: string): Promise<void> {
  await r2Client().send(new CopyObjectCommand({ Bucket: r2Bucket(), CopySource: `${r2Bucket()}/${encodeURI(from)}`, Key: to }));
}

/** Size and content type, or null if the key doesn't exist. */
export async function headObject(key: string): Promise<{ size: number; contentType: string } | null> {
  try {
    const res = await r2Client().send(new HeadObjectCommand({ Bucket: r2Bucket(), Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? "" };
  } catch (err) {
    if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

/** Every object under `prefix`, with its size. */
export async function listObjects(prefix: string, max = Infinity): Promise<{ key: string; size: number }[]> {
  const out: { key: string; size: number }[] = [];
  let ContinuationToken: string | undefined;
  do {
    const res = await r2Client().send(
      new ListObjectsV2Command({ Bucket: r2Bucket(), Prefix: prefix, ContinuationToken, MaxKeys: Math.min(1000, max - out.length) })
    );
    for (const o of res.Contents ?? []) if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0 });
    ContinuationToken = res.IsTruncated && out.length < max ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return out;
}

/** Deletes `keys` (missing ones are fine), returning the ones that failed. */
export async function deleteObjects(keys: string[]): Promise<string[]> {
  const failed: string[] = [];
  for (let i = 0; i < keys.length; i += 1000) {
    const res = await r2Client().send(
      new DeleteObjectsCommand({ Bucket: r2Bucket(), Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } })
    );
    for (const error of res.Errors ?? []) if (error.Key) failed.push(error.Key);
  }
  return failed;
}

export async function deletePrefix(prefix: string): Promise<string[]> {
  return deleteObjects((await listObjects(prefix)).map((o) => o.key));
}

/** A URL the browser can PUT one object to for 15 minutes. With `size`, the
 * signature covers Content-Length, so a larger body is refused. */
export function presignPut(key: string, size?: number): Promise<string> {
  return getSignedUrl(r2Client(), new PutObjectCommand({ Bucket: r2Bucket(), Key: key, ContentLength: size }), { expiresIn: 900 });
}

/** Text of a key, read with credentials (not through the CDN), uncached. */
export async function fetchStorageText(key: string): Promise<string> {
  const object = await r2Client().send(new GetObjectCommand({ Bucket: r2Bucket(), Key: key }));
  if (!object.Body) throw new Error(`Empty R2 object ${key}`);
  return object.Body.transformToString();
}

/** Next's data cache drops any entry whose serialised form is over 2 MiB, so
 * objects are cached as base64 chunks under it: 1.4 MB of bytes is ~1.87 MB
 * of base64. A book of any size stays cached; most fit in one chunk. */
const CHUNK_BYTES = 1_400_000;
const CACHE_SECONDS = 60 * 60 * 24 * 365;

async function readRange(key: string, start: number, end: number): Promise<{ bytes: Uint8Array; size: number }> {
  const res = await fetch(cdnUrl(key), { headers: { Range: `bytes=${start}-${end}`, "Accept-Encoding": "identity" }, cache: "no-store" });
  if (res.status !== 200 && res.status !== 206) throw new Error(`Could not fetch ${key} (${res.status})`);
  const body = new Uint8Array(await res.arrayBuffer());
  // 200: the server ignored Range and sent the whole object.
  if (res.status === 200) return { bytes: body.subarray(start, end + 1), size: body.byteLength };
  return { bytes: body, size: Number(res.headers.get("content-range")?.split("/")[1]) };
}

/** Text of a key, fetched through the CDN and kept in Next's data cache for a
 * year whatever its size. Keys are immutable, so a cached copy is never stale.
 * Throws if the object can't be read. */
export async function readStorageText(key: string): Promise<string> {
  const cached = <T>(part: string, read: () => Promise<T>) => unstable_cache(read, ["r2", key, part], { revalidate: CACHE_SECONDS })();
  const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

  const first = await cached("0", async () => {
    const range = await readRange(key, 0, CHUNK_BYTES - 1);
    return { size: range.size, data: toBase64(range.bytes) };
  });
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, Math.ceil(first.size / CHUNK_BYTES) - 1) }, (_, i) => {
      const start = (i + 1) * CHUNK_BYTES;
      return cached(String(i + 1), async () => toBase64((await readRange(key, start, start + CHUNK_BYTES - 1)).bytes));
    })
  );
  const bytes = Buffer.concat([first.data, ...rest].map((chunk) => Buffer.from(chunk, "base64")));
  if (bytes.byteLength !== first.size) throw new Error(`${key}: assembled ${bytes.byteLength} bytes, expected ${first.size}`);
  return bytes.toString("utf8");
}
