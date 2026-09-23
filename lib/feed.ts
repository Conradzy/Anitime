// A product posted through "Post produce", as returned by /api/listings?scope=feed.
export type FeedListing = {
  id: number;
  crop: string;
  variety: string;
  unit: string;
  quantity: number;
  availableQuantity: number;
  unitPrice: number;
  priceType: 'NEGOTIABLE' | 'FIXED';
  paymentMethods: string[];
  description: string | null;
  location: string;
  placeType: 'FARM' | 'SHOP' | 'STORAGE';
  placeName: string | null;
  addressDetails: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  photos: string[];
  mine: boolean;
  matchesInterest: boolean;
  seller: { name: string; verified: boolean; rating: number; reviewCount: number } | null;
};

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
  if (s < 86400 * 30) return Math.floor(s / 86400) + ' day' + (s >= 86400 * 2 ? 's' : '') + ' ago';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
