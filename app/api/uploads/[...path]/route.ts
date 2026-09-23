import { readLocalPhoto, PHOTO_TYPES, type PhotoExt } from '@/lib/storage';

/** Serves photos saved to the local .uploads folder (development fallback
 * when Supabase Storage isn't configured). Only paths of the exact shape
 * <userId>/<uuid>.<ext> are readable, so this can't be used to read other files. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const storagePath = (await params).path.join('/');
  const bytes = await readLocalPhoto(storagePath);
  if (!bytes) return new Response('Not found', { status: 404 });

  const ext = storagePath.split('.').pop() as PhotoExt;
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': PHOTO_TYPES[ext],
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
