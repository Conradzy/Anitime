'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppSidebar } from '@/components/AppSidebar';
import type { DeliveryMapHandle, MapDelivery } from '@/components/DeliveryMap';
import type { TransactionView } from '@/lib/deals';
import { PAYMENT_LABEL } from '@/lib/crops';
import { FUEL_PRICE_PER_LITER, VEHICLE_SET, haulEstimate } from '@/lib/vehicles';
import styles from './page.module.css';

// Both maps touch `window`/WebGL, so they can only render on the client.
const DeliveryMap3D = dynamic(() => import('@/components/DeliveryMap3D'), { ssr: false });
const DeliveryMap2D = dynamic(() => import('@/components/DeliveryMap'), { ssr: false });

// Google's photorealistic 3D map needs an API key (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
// in .env). Until one is set, only the OpenStreetMap layer is offered.
const HAS_3D = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
type MapLayer = 'photo' | 'street';

const peso = (n: number, dec = 0) =>
  '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: dec, maximumFractionDigits: dec });

function fmtDateTime(iso: string | null) {
  if (!iso) return 'Date to be agreed';
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
}
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
}
function fmtTime(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
}
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

/** Where a deal is, in one word. */
function statusOf(t: TransactionView): string {
  if (t.status === 'CANCELLED') return 'Cancelled';
  if (t.status === 'COMPLETED') return 'Completed';
  if (t.buyerConfirmedAt) return 'Received';
  if (t.deliveryStatus === 'DELIVERED') return 'Handed over';
  if (t.deliveryStatus === 'IN_TRANSIT') return t.fulfillment === 'DELIVERY' ? 'On the way' : 'Ready for pickup';
  return 'Scheduled';
}

function statusChip(s: string) {
  if (s === 'Completed') return { fg: '#FFFFFF', bg: '#2F6B45' };
  if (s === 'Cancelled') return { fg: '#6A7A71', bg: '#EDEFE7' };
  if (s === 'On the way' || s === 'Ready for pickup') return { fg: '#062F24', bg: '#E4EDC8' };
  if (s === 'Handed over' || s === 'Received') return { fg: '#7A5A16', bg: '#F7ECCB' };
  return { fg: '#1F5B7A', bg: '#DCEAF2' };
}

/** The smallest vehicle that fits the load. */
function defaultVehicleKey(t: TransactionView): string {
  const kg = t.quantity * (t.unit === 'ton' ? 1000 : 1);
  return (VEHICLE_SET.find((v) => v.capKg >= kg) ?? VEHICLE_SET[VEHICLE_SET.length - 1]).key;
}

function TruckIcon({ size = 18, color = '#A7C641' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.6 13.4h11.2V6.2H2.6z" />
      <path d="M13.8 9h2.2l1.4 2.4v2h-3.6z" />
      <circle cx="6" cy="15.2" r="1.4" />
      <circle cx="14.6" cy="15.2" r="1.4" />
    </svg>
  );
}

function Person({ p, size = 44 }: { p: TransactionView['counterparty']; size?: number }) {
  const style: CSSProperties = { width: size, height: size };
  if (p?.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.photoUrl} alt="" className={styles.personImg} style={style} />;
  }
  return (
    <span className={styles.personInitials} style={{ ...style, fontSize: size * 0.34 }}>
      {initials(p?.fullname || p?.name || '?')}
    </span>
  );
}

export default function DeliveriesPage() {
  // useSearchParams needs a Suspense boundary during static rendering.
  return (
    <Suspense fallback={null}>
      <DeliveriesInner />
    </Suspense>
  );
}

