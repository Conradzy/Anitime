import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/marketplace';
import { badgeCounts } from '@/lib/notify';

/** GET — the bell menu: the latest notifications plus the two sidebar counts.
 * `?countsOnly=1` skips the list, which is what the sidebar polls for. */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const counts = await badgeCounts(user.id);
  if (new URL(req.url).searchParams.get('countsOnly')) return NextResponse.json({ counts });

  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { id: 'desc' },
    take: 40,
  });
  return NextResponse.json({
    counts,
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}

/** POST { ids?: number[] } — marks those notifications read, or all of them. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((n: unknown) => Number.isInteger(n)) : null;
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true, counts: await badgeCounts(user.id) });
}
