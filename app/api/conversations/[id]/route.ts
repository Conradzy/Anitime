import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, sellerBadges, serializeOffer } from '@/lib/marketplace';

/** GET — one chat with its messages, pictures, offer cards and (if any) the
 * transaction an accepted offer started. Opening it marks the other person's
 * messages as read. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const id = Number((await params).id);
  const c = await prisma.conversation.findUnique({
    where: { id },
    include: {
      listing: true,
      buyRequest: true,
      messages: { orderBy: { createdAt: 'asc' }, include: { offer: true, attachments: { orderBy: { id: 'asc' } } } },
      offers: { include: { transaction: true } },
    },
  });
  if (!c || (c.buyerId !== user.id && c.sellerId !== user.id)) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  await prisma.message.updateMany({
    where: { conversationId: id, readAt: null, senderId: { not: user.id } },
    data: { readAt: new Date() },
  });

  const otherId = c.buyerId === user.id ? c.sellerId : c.buyerId;
  const badges = await sellerBadges([otherId, user.id]);
  // A chat can hold several deals over time (each accepted offer is one). Show
  // the live one if there is one, otherwise the most recent.
  const deals = c.offers.map((o) => o.transaction).filter((t) => t !== null).sort((a, b) => b.id - a.id);
  const tx = deals.find((t) => t.status === 'ACTIVE') ?? deals[0];

  // Normalised the same way whether this chat is about a listing (a seller's
  // stock) or a buy request (a buyer's want) — everything downstream reads
  // this one shape and only checks `kind` where the two genuinely differ
  // (who has to supply a location on their offer).
  const listing = c.listing
    ? {
        id: c.listing.id,
        title: `${c.listing.crop} — ${c.listing.variety}`,
        unit: c.listing.unit,
        unitPrice: Number(c.listing.unitPrice),
        priceType: c.listing.priceType,
        quantity: Number(c.listing.quantity),
        availableQuantity: Number(c.listing.availableQuantity),
        paymentMethods: c.listing.paymentMethods,
        status: c.listing.status,
        location: c.listing.location,
        fulfillment: c.listing.fulfillment,
        kind: 'LISTING' as const,
      }
    : {
        id: c.buyRequest!.id,
        title: `Wants: ${c.buyRequest!.crop} — ${c.buyRequest!.variety}`,
        unit: c.buyRequest!.unit,
        unitPrice: c.buyRequest!.targetPrice === null ? 0 : Number(c.buyRequest!.targetPrice),
        priceType: c.buyRequest!.priceType,
        quantity: Number(c.buyRequest!.quantity),
        availableQuantity: Number(c.buyRequest!.remainingQuantity),
        paymentMethods: c.buyRequest!.paymentMethods,
        status: c.buyRequest!.status,
        location: c.buyRequest!.location,
        fulfillment: c.buyRequest!.fulfillment,
        kind: 'BUY_REQUEST' as const,
      };

  return NextResponse.json({
    id: c.id,
    role: c.buyerId === user.id ? 'BUYER' : 'SELLER',
    meId: user.id,
    me: badges.get(user.id) ?? null,
    other: badges.get(otherId) ?? null,
    listing,
    transaction: tx
      ? {
          id: tx.id,
          code: tx.transactionCode,
          quantity: Number(tx.quantity),
          unit: tx.unit,
          agreedUnitPrice: Number(tx.agreedUnitPrice),
          totalAmount: Number(tx.totalAmount),
          status: tx.status,
          paymentStatus: tx.paymentStatus,
          deliveryStatus: tx.deliveryStatus,
          fulfillment: tx.fulfillment,
          scheduledAt: tx.scheduledAt ? tx.scheduledAt.toISOString() : null,
          distanceKm: tx.distanceKm === null ? null : Number(tx.distanceKm),
        }
      : null,
    messages: c.messages.map((m) => ({
      id: m.id,
      type: m.type,
      body: m.body,
      mine: m.senderId === user.id,
      createdAt: m.createdAt.toISOString(),
      offer: m.offer ? serializeOffer(m.offer) : null,
      images: m.attachments.map((a) => a.url),
    })),
  });
}
