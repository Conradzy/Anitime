import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

// Where produce photos are kept.
//  - With SUPABASE_URL + SUPABASE_SECRET_KEY set: Supabase Storage bucket
//    "listing-photos" (public read, written only by this server).
//  - Otherwise: the local ".uploads" folder, served through /api/uploads/...
//    (fine for development; use Supabase Storage when deployed).
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = 'listing-photos';
const LOCAL_DIR = path.join(process.cwd(), '.uploads');

export const usingSupabaseStorage = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** <userId>/<uuid>.<ext> — the only shape of path we ever accept or produce. */
export const PHOTO_PATH_RE = /^\d+\/[a-f0-9-]{36}\.(jpg|png|webp)$/;

export const PHOTO_TYPES = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;
export type PhotoExt = keyof typeof PHOTO_TYPES;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Detects the real image type from the file's first bytes (the browser's
 * claimed type and filename can't be trusted). */
export function sniffImage(b: Uint8Array): PhotoExt | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

function supabaseHeaders(extra: Record<string, string> = {}) {
  const h: Record<string, string> = { apikey: SUPABASE_KEY!, ...extra };
  // Legacy service_role keys are JWTs and go in Authorization too; the newer
  // sb_secret_… keys are sent as apikey only.
  if (SUPABASE_KEY!.startsWith('eyJ')) h.Authorization = `Bearer ${SUPABASE_KEY}`;
  return h;
}

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: MAX_PHOTO_BYTES,
      allowed_mime_types: Object.values(PHOTO_TYPES),
    }),
  });
  // 200 = created; an "already exists" response is fine too.
  if (!res.ok) {
    const text = await res.text();
    if (!/already exists|Duplicate/i.test(text)) throw new Error(`Could not prepare the photo bucket: ${text}`);
  }
  bucketReady = true;
}

export function photoUrl(storagePath: string): string {
  return usingSupabaseStorage
    ? `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`
    : `/api/uploads/${storagePath}`;
}

export async function savePhoto(storagePath: string, bytes: Uint8Array, contentType: string) {
  if (usingSupabaseStorage) {
    await ensureBucket();
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method: 'POST',
      headers: supabaseHeaders({ 'Content-Type': contentType, 'x-upsert': 'false' }),
      body: bytes as unknown as BodyInit,
    });
    if (!res.ok) throw new Error(`Photo upload failed: ${await res.text()}`);
    return;
  }
  const file = path.join(LOCAL_DIR, storagePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

/** Local-storage only: reads a saved photo back for /api/uploads/... */
export async function readLocalPhoto(storagePath: string): Promise<Buffer | null> {
  if (!PHOTO_PATH_RE.test(storagePath)) return null;
  try {
    return await readFile(path.join(LOCAL_DIR, storagePath));
  } catch {
    return null;
  }
}
