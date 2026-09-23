import { prisma } from '@/lib/prisma';
import type { NotificationType } from '@/lib/generated/prisma/client';

type NewNotification = {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
};

/** Adds bell-menu entries. Never throws: a notification is a nice-to-have, so
 * a failure here must not undo the offer or delivery step that caused it. */
export async function notify(items: NewNotification | NewNotification[]) {
  const rows = (Array.isArray(items) ? items : [items]).map((n) => ({
    userId: n.userId,
    type: n.type,
    title: n.title.slice(0, 160),
    body: n.body?.slice(0, 400) ?? null,
    link: n.link ?? null,
  }));
  if (rows.length === 0) return;
  try {
    await prisma.notification.createMany({ data: rows });
  } catch (e) {
    console.error('could not save notification', e);
  }
}

/** Unread counts for the sidebar: the bell badge and the Messages badge. */
export async function badgeCounts(userId: number) {
  const [notifications, messages] = await Promise.all([
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.message.count({
      where: {
        readAt: null,
        senderId: { not: userId },
        type: { not: 'SYSTEM' },
        conversation: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      },
    }),
  ]);
  return { notifications, messages };
}
