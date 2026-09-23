import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/marketplace';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** GET — the "This week" card in the home sidebar: how many of this user's
 * listings are live right now, and how many buyers started a chat about one
 * of them in the last 7 days (a chat is the closest thing this app has to an
 * "inquiry" — it is opened the moment a buyer wants to ask about a listing). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const since = new Date(Date.now() - WEEK_MS);
  const [activeListings, buyerInquiries] = await Promise.all([
    prisma.listing.count({ where: { sellerId: user.id, status: 'ACTIVE' } }),
    prisma.conversation.count({ where: { sellerId: user.id, createdAt: { gte: since } } }),
  ]);

  return NextResponse.json({ activeListings, buyerInquiries });
}
