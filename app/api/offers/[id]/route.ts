import { NextResponse } from 'next/server';
import { notify } from '@/lib/notify';
import { prisma } from '@/lib/prisma';
import type { PaymentMethod } from '@/lib/generated/prisma/enums';
import { requireUser } from '@/lib/marketplace';
import { planBuyRequestRoute, planRoute } from '@/lib/deals';

const FULFILL_LABEL = { DELIVERY: 'Delivery', PICKUP: 'Pickup' } as const;

/** PATCH { action: 'accept' | 'decline' | 'withdraw' }
 * Accepting reserves the stock and starts the transaction in ONE database
 * transaction, so two buyers can never both get the same kilos. The route is
 * planned first (it needs the network), then everything is saved together. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const offerId = Number((await params).id);
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, include: { listing: true, buyRequest: true } });
  if (!offer || (offer.buyerId !== user.id && offer.sellerId !== user.id)) {
    return NextResponse.json({ error: 'Offer not found.' }, { status: 404 });
  }
  const side = offer.buyerId === user.id ? 'BUYER' : 'SELLER';
  if (offer.status !== 'PENDING') return NextResponse.json({ error: 'This offer was already answered.' }, { status: 409 });
  // The thing being negotiated over — a seller's listing, or a buyer's request.
  const crop = offer.listing ? offer.listing.crop : offer.buyRequest!.crop;

  const say = (tx: Pick<typeof prisma, 'message' | 'conversation'>, body: string) =>
    Promise.all([
      tx.message.create({ data: { conversationId: offer.conversationId, type: 'SYSTEM', body } }),
      tx.conversation.update({ where: { id: offer.conversationId }, data: { lastMessageAt: new Date() } }),
    ]);

  if (action === 'withdraw') {
    if (offer.proposedBy !== side) return NextResponse.json({ error: 'Only the sender can withdraw an offer.' }, { status: 403 });
    await prisma.$transaction(async (tx) => {
      await tx.offer.update({ where: { id: offerId }, data: { status: 'WITHDRAWN', respondedAt: new Date() } });
      await say(tx, 'Offer withdrawn.');
    });
    return NextResponse.json({ ok: true });
  }

  // accept / decline are for the side that did NOT make the offer
  if (offer.proposedBy === side) return NextResponse.json({ error: "You can't answer your own offer." }, { status: 403 });

  if (action === 'decline') {
    await prisma.$transaction(async (tx) => {
      await tx.offer.update({ where: { id: offerId }, data: { status: 'REJECTED', respondedAt: new Date() } });
      await say(tx, 'Offer declined.');
    });
    await notify({
      userId: offer.buyerId === user.id ? offer.sellerId : offer.buyerId,
      type: 'OFFER',
      title: 'Your offer was declined',
      body: `${user.fullname} declined the offer for ${crop}.`,
      link: `/messages?c=${offer.conversationId}`,
    });
    return NextResponse.json({ ok: true });
  }

  if (action !== 'accept') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

  // Work out the route now; it is stored with the deal so the Deliveries page
  // can show it instantly, and a routing hiccup can never block the deal.
  const route = offer.listing
    ? await planRoute(offer.listing, offer).catch(() => ({ origin: null, dest: null, distanceKm: null, path: null, source: null }))
    : await planBuyRequestRoute(offer.buyRequest!, offer).catch(() => ({ origin: null, dest: null, distanceKm: null, path: null, source: null }));

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Atomic reserve: only succeeds if enough is still unsold / unwanted.
      const reserved = offer.listing
        ? await tx.listing.updateMany({
            where: { id: offer.listingId!, status: 'ACTIVE', availableQuantity: { gte: offer.quantity } },
            data: { availableQuantity: { decrement: offer.quantity } },
          })
        : await tx.buyRequest.updateMany({
            where: { id: offer.buyRequestId!, status: 'ACTIVE', remainingQuantity: { gte: offer.quantity } },
            data: { remainingQuantity: { decrement: offer.quantity } },
          });
      if (reserved.count === 0) throw new Error(offer.listing ? 'Not enough stock left for this offer.' : 'Not enough of this request left for this offer.');

      let paymentMethod: PaymentMethod | null = null;
      let originLabelFallback = '';
      if (offer.listing) {
        const left = await tx.listing.findUniqueOrThrow({ where: { id: offer.listingId! } });
        if (Number(left.availableQuantity) <= 0) {
          await tx.listing.update({ where: { id: left.id }, data: { status: 'SOLD_OUT' } });
        }
        paymentMethod = left.paymentMethods[0] ?? null;
        originLabelFallback = left.location;
      } else {
        const left = await tx.buyRequest.findUniqueOrThrow({ where: { id: offer.buyRequestId! } });
        if (Number(left.remainingQuantity) <= 0) {
          await tx.buyRequest.update({ where: { id: left.id }, data: { status: 'FULFILLED' } });
        }
        paymentMethod = left.paymentMethods[0] ?? null;
      }

      await tx.offer.update({ where: { id: offerId }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
      const created = await tx.transaction.create({
        data: {
          transactionCode: `TMP-${offerId}`,
          listingId: offer.listingId, buyRequestId: offer.buyRequestId, offerId, buyerId: offer.buyerId, sellerId: offer.sellerId,
          quantity: offer.quantity, unit: offer.unit,
          agreedUnitPrice: offer.unitPrice, totalAmount: offer.totalAmount,
          paymentMethod,
          fulfillment: offer.fulfillment,
          scheduledAt: offer.scheduledAt,
          originLat: route.origin?.lat ?? null,
          originLng: route.origin?.lng ?? null,
          originLabel: route.origin?.label ?? originLabelFallback,
          destLat: route.dest?.lat ?? null,
          destLng: route.dest?.lng ?? null,
          destLabel: route.dest?.label ?? null,
          distanceKm: route.distanceKm,
          routePath: route.path ?? undefined,
          routeSource: route.source,
        },
      });
      const code = `ANI-${String(created.id).padStart(5, '0')}`;
      await tx.transaction.update({ where: { id: created.id }, data: { transactionCode: code } });
      await say(
        tx,
        `Offer accepted. Transaction ${code} has started — ${FULFILL_LABEL[offer.fulfillment]} on ${
          offer.scheduledAt
            ? offer.scheduledAt.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
            : 'a date to be agreed'
        }. It now appears on the Deliveries page.`
      );
      return code;
    });
    await notify([
      {
        userId: offer.buyerId === user.id ? offer.sellerId : offer.buyerId,
        type: 'DEAL',
        title: `Offer accepted — ${result}`,
        body: `${user.fullname} accepted the offer for ${crop}. It is now on the Deliveries page.`,
        link: '/deliveries',
      },
    ]);
    return NextResponse.json({ ok: true, transactionCode: result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not accept the offer.' }, { status: 409 });
  }
}
