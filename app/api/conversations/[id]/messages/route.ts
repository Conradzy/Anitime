import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notify';
import { requireUser } from '@/lib/marketplace';
import { PHOTO_PATH_RE, photoUrl } from '@/lib/storage';

const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_LEAD_MS = 5 * 60 * 1000; // a schedule may not be more than 5 minutes in the past
const MAX_AHEAD_MS = 366 * 24 * 3600 * 1000;

/** Picture paths come back from /api/uploads. Only ones this user uploaded are
 * accepted, and the URLs are rebuilt here rather than trusted. */
function cleanImages(raw: unknown, userId: number): { paths: string[] } | { error: string } {
  const list = Array.isArray(raw) ? raw.map((p) => String(p)) : [];
  if (list.length > MAX_IMAGES_PER_MESSAGE) return { error: `You can send up to ${MAX_IMAGES_PER_MESSAGE} pictures at once.` };
  if (list.some((p) => !PHOTO_PATH_RE.test(p) || !p.startsWith(`${userId}/`))) {
    return { error: 'A picture is not valid. Please attach it again.' };
  }
  return { paths: list };
}

/** POST — send a text message (optionally with pictures), or an offer / counteroffer.
 *   { type: 'TEXT', body?, images?: string[] }
 *   { type: 'OFFER', quantity, unitPrice, fulfillment, scheduledAt, buyerLat?, buyerLng?,
 *     buyerAddress?, message?, parentOfferId? }
 * Totals are recomputed here; the client's own arithmetic is never trusted. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const id = Number((await params).id);
  const conv = await prisma.conversation.findUnique({ where: { id }, include: { listing: true } });
  if (!conv || (conv.buyerId !== user.id && conv.sellerId !== user.id)) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }
  const side = conv.buyerId === user.id ? 'BUYER' : 'SELLER';
  const body = await req.json().catch(() => null);

  if (body?.type === 'OFFER') {
    const { listing } = conv;
    if (listing.status !== 'ACTIVE') return NextResponse.json({ error: 'This listing is no longer available.' }, { status: 409 });

    const quantity = Number(body.quantity);
    const unitPrice = Math.round(Number(body.unitPrice) * 100) / 100;
    if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: 'Enter a valid quantity.' }, { status: 400 });
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return NextResponse.json({ error: 'Enter a valid price.' }, { status: 400 });
    if (quantity > Number(listing.availableQuantity)) {
      return NextResponse.json({ error: `Only ${Number(listing.availableQuantity)} ${listing.unit} available.` }, { status: 400 });
    }
    if (listing.priceType === 'FIXED' && unitPrice !== Number(listing.unitPrice)) {
      return NextResponse.json({ error: 'This listing has a fixed price.' }, { status: 400 });
    }

    // ---- delivery or pickup, and when ---------------------------------------------
    // The seller already said how this product changes hands when they posted
    // it; the offer only gets a say when the listing allows both.
    const asked = body.fulfillment === 'DELIVERY' ? ('DELIVERY' as const) : ('PICKUP' as const);
    const fulfillment = listing.fulfillment === 'BOTH' ? asked : (listing.fulfillment as 'DELIVERY' | 'PICKUP');
    if (listing.fulfillment !== 'BOTH' && asked !== fulfillment) {
      return NextResponse.json(
        { error: `This listing is ${fulfillment === 'PICKUP' ? 'pickup' : 'delivery'} only.` },
        { status: 400 }
      );
    }
    const scheduledAt = new Date(String(body.scheduledAt ?? ''));
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: `Choose a date and time for the ${fulfillment === 'DELIVERY' ? 'delivery' : 'pickup'}.` }, { status: 400 });
    }
    if (scheduledAt.getTime() < Date.now() - MAX_LEAD_MS) {
      return NextResponse.json({ error: 'That date and time has already passed.' }, { status: 400 });
    }
    if (scheduledAt.getTime() > Date.now() + MAX_AHEAD_MS) {
      return NextResponse.json({ error: 'Choose a date within the next year.' }, { status: 400 });
    }

    const totalAmount = Math.round(quantity * unitPrice * 100) / 100;
    const note = String(body.message ?? '').trim().slice(0, 300) || null;

    try {
      const offer = await prisma.$transaction(async (tx) => {
        const parentId = body.parentOfferId ? Number(body.parentOfferId) : null;
        let parent = null;
        if (parentId) {
          parent = await tx.offer.findUnique({ where: { id: parentId } });
          if (!parent || parent.conversationId !== id || parent.status !== 'PENDING' || parent.proposedBy === side) {
            throw new Error('That offer can no longer be countered.');
          }
          await tx.offer.update({ where: { id: parentId }, data: { status: 'COUNTERED', respondedAt: new Date() } });
        } else if (await tx.offer.findFirst({ where: { conversationId: id, status: 'PENDING' } })) {
          throw new Error('There is already an offer waiting for a response.');
        }

        // The buyer's location belongs to the buyer: a seller's counteroffer
        // carries it over from the offer being answered, never a new one.
        let buyerLat: number | null = null;
        let buyerLng: number | null = null;
        let buyerAddress: string | null = null;
        if (side === 'SELLER') {
          buyerLat = parent?.buyerLat ?? null;
          buyerLng = parent?.buyerLng ?? null;
          buyerAddress = parent?.buyerAddress ?? null;
        } else if (body.buyerLat != null && body.buyerLng != null) {
          buyerLat = Number(body.buyerLat);
          buyerLng = Number(body.buyerLng);
          if (!(buyerLat >= -90 && buyerLat <= 90 && buyerLng >= -180 && buyerLng <= 180)) {
            throw new Error('That location is not valid.');
          }
          buyerAddress = String(body.buyerAddress ?? '').trim().slice(0, 200) || null;
        }
        // Delivery needs it so the seller knows where to go; pickup needs it so
        // both sides get a route, distance and travel time.
        if (buyerLat === null || buyerLng === null) {
          throw new Error(
            side === 'SELLER'
              ? "This offer has no buyer location, so it can't be countered. Ask the buyer to send a new offer."
              : fulfillment === 'DELIVERY'
                ? 'Set the delivery location first, so the seller knows where to bring it.'
                : 'Set your location first, so we can work out the route and travel time to the pickup.'
          );
        }

        const created = await tx.offer.create({
          data: {
            conversationId: id, listingId: listing.id, buyerId: conv.buyerId, sellerId: conv.sellerId,
            quantity, unit: listing.unit, unitPrice, totalAmount, message: note,
            proposedBy: side, parentOfferId: parentId,
            fulfillment, scheduledAt, buyerLat, buyerLng, buyerAddress,
          },
        });
        await tx.message.create({ data: { conversationId: id, senderId: user.id, type: 'OFFER', offerId: created.id } });
        await tx.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
        return created;
      });
      const other = side === 'BUYER' ? conv.sellerId : conv.buyerId;
      await notify({
        userId: other,
        type: 'OFFER',
        title: offer.parentOfferId ? 'You got a counter-offer' : 'You got a new offer',
        body: `${user.fullname} — ${quantity} ${listing.unit} of ${listing.crop} at ₱${unitPrice.toLocaleString('en-PH')} / ${listing.unit}.`,
        link: `/messages?c=${id}`,
      });
      return NextResponse.json({ offerId: offer.id }, { status: 201 });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not send the offer.' }, { status: 409 });
    }
  }

  // ---- plain message, with or without pictures -------------------------------------------
  const text = String(body?.body ?? '').trim();
  const images = cleanImages(body?.images, user.id);
  if ('error' in images) return NextResponse.json({ error: images.error }, { status: 400 });
  if (!text && images.paths.length === 0) return NextResponse.json({ error: 'Write a message or attach a picture.' }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: 'Message is too long.' }, { status: 400 });

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: id, senderId: user.id, type: 'TEXT', body: text || null,
        attachments: { create: images.paths.map((storagePath) => ({ storagePath, url: photoUrl(storagePath) })) },
      },
    }),
    prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } }),
  ]);
  await notify({
    userId: side === 'BUYER' ? conv.sellerId : conv.buyerId,
    type: 'SYSTEM',
    title: `New message from ${user.fullname}`,
    body: text || `Sent ${images.paths.length} picture${images.paths.length === 1 ? '' : 's'}.`,
    link: `/messages?c=${id}`,
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
