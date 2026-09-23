import { prisma } from '@/lib/prisma';
import { FUEL_PRICE_PER_LITER, VEHICLE_SET, haulEstimate } from '@/lib/vehicles';
import { TXN_PAGE_SIZE, type Range, type TxnRow } from '@/lib/dashboard-shared';

export { RANGES, TXN_PAGE_SIZE, paymentLabel } from '@/lib/dashboard-shared';
export type { Range, TxnRow } from '@/lib/dashboard-shared';

const DAYS: Record<Range, number> = { '7D': 7, '30D': 30, '3M': 90, '6M': 182, '1Y': 365 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const num = (v: unknown) => Number(v ?? 0);

/** The vehicle a load of this size needs — the same rule the Deliveries page uses. */
function vehicleFor(quantity: number, unit: string) {
  const kg = quantity * (unit === 'ton' ? 1000 : 1);
  return VEHICLE_SET.find((v) => v.capKg >= kg) ?? VEHICLE_SET[VEHICLE_SET.length - 1];
}

type Row = Awaited<ReturnType<typeof fetchRows>>[number];

function fetchRows(userId: number, since?: Date) {
  return prisma.transaction.findMany({
    where: {
      OR: [{ buyerId: userId }, { sellerId: userId }],
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    include: {
      listing: { select: { crop: true, variety: true } },
      buyer: { select: { fullname: true } },
      seller: { select: { fullname: true } },
    },
    orderBy: { id: 'desc' },
  });
}

function toRow(t: Row, userId: number): TxnRow {
  const isSeller = t.sellerId === userId;
  return {
    id: t.id,
    code: t.transactionCode,
    kind: isSeller ? 'SALE' : 'PURCHASE',
    date: (t.completedAt ?? t.acceptedAt ?? t.createdAt).toISOString(),
    crop: t.listing.crop,
    variety: t.listing.variety,
    quantity: num(t.quantity),
    unit: t.unit,
    unitPrice: num(t.agreedUnitPrice),
    total: num(t.totalAmount),
    paymentMethod: t.paymentMethod,
    paid: t.paymentStatus === 'PAID',
    status: t.status === 'COMPLETED' ? 'Completed' : t.status === 'CANCELLED' ? 'Cancelled' : t.paymentStatus === 'PAID' ? 'Paid' : 'In progress',
    counterparty: (isSeller ? t.buyer.fullname : t.seller.fullname) ?? 'Other party',
  };
}

/** Buckets for the sales chart: days for short ranges, months for long ones. */
function buildSeries(rows: Row[], userId: number, range: Range) {
  const days = DAYS[range];
  const byMonth = days > 90;
  const now = new Date();
  const buckets: { label: string; value: number; key: string }[] = [];

  if (byMonth) {
    const months = range === '3M' ? 3 : range === '6M' ? 6 : 12;
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ label: MONTHS[d.getMonth()], value: 0, key: `${d.getFullYear()}-${d.getMonth()}` });
    }
  } else {
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      buckets.push({
        label: `${MONTHS[d.getMonth()]} ${d.getDate()}`,
        value: 0,
        key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      });
    }
  }

  const index = new Map(buckets.map((b, i) => [b.key, i]));
  for (const t of rows) {
    if (t.sellerId !== userId || t.status === 'CANCELLED') continue;
    const d = t.completedAt ?? t.acceptedAt ?? t.createdAt;
    const key = byMonth ? `${d.getFullYear()}-${d.getMonth()}` : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const i = index.get(key);
    if (i !== undefined) buckets[i].value += num(t.totalAmount);
  }
  return buckets.map(({ label, value }) => ({ label, value }));
}

/**
 * Everything the dashboard shows, all of it from this user's own deals:
 * what they sold, what they bought, the sales chart, sales per crop, their
 * next delivery or pickup, and the first page of their transactions.
 */
