import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/marketplace';
import { isDealComplete } from '@/lib/deals';
import { notify } from '@/lib/notify';

/**
 * PATCH { action } — moves a deal forward. Who may do what:
 *
 *   SELLER  start      goods are on the way / ready for pickup
 *   SELLER  delivered  the goods were handed over
 *   SELLER  paid       the payment (for example the cash on delivery) arrived
 *   BUYER   received   the goods arrived as agreed
 *   EITHER  cancel     only before anything has been sent or paid
 *
 * The deal is COMPLETED only when the BUYER has confirmed receipt AND the
 * SELLER has confirmed payment. Each side confirms the thing only they can
 * truthfully know, so neither can close the deal alone.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const id = Number((await params).id);
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };

  const t = await prisma.transaction.findUnique({ where: { id }, include: { offer: { select: { conversationId: true } } } });
  if (!t || (t.buyerId !== user.id && t.sellerId !== user.id)) {
    return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
  }
  const isSeller = t.sellerId === user.id;
  if (t.status !== 'ACTIVE') return NextResponse.json({ error: `This deal is already ${t.status.toLowerCase()}.` }, { status: 409 });

  const say = (tx: Pick<typeof prisma, 'message' | 'conversation'>, body: string) =>
    Promise.all([
      tx.message.create({ data: { conversationId: t.offer.conversationId, type: 'SYSTEM', body } }),
      tx.conversation.update({ where: { id: t.offer.conversationId }, data: { lastMessageAt: new Date() } }),
    ]);
  const now = new Date();
  const forbidden = (who: string) => NextResponse.json({ error: `Only the ${who} can do this.` }, { status: 403 });

  try {
    await prisma.$transaction(async (tx) => {
      // Completion is checked after every change, inside the same transaction.
      const finish = async () => {
        const fresh = await tx.transaction.findUniqueOrThrow({ where: { id } });
        if (isDealComplete(fresh)) {
          await tx.transaction.update({ where: { id }, data: { status: 'COMPLETED', completedAt: now } });
          await say(tx, `Deal ${t.transactionCode} is complete. You can both leave a review now.`);
        }
      };

      if (action === 'start') {
        if (!isSeller) throw forbidden('seller');
        if (t.deliveryStatus !== 'PENDING') throw new Error('This has already started.');
        await tx.transaction.update({ where: { id }, data: { deliveryStatus: 'IN_TRANSIT' } });
        await say(tx, t.fulfillment === 'DELIVERY' ? 'The seller is on the way with your order.' : 'Your order is ready for pickup.');
      } else if (action === 'delivered') {
        if (!isSeller) throw forbidden('seller');
        if (t.deliveryStatus === 'DELIVERED') throw new Error('Already marked as handed over.');
        await tx.transaction.update({ where: { id }, data: { deliveryStatus: 'DELIVERED', sellerDeliveredAt: now } });
        await say(tx, 'The seller marked the goods as handed over. Buyer: please confirm you received them.');
      } else if (action === 'paid') {
        if (!isSeller) throw forbidden('seller');
        if (t.paidAt) throw new Error('Payment is already confirmed.');
        if (t.deliveryStatus === 'PENDING') throw new Error('Mark the goods as on the way or ready for pickup first.');
        await tx.transaction.update({ where: { id }, data: { paymentStatus: 'PAID', paidAt: now } });
        await say(tx, 'The seller confirmed the payment was received.');
        await finish();
      } else if (action === 'received') {
        if (isSeller) throw forbidden('buyer');
        if (t.deliveryStatus === 'PENDING') throw new Error('The seller has not sent this yet.');
        if (t.buyerConfirmedAt) throw new Error('You already confirmed this.');
        await tx.transaction.update({
          where: { id },
          data: { buyerConfirmedAt: now, deliveryStatus: 'DELIVERED', sellerDeliveredAt: t.sellerDeliveredAt ?? now },
        });
        await say(tx, 'The buyer confirmed the goods were received.');
        await finish();
      } else if (action === 'cancel') {
        if (t.deliveryStatus !== 'PENDING' || t.paidAt) throw new Error('This can no longer be cancelled — it has already been sent or paid.');
        await tx.transaction.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: now } });
        // The kilos go back on sale / back on the want, whichever this deal was.
        if (t.listingId) {
          const listing = await tx.listing.update({
            where: { id: t.listingId },
            data: { availableQuantity: { increment: t.quantity } },
          });
          if (listing.status === 'SOLD_OUT') await tx.listing.update({ where: { id: listing.id }, data: { status: 'ACTIVE' } });
        } else if (t.buyRequestId) {
          const req = await tx.buyRequest.update({
            where: { id: t.buyRequestId },
            data: { remainingQuantity: { increment: t.quantity } },
          });
          if (req.status === 'FULFILLED') await tx.buyRequest.update({ where: { id: req.id }, data: { status: 'ACTIVE' } });
        }
        await say(tx, `${isSeller ? 'The seller' : 'The buyer'} cancelled deal ${t.transactionCode}. The stock is back on sale.`);
      } else {
        throw new Error('Unknown action.');
      }
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'That did not work.' }, { status: 409 });
  }

  // Tell the other side what just changed.
  const other = isSeller ? t.buyerId : t.sellerId;
  const pickup = t.fulfillment === 'PICKUP';
  const note: Record<string, { type: 'DELIVERY' | 'PAYMENT' | 'DEAL'; title: string; body: string }> = {
    start: {
      type: 'DELIVERY',
      title: pickup ? 'Your order is ready for pickup' : 'Your order is on the way',
      body: `${t.transactionCode} · ${user.fullname} marked it ${pickup ? 'ready for pickup' : 'as started'}.`,
    },
    delivered: { type: 'DELIVERY', title: 'Goods handed over', body: `${t.transactionCode} · please confirm you received them.` },
    received: { type: 'DELIVERY', title: 'The buyer confirmed receipt', body: `${t.transactionCode} · ${user.fullname} received the goods.` },
    paid: { type: 'PAYMENT', title: 'Payment confirmed', body: `${t.transactionCode} · the seller confirmed the payment arrived.` },
    cancel: { type: 'DEAL', title: 'Deal cancelled', body: `${t.transactionCode} · ${user.fullname} cancelled it. The stock is back on sale.` },
  };
  const n = action ? note[action] : undefined;
  if (n) await notify({ userId: other, type: n.type, title: n.title, body: n.body, link: '/deliveries' });

  const done = await prisma.transaction.findUnique({ where: { id }, select: { status: true } });
  if (done?.status === 'COMPLETED') {
    await notify([t.buyerId, t.sellerId].map((uid) => ({
      userId: uid,
      type: 'DEAL' as const,
      title: `Deal ${t.transactionCode} is complete`,
      body: 'Both sides confirmed. You can leave a review now.',
      link: '/deliveries',
    })));
  }
  return NextResponse.json({ ok: true });
}