function DeliveriesInner() {
  const wanted = Number(useSearchParams().get('t')) || null;
  const [mini, setMini] = useState(false);
  const [txs, setTxs] = useState<TransactionView[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selId, setSelId] = useState<number | null>(wanted);
  const [panel, setPanel] = useState(true);
  const [layer, setLayer] = useState<MapLayer>(HAS_3D ? 'photo' : 'street');
  const [veh, setVeh] = useState<{ id: number; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const mapRef = useRef<DeliveryMapHandle>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/transactions', { cache: 'no-store' });
      if (res.status === 401) {
        window.location.replace('/auth');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not load your deliveries.');
      setTxs(data.transactions);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load your deliveries.');
    }
  }, []);

  // First load, then a refresh every 20 seconds so the other person's
  // confirmations show up without reloading.
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 20000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const list = useMemo(() => txs ?? [], [txs]);
  const selected = useMemo(() => {
    if (!list.length) return null;
    return list.find((t) => t.id === selId) ?? list.find((t) => t.status === 'ACTIVE') ?? list[0];
  }, [list, selId]);

  // ---- what the map draws: every live deal that has a stored route -----------------
  const mapDeliveries = useMemo<MapDelivery[]>(() => {
    return list
      .filter((t) => t.status !== 'CANCELLED' && t.origin && t.dest && t.routePath && t.routePath.length > 1)
      .map((t) => {
        const vehicle = VEHICLE_SET.find((v) => v.key === defaultVehicleKey(t))!;
        const est = t.distanceKm !== null ? haulEstimate(t.distanceKm, vehicle, FUEL_PRICE_PER_LITER) : null;
        return {
          id: String(t.id),
          dir: t.role === 'SELLER' ? ('out' as const) : ('in' as const),
          path: t.routePath!,
          origin: t.origin!,
          dest: t.dest!,
          title: `${t.crop} — ${t.variety}`,
          who: t.counterparty?.fullname ?? t.counterparty?.name ?? 'Other party',
          when: fmtDateTime(t.scheduledAt),
          cargo: `${t.quantity.toLocaleString('en-PH')} ${t.unit} · ${peso(t.agreedUnitPrice, 2)} / ${t.unit}`,
          eta: est?.etaLabel ?? '—',
          distance: t.distanceKm !== null ? `${t.distanceKm.toFixed(1)} km` : '—',
          total: peso(t.totalAmount),
          status: statusOf(t),
        };
      });
  }, [list]);

  const selectedMapId = selected && mapDeliveries.some((d) => d.id === String(selected.id)) ? String(selected.id) : '';
  const onMapSelect = useCallback((id: string) => setSelId(Number(id)), []);

  const vehicleKey = selected ? (veh?.id === selected.id ? veh.key : defaultVehicleKey(selected)) : 'light';
  const vehicle = VEHICLE_SET.find((v) => v.key === vehicleKey)!;
  const est = selected && selected.distanceKm !== null ? haulEstimate(selected.distanceKm, vehicle, FUEL_PRICE_PER_LITER) : null;

  const activeTotal = list.filter((t) => t.status !== 'CANCELLED').reduce((a, t) => a + t.totalAmount, 0);

  async function act(action: string) {
    if (!selected) return;
    setBusy(true);
    setActionError('');
    try {
      const res = await fetch(`/api/transactions/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setActionError(data.error ?? 'That did not work.');
      await load();
    } catch {
      setActionError('Could not reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  async function submitReview() {
    if (!selected || stars < 1) return;
    setBusy(true);
    setActionError('');
    const res = await fetch(`/api/transactions/${selected.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: stars, comment }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) setActionError(data.error ?? 'Could not save your review.');
    else {
      setStars(0);
      setComment('');
    }
    await load();
    setBusy(false);
  }

  // ---- what the viewer can do right now, by role --------------------------------------
  const t = selected;
  const isSeller = t?.role === 'SELLER';
  const active = t?.status === 'ACTIVE';
  const canStart = Boolean(t && active && isSeller && t.deliveryStatus === 'PENDING');
  const canHandOver = Boolean(t && active && isSeller && t.deliveryStatus === 'IN_TRANSIT');
  // One step at a time, matching the stepper above the card: ready → handed
  // over → payment received. Showing all three at once made the order unclear.
  const canConfirmPayment = Boolean(t && active && isSeller && !t.paidAt && t.deliveryStatus === 'DELIVERED');
  const canReceive = Boolean(t && active && !isSeller && t.deliveryStatus !== 'PENDING' && !t.buyerConfirmedAt);
  const canCancel = Boolean(t && active && t.deliveryStatus === 'PENDING' && !t.paidAt);

  const timeline = t
    ? [
        { label: 'Agreed', done: true },
        { label: t.fulfillment === 'DELIVERY' ? 'On the way' : 'Ready', done: t.deliveryStatus !== 'PENDING' },
        { label: 'Handed over', done: Boolean(t.sellerDeliveredAt) },
        { label: 'Received', done: Boolean(t.buyerConfirmedAt) },
        { label: 'Paid', done: Boolean(t.paidAt) },
      ]
    : [];

  return (
    <div data-shell="" className={styles.shell} style={{ '--cols': mini ? '76px' : '246px' } as CSSProperties}>
      <AppSidebar active="deliveries" mini={mini} onToggle={() => setMini((m) => !m)} />

      <div className={styles.mainCol}>
        <div data-stage="" className={styles.stage}>
          <div data-maparea="" className={styles.mapArea}>
            <div className={styles.mapWrap}>
              {layer === 'photo' ? (
                <DeliveryMap3D ref={mapRef} deliveries={mapDeliveries} selectedId={selectedMapId} onSelect={onMapSelect} />
              ) : (
                <DeliveryMap2D ref={mapRef} deliveries={mapDeliveries} selectedId={selectedMapId} onSelect={onMapSelect} />
              )}
            </div>

            {/* nothing to show yet */}
            {txs && txs.length === 0 && (
              <div className={styles.emptyOverlay}>
                <div className={styles.emptyCard}>
                  <span className={styles.emptyIcon}>
                    <TruckIcon size={26} color="#2F6B45" />
                  </span>
                  <h2 className={styles.emptyTitle}>No deliveries yet</h2>
                  <p className={styles.emptyText}>
                    When you and another user agree on an offer in Messages, the deal appears here with its route, ETA,
                    schedule and payment.
                  </p>
                  <Link href="/messages" className={styles.emptyBtn}>
                    Go to messages
                  </Link>
                </div>
              </div>
            )}
            {loadError && !txs && (
              <div className={styles.emptyOverlay}>
                <div className={styles.emptyCard}>
                  <h2 className={styles.emptyTitle}>Couldn&apos;t load deliveries</h2>
                  <p className={styles.emptyText}>{loadError}</p>
                  <button type="button" className={styles.emptyBtn} onClick={load}>
                    Try again
                  </button>
                </div>
              </div>
            )}

            {t && (
              <div className={styles.etaBadge}>
                <span className={styles.etaIcon}>
                  <TruckIcon size={16} />
                </span>
                <span className={styles.etaTextWrap}>
                  <span className={styles.etaLabel}>{t.fulfillment === 'DELIVERY' ? 'Delivery on' : 'Pickup on'}</span>
                  <span className={styles.etaValue}>
                    {fmtDate(t.scheduledAt)} · {fmtTime(t.scheduledAt)}
                  </span>
                </span>
              </div>
            )}

            <div className={styles.legendWrap}>
              <span className={styles.legendChip}>
                <span className={styles.dotFarm} />Product location
              </span>
              <span className={styles.legendChip}>
                <span className={styles.dotOut} />You&apos;re selling
              </span>
              <span className={styles.legendChip}>
                <span className={styles.dotIn} />You&apos;re buying
              </span>
            </div>

            <div className={styles.dock}>
              {t && (
                <div data-detail="" className={styles.detailCard}>
                  <div className={styles.detailHead}>
                    <Person p={t.counterparty} />
                    <div className={styles.detailInfo}>
                      <div className={styles.detailTop}>
                        <span className={styles.detailName}>{t.counterparty?.fullname ?? 'Other party'}</span>
                        {t.counterparty?.verified ? (
                          <span className={styles.verifiedBadge}>✓ Verified</span>
                        ) : (
                          <span className={styles.unverifiedBadge}>Unverified</span>
                        )}
                        <span className={styles.roleTag}>{isSeller ? 'Buyer' : 'Seller'}</span>
                      </div>
                      <div className={styles.detailSub}>
                        {t.counterparty?.farmName ? `${t.counterparty.farmName} · ` : ''}
                        {t.role === 'BUYER' ? (t.origin?.label ?? '') : (t.dest?.label ?? '')}
                      </div>
                    </div>
                  </div>

                  <div className={styles.detailMeta}>
                    <span className={styles.starsRow}>
                      {t.counterparty && t.counterparty.reviewCount > 0 ? (
                        <>
                          <span className={styles.starsOn}>{'★'.repeat(Math.round(t.counterparty.rating))}</span>
                          <span className={styles.starsOff}>{'★'.repeat(5 - Math.round(t.counterparty.rating))}</span>{' '}
                          <span className={styles.ratingText}>
                            {t.counterparty.rating.toFixed(1)} ({t.counterparty.reviewCount})
                          </span>
                        </>
                      ) : (
                        <span className={styles.ratingText}>No reviews yet</span>
                      )}
                    </span>
                    <span className={styles.phoneRow}>
                      {t.code} · {t.fulfillment === 'DELIVERY' ? 'Delivery' : 'Pickup'}
                    </span>
                  </div>

                  <div className={styles.timeline} aria-label="Progress of this deal">
                    {timeline.map((s) => (
                      <span key={s.label} className={s.done ? styles.tlDone : styles.tlTodo}>
                        <span className={styles.tlDot}>{s.done ? '✓' : ''}</span>
                        {s.label}
                      </span>
                    ))}
                  </div>

                  <div className={styles.statGrid}>
                    <div className={styles.statCard}>
                      <div className={styles.statLabel}>{t.fulfillment === 'DELIVERY' ? 'Delivery' : 'Pickup'}</div>
                      <div className={styles.statValueSm}>{fmtDate(t.scheduledAt)}</div>
                      <div className={styles.statSub}>{fmtTime(t.scheduledAt)}</div>
                    </div>
                    <div className={styles.statCard}>
                      <div className={styles.statLabel}>Distance</div>
                      <div className={styles.statValue}>{t.distanceKm !== null ? `${t.distanceKm.toFixed(1)} km` : '—'}</div>
                      <div className={styles.statSub}>{t.routeSource === 'straight' ? 'estimate' : t.distanceKm !== null ? 'by road' : 'no route'}</div>
                    </div>
                    <div className={styles.statCardTotal}>
                      <div className={styles.statLabelTotal}>Total</div>
                      <div className={styles.statValueTotal}>{peso(t.totalAmount)}</div>
                    </div>
                  </div>

                  <div className={styles.cargoRow}>
                    <span className={styles.cargoText}>
                      {t.crop} · {t.variety} · {t.quantity.toLocaleString('en-PH')} {t.unit}
                    </span>
                    <span className={styles.rateText}>
                      {peso(t.agreedUnitPrice, 2)} / {t.unit}
                      {t.paymentMethod ? ` · ${PAYMENT_LABEL[t.paymentMethod] ?? t.paymentMethod}` : ''}
                      {' · '}
                      {t.paymentStatus === 'PAID' ? 'Paid' : 'Unpaid'}
                    </span>
                  </div>

                  {est && (
                    <div className={styles.haulBox}>
                      <div className={styles.haulHead}>
                        <span className={styles.haulTitle}>ETA by vehicle</span>
                        <span className={styles.vehPills}>
                          {VEHICLE_SET.map((v) => (
                            <button
                              key={v.key}
                              type="button"
                              className={v.key === vehicleKey ? styles.vehOn : styles.vehOff}
                              onClick={() => setVeh({ id: t.id, key: v.key })}
                            >
                              {v.label}
                            </button>
                          ))}
                        </span>
                      </div>
                      <div className={styles.haulRow}>
                        <span>
                          <strong>{est.etaLabel}</strong> one way
                        </span>
                        <span>
                          {est.liters.toFixed(1)} L · <strong>{peso(est.cost)}</strong> fuel round trip
                        </span>
                      </div>
                    </div>
                  )}

                  {/* actions: each side can only confirm what it can truthfully know */}
                  {active && (
                    <div className={styles.actionRow}>
                      {canStart && (
                        <button type="button" className={styles.actPrimary} disabled={busy} onClick={() => act('start')}>
                          {t.fulfillment === 'DELIVERY' ? 'Start delivery' : 'Mark ready for pickup'}
                        </button>
                      )}
                      {canHandOver && (
                        <button type="button" className={styles.actPrimary} disabled={busy} onClick={() => act('delivered')}>
                          Mark as handed over
                        </button>
                      )}
                      {canReceive && (
                        <button type="button" className={styles.actPrimary} disabled={busy} onClick={() => act('received')}>
                          Confirm I received it
                        </button>
                      )}
                      {canConfirmPayment && (
                        <button type="button" className={styles.actGhost} disabled={busy} onClick={() => act('paid')}>
                          Confirm payment received
                        </button>
                      )}
                      {canCancel && (
                        <button type="button" className={styles.actDanger} disabled={busy} onClick={() => act('cancel')}>
                          Cancel deal
                        </button>
                      )}
                    </div>
                  )}
                  {active && (
                    <p className={styles.rule}>
                      {isSeller
                        ? 'You confirm the payment arrived; the buyer confirms they received the goods. The deal completes when both are done.'
                        : 'You confirm you received the goods; the seller confirms the payment arrived. The deal completes when both are done.'}
                    </p>
                  )}
                  {actionError && <div className={styles.actErr}>{actionError}</div>}

                  {/* both sides can rate each other once the deal is complete */}
                  {t.status === 'COMPLETED' && (
                    <div className={styles.reviewBox}>
                      {t.myReview ? (
                        <div className={styles.reviewDone}>
                          You rated {t.counterparty?.fullname ?? 'them'} <strong>{'★'.repeat(t.myReview.rating)}</strong>
                          {t.theirReview && (
                            <>
                              {' · '}They rated you <strong>{'★'.repeat(t.theirReview.rating)}</strong>
                            </>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className={styles.reviewTitle}>How was {t.counterparty?.fullname ?? 'this deal'}?</div>
                          <div className={styles.starPick} role="radiogroup" aria-label="Rating">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                role="radio"
                                aria-checked={stars === n}
                                aria-label={`${n} star${n === 1 ? '' : 's'}`}
                                className={n <= stars ? styles.starOn : styles.starOff}
                                onClick={() => setStars(n)}
                              >
                                ★
                              </button>
                            ))}
                          </div>
                          <input
                            className={styles.reviewInput}
                            maxLength={500}
                            placeholder="Add a comment (optional)"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                          />
                          <button type="button" className={styles.actPrimary} disabled={busy || stars < 1} onClick={submitReview}>
                            Submit review
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  <Link href={`/messages?c=${t.conversationId}`} className={styles.messageBtn}>
                    Open chat
                  </Link>
                </div>
              )}

              <div className={styles.dockControls}>
                {HAS_3D && (
                  <div className={styles.layerSwitch} role="group" aria-label="Map layer">
                    <button
                      type="button"
                      onClick={() => setLayer('photo')}
                      aria-pressed={layer === 'photo'}
                      className={layer === 'photo' ? styles.layerBtnOn : styles.layerBtn}
                    >
                      Photorealistic
                    </button>
                    <button
                      type="button"
                      onClick={() => setLayer('street')}
                      aria-pressed={layer === 'street'}
                      className={layer === 'street' ? styles.layerBtnOn : styles.layerBtn}
                    >
                      Street map
                    </button>
                  </div>
                )}
                <div className={styles.zoomControls}>
                  <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in" className={styles.zoomBtn}>
                    +
                  </button>
                  <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out" className={styles.zoomBtn}>
                    −
                  </button>
                  <button type="button" onClick={() => mapRef.current?.reset()} aria-label="Reset view" className={styles.resetBtn}>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#062F24" strokeWidth="1.6" strokeLinecap="round">
                      <path d="M4 10a6 6 0 1 1 2 4.4" />
                      <path d="M4 6.4V10h3.4" />
                    </svg>
                  </button>
                  {layer === 'photo' &&
                    (
                      [
                        ['tiltUp', 'Tilt up', 'M4 13l6-6 6 6'],
                        ['tiltDown', 'Tilt down', 'M4 7l6 6 6-6'],
                        ['rotateLeft', 'Rotate left', 'M12 4L6 10l6 6'],
                        ['rotateRight', 'Rotate right', 'M8 4l6 6-6 6'],
                      ] as const
                    ).map(([action, label, d]) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => mapRef.current?.[action]?.()}
                        aria-label={label}
                        title={label}
                        className={styles.resetBtn}
                      >
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#062F24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d={d} />
                        </svg>
                      </button>
                    ))}
                </div>
              </div>
            </div>

            {!panel && (
              <button type="button" onClick={() => setPanel(true)} className={styles.reopenPanelBtn}>
                <TruckIcon size={16} color="#2F6B45" />
                Your deliveries
                <span className={styles.pendingCountBadge}>{list.length}</span>
              </button>
            )}

            {panel && (
              <div data-panel="" className={styles.panel}>
                <div className={styles.panelHead}>
                  <div className={styles.panelHeadRow}>
                    <h2 className={styles.panelTitle}>Your deliveries</h2>
                    <span className={styles.panelHeadRight}>
                      <span className={styles.panelCountBadge}>{list.length}</span>
                      <button type="button" onClick={() => setPanel(false)} aria-label="Minimize panel" className={styles.minimizeBtn}>
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#4B5C53" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M5 13h10" />
                        </svg>
                      </button>
                    </span>
                  </div>
                  <p className={styles.panelSub}>Select one to see its route, schedule and payment.</p>
                </div>

                <div className={styles.panelList}>
                  {!txs && !loadError && <div className={styles.listNote}>Loading…</div>}
                  {txs && list.length === 0 && <div className={styles.listNote}>Nothing here yet.</div>}
                  {list.map((d) => {
                    const on = selected?.id === d.id;
                    const label = statusOf(d);
                    const chip = statusChip(label);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className={styles.itemCard}
                        onClick={() => {
                          setSelId(d.id);
                          setActionError('');
                        }}
                        style={{ '--item-border': on ? '#A7C641' : 'rgba(6,47,36,.1)', '--item-bg': on ? '#F6F9EC' : '#FFFFFF' } as CSSProperties}
                      >
                        <span className={styles.itemTop}>
                          <span className={styles.itemIconWrap} style={{ '--item-icon-bg': on ? '#062F24' : '#F1F5E4' } as CSSProperties}>
                            <TruckIcon size={18} color={on ? '#A7C641' : '#2F6B45'} />
                          </span>
                          <span className={styles.itemInfo}>
                            <span className={styles.itemCrop}>
                              {d.crop} — {d.variety}
                            </span>
                            <span className={styles.itemBuyer}>
                              {d.counterparty?.fullname ?? 'Other party'}
                              {d.counterparty?.farmName ? ` · ${d.counterparty.farmName}` : ''}
                            </span>
                          </span>
                          <span className={styles.itemStatus} style={{ '--item-status-fg': chip.fg, '--item-status-bg': chip.bg } as CSSProperties}>
                            {label}
                          </span>
                        </span>

                        <span className={styles.itemMetaGrid}>
                          <span className={styles.itemMetaRow}>{d.fulfillment === 'DELIVERY' ? 'Delivery' : 'Pickup'}</span>
                          <span className={styles.itemMetaRow}>
                            {d.role === 'SELLER' ? 'You sell' : 'You buy'}
                          </span>
                          <span className={styles.itemMetaRow}>
                            {fmtDate(d.scheduledAt)} · {fmtTime(d.scheduledAt)}
                          </span>
                          <span className={styles.itemMetaRow}>{d.distanceKm !== null ? `${d.distanceKm.toFixed(1)} km` : 'No route'}</span>
                        </span>

                        <span className={styles.itemFoot}>
                          <span className={styles.itemFootLabel}>Total amount</span>
                          <span className={styles.itemFootValue}>{peso(d.totalAmount)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className={styles.panelFoot}>
                  <span className={styles.panelFootLabel}>Combined value</span>
                  <span className={styles.panelFootValue}>{peso(activeTotal)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
