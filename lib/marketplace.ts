import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/current-user';

/** Signed-in user or null (route handlers turn null into a 401). */
export const requireUser = getCurrentUser;

/** What other people see about someone: name, farm, picture, Verified badge and
 * the average of the reviews they have received (as a seller OR as a buyer). */
export type SellerBadge = {
  id: number;
  /** Farm/business name when there is one, otherwise the person's own name. */
  name: string;
  fullname: string;
  farmName: string | null;
  photoUrl: string | null;
  verified: boolean;
  rating: number; // 0 when no reviews yet
  reviewCount: number;
};

/** Verified status, picture and average rating for a set of people, in a few
 * queries rather than one per person. */
export async function sellerBadges(ids: number[]): Promise<Map<number, SellerBadge>> {
  const unique = [...new Set(ids)];
  const [users, ratings] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: unique } },
      select: {
        id: true, fullname: true, businessname: true, sellerVerified: true,
        profile: { select: { profilePhotoUrl: true } },
      },
    }),
    prisma.review.groupBy({
      by: ['revieweeId'],
      where: { revieweeId: { in: unique } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);
  const byId = new Map(ratings.map((r) => [r.revieweeId, r]));
  return new Map(
    users.map((u) => {
      const r = byId.get(u.id);
      return [
        u.id,
        {
          id: u.id,
          name: u.businessname || u.fullname,
          fullname: u.fullname,
          farmName: u.businessname || null,
          photoUrl: u.profile?.profilePhotoUrl ?? null,
          verified: u.sellerVerified,
          rating: r?._avg.rating ? Math.round(r._avg.rating * 10) / 10 : 0,
          reviewCount: r?._count._all ?? 0,
        },
      ];
    })
  );
}

type ListingRow = {
  id: number; sellerId: number; crop: string; variety: string; unit: string;
  quantity: unknown; availableQuantity: unknown; unitPrice: unknown; priceType: string;
  paymentMethods: string[]; description: string | null; location: string; status: string; createdAt: Date;
  latitude?: number | null; longitude?: number | null;
  placeType?: string; placeName?: string | null; addressDetails?: string | null; fulfillment?: string;
  photos?: { url: string }[];
};

export function serializeListing(l: ListingRow, seller?: SellerBadge) {
  return {
    id: l.id,
    sellerId: l.sellerId,
    crop: l.crop,
    variety: l.variety,
    unit: l.unit,
    quantity: Number(l.quantity),
    availableQuantity: Number(l.availableQuantity),
    unitPrice: Number(l.unitPrice),
    priceType: l.priceType,
    paymentMethods: l.paymentMethods,
    description: l.description,
    location: l.location,
    placeType: (l.placeType ?? 'FARM') as 'FARM' | 'SHOP' | 'STORAGE',
    fulfillment: (l.fulfillment ?? 'BOTH') as 'PICKUP' | 'DELIVERY' | 'BOTH',
    placeName: l.placeName ?? null,
    addressDetails: l.addressDetails ?? null,
    latitude: l.latitude ?? null,
    longitude: l.longitude ?? null,
    photos: (l.photos ?? []).map((p) => p.url),
    status: l.status,
    createdAt: l.createdAt.toISOString(),
    seller: seller ?? null,
  };
}

type OfferRow = {
  id: number; listingId: number; quantity: unknown; unit: string; unitPrice: unknown; totalAmount: unknown;
  message: string | null; status: string; proposedBy: string; parentOfferId: number | null; createdAt: Date;
  fulfillment: string; scheduledAt: Date | null; buyerLat: number | null; buyerLng: number | null; buyerAddress: string | null;
};

export function serializeOffer(o: OfferRow) {
  return {
    id: o.id,
    listingId: o.listingId,
    quantity: Number(o.quantity),
    unit: o.unit,
    unitPrice: Number(o.unitPrice),
    totalAmount: Number(o.totalAmount),
    message: o.message,
    status: o.status,
    proposedBy: o.proposedBy,
    parentOfferId: o.parentOfferId,
    createdAt: o.createdAt.toISOString(),
    fulfillment: o.fulfillment as 'DELIVERY' | 'PICKUP',
    scheduledAt: o.scheduledAt ? o.scheduledAt.toISOString() : null,
    buyerLat: o.buyerLat,
    buyerLng: o.buyerLng,
    buyerAddress: o.buyerAddress,
  };
}
