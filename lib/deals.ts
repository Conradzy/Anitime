import { fetchRoadRoute, thinPath, type LatLng } from '@/lib/routing';
import { geocodePlace } from '@/lib/geocode-server';
import type { SellerBadge } from '@/lib/marketplace';

export type Place = { lat: number; lng: number; label: string };

export type PlannedRoute = {
  origin: Place | null;
  dest: Place | null;
  distanceKm: number | null;
  path: [number, number][] | null;
  source: 'road' | 'straight' | null;
};

/** Works out the route for a freshly agreed deal, BEFORE it is saved (network
 * calls must not sit inside a database transaction).
 *
 *   origin = where the product is (the listing's pin, or its place name looked up)
 *   dest   = where the buyer is
 *
 * The buyer's location is required on every offer, so the only way a route can
 * be missing is a place name that can't be found or older deals made before that
 * rule; then there is simply no route and the deal still goes ahead. */
export async function planRoute(
  listing: { location: string; placeName?: string | null; latitude: number | null; longitude: number | null },
  offer: { buyerLat: number | null; buyerLng: number | null; buyerAddress: string | null }
): Promise<PlannedRoute> {
  let originPoint: LatLng | null =
    listing.latitude !== null && listing.longitude !== null ? { lat: listing.latitude, lng: listing.longitude } : null;
  if (!originPoint) originPoint = await geocodePlace(listing.location);

  const originLabel = listing.placeName ? `${listing.placeName}, ${listing.location}` : listing.location;
  const origin: Place | null = originPoint ? { ...originPoint, label: originLabel } : null;
  const dest: Place | null =
    offer.buyerLat !== null && offer.buyerLng !== null
      ? { lat: offer.buyerLat, lng: offer.buyerLng, label: offer.buyerAddress || 'Buyer location' }
      : null;

  if (!origin || !dest) return { origin, dest, distanceKm: null, path: null, source: null };

  const route = await fetchRoadRoute(origin, dest, AbortSignal.timeout(9000));
  return {
    origin,
    dest,
    distanceKm: Math.round(route.km * 100) / 100,
    path: thinPath(route.path, 300),
    source: route.source,
  };
}

/** A deal is finished once the buyer has confirmed they received the goods AND
 * the seller has confirmed the payment arrived. Neither side alone can end it. */
export function isDealComplete(t: { buyerConfirmedAt: Date | null; paidAt: Date | null }): boolean {
  return Boolean(t.buyerConfirmedAt && t.paidAt);
}

type TxRow = {
  id: number; transactionCode: string; buyerId: number; sellerId: number;
  quantity: unknown; unit: string; agreedUnitPrice: unknown; totalAmount: unknown;
  paymentMethod: string | null; paymentStatus: string; deliveryStatus: string; status: string;
  fulfillment: string; scheduledAt: Date | null;
  originLat: number | null; originLng: number | null; originLabel: string | null;
  destLat: number | null; destLng: number | null; destLabel: string | null;
  distanceKm: unknown; routePath: unknown; routeSource: string | null;
  sellerDeliveredAt: Date | null; buyerConfirmedAt: Date | null; paidAt: Date | null;
  createdAt: Date; acceptedAt: Date; completedAt: Date | null; cancelledAt: Date | null;
  offer: { conversationId: number };
  listing: { crop: string; variety: string; photos: { url: string }[] };
  reviews: { reviewerId: number; rating: number; comment: string | null }[];
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** The shape the Deliveries page and chat banner read. `me` decides which side
 * of the deal the viewer is on, and who "the other person" is. */
export function serializeTransaction(t: TxRow, me: number, badges: Map<number, SellerBadge>) {
  const role = t.buyerId === me ? ('BUYER' as const) : ('SELLER' as const);
  const otherId = role === 'BUYER' ? t.sellerId : t.buyerId;
  const mine = t.reviews.find((r) => r.reviewerId === me) ?? null;
  const theirs = t.reviews.find((r) => r.reviewerId !== me) ?? null;
  const path = Array.isArray(t.routePath) ? (t.routePath as [number, number][]) : null;

  return {
    id: t.id,
    code: t.transactionCode,
    role,
    conversationId: t.offer.conversationId,
    crop: t.listing.crop,
    variety: t.listing.variety,
    photo: t.listing.photos[0]?.url ?? null,
    quantity: Number(t.quantity),
    unit: t.unit,
    agreedUnitPrice: Number(t.agreedUnitPrice),
    totalAmount: Number(t.totalAmount),
    paymentMethod: t.paymentMethod,
    paymentStatus: t.paymentStatus,
    deliveryStatus: t.deliveryStatus,
    status: t.status,
    fulfillment: t.fulfillment as 'DELIVERY' | 'PICKUP',
    scheduledAt: iso(t.scheduledAt),
    origin: t.originLat !== null && t.originLng !== null ? { lat: t.originLat, lng: t.originLng, label: t.originLabel ?? '' } : null,
    dest: t.destLat !== null && t.destLng !== null ? { lat: t.destLat, lng: t.destLng, label: t.destLabel ?? '' } : null,
    distanceKm: t.distanceKm === null ? null : Number(t.distanceKm),
    routePath: path,
    routeSource: t.routeSource as 'road' | 'straight' | null,
    sellerDeliveredAt: iso(t.sellerDeliveredAt),
    buyerConfirmedAt: iso(t.buyerConfirmedAt),
    paidAt: iso(t.paidAt),
    createdAt: t.createdAt.toISOString(),
    acceptedAt: t.acceptedAt.toISOString(),
    completedAt: iso(t.completedAt),
    cancelledAt: iso(t.cancelledAt),
    counterparty: badges.get(otherId) ?? null,
    myReview: mine ? { rating: mine.rating, comment: mine.comment } : null,
    theirReview: theirs ? { rating: theirs.rating, comment: theirs.comment } : null,
  };
}

/** What the Deliveries page and chat read; the browser imports only this type. */
export type TransactionView = ReturnType<typeof serializeTransaction>;

export const TX_INCLUDE = {
  offer: { select: { conversationId: true } },
  listing: { select: { crop: true, variety: true, photos: { orderBy: { position: 'asc' as const }, take: 1, select: { url: true } } } },
  reviews: { select: { reviewerId: true, rating: true, comment: true } },
};
