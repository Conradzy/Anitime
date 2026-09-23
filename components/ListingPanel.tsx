'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { CROPS, PAYMENT_LABEL, PLACE_LABEL } from '@/lib/crops';
import { timeAgo, type FeedListing } from '@/lib/feed';
import { getDevicePosition, searchPlaces } from '@/lib/geo';
import { fetchRoadRoute, type LatLng, type RouteResult } from '@/lib/routing';
import { FUEL_SET, VEHICLE_SET, haulEstimate } from '@/lib/vehicles';
// Same look as the buyer-request panel: its classes are reused as they are.
import styles from '@/app/seller-home/page.module.css';
import own from './ListingPanel.module.css';

// Leaflet only works in the browser, and it is only needed once a route exists.
const RouteMap = dynamic(() => import('./RouteMap'), { ssr: false });
const LocationPicker = dynamic(() => import('./LocationPicker'), { ssr: false });

const peso = (n: number, dec = 0) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Find coordinates for a place name. Listings posted without a map pin only
 * carry text like "Tagum, Davao del Norte", so try the whole label first and
 * then progressively shorter pieces of it. */
async function geocodeLabel(label: string): Promise<LatLng | null> {
  const parts = label.split(',').map((p) => p.trim()).filter(Boolean);
  const attempts = [label, parts.slice(0, 2).join(', '), parts[0]].filter((a, i, arr) => a && arr.indexOf(a) === i);
  for (const q of attempts) {
    try {
      const hit = (await searchPlaces(q))[0];
      if (hit) return { lat: hit.lat, lng: hit.lng };
    } catch {
      return null;
    }
  }
  return null;
}

function StarsLine({ seller }: { seller: FeedListing['seller'] }) {
  if (!seller || seller.reviewCount === 0) {
    return <span className={styles.drawerRatingText}>No reviews yet</span>;
  }
  const on = Math.round(seller.rating);
  return (
    <>
      <span className={styles.starsOnColor}>{'★★★★★'.slice(0, on)}</span>
      <span className={styles.starsOffColor}>{'★★★★★'.slice(0, 5 - on)}</span>{' '}
      <span className={styles.drawerRatingText}>
        {seller.rating.toFixed(1)} of {seller.reviewCount} review{seller.reviewCount === 1 ? '' : 's'}
      </span>
    </>
  );
}

