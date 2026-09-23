import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireUser } from '@/lib/marketplace';
import { MAX_PHOTO_BYTES, PHOTO_TYPES, photoUrl, savePhoto, sniffImage } from '@/lib/storage';

/** POST multipart/form-data { file } — stores one produce photo and returns
 * its storage path + URL. The listing form sends the path back when the
 * product is published, and only then is it attached to a listing. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: 'Each photo must be 5 MB or smaller.' }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniffImage(bytes);
  if (!ext) return NextResponse.json({ error: 'Only PNG, JPG or WEBP photos are allowed.' }, { status: 415 });

  const storagePath = `${user.id}/${randomUUID()}.${ext}`;
  try {
    await savePhoto(storagePath, bytes, PHOTO_TYPES[ext]);
  } catch (e) {
    console.error('photo upload failed', e);
    return NextResponse.json({ error: 'Could not store the photo. Please try again.' }, { status: 502 });
  }
  return NextResponse.json({ path: storagePath, url: photoUrl(storagePath) }, { status: 201 });
}
