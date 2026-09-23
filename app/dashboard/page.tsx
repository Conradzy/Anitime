'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { AppSidebar } from '@/components/AppSidebar';
import { useCurrentUser } from '@/lib/use-current-user';
import { getManilaGreeting } from '@/lib/greeting';
import type { DashboardData } from '@/lib/dashboard';
import { RANGES, paymentLabel, type Range, type TxnRow } from '@/lib/dashboard-shared';
import styles from './page.module.css';

/* ---------------------------------------------------------------------
 * AniTime Dashboard — every number comes from this user's own deals
 * (/api/dashboard). Nothing here is sample data: an account with no
 * deals yet sees zeroes and a short "nothing here yet" line.
 * ------------------------------------------------------------------- */

const PALETTE = ['#2F6B45', '#A7C641', '#6E9A3A', '#E0B341', '#8FB0A0'];

const CROP_IMG: Record<string, string> = {
  Banana: '/images/crops/banana.png',
  Coconut: '/images/crops/coconut.png',
  Corn: '/images/crops/corn.png',
  Mango: '/images/crops/mango.png',
  Pineapple: '/images/crops/pineapple.png',
};

function peso(n: number, dec = 0) {
  return '₱' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Short money for axis ticks: ₱12k, ₱1.2M. */
function pesoShort(n: number) {
  if (n >= 1_000_000) return '₱' + (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M';
  if (n >= 1000) return '₱' + Math.round(n / 1000) + 'k';
  return '₱' + Math.round(n);
}

function tons(kg: number) {
  return kg >= 1000 ? (kg / 1000).toFixed(1) + ' tons' : Math.round(kg).toLocaleString('en-US') + ' kg';
}

/** Percentage change against the previous period of the same length. */
function delta(now: number, before: number): { text: string; up: boolean } | null {
  if (before <= 0) return now > 0 ? { text: 'new', up: true } : null;
  const pct = ((now - before) / before) * 100;
  if (Math.abs(pct) < 0.05) return null;
  return { text: `${Math.abs(pct).toFixed(1)}%`, up: pct >= 0 };
}

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
    : 'Date to be agreed';

const STATUS_COLOR: Record<string, { fg: string; bg: string }> = {
  Completed: { fg: '#062F24', bg: '#E4EDC8' },
  Paid: { fg: '#062F24', bg: '#E4EDC8' },
  'In progress': { fg: '#1F5B7A', bg: '#DCEAF2' },
  Cancelled: { fg: '#7B2F18', bg: '#F3E3DC' },
};

/** The stored road route, drawn to fit the little map box. */
function RouteSketch({ path }: { path: [number, number][] | null }) {
  if (!path || path.length < 2) {
    return (
      <svg viewBox="0 0 320 168" width="100%" height="168" className={styles.routeMapSvg} role="img" aria-label="No route yet">
        <rect width="320" height="168" fill="#EEF1E6" />
        <path d="M-10 120 C 60 100 120 140 200 124 C 260 112 300 132 330 120 L330 180 L-10 180Z" fill="#DCE4CE" />
      </svg>
    );
  }
  const lats = path.map((p) => p[0]);
  const lngs = path.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1e-6;
  const spanLng = maxLng - minLng || 1e-6;
  const pad = 26;
  const scale = Math.min((320 - pad * 2) / spanLng, (168 - pad * 2) / spanLat);
  const x = (lng: number) => 160 + (lng - (minLng + maxLng) / 2) * scale;
  const y = (lat: number) => 84 - (lat - (minLat + maxLat) / 2) * scale;
  const d = path.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p[1]).toFixed(1)} ${y(p[0]).toFixed(1)}`).join(' ');
  const a = path[0];
  const b = path[path.length - 1];

  return (
    <svg viewBox="0 0 320 168" width="100%" height="168" className={styles.routeMapSvg} role="img" aria-label="Delivery route">
      <rect width="320" height="168" fill="#EEF1E6" />
      <g stroke="rgba(6,47,36,.1)" strokeWidth="1">
        <path d="M0 44H320" />
        <path d="M0 96H320" />
        <path d="M60 0V168" />
        <path d="M180 0V168" />
        <path d="M260 0V168" />
      </g>
      <path d={d} fill="none" stroke="#2F6B45" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(a[1])} cy={y(a[0])} r="7" fill="#A7C641" stroke="#062F24" strokeWidth="2" />
      <circle cx={x(b[1])} cy={y(b[0])} r="7" fill="#062F24" stroke="#F6F5EF" strokeWidth="2" />
    </svg>
  );
}

export default function DashboardPage() {
  const [mini, setMini] = useState(false);
  const [range, setRange] = useState<Range>('30D');
  const [data, setData] = useState<DashboardData | null>(null);
  const [txns, setTxns] = useState<TxnRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [totalTxns, setTotalTxns] = useState(0);
  const [seeAll, setSeeAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');

  const { user } = useCurrentUser();
  const firstName = user?.fullname.split(' ')[0] || 'there';
  const greeting = getManilaGreeting();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard?range=${range}`, { cache: 'no-store' });
      if (res.status === 401) {
        window.location.replace('/auth');
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not load your dashboard.');
      setData(json);
      setTxns(json.transactions.rows);
      setPages(json.transactions.pages);
      setTotalTxns(json.transactions.total);
      setPage(1);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load your dashboard.');
    }
  }, [range]);

  useEffect(() => {
    // queued, not called straight away, so the first paint isn't blocked
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function goToPage(p: number) {
    const res = await fetch(`/api/transactions/history?page=${p}`, { cache: 'no-store' });
    if (!res.ok) return;
    const json = await res.json();
    setTxns(json.rows);
    setPage(json.page);
    setPages(json.pages);
    setTotalTxns(json.total);
  }

  const totals = data?.totals;
  const prev = data?.previous;
  const byCrop = data?.byCrop ?? [];
  const series = data?.series ?? [];
  const grand = totals?.sales ?? 0;
  const noSales = byCrop.length === 0;

  // ---- sales chart -------------------------------------------------------
  const w = 584;
  const h = 184;
  const y0 = 8;
  const peakValue = Math.max(...series.map((s) => s.value), 0);
  const max = peakValue > 0 ? peakValue * 1.12 : 1;
  const pts = series.map((s, i) => ({
    x: series.length > 1 ? (i * w) / (series.length - 1) : w / 2,
    y: y0 + h - (s.value / max) * h,
    v: s.value,
  }));
  const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
  const areaPath = pts.length ? `${linePath} L${w} ${y0 + h} L0 ${y0 + h} Z` : '';
  const peak = pts.length ? pts.reduce((a, b) => (b.v > a.v ? b : a), pts[0]) : null;
  const yTicks = [0, 1, 2, 3, 4].map((i) => pesoShort((max * (4 - i)) / 4));
  // at most six labels under the chart, whatever the range
  const labelStep = Math.max(1, Math.ceil(series.length / 6));
  const dayLabels = series.filter((_, i) => i % labelStep === 0).map((s) => s.label);

  // ---- donut -------------------------------------------------------------
  const C = 2 * Math.PI * 72;
  // each slice starts where the ones before it ended
  const donut = byCrop.map((c, i) => {
    const before = byCrop.slice(0, i).reduce((a, x) => a + (grand > 0 ? x.revenue / grand : 0), 0);
    const frac = grand > 0 ? c.revenue / grand : 0;
    return {
      color: PALETTE[i % PALETTE.length],
      dash: `${Math.max(C * frac - 3, 0).toFixed(1)} ${C.toFixed(1)}`,
      offset: (-C * before).toFixed(1),
    };
  });
  const legend = byCrop.map((c, i) => ({
    name: c.crop,
    color: PALETTE[i % PALETTE.length],
    pct: grand > 0 ? ((c.revenue / grand) * 100).toFixed(1) + '%' : '0%',
    value: peso(c.revenue),
  }));

  const salesDelta = delta(totals?.sales ?? 0, prev?.sales ?? 0);
  const next = data?.logistics.next ?? null;
  const detail = open ? byCrop.find((c) => c.crop === open) : undefined;

  return (
    <>
      <div data-shell className={styles.shell} style={{ '--cols': mini ? '76px' : '246px' } as CSSProperties}>
        <AppSidebar active="dashboard" mini={mini} onToggle={() => setMini((v) => !v)} />

        <div data-cols className={styles.colsGrid}>
          <main className={styles.mainCol}>
            <header className={styles.pageHeader}>
              <div>
                <h1 className={styles.pageTitle}>
                  {greeting}, {firstName}
                </h1>
                <p className={styles.pageSubtitle}>
                  {loadError || 'Your sales, purchases and deliveries for the selected period.'}
                </p>
              </div>
              <div className={styles.rangeWrap}>
                {RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    className={styles.rangeBtn}
                    style={
                      {
                        '--rb-bg': r === range ? '#062F24' : 'transparent',
                        '--rb-fg': r === range ? '#F6F5EF' : '#4B5C53',
                      } as CSSProperties
                    }
                  >
                    {r}
                  </button>
                ))}
              </div>
            </header>

            <div className={styles.kpiGrid}>
              {[
                {
                  icon: '₱',
                  label: 'Total sales',
                  value: peso(totals?.sales ?? 0),
                  d: salesDelta,
                  note: 'produce you sold',
                },
                {
                  icon: '▤',
                  label: 'Total purchases',
                  value: peso(totals?.purchases ?? 0),
                  d: delta(totals?.purchases ?? 0, prev?.purchases ?? 0),
                  note: 'produce you bought',
                },
                {
                  icon: '◆',
                  label: 'Active products',
                  value: String(totals?.activeListings ?? 0),
                  d: null,
                  note: 'listings live now',
                },
                {
                  icon: '⇢',
                  label: 'Deals completed',
                  value: String(totals?.completed ?? 0),
                  d: delta(totals?.completed ?? 0, prev?.completed ?? 0),
                  note: 'finished this period',
                },
              ].map((k) => (
                <article key={k.label} className={styles.kpiCard}>
                  <div className={styles.kpiHeadRow}>
                    <span aria-hidden="true" className={styles.kpiIcon}>
                      {k.icon}
                    </span>
                    <span className={styles.kpiLabel}>{k.label}</span>
                  </div>
                  <div className={styles.kpiValueRow}>
                    <span className={styles.kpiValue}>{k.value}</span>
                    {k.d && (
                      <span className={styles.kpiDelta} style={{ color: k.d.up ? undefined : '#B4462F' }}>
                        {k.d.text === 'new' ? 'new' : `${k.d.up ? '↑' : '↓'} ${k.d.text}`}
                      </span>
                    )}
                  </div>
                  <div className={styles.kpiNote}>{k.note}</div>
                </article>
              ))}
            </div>

            <div className={styles.chartsGrid}>
              <section className={styles.panelCard}>
                <div className={styles.sectionHeadRow}>
                  <div>
                    <h2 className={styles.sectionTitle}>Sales overview</h2>
                    <p className={styles.sectionSubtitle}>What you sold, over time</p>
                  </div>
                  <div className={styles.alignRight}>
                    <div className={styles.heroValueRight}>{peso(grand)}</div>
                    {salesDelta && (
                      <div className={styles.heroDeltaRight}>
                        {salesDelta.text === 'new'
                          ? 'first sales this period'
                          : `${salesDelta.up ? '↑' : '↓'} ${salesDelta.text} vs. previous period`}
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles.chartCol}>
                  <div className={styles.chartRow}>
                    <div className={styles.yTicksCol}>
                      {yTicks.map((t, i) => (
                        <span key={i} className={styles.tickLabel}>
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className={styles.chartSvgCol}>
                      <svg
                        viewBox="0 0 584 200"
                        width="100%"
                        height="100%"
                        preserveAspectRatio="none"
                        className={styles.lineChartSvg}
                        role="img"
                        aria-label="Sales over time"
                      >
                        <defs>
                          <linearGradient id="dash-area" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#A7C641" stopOpacity=".42" />
                            <stop offset="100%" stopColor="#A7C641" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <g stroke="rgba(6,47,36,.09)" strokeWidth="1">
                          <path d="M0 1H584" vectorEffect="non-scaling-stroke" />
                          <path d="M0 50H584" vectorEffect="non-scaling-stroke" />
                          <path d="M0 100H584" vectorEffect="non-scaling-stroke" />
                          <path d="M0 150H584" vectorEffect="non-scaling-stroke" />
                          <path d="M0 199H584" vectorEffect="non-scaling-stroke" />
                        </g>
                        {peakValue > 0 && (
                          <>
                            <path d={areaPath} fill="url(#dash-area)" />
                            <path
                              d={linePath}
                              fill="none"
                              stroke="#2F6B45"
                              strokeWidth="2.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              vectorEffect="non-scaling-stroke"
                            />
                            {peak && (
                              <circle
                                cx={peak.x.toFixed(1)}
                                cy={peak.y.toFixed(1)}
                                r="5"
                                fill="#2F6B45"
                                stroke="#FFFFFF"
                                strokeWidth="2.5"
                                vectorEffect="non-scaling-stroke"
                              />
                            )}
                          </>
                        )}
                      </svg>
                    </div>
                  </div>
                  <div className={styles.dayLabelsRow}>
                    {dayLabels.map((l, i) => (
                      <span key={`${l}-${i}`}>{l}</span>
                    ))}
                  </div>
                </div>
              </section>

              <section className={styles.panelCard}>
                <h2 className={styles.sectionTitle}>Sales by crop</h2>
                <div className={styles.donutWrap}>
                  <svg viewBox="0 0 200 200" width="100%" height="186" className={styles.donutSvg} role="img" aria-label="Share of sales by crop">
                    <circle cx="100" cy="100" r="72" fill="none" stroke="#F1F1EC" strokeWidth="26" />
                    {donut.map((d, i) => (
                      <circle key={i} cx="100" cy="100" r="72" fill="none" stroke={d.color} strokeWidth="26" strokeDasharray={d.dash} strokeDashoffset={d.offset} />
                    ))}
                  </svg>
                  <div className={styles.donutCenter}>
                    <div className={styles.donutTotal}>{peso(grand)}</div>
                    <div className={styles.donutCaption}>Total sales</div>
                  </div>
                </div>
                <div className={styles.legendList}>
                  {noSales && <div className={styles.sectionSubtitle}>No sales in this period yet.</div>}
                  {legend.map((l) => (
                    <div key={l.name} className={styles.legendRow}>
                      <span className={styles.legendDot} style={{ '--dot-color': l.color } as CSSProperties} />
                      <span className={styles.legendName}>{l.name}</span>
                      <span className={styles.legendPct}>{l.pct}</span>
                      <span className={styles.legendValue}>{l.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className={styles.panelCardSimple}>
              <div className={styles.sectionHeadRowEnd}>
                <div>
                  <h2 className={styles.sectionTitle}>Crop performance</h2>
                  <p className={styles.sectionSubtitle}>
                    {noSales ? 'Sell a crop and it shows up here.' : 'Click a crop to see how each variety did'}
                  </p>
                </div>
              </div>
              <div data-cropgrid className={styles.cropGrid}>
                {byCrop.map((c, i) => (
                  <button key={c.crop} type="button" onClick={() => setOpen(c.crop)} className={styles.cropCard}>
                    <span className={styles.cropImgWrap}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={CROP_IMG[c.crop] ?? '/images/crops/banana.png'} alt={c.crop} className={styles.cropImg} />
                    </span>
                    <span className={styles.cropCardName}>{c.crop}</span>
                    <span className={styles.cropCardRevenue}>{peso(c.revenue)}</span>
                    <span className={styles.cropCardShare}>
                      {grand > 0 ? ((c.revenue / grand) * 100).toFixed(1) : '0'}% of sales · {tons(c.kg)}
                    </span>
                    <span className={styles.cropCardViewLink} style={{ color: PALETTE[i % PALETTE.length] }}>
                      View details →
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.panelCardMinW}>
              <div className={styles.sectionHeadRowEnd}>
                <div>
                  <h2 className={styles.sectionTitle}>Recent transactions</h2>
                  <p className={styles.sectionSubtitle}>
                    {totalTxns === 0
                      ? 'Completed deals appear here.'
                      : seeAll
                        ? `All ${totalTxns} deal${totalTxns === 1 ? '' : 's'}, newest first`
                        : 'Your latest deals, as buyer and as seller'}
                  </p>
                </div>
                {totalTxns > 5 && (
                  <button
                    type="button"
                    className={styles.viewAllLink}
                    onClick={() => {
                      setSeeAll((v) => !v);
                      if (seeAll) void goToPage(1);
                    }}
                  >
                    {seeAll ? 'Show less' : 'See all →'}
                  </button>
                )}
              </div>
              <div className={styles.tableScrollWrap}>
                <table className={styles.txnTable}>
                  <thead>
                    <tr className={styles.tableHeadRow}>
                      {['Date & time', 'Type', 'Crop', 'Variety', 'Quantity', 'Unit price', 'Total', 'Payment', 'Status'].map((h) => (
                        <th key={h} className={styles.th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((t) => {
                      const c = STATUS_COLOR[t.status] ?? STATUS_COLOR['In progress'];
                      return (
                        <tr key={t.id}>
                          <td className={styles.tdDate}>{fmtDateTime(t.date)}</td>
                          <td className={styles.tdPlain}>{t.kind === 'SALE' ? 'Sold' : 'Bought'}</td>
                          <td className={styles.tdBold}>{t.crop}</td>
                          <td className={styles.tdPlain}>{t.variety}</td>
                          <td className={styles.tdDate}>
                            {t.quantity.toLocaleString('en-PH')} {t.unit}
                          </td>
                          <td className={styles.tdDate}>
                            {peso(t.unitPrice, 2)} / {t.unit}
                          </td>
                          <td className={styles.tdBoldNowrap}>{peso(t.total)}</td>
                          <td className={styles.tdDate}>{paymentLabel(t.paymentMethod)}</td>
                          <td className={styles.tdStatusCell}>
                            <span className={styles.statusBadge} style={{ '--st-fg': c.fg, '--st-bg': c.bg } as CSSProperties}>
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {txns.length === 0 && (
                      <tr>
                        <td className={styles.tdPlain} colSpan={9}>
                          No deals yet. Accept an offer in Messages and it will appear here.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {seeAll && pages > 1 && (
                <div className={styles.pager}>
                  <button type="button" className={styles.pagerBtn} disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                    ‹ Previous
                  </button>
                  <span className={styles.pagerInfo}>
                    Page {page} of {pages}
                  </span>
                  <button type="button" className={styles.pagerBtn} disabled={page >= pages} onClick={() => goToPage(page + 1)}>
                    Next ›
                  </button>
                </div>
              )}
            </section>
          </main>

          <aside className={styles.sidebar}>
            <section className={styles.heroCard}>
              <span aria-hidden="true" className={styles.heroGradient} />
              <div className={styles.heroContent}>
                <span className={styles.heroIcon}>
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#A7C641" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M8 14.5V6.5" />
                    <path d="M8 7.2C8 4.2 10 2 14 2c0 4-2 6.2-5.2 6.2" />
                    <path d="M8 9.4C8 7.4 6.4 5.8 3.4 5.8c0 2.6 1.6 4 4 4" />
                  </svg>
                </span>
                <div className={styles.heroLabel}>Produce listed now</div>
                <div className={styles.heroValueRow}>
                  <span className={styles.heroValue}>{tons(totals?.supplyKg ?? 0)}</span>
                </div>
                <div className={styles.heroNote}>
                  across {totals?.activeListings ?? 0} live listing{(totals?.activeListings ?? 0) === 1 ? '' : 's'}
                </div>
              </div>
            </section>

            <section className={styles.sidePanelCard}>
              <div className={styles.sidePanelHeadRow}>
                <span className={styles.sidePanelIcon}>
                  <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="#2F6B45" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.6 13.4h11.2V6.2H2.6z" />
                    <path d="M13.8 9h2.2l1.4 2.4v2h-3.6z" />
                    <circle cx="6" cy="15.2" r="1.4" />
                    <circle cx="14.6" cy="15.2" r="1.4" />
                  </svg>
                </span>
                <h2 className={styles.sidePanelTitle}>Logistics &amp; delivery</h2>
              </div>
              <div className={styles.logisticsStatRow}>
                <div>
                  <div className={styles.logisticsStatLabel}>On-going deliveries</div>
                  <div className={styles.logisticsStatValueRow}>
                    <span className={styles.logisticsStatValue}>{data?.logistics.ongoing ?? 0}</span>
                  </div>
                </div>
                <Link href="/deliveries" className={styles.viewRoutesLink}>
                  View routes →
                </Link>
              </div>

              {next ? (
                <>
                  <div className={styles.nextWhen}>
                    <strong>{next.fulfillment === 'DELIVERY' ? 'Next delivery' : 'Next pickup'}</strong> ·{' '}
                    {fmtDateTime(next.scheduledAt)}
                  </div>
                  <div className={styles.routeMapWrap}>
                    <RouteSketch path={next.routePath} />
                    <div className={styles.routeOverlay}>
                      <span className={styles.routeOverlayIcon}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#2F6B45" strokeWidth="1.3">
                          <path d="M6 11s4-4.2 4-6.6A4 4 0 0 0 2 4.4C2 6.8 6 11 6 11z" />
                        </svg>
                      </span>
                      <span className={styles.routeOverlayText}>
                        <span className={styles.routeName}>
                          {(next.origin ?? 'Product').split(',')[0]} → {(next.dest ?? 'Buyer').split(',')[0]}
                        </span>
                        <span className={styles.routeSub}>
                          {next.distanceKm !== null ? `${next.distanceKm.toFixed(1)} km` : 'No route yet'}
                          {next.etaLabel ? ` · ${next.etaLabel}` : ''}
                        </span>
                      </span>
                      {next.vehicle && <span className={styles.vehicleBadge}>{next.vehicle}</span>}
                    </div>
                  </div>
                  <div className={styles.nextCargo}>
                    {next.crop} · {next.variety} — {next.role === 'SELLER' ? 'you are selling' : 'you are buying'} ({next.code})
                  </div>
                </>
              ) : (
                <p className={styles.sectionSubtitle}>
                  No delivery or pickup scheduled. Agree an offer in Messages and its route shows up here.
                </p>
              )}
            </section>

            <section className={styles.sidePanelCard}>
              <div className={styles.sidePanelHeadRowBetween}>
                <h2 className={styles.sidePanelTitle}>Top selling products</h2>
                <span className={styles.thisMonthLabel}>This period</span>
              </div>
              <div className={styles.topProductsList}>
                {byCrop.length === 0 && <p className={styles.sectionSubtitle}>Nothing sold yet.</p>}
                {byCrop.slice(0, 5).map((c, i) => (
                  <div key={c.crop} className={styles.topProductRow}>
                    <span className={styles.topProductIcon}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={CROP_IMG[c.crop] ?? '/images/crops/banana.png'} alt={c.crop} className={styles.topProductImg} />
                    </span>
                    <span className={styles.topProductInfo}>
                      <span className={styles.topProductTop}>
                        <span className={styles.topProductName}>{c.crop}</span>
                        <span className={styles.topProductVariety}>({c.varieties[0]?.variety.split(' / ')[0] ?? '—'})</span>
                        <span className={styles.topProductDelta}>{peso(c.revenue)}</span>
                      </span>
                      <span className={styles.topProductTons}>{tons(c.kg)}</span>
                      <span className={styles.topProductBarTrack}>
                        <span
                          className={styles.topProductBarFill}
                          style={
                            {
                              '--bar-color': PALETTE[i % PALETTE.length],
                              '--bar-w': `${Math.round((c.revenue / (byCrop[0]?.revenue || 1)) * 100)}%`,
                            } as CSSProperties
                          }
                        />
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {detail && (
        <div role="dialog" aria-modal="true" aria-label={`${detail.crop} analytics`} className={styles.modalVeil} onClick={() => setOpen(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <span className={styles.modalIcon}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={CROP_IMG[detail.crop] ?? '/images/crops/banana.png'} alt={detail.crop} className={styles.modalIconImg} />
              </span>
              <div className={styles.modalTitleWrap}>
                <div className={styles.modalKicker}>Crop analytics</div>
                <h2 className={styles.modalCropTitle}>{detail.crop}</h2>
              </div>
              <div className={styles.modalHeadRight}>
                <span className={styles.modalVarietiesBadge}>
                  {detail.varieties.length} variet{detail.varieties.length === 1 ? 'y' : 'ies'} sold
                </span>
                <button type="button" aria-label="Close" onClick={() => setOpen(null)} className={styles.modalCloseBtn}>
                  ✕
                </button>
              </div>
            </header>

            <div className={styles.modalContent}>
              <div className={styles.statsGrid}>
                {[
                  { label: 'Revenue', value: peso(detail.revenue), note: 'in the selected period' },
                  { label: 'Volume sold', value: tons(detail.kg), note: `${Math.round(detail.kg).toLocaleString('en-US')} kg in total` },
                  {
                    label: 'Average price',
                    value: detail.kg > 0 ? peso(detail.revenue / detail.kg, 2) + ' / kg' : '—',
                    note: 'weighted by volume',
                  },
                  { label: 'Deals', value: String(detail.orders), note: 'offers accepted' },
                ].map((s) => (
                  <div key={s.label} className={styles.statCard}>
                    <div className={styles.statCardLabel}>{s.label}</div>
                    <div className={styles.statCardValue}>{s.value}</div>
                    <div className={styles.statCardNote}>{s.note}</div>
                  </div>
                ))}
              </div>

              <section className={styles.subsectionCard}>
                <h3 className={styles.subsectionTitle}>Revenue by variety</h3>
                <p className={styles.subsectionSubtitle}>From your accepted offers in this period</p>
                <div className={styles.barsRow}>
                  {detail.varieties.map((v, i) => (
                    <div key={v.variety} className={styles.barCol}>
                      <span className={styles.barValue}>{peso(v.revenue)}</span>
                      <span
                        className={styles.bar}
                        style={
                          {
                            '--bar-color': PALETTE[i % PALETTE.length],
                            '--bar-h': `${Math.max(12, (v.revenue / (detail.varieties[0]?.revenue || 1)) * 172)}px`,
                          } as CSSProperties
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className={styles.barLabelsRow}>
                  {detail.varieties.map((v) => (
                    <div key={v.variety} className={styles.barLabelCol}>
                      <span className={styles.barShortName}>{v.variety.split(' / ')[0]}</span>
                      <span className={styles.barKg}>{tons(v.kg)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles.subsectionCard}>
                <h3 className={styles.subsectionTitle}>Varieties</h3>
                <div className={styles.tableScrollWrapTight}>
                  <table className={styles.varietiesTable}>
                    <thead>
                      <tr className={styles.tableHeadRow}>
                        {['Variety', 'Deals', 'Volume', 'Average price', 'Revenue', 'Share'].map((th) => (
                          <th key={th} className={styles.th}>
                            {th}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.varieties.map((v, i) => (
                        <tr key={v.variety}>
                          <td className={styles.tdNameCell}>
                            <span className={styles.varietyNameRow}>
                              <span className={styles.varietyDot} style={{ '--dot-color': PALETTE[i % PALETTE.length] } as CSSProperties} />
                              {v.variety}
                            </span>
                          </td>
                          <td className={styles.tdDate}>{v.orders}</td>
                          <td className={styles.tdDate}>{tons(v.kg)}</td>
                          <td className={styles.tdDate}>{v.kg > 0 ? peso(v.revenue / v.kg, 2) : '—'}</td>
                          <td className={styles.tdBoldNowrap}>{peso(v.revenue)}</td>
                          <td className={styles.tdShareCell}>
                            {detail.revenue > 0 ? ((v.revenue / detail.revenue) * 100).toFixed(1) : '0'}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <div className={styles.modalFooterRow}>
              <span className={styles.modalFooterText}>Figures come from your accepted offers in the selected period.</span>
              <Link href="/deliveries" className={styles.viewRoutesLink}>
                See deliveries →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