export function ListingPanel({
  listing,
  userPos,
  onUserPos,
  onClose,
  onNegotiate,
  negotiating,
  error,
}: {
  listing: FeedListing;
  userPos: LatLng | null;
  onUserPos: (p: LatLng) => void;
  onClose: () => void;
  onNegotiate: (listingId: number) => void;
  negotiating: boolean;
  error: string;
}) {
  const unitKg = listing.unit === 'ton' ? 1000 : 1;
  const availableKg = listing.availableQuantity * unitKg;
  const totalPrice = listing.availableQuantity * listing.unitPrice;

  // ---- pick the smallest vehicle that fits the load ---------------------------
  const [vehicleKey, setVehicleKey] = useState<string>(
    () => (VEHICLE_SET.find((v) => v.capKg >= availableKg) ?? VEHICLE_SET[VEHICLE_SET.length - 1]).key
  );
  const [fuelKey, setFuelKey] = useState<string>('diesel');
  const vehicle = VEHICLE_SET.find((v) => v.key === vehicleKey)!;
  const fuel = FUEL_SET.find((f) => f.key === fuelKey)!;

  // ---- where the user is --------------------------------------------------------
  const [locError, setLocError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [posSource, setPosSource] = useState<'device' | 'map'>('device');

  useEffect(() => {
    if (listing.mine || userPos) return;
    let cancelled = false;
    // Deferred a tick so the browser's permission prompt opens after the panel
    // has painted, and so no state is set synchronously inside the effect.
    const t = setTimeout(async () => {
      try {
        const p = await getDevicePosition();
        if (!cancelled) {
          setPosSource('device');
          onUserPos(p);
        }
      } catch (e) {
        if (!cancelled) setLocError(e instanceof Error ? e.message : 'Could not get your location.');
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // `attempt` re-runs this when the user presses "Try again".
  }, [listing.mine, userPos, onUserPos, attempt]);

  // ---- where the product is -----------------------------------------------------
  const [geo, setGeo] = useState<{ id: number; point: LatLng | null } | null>(null);
  const hasPin = listing.latitude !== null && listing.longitude !== null;

  useEffect(() => {
    if (hasPin || listing.mine) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const point = await geocodeLabel(listing.location);
      if (!cancelled) setGeo({ id: listing.id, point });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [hasPin, listing.mine, listing.id, listing.location]);

  const dest = useMemo<LatLng | null>(() => {
    if (hasPin) return { lat: listing.latitude!, lng: listing.longitude! };
    return geo?.id === listing.id ? geo.point : null;
  }, [hasPin, listing.latitude, listing.longitude, listing.id, geo]);
  const destResolved = hasPin || geo?.id === listing.id;

  // ---- the road route -----------------------------------------------------------
  const [route, setRoute] = useState<{ key: string; result: RouteResult } | null>(null);
  const routeKey = userPos && dest ? `${userPos.lat},${userPos.lng}>${dest.lat},${dest.lng}` : '';

  useEffect(() => {
    if (!userPos || !dest || listing.mine) return;
    const ctl = new AbortController();
    const key = `${userPos.lat},${userPos.lng}>${dest.lat},${dest.lng}`;
    const t = setTimeout(async () => {
      try {
        const result = await fetchRoadRoute(userPos, dest, ctl.signal);
        setRoute({ key, result });
      } catch {
        /* aborted: a newer route is on its way */
      }
    }, 0);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [userPos, dest, listing.mine]);

  const current = route && route.key === routeKey ? route.result : null;
  const est = current ? haulEstimate(current.km, vehicle, fuel.price) : null;
  const trips = Math.ceil(availableKg / vehicle.capKg);

  // Esc closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !pickerOpen && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, pickerOpen]);

  const cropImg = CROPS.find((c) => c.name === listing.crop)?.img ?? '/images/crops/banana.png';
  const sellerName = listing.mine ? 'You' : (listing.seller?.name ?? 'Seller');
  const title = `${listing.crop} — ${listing.variety}`;

  // ---- what the route area shows --------------------------------------------------
  let routeArea: React.ReactNode;
  if (listing.mine) {
    routeArea = (
      <div className={own.locBox}>
        <span>This is your own listing, so there is no route to plan.</span>
      </div>
    );
  } else if (!userPos) {
    routeArea = locError ? (
      <div className={own.locBox}>
        <span>
          <strong>We need your location to plan the route.</strong>
          <br />
          {locError}
        </span>
        <div className={own.locActions}>
          <button
            type="button"
            className={own.locBtn}
            onClick={() => {
              setLocError('');
              setAttempt((a) => a + 1);
            }}
          >
            Try again
          </button>
          <button type="button" className={own.locBtnGhost} onClick={() => setPickerOpen(true)}>
            Choose on map
          </button>
        </div>
      </div>
    ) : (
      <div className={own.locBox} role="status">
        <span className={own.spin} />
        <span>
          <strong>Getting your location…</strong>
          <br />
          Choose <strong>Allow</strong> when your browser asks, so we can plan the route.
        </span>
        <button type="button" className={own.locBtnGhost} onClick={() => setPickerOpen(true)}>
          Choose on map instead
        </button>
      </div>
    );
  } else if (destResolved && !dest) {
    routeArea = (
      <div className={own.locBox}>
        <span>
          <strong>We couldn&apos;t find this place on the map.</strong>
          <br />
          The seller entered “{listing.location}”. Ask them for the exact spot when you negotiate.
        </span>
      </div>
    );
  } else if (!current || !dest) {
    routeArea = (
      <div className={own.locBox} role="status">
        <span className={own.spin} />
        <span>Finding the best road…</span>
      </div>
    );
  } else {
    routeArea = (
      <RouteMap
        from={userPos}
        to={dest}
        path={current.path}
        fromLabel={posSource === 'device' ? 'You' : 'Your pin'}
        toLabel={listing.location.split(',')[0]}
        approximate={current.source === 'straight'}
      />
    );
  }

  return (
    <div className={styles.drawerVeil} onClick={onClose}>
      <div className={styles.drawerPanel} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.drawerHeader}>
          <button type="button" onClick={onClose} aria-label="Close" className={styles.drawerCloseBtn}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#4B5C53" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11.5 5L6.5 10l5 5" />
            </svg>
          </button>
          <span className={styles.drawerKicker}>Product listing</span>
          <a href="#" className={styles.reportPostLink} onClick={(e) => e.preventDefault()}>
            Report post
          </a>
        </header>

        <div className={styles.drawerContent}>
          <div className={styles.drawerTopRow}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={listing.photos[0] ?? cropImg} alt={`${listing.crop} photo`} className={own.photo} />
            <div className={styles.drawerTitleWrap}>
              <h2 className={styles.drawerTitle}>{title}</h2>
              <div className={styles.buyerRow}>
                <span className={styles.buyerName}>{sellerName}</span>
                {listing.seller?.verified ? (
                  <span className={styles.verifiedBuyerBadge}>
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#2F6B45" strokeWidth="1.8">
                      <circle cx="10" cy="10" r="7.2" />
                      <path d="M6.8 10.2l2.2 2.2 4.2-4.4" />
                    </svg>
                    Verified seller
                  </span>
                ) : (
                  <span className={own.unverifiedBadge}>Unverified</span>
                )}
              </div>
              <div className={styles.shopMetaLine}>
                {PLACE_LABEL[listing.placeType] ?? 'Farm'}
                {listing.placeName ? ` · ${listing.placeName}` : ''} · {listing.location} · Posted {timeAgo(listing.createdAt)}
              </div>
              {listing.addressDetails && <div className={styles.shopMetaLine}>{listing.addressDetails}</div>}
              <div className={styles.drawerStarsWrap}>
                <StarsLine seller={listing.seller} />
              </div>
            </div>
          </div>

          <div className={styles.dealStatsGrid}>
            <div className={styles.dealStatCard}>
              <div className={styles.dealStatLabel}>Available</div>
              <div className={styles.dealStatValue}>
                {listing.availableQuantity.toLocaleString('en-PH')} {listing.unit}
              </div>
            </div>
            <div className={styles.dealStatCard}>
              <div className={styles.dealStatLabel}>Price per {listing.unit}</div>
              <div className={styles.dealStatValue}>{peso(listing.unitPrice, listing.unitPrice % 1 ? 2 : 0)} / {listing.unit}</div>
            </div>
            <div className={styles.dealStatCardDark}>
              <div className={styles.dealStatLabelDark}>Estimated total</div>
              <div className={styles.dealStatValueGreen}>{peso(totalPrice)}</div>
            </div>
          </div>

          {listing.description && <p className={styles.dealNote}>{listing.description}</p>}
          <p className={own.payLine}>
            <strong>{listing.priceType === 'FIXED' ? 'Fixed price' : 'Negotiable'}</strong>
            {listing.paymentMethods.length > 0 && (
              <> · Accepts {listing.paymentMethods.map((m) => PAYMENT_LABEL[m] ?? m).join(', ')}</>
            )}
          </p>

          <div className={styles.mt26}>
            <div className={styles.subHeadRow}>
              <h3 className={styles.subHeadTitle}>Route from your location</h3>
              <span className={styles.subHeadMeta}>
                {current ? `${current.km.toFixed(1)} km · ${current.source === 'road' ? 'by road' : 'estimated'}` : ''}
              </span>
            </div>
            <div className={own.mapSlot}>{routeArea}</div>
            {current?.source === 'straight' && (
              <p className={own.routeNoteWarn}>
                No road route could be found (the places may be on different islands, or the routing service is busy), so
                this is a straight-line estimate with a 30% allowance for roads.
              </p>
            )}
            {!hasPin && dest && !listing.mine && (
              <p className={own.routeNote}>
                The seller didn&apos;t drop a pin, so the destination is the center of “{listing.location.split(',')[0]}”.
                The exact spot may be a few kilometers away.
              </p>
            )}
            {userPos && !listing.mine && (
              <p className={own.routeNote}>
                Starting from {posSource === 'device' ? 'your current location' : 'the point you chose'}.{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setPickerOpen(true);
                  }}
                >
                  Change
                </a>
              </p>
            )}
          </div>

          {!listing.mine && (
            <div className={styles.mt26}>
              <h3 className={styles.subHeadTitle}>Hauling estimate</h3>
              <div className={styles.vehicleGrid}>
                {VEHICLE_SET.map((x) => {
                  const on = x.key === vehicleKey;
                  return (
                    <button
                      key={x.key}
                      type="button"
                      onClick={() => setVehicleKey(x.key)}
                      className={styles.vehicleBtn}
                      style={{ '--vb-border': on ? '#A7C641' : 'rgba(6,47,36,.14)', '--vb-bg': on ? '#F1F5E4' : '#FFFFFF' } as CSSProperties}
                    >
                      <span className={styles.vehicleName}>{x.label}</span>
                      <span className={styles.vehicleCap} style={{ '--vc-color': on ? '#4B5C53' : '#6A7A71' } as CSSProperties}>
                        {x.cap}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.fuelRow}>
                <span className={styles.fuelLabel}>Fuel</span>
                <div className={styles.fuelPillWrap}>
                  {FUEL_SET.map((x) => {
                    const on = x.key === fuelKey;
                    return (
                      <button
                        key={x.key}
                        type="button"
                        onClick={() => setFuelKey(x.key)}
                        className={styles.fuelBtn}
                        style={{ '--fb2-bg': on ? '#062F24' : 'transparent', '--fb2-fg': on ? '#F6F5EF' : '#4B5C53' } as CSSProperties}
                      >
                        {x.label}
                      </button>
                    );
                  })}
                </div>
                <span className={styles.fuelPriceNote}>{peso(fuel.price, 2)} / L indicative</span>
              </div>

              <div className={styles.haulingStatsGrid}>
                <div className={styles.dealStatCard}>
                  <div className={styles.dealStatLabel}>ETA</div>
                  <div className={styles.haulingStatValue}>{est ? est.etaLabel : '—'}</div>
                  <div className={styles.haulingStatMeta}>
                    {vehicle.label} · {current ? `${current.km.toFixed(1)} km one way` : 'waiting for route'}
                  </div>
                </div>
                <div className={styles.dealStatCard}>
                  <div className={styles.dealStatLabel}>Fuel needed</div>
                  <div className={styles.haulingStatValue}>{est ? `${est.liters.toFixed(1)} L` : '—'}</div>
                  <div className={styles.haulingStatMeta}>
                    {vehicle.kmpl} km/L · {est ? `${est.roundTripKm.toFixed(1)} km round trip` : 'round trip'}
                  </div>
                </div>
                <div className={styles.dealStatCard}>
                  <div className={styles.dealStatLabel}>Fuel cost</div>
                  <div className={styles.haulingStatValue}>{est ? peso(est.cost) : '—'}</div>
                  <div className={styles.haulingStatMeta}>Round trip</div>
                </div>
              </div>

              {trips > 1 && (
                <p className={own.capNote}>
                  {vehicle.label} carries {vehicle.cap.replace('up to ', '')}, but this listing has{' '}
                  {availableKg.toLocaleString('en-PH')} kg — that&apos;s about {trips} trips, or choose a larger vehicle. The
                  costs above are for one trip.
                </p>
              )}
              <p className={styles.haulingDisclaimer}>
                Distance follows real roads. Fuel is priced at about ₱94 per liter and speeds are averages — confirm
                hauling terms during negotiation.
              </p>
            </div>
          )}

          <div className={styles.reviewsBlock}>
            <div className={styles.subHeadRow}>
              <h3 className={styles.subHeadTitle}>Reviews</h3>
            </div>
            <div className={own.noReviews}>
              {listing.seller && listing.seller.reviewCount > 0
                ? `${listing.seller.name} has ${listing.seller.reviewCount} review${listing.seller.reviewCount === 1 ? '' : 's'} with an average of ${listing.seller.rating.toFixed(1)} stars.`
                : 'No reviews yet. Reviews from completed deals will show up here.'}
            </div>
          </div>
        </div>

        <footer className={styles.drawerFooter}>
          <div className={styles.footerAmountWrap}>
            <div className={styles.footerAmountLabel}>Estimated payment</div>
            <div className={styles.footerAmountValue}>{peso(totalPrice)}</div>
            {error && <div className={own.routeNoteWarn}>{error}</div>}
          </div>
          {listing.mine ? (
            <span className={own.ownNote}>Your listing</span>
          ) : (
            <button
              type="button"
              className={`${styles.negotiateBtn} ${own.negotiateBtnBtn}`}
              disabled={negotiating}
              onClick={() => onNegotiate(listing.id)}
            >
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="#062F24" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.4 5.2h13.2v8.4H8.6L5 16.6v-3H3.4z" />
              </svg>
              {negotiating ? 'Opening…' : 'Negotiate now'}
            </button>
          )}
        </footer>
      </div>

      {pickerOpen && (
        // React events bubble through the tree: without this, a click inside
        // the picker would reach the veil above and close the whole panel.
        <div onClick={(e) => e.stopPropagation()}>
          <LocationPicker
            initial={userPos}
            onCancel={() => setPickerOpen(false)}
            onConfirm={(picked) => {
              setPosSource('map');
              setLocError('');
              onUserPos({ lat: picked.lat, lng: picked.lng });
              setPickerOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
