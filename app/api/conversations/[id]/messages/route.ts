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
  const conv = await prisma.conversation.findUnique({ where: { id }, include: { listing: true, buyRequest: true } });
  if (!conv || (conv.buyerId !== user.id && conv.sellerId !== user.id)) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }
  const side = conv.buyerId === user.id ? 'BUYER' : 'SELLER';
  const body = await req.json().catch(() => null);

  if (body?.type === 'OFFER') {
    // A listing offer is against a seller's stock; a buy-request offer is
    // against a buyer's want. Everything below reads from this one normalised
    // shape and only branches where the two genuinely differ.
    const kind: 'LISTING' | 'BUY_REQUEST' = conv.listing ? 'LISTING' : 'BUY_REQUEST';
    const source = kind === 'LISTING'
      ? {
          crop: conv.listing!.crop, unit: conv.listing!.unit, status: conv.listing!.status,
          available: Number(conv.listing!.availableQuantity), priceType: conv.listing!.priceType,
          fixedPrice: Number(conv.listing!.unitPrice), fulfillmentSetting: conv.listing!.fulfillment,
        }
      : {
          crop: conv.buyRequest!.crop, unit: conv.buyRequest!.unit, status: conv.buyRequest!.status,
          available: Number(conv.buyRequest!.remainingQuantity), priceType: conv.buyRequest!.priceType,
          fixedPrice: conv.buyRequest!.targetPrice === null ? 0 : Number(conv.buyRequest!.targetPrice),
          fulfillmentSetting: conv.buyRequest!.fulfillment,
        };
    if (source.status !== 'ACTIVE') {
      return NextResponse.json({ error: kind === 'LISTING' ? 'This listing is no longer available.' : 'This buy request is no longer open.' }, { status: 409 });
    }

    const quantity = Number(body.quantity);
    const unitPrice = Math.round(Number(body.unitPrice) * 100) / 100;
    if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: 'Enter a valid quantity.' }, { status: 400 });
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return NextResponse.json({ error: 'Enter a valid price.' }, { status: 400 });
    if (quantity > source.available) {
      return NextResponse.json({ error: `Only ${source.available} ${source.unit} ${kind === 'LISTING' ? 'available' : 'still wanted'}.` }, { status: 400 });
    }
    if (source.priceType === 'FIXED' && unitPrice !== source.fixedPrice) {
      return NextResponse.json({ error: kind === 'LISTING' ? 'This listing has a fixed price.' : 'This request has a fixed budget.' }, { status: 400 });
    }

    // ---- delivery or pickup, and when ---------------------------------------------
    // Whoever posted first (the seller on a listing, the buyer on a request)
    // already said how this changes hands; the offer only gets a say when
    // they left it open to either.
    const asked = body.fulfillment === 'DELIVERY' ? ('DELIVERY' as const) : ('PICKUP' as const);
    const fulfillment = source.fulfillmentSetting === 'BOTH' ? asked : (source.fulfillmentSetting as 'DELIVERY' | 'PICKUP');
    if (source.fulfillmentSetting !== 'BOTH' && asked !== fulfillment) {
      return NextResponse.json(
        { error: `This ${kind === 'LISTING' ? 'listing' : 'request'} is ${fulfillment === 'PICKUP' ? 'pickup' : 'delivery'} only.` },
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

        let buyerLat: number | null = null;
        let buyerLng: number | null = null;
        let buyerAddress: string | null = null;
        let sellerLat: number | null = null;
        let sellerLng: number | null = null;
        let sellerAddress: string | null = null;

        if (kind === 'LISTING') {
          // The seller's side is the listing's own pin — never asked here.
          // The buyer's location belongs to the buyer: a seller's counteroffer
          // carries it over from the offer being answered, never a new one.
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
          if (buyerLat === null || buyerLng === null) {
            throw new Error(
              side === 'SELLER'
                ? "This offer has no buyer location, so it can't be countered. Ask the buyer to send a new offer."
                : fulfillment === 'DELIVERY'
                  ? 'Set the delivery location first, so the seller knows where to bring it.'
                  : 'Set your location first, so we can work out the route and travel time to the pickup.'
            );
          }
        } else {
          // The buyer's side is the request's own location — always known,
          // never asked. The responding seller's location must be supplied,
          // the mirror of the listing case above with the roles swapped.
          buyerLat = conv.buyRequest!.latitude;
          buyerLng = conv.buyRequest!.longitude;
          buyerAddress = conv.buyRequest!.location;
          if (side === 'BUYER') {
            sellerLat = parent?.sellerLat ?? null;
            sellerLng = parent?.sellerLng ?? null;
            sellerAddress = parent?.sellerAddress ?? null;
          } else if (body.sellerLat != null && body.sellerLng != null) {
            sellerLat = Number(body.sellerLat);
            sellerLng = Number(body.sellerLng);
            if (!(sellerLat >= -90 && sellerLat <= 90 && sellerLng >= -180 && sellerLng <= 180)) {
              throw new Error('That location is not valid.');
            }
            sellerAddress = String(body.sellerAddress ?? '').trim().slice(0, 200) || null;
          }
          if (sellerLat === null || sellerLng === null) {
            throw new Error(
              side === 'BUYER'
                ? "This offer has no seller location, so it can't be countered. Ask the seller to send a new offer."
                : fulfillment === 'DELIVERY'
                  ? 'Set your location first, so the buyer knows where it is coming from.'
                  : 'Set your location first, so we can work out the route and travel time for the pickup.'
            );
          }
        }

        const created = await tx.offer.create({
          data: {
            conversationId: id,
            listingId: conv.listing?.id ?? null,
            buyRequestId: conv.buyRequest?.id ?? null,
            buyerId: conv.buyerId, sellerId: conv.sellerId,
            quantity, unit: source.unit, unitPrice, totalAmount, message: note,
            proposedBy: side, parentOfferId: parentId,
            fulfillment, scheduledAt, buyerLat, buyerLng, buyerAddress, sellerLat, sellerLng, sellerAddress,
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
        body: `${user.fullname} — ${quantity} ${source.unit} of ${source.crop} at ₱${unitPrice.toLocaleString('en-PH')} / ${source.unit}.`,
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
