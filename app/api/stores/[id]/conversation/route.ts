import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/marketplace';
import { prisma } from '@/lib/prisma';
import { STORES } from '@/lib/stores';
import { storeDemoEmail } from '@/lib/store-demo';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in to message a store.' }, { status: 401 });
  const { id } = await params;
  const selected = STORES.find(item => item.id === id);
  if (!selected) return NextResponse.json({ error: 'Store not found.' }, { status: 404 });
  const buyer = await prisma.user.findUnique({ where: { email: storeDemoEmail(selected.id) }, select: { id: true } });
  if (!buyer) return NextResponse.json({ error: 'This demo store has not been set up yet.' }, { status: 503 });
  if (buyer.id === user.id) return NextResponse.json({ error: 'You are signed in as this store. Use a seller account to start a chat.' }, { status: 400 });
  const request = await prisma.buyRequest.findFirst({ where: { buyerId: buyer.id, status: 'ACTIVE' }, orderBy: { id: 'asc' } });
  if (!request) return NextResponse.json({ error: 'This store has no open buying request.' }, { status: 409 });
  const conversation = await prisma.conversation.upsert({
    where: { buyRequestId_sellerId: { buyRequestId: request.id, sellerId: user.id } },
    create: { buyRequestId: request.id, buyerId: buyer.id, sellerId: user.id }, update: {},
  });
  return NextResponse.json({ id: conversation.id });
}
