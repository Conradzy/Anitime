import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/lib/generated/prisma/client';
import { requireUser, sellerBadges, serializeBuyRequest } from '@/lib/marketplace';
import { CROPS, PAYMENT_METHODS, UNITS } from '@/lib/crops';
import { PHOTO_PATH_RE, photoUrl } from '@/lib/storage';
import { geocodePlace } from '@/lib/geocode-server';

const PAYMENT_KEYS: string[] = PAYMENT_METHODS.map((p) => p.key);
const FEED_PAGE_SIZE = 10;

/** GET /api/buy-requests?scope=feed&page=1&q=  -> what other buyers want, 10 per page
 *  GET /api/buy-requests?scope=mine             -> the signed-in buyer's own requests */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const scope = params.get('scope');
  const include = { photos: { orderBy: { position: 'asc' as const } } };

  if (scope === 'mine') {
    const rows = await prisma.buyRequest.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include,
    });
    return NextResponse.json({ requests: rows.map((r) => serializeBuyRequest(r)) });
  }

  const q = (params.get('q') ?? '').trim().slice(0, 80);
  const where: Prisma.BuyRequestWhereInput = {
    status: 'ACTIVE',
    remainingQuantity: { gt: 0 },
    buyerId: { not: user.id },
    ...(q
      ? {
          OR: [
            { crop: { contains: q, mode: 'insensitive' } },
            { variety: { contains: q, mode: 'insensitive' } },
            { location: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.BuyRequestOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

  const total = await prisma.buyRequest.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / FEED_PAGE_SIZE));
  const page = Math.min(Math.max(Number(params.get('page')) || 1, 1), totalPages);

  const rows = await prisma.buyRequest.findMany({
    where,
    orderBy,
    skip: (page - 1) * FEED_PAGE_SIZE,
    take: FEED_PAGE_SIZE,
    include,
  });
  const badges = await sellerBadges(rows.map((r) => r.buyerId));
  return NextResponse.json({
    requests: rows.map((r) => serializeBuyRequest(r, badges.get(r.buyerId))),
    page,
    pageSize: FEED_PAGE_SIZE,
    total,
    totalPages,
  });
}

/** POST /api/buy-requests — posts what the signed-in buyer wants to buy.
 * Mirrors POST /api/listings: same crop catalogue, same optional map pin, same
 * validation, just the seller's "how much I have" flipped to "how much I want". */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const crop = CROPS.find((c) => c.name === body?.crop);
  const variety = crop?.varieties.find((v) => v.name === body?.variety);
  const quantity = Number(body?.quantity);
  const unit = String(body?.unit ?? '');
  const location = String(body?.location ?? '').trim();
  const description = String(body?.description ?? '').trim().slice(0, 500) || null;
  const paymentMethods: string[] = Array.isArray(body?.paymentMethods)
    ? body.paymentMethods.filter((p: unknown) => typeof p === 'string' && PAYMENT_KEYS.includes(p))
    : [];

  if (!crop || !variety) return NextResponse.json({ error: 'Pick a crop and variety.' }, { status: 400 });
  if (!(UNITS as readonly string[]).includes(unit)) return NextResponse.json({ error: 'Invalid unit.' }, { status: 400 });
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
    return NextResponse.json({ error: 'Enter a valid quantity.' }, { status: 400 });
  }
  if (!location) return NextResponse.json({ error: 'Enter where you want it delivered, or where you can pick it up from.' }, { status: 400 });

  let targetPrice: number | null = null;
  if (body?.targetPrice !== undefined && body?.targetPrice !== null && body?.targetPrice !== '') {
    targetPrice = Number(body.targetPrice);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0 || targetPrice > 1_000_000) {
      return NextResponse.json({ error: 'Enter a valid target price, or leave it blank.' }, { status: 400 });
    }
  }

  const fulfillment = (['PICKUP', 'DELIVERY', 'BOTH'] as const).includes(body?.fulfillment) ? body.fulfillment : 'BOTH';
  let neededBy: Date | null = null;
  if (body?.neededBy) {
    const d = new Date(String(body.neededBy));
    if (!Number.isNaN(d.getTime())) neededBy = d;
  }

  let latitude: number | null = null;
  let longitude: number | null = null;
  if (body?.latitude != null && body?.longitude != null) {
    latitude = Number(body.latitude);
    longitude = Number(body.longitude);
    if (!(latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180)) {
      return NextResponse.json({ error: 'That map location is not valid.' }, { status: 400 });
    }
  }
  if (latitude === null || longitude === null) {
    const found = await geocodePlace(location);
    if (found) {
      latitude = found.lat;
      longitude = found.lng;
    }
  }

  // Photos arrive as storage paths returned by /api/uploads, same as listings.
  const rawPhotos: unknown[] = Array.isArray(body?.photos) ? body.photos : [];
  if (rawPhotos.length > 5) return NextResponse.json({ error: 'Up to 5 photos.' }, { status: 400 });
  const photos = rawPhotos.map((p) => String(p));
  if (photos.some((p) => !PHOTO_PATH_RE.test(p) || !p.startsWith(`${user.id}/`))) {
    return NextResponse.json({ error: 'A photo is not valid. Re-upload it.' }, { status: 400 });
  }

  const created = await prisma.buyRequest.create({
    data: {
      buyerId: user.id,
      crop: crop.name,
      variety: variety.name,
      unit,
      quantity,
      remainingQuantity: quantity,
      targetPrice,
      priceType: body?.priceType === 'FIXED' ? 'FIXED' : 'NEGOTIABLE',
      paymentMethods: paymentMethods as never,
      description,
      location,
      fulfillment: fulfillment as 'PICKUP' | 'DELIVERY' | 'BOTH',
      latitude,
      longitude,
      neededBy,
      photos: { create: photos.map((storagePath, position) => ({ storagePath, url: photoUrl(storagePath), position })) },
    },
  });
  return NextResponse.json({ id: created.id }, { status: 201 });
}
