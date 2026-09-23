// Crop catalogue used by the "Post your produce" form. Names and reference
// farm-gate prices mirror the almanac page.
export type CropOption = {
  key: string;
  name: string;
  img: string;
  varieties: { name: string; price: number }[];
};

export const CROPS: CropOption[] = [
  {
    key: 'banana', name: 'Banana', img: '/images/crops/banana.png',
    varieties: [
      { name: 'Lakatan / Binangay', price: 24 },
      { name: 'Latundan', price: 18 },
      { name: 'Cardaba / Saba', price: 14 },
    ],
  },
  {
    key: 'coconut', name: 'Coconut', img: '/images/crops/coconut.png',
    varieties: [
      { name: 'Unpeeled Coconut', price: 7 },
      { name: 'Peeled Coconut', price: 9 },
      { name: 'Copra', price: 63 },
      { name: 'Uling / Charcoal', price: 28 },
    ],
  },
  {
    key: 'mango', name: 'Mango', img: '/images/crops/mango.png',
    varieties: [
      { name: 'Carabao', price: 75 },
      { name: 'Cebu', price: 65 },
      { name: 'Pico', price: 70 },
      { name: 'Indian / Katchamita', price: 60 },
    ],
  },
  {
    key: 'corn', name: 'Corn', img: '/images/crops/corn.png',
    varieties: [
      { name: 'Yellow Sweet Corn', price: 35 },
      { name: 'White Lagkitan / Native Glutinous', price: 30 },
      { name: 'White Corn Grits / Tinigib', price: 40 },
      { name: 'Purple / Bicolor Waxy Corn', price: 35 },
    ],
  },
  {
    key: 'pineapple', name: 'Pineapple', img: '/images/crops/pineapple.png',
    varieties: [
      { name: 'Hawaiian / Smooth Cayenne', price: 25 },
      { name: 'Queen / Formosa', price: 30 },
      { name: 'Native / Red Spanish', price: 22 },
    ],
  },
];

export const UNITS = ['kg', 'ton'] as const;

/** Where buyers find the produce. */
export const PLACE_TYPES = [
  { key: 'FARM', label: 'Farm', hint: 'Buyers come to your farm' },
  { key: 'SHOP', label: 'Shop', hint: 'You sell from a shop or stall' },
  { key: 'STORAGE', label: 'Storage room', hint: 'Kept in a warehouse or storage' },
] as const;
export type PlaceTypeKey = (typeof PLACE_TYPES)[number]['key'];
export const PLACE_LABEL: Record<string, string> = Object.fromEntries(PLACE_TYPES.map((p) => [p.key, p.label]));


/** How a seller will hand the produce over. Chosen when posting, so an offer
 * only has to agree a date — not re-open the question. */
export const FULFILLMENT_OPTIONS = [
  { key: 'PICKUP', label: 'Pickup only', hint: 'Buyers collect it from you' },
  { key: 'DELIVERY', label: 'Delivery only', hint: 'You bring it to the buyer' },
  { key: 'BOTH', label: 'Either one', hint: 'The buyer chooses when they offer' },
] as const;
export type FulfillmentKey = (typeof FULFILLMENT_OPTIONS)[number]['key'];

export const PAYMENT_METHODS = [
  { key: 'CASH_ON_DELIVERY', label: 'Cash on delivery' },
  { key: 'CASH_ON_PICKUP', label: 'Cash on pickup' },
  { key: 'GCASH', label: 'GCash' },
  { key: 'MAYA', label: 'Maya' },
  { key: 'BANK_TRANSFER', label: 'Bank transfer' },
] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number]['key'];
export const PAYMENT_LABEL: Record<string, string> = Object.fromEntries(PAYMENT_METHODS.map((p) => [p.key, p.label]));