export async function dashboardData(userId: number, range: Range) {
  const days = DAYS[range];
  const start = new Date(Date.now() - days * 86400000);
  const prevStart = new Date(Date.now() - days * 2 * 86400000);

  const [rows, activeListings, supply] = await Promise.all([
    fetchRows(userId, prevStart),
    prisma.listing.count({ where: { sellerId: userId, status: 'ACTIVE' } }),
    prisma.listing.aggregate({ where: { sellerId: userId, status: 'ACTIVE' }, _sum: { availableQuantity: true } }),
  ]);

  const inRange = rows.filter((t) => (t.completedAt ?? t.acceptedAt ?? t.createdAt) >= start);
  const inPrev = rows.filter((t) => {
    const d = t.completedAt ?? t.acceptedAt ?? t.createdAt;
    return d >= prevStart && d < start;
  });

  const sum = (list: Row[], pick: (t: Row) => boolean) =>
    list.filter((t) => t.status !== 'CANCELLED' && pick(t)).reduce((a, t) => a + num(t.totalAmount), 0);
  const asSeller = (t: Row) => t.sellerId === userId;
  const asBuyer = (t: Row) => t.buyerId === userId;

  const completed = inRange.filter((t) => t.status === 'COMPLETED');
  const prevCompleted = inPrev.filter((t) => t.status === 'COMPLETED');

  // Sales per crop (and per variety inside it), for the donut, the crop cards
  // and the top-products list.
  type VarietyStat = { variety: string; revenue: number; kg: number; orders: number };
  type CropStat = { crop: string; revenue: number; kg: number; orders: number; varieties: VarietyStat[] };
  const cropMap = new Map<string, CropStat>();
  for (const t of inRange) {
    if (t.sellerId !== userId || t.status === 'CANCELLED') continue;
    const kg = num(t.quantity) * (t.unit === 'ton' ? 1000 : 1);
    const amount = num(t.totalAmount);
    const cur = cropMap.get(t.listing.crop) ?? { crop: t.listing.crop, revenue: 0, kg: 0, orders: 0, varieties: [] };
    cur.revenue += amount;
    cur.kg += kg;
    cur.orders += 1;
    const v = cur.varieties.find((x) => x.variety === t.listing.variety);
    if (v) {
      v.revenue += amount;
      v.kg += kg;
      v.orders += 1;
    } else {
      cur.varieties.push({ variety: t.listing.variety, revenue: amount, kg, orders: 1 });
    }
    cropMap.set(t.listing.crop, cur);
  }
  const byCrop = [...cropMap.values()]
    .map((c) => ({ ...c, varieties: c.varieties.sort((a, b) => b.revenue - a.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  // The delivery or pickup happening soonest, with its route.
  const live = await prisma.transaction.findMany({
    where: { status: 'ACTIVE', OR: [{ buyerId: userId }, { sellerId: userId }] },
    include: { listing: { select: { crop: true, variety: true } } },
    orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
  });
  const next = live.find((t) => t.originLat !== null && t.destLat !== null) ?? live[0] ?? null;
  const vehicle = next ? vehicleFor(num(next.quantity), next.unit) : null;
  const km = next?.distanceKm !== null && next?.distanceKm !== undefined ? num(next.distanceKm) : null;
  const est = km !== null && vehicle ? haulEstimate(km, vehicle, FUEL_PRICE_PER_LITER) : null;

  return {
    range,
    totals: {
      sales: sum(inRange, asSeller),
      purchases: sum(inRange, asBuyer),
      orders: inRange.filter((t) => t.status !== 'CANCELLED').length,
      completed: completed.length,
      activeListings,
      supplyKg: num(supply._sum.availableQuantity),
    },
    previous: {
      sales: sum(inPrev, asSeller),
      purchases: sum(inPrev, asBuyer),
      orders: inPrev.filter((t) => t.status !== 'CANCELLED').length,
      completed: prevCompleted.length,
    },
    series: buildSeries(inRange, userId, range),
    byCrop,
    logistics: {
      ongoing: live.length,
      next: next
        ? {
            id: next.id,
            code: next.transactionCode,
            crop: next.listing.crop,
            variety: next.listing.variety,
            role: next.sellerId === userId ? ('SELLER' as const) : ('BUYER' as const),
            fulfillment: next.fulfillment,
            scheduledAt: next.scheduledAt?.toISOString() ?? null,
            origin: next.originLabel,
            dest: next.destLabel,
            originPoint: next.originLat !== null && next.originLng !== null ? { lat: next.originLat, lng: next.originLng } : null,
            destPoint: next.destLat !== null && next.destLng !== null ? { lat: next.destLat, lng: next.destLng } : null,
            routePath: Array.isArray(next.routePath) ? (next.routePath as [number, number][]) : null,
            distanceKm: km,
            etaLabel: est?.etaLabel ?? null,
            vehicle: vehicle?.label ?? null,
          }
        : null,
    },
  };
}

export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;

/** One page of this user's deals, newest first, for the transactions table. */
export async function transactionPage(userId: number, page: number, size = TXN_PAGE_SIZE) {
  const where = { OR: [{ buyerId: userId }, { sellerId: userId }] };
  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: {
        listing: { select: { crop: true, variety: true } },
        buyer: { select: { fullname: true } },
        seller: { select: { fullname: true } },
      },
      orderBy: { id: 'desc' },
      skip: Math.max(0, page - 1) * size,
      take: size,
    }),
  ]);
  return { total, page, size, pages: Math.max(1, Math.ceil(total / size)), rows: rows.map((t) => toRow(t, userId)) };
}
