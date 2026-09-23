import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/marketplace';
import { PHOTO_PATH_RE, photoUrl } from '@/lib/storage';

/** POST { path } — makes an already-uploaded picture (from /api/uploads) the
 * user's profile picture. It then shows next to their name on listings, in
 * chats and on the Deliveries page. Only a picture this user uploaded is
 * accepted, and the URL is rebuilt here rather than trusted. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const path = String(body?.path ?? '');
  if (!PHOTO_PATH_RE.test(path) || !path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: 'That picture is not valid. Please upload it again.' }, { status: 400 });
  }

  const url = photoUrl(path);
  await prisma.userProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, profilePhotoUrl: url },
    update: { profilePhotoUrl: url },
  });
  return NextResponse.json({ url });
}

/** DELETE — goes back to showing initials. */
export async function DELETE() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  await prisma.userProfile.updateMany({ where: { userId: user.id }, data: { profilePhotoUrl: null } });
  return NextResponse.json({ ok: true });
}
