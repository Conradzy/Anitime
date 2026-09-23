// The parts of the dashboard's data shape that the browser needs. Kept apart
// from lib/dashboard.ts so importing them into a client component doesn't drag
// Prisma (and its Node-only dependencies) into the browser bundle.

export const RANGES = ['7D', '30D', '3M', '6M', '1Y'] as const;
export type Range = (typeof RANGES)[number];

export const TXN_PAGE_SIZE = 5;

export type TxnRow = {
  id: number;
  code: string;
  /** SALE when the signed-in user sold it, PURCHASE when they bought it. */
  kind: 'SALE' | 'PURCHASE';
  date: string;
  crop: string;
  variety: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  paymentMethod: string | null;
  paid: boolean;
  status: string;
  counterparty: string;
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH_ON_DELIVERY: 'Cash on delivery',
  CASH_ON_PICKUP: 'Cash on pickup',
  GCASH: 'GCash',
  BANK_TRANSFER: 'Bank transfer',
  MAYA: 'Maya',
};

export const paymentLabel = (k: string | null) => (k ? (PAYMENT_LABEL[k] ?? k) : '—');
