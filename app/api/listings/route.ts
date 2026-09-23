import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/lib/generated/prisma/client';
import { requireUser, sellerBadges, serializeListing } from '@/lib/marketplace';
import { CROPS, FULFILLMENT_OPTIONS, PAYMENT_METHODS, PLACE_TYPES, UNITS } from '@/lib/crops';
import { PHOTO_PATH_RE, photoUrl } from '@/lib/storage';
import { geocodePlace } from '@/lib/geocode-server';

const PAYMENT_KEYS: string[] = PAYMENT_METHODS.map((p) => p.key);

const FEED_PAGE_SIZE = 10;

/** The crops a user picked when they registered ("Coconut, Banana"),
 * normalised to the catalogue's crop names. */
function interestsOf(product: string): string[] {
  const wanted = product.split(',').map((p) => p.trim().toLowerCase());
  return CROPS.filter((c) => wanted.includes(c.name.toLowerCase())).map((c) => c.name);
}

/** GET /api/listings?scope=feed&page=1&q=&crops=Coconut,Mango&sort=recent
 *    The home feed: every live listing, 10 per page. Listings of the crops the
 *    user registered for come first (newest first), then everything else.
 *  GET /api/listings?scope=mine  -> the signed-in seller's listings (incl. drafts)
 *  GET /api/listings             -> the marketplace: other sellers' live listings */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const scope = params.get('scope');

  if (scope === 'feed') {
    const interests = interestsOf(user.product);
    const cropFilter = (params.get('crops') ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter((c) => CROPS.some((k) => k.name === c));
    const q = (params.get('q') ?? '').trim().slice(0, 80);

    const base: Prisma.ListingWhereInput = {
      status: 'ACTIVE',
      availableQuantity: { gt: 0 },
      ...(cropFilter.length ? { crop: { in: cropFilter } } : {}),
      ...(q
        ? {
            OR: [
              { crop: { contains: q, mode: 'insensitive' } },
              { variety: { contains: q, mode: 'insensitive' } },
              { location: { contains: q, mode: 'insensitive' } },
              { placeName: { contains: q, mode: 'insensitive' } },
              { addressDetails: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const matchedWhere: Prisma.ListingWhereInput = { AND: [base, { crop: { in: interests } }] };
    const otherWhere: Prisma.ListingWhereInput = interests.length ? { AND: [base, { crop: { notIn: interests } }] } : base;
    const orderBy: Prisma.ListingOrderByWithRelationInput[] =
      params.get('sort') === 'value' ? [{ unitPrice: 'desc' }, { id: 'desc' }] : [{ createdAt: 'desc' }, { id: 'desc' }];
    const include = { photos: { orderBy: { position: 'asc' as const } } };

    const [matchedCount, otherCount] = await Promise.all([
      interests.length ? prisma.listing.count({ where: matchedWhere }) : Promise.resolve(0),
      prisma.listing.count({ where: otherWhere }),
    ]);
    const total = matchedCount + otherCount;
    const totalPages = Math.max(1, Math.ceil(total / FEED_PAGE_SIZE));
    const page = Math.min(Math.max(Number(params.get('page')) || 1, 1), totalPages);
    const start = (page - 1) * FEED_PAGE_SIZE;

    // Interest matches fill the front of the list; the page window slides
    // across "matched" and then "other" without loading everything.
    const rows = [];
    if (start < matchedCount) {
      rows.push(...(await prisma.listing.findMany({ where: matchedWhere, orderBy, skip: start, take: FEED_PAGE_SIZE, include })));
    }
    if (rows.length < FEED_PAGE_SIZE) {
      rows.push(
        ...(await prisma.listing.findMany({
          where: otherWhere,
          orderBy,
          skip: Math.max(start - matchedCount, 0),
          take: FEED_PAGE_SIZE - rows.length,
          include,
        }))
      );
    }

    const badges = await sellerBadges(rows.map((r) => r.sellerId));
    return NextResponse.json({
      listings: rows.map((r) => ({
        ...serializeListing(r, badges.get(r.sellerId)),
        mine: r.sellerId === user.id,
        matchesInterest: interests.includes(r.crop),
      })),
      page,
      pageSize: FEED_PAGE_SIZE,
      total,
      totalPages,
      interests,
    });
  }

  const mine = scope === 'mine';
  const rows = await prisma.listing.findMany({
    where: mine
      ? { sellerId: user.id }
      : { sellerId: { not: user.id }, status: 'ACTIVE', availableQuantity: { gt: 0 } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { photos: { orderBy: { position: 'asc' } } },
  });
  const badges = await sellerBadges(rows.map((r) => r.sellerId));
  return NextResponse.json({ listings: rows.map((r) => serializeListing(r, badges.get(r.sellerId))) });
}

/** POST /api/listings — publishes (or saves as draft) several products at
 * once. Each item becomes its own independent listing. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  // Sellers post freely; a buyer unlocks selling by passing the same ID + selfie
  // verification (which sets sellerVerified).
  if (user.role === 'BUYER' && !user.sellerVerified) {
    return NextResponse.json(
      { error: 'To sell, first verify your identity from your profile (Start selling).' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const items: unknown = body?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    return NextResponse.json({ error: 'Add between 1 and 20 products.' }, { status: 400 });
  }

  const status = body.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE';
  const location = String(body.location ?? '').trim();
  const description = String(body.description ?? '').trim().slice(0, 500) || null;
  const paymentMethods: string[] = Array.isArray(body.paymentMethods)
    ? body.paymentMethods.filter((p: unknown) => typeof p === 'string' && PAYMENT_KEYS.includes(p))
    : [];

  if (!location) return NextResponse.json({ error: 'Enter where buyers can find the produce.' }, { status: 400 });

  // Where the produce is: a farm, a shop or a storage room, with an optional
  // name and street/landmark details.
  const placeType = PLACE_TYPES.find((p) => p.key === body.placeType)?.key ?? 'FARM';
  const fulfillment = FULFILLMENT_OPTIONS.find((f) => f.key === body.fulfillment)?.key ?? 'BOTH';
  const placeName = String(body.placeName ?? '').trim().slice(0, 120) || null;
  const addressDetails = String(body.addressDetails ?? '').trim().slice(0, 240) || null;

  // Optional map pin (chosen on the map or from the device's location).
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (body.latitude != null && body.longitude != null) {
    latitude = Number(body.latitude);
    longitude = Number(body.longitude);
    if (!(latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180)) {
      return NextResponse.json({ error: 'That map location is not valid.' }, { status: 400 });
    }
  }
  if (status === 'ACTIVE' && paymentMethods.length === 0) {
    return NextResponse.json({ error: 'Choose at least one payment method.' }, { status: 400 });
  }

  // No map pin? Look the place name up once, here, so every listing can be routed to.
  if (latitude === null || longitude === null) {
    const found = await geocodePlace(location);
    if (found) {
      latitude = found.lat;
      longitude = found.lng;
    }
  }

  const batchId = randomUUID();
  const data = [];
  for (const [i, raw] of items.entries()) {
    const it = raw as Record<string, unknown>;
    const crop = CROPS.find((c) => c.name === it.crop);
    const variety = crop?.varieties.find((v) => v.name === it.variety);
    const quantity = Number(it.quantity);
    const unitPrice = Number(it.unitPrice);
    const unit = String(it.unit);
    if (!crop || !variety) return NextResponse.json({ error: `Product ${i + 1}: pick a crop and variety.` }, { status: 400 });
    if (!(UNITS as readonly string[]).includes(unit)) return NextResponse.json({ error: `Product ${i + 1}: invalid unit.` }, { status: 400 });
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
      return NextResponse.json({ error: `Product ${i + 1}: enter a valid quantity.` }, { status: 400 });
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 1_000_000) {
      return NextResponse.json({ error: `Product ${i + 1}: enter a valid price.` }, { status: 400 });
    }
    // Photos arrive as storage paths returned by /api/uploads. Only paths that
    // this user uploaded are accepted; URLs are rebuilt here, never trusted.
    const rawPhotos: unknown[] = Array.isArray(it.photos) ? it.photos : [];
    if (rawPhotos.length > 5) return NextResponse.json({ error: `Product ${i + 1}: up to 5 photos.` }, { status: 400 });
    const photos = rawPhotos.map((p) => String(p));
    if (photos.some((p) => !PHOTO_PATH_RE.test(p) || !p.startsWith(`${user.id}/`))) {
      return NextResponse.json({ error: `Product ${i + 1}: a photo is not valid. Re-upload it.` }, { status: 400 });
    }

    data.push({
      sellerId: user.id,
      batchId,
      crop: crop.name,
      variety: variety.name,
      unit,
      quantity,
      availableQuantity: quantity,
      unitPrice,
      priceType: it.priceType === 'FIXED' ? ('FIXED' as const) : ('NEGOTIABLE' as const),
      paymentMethods: paymentMethods as never,
      description,
      location,
      placeType: placeType as 'FARM' | 'SHOP' | 'STORAGE',
      fulfillment: fulfillment as 'PICKUP' | 'DELIVERY' | 'BOTH',
      placeName,
      addressDetails,
      latitude,
      longitude,
      status: status as 'DRAFT' | 'ACTIVE',
      photos: { create: photos.map((storagePath, position) => ({ storagePath, url: photoUrl(storagePath), position })) },
    });
  }

  // Every product is its own listing; all are created together or not at all.
  await prisma.$transaction(data.map((d) => prisma.listing.create({ data: d })));
  return NextResponse.json({ created: data.length, batchId, status }, { status: 201 });
}
