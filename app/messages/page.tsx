'use client';

import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AppSidebar } from '@/components/AppSidebar';
import { DateTimePicker } from '@/components/DateTimePicker';
import { PAYMENT_LABEL } from '@/lib/crops';
import { getDevicePosition, reverseGeocode } from '@/lib/geo';
import styles from './page.module.css';

const LocationPicker = dynamic(() => import('@/components/LocationPicker'), { ssr: false });

/* ---------------------------------------------------------------- types ---- */

type Badge = {
  id: number; name: string; fullname: string; farmName: string | null; photoUrl: string | null;
  verified: boolean; rating: number; reviewCount: number;
};

type ConversationRow = {
  id: number;
  role: 'BUYER' | 'SELLER';
  other: Badge | null;
  listing: { id: number; title: string; unit: string; unitPrice: number; availableQuantity: number };
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
};

type OfferData = {
  id: number;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalAmount: number;
  message: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED' | 'WITHDRAWN' | 'EXPIRED';
  proposedBy: 'BUYER' | 'SELLER';
  fulfillment: 'DELIVERY' | 'PICKUP';
  scheduledAt: string | null;
  buyerLat: number | null;
  buyerLng: number | null;
  buyerAddress: string | null;
  sellerLat: number | null;
  sellerLng: number | null;
  sellerAddress: string | null;
};

type ChatMessage = {
  id: number;
  type: 'TEXT' | 'OFFER' | 'SYSTEM';
  body: string | null;
  mine: boolean;
  createdAt: string;
  offer: OfferData | null;
  images: string[];
};

type ConversationDetail = {
  id: number;
  role: 'BUYER' | 'SELLER';
  other: Badge | null;
  listing: {
    id: number; title: string; unit: string; unitPrice: number; priceType: 'NEGOTIABLE' | 'FIXED';
    quantity: number; availableQuantity: number; paymentMethods: string[]; status: string;
    /** what the seller (or, for a buy request, the buyer) allows: an offer may only pick from this */
    fulfillment: 'PICKUP' | 'DELIVERY' | 'BOTH';
    /** LISTING = a seller's product; BUY_REQUEST = a buyer's want, being answered by a seller. */
    kind: 'LISTING' | 'BUY_REQUEST';
  };
  transaction: {
    id: number; code: string; quantity: number; unit: string; agreedUnitPrice: number; totalAmount: number;
    status: string; fulfillment: 'DELIVERY' | 'PICKUP'; scheduledAt: string | null; distanceKm: number | null;
  } | null;
  messages: ChatMessage[];
};

type MarketListing = {
  id: number; crop: string; variety: string; unit: string; unitPrice: number; availableQuantity: number;
  location: string; paymentMethods: string[]; seller: Badge | null;
};

/* -------------------------------------------------------------- helpers ---- */

const peso = (n: number, dec = 2) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: n % 1 === 0 ? 0 : dec, maximumFractionDigits: dec });
const round2 = (n: number) => Math.round(n * 100) / 100;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

const pad2 = (n: number) => String(n).padStart(2, '0');
/** A Date as the "yyyy-mm-ddThh:mm" text a date-time input wants (local time). */
function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function defaultWhen() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d);
}
function fmtWhen(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
}

/** Profile picture when there is one, otherwise the person's initials. */
function Avatar({ b, large }: { b: Badge | null; large?: boolean }) {
  const cls = large ? styles.avatarLg : styles.avatar;
  if (b?.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={b.photoUrl} alt="" className={`${cls} ${styles.avatarImg}`} />;
  }
  return <span className={cls}>{initials(b?.fullname || b?.name || '?')}</span>;
}

function timeShort(iso: string) {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
}
function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
}

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  return { ok: res.ok, data: await res.json().catch(() => ({}) as T & { error?: string }) };
}

function Stars({ b }: { b: Badge | null }) {
  if (!b) return null;
  return b.reviewCount ? (
    <span className={styles.stars}>
      <span className={styles.starOn}>★</span> {b.rating.toFixed(1)} <span className={styles.muted}>({b.reviewCount})</span>
    </span>
  ) : (
    <span className={styles.muted}>No reviews yet</span>
  );
}

function VerifiedTag({ b }: { b: Badge | null }) {
  if (!b) return null;
  return <span className={b.verified ? styles.tagVerified : styles.tagUnverified}>{b.verified ? '✓ Verified' : 'Unverified'}</span>;
}

/* ---------------------------------------------------------- offer modal ---- */

function OfferModal({
  detail,
  parent,
  onClose,
  onSent,
}: {
  detail: ConversationDetail;
  parent: OfferData | null; // set when countering
  onClose: () => void;
  onSent: () => void;
}) {
  const { listing } = detail;
  const maxQty = listing.availableQuantity;
  const fixed = listing.priceType === 'FIXED';

  const [mode, setMode] = useState<'unit' | 'total'>('unit');
  const [qty, setQty] = useState(String(parent?.quantity ?? maxQty));
  const [unitPrice, setUnitPrice] = useState(String(parent?.unitPrice ?? listing.unitPrice));
  const [total, setTotal] = useState(String(parent?.totalAmount ?? round2(maxQty * listing.unitPrice)));
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // How and when the goods change hands. On a listing, the buyer says where
  // they are (the seller's side is the listing's own pin). On a buy request
  // it is the mirror: the buyer's side is already known from the request
  // itself, and the responding SELLER is the one who has to say where they
  // are. Either way, a counteroffer keeps the location and can change
  // everything else.
  const isBuyer = detail.role === 'BUYER';
  const mustSetLocation = listing.kind === 'BUY_REQUEST' ? !isBuyer : isBuyer;
  const [fulfillment, setFulfillment] = useState<'DELIVERY' | 'PICKUP'>(
    listing.fulfillment === 'BOTH' ? (parent?.fulfillment ?? 'PICKUP') : listing.fulfillment
  );
  const [when, setWhen] = useState(() => (parent?.scheduledAt ? toLocalInput(new Date(parent.scheduledAt)) : defaultWhen()));
  const parentLoc =
    listing.kind === 'BUY_REQUEST'
      ? parent && parent.sellerLat !== null && parent.sellerLng !== null
        ? { lat: parent.sellerLat, lng: parent.sellerLng, label: parent.sellerAddress ?? 'Seller location' }
        : null
      : parent && parent.buyerLat !== null && parent.buyerLng !== null
        ? { lat: parent.buyerLat, lng: parent.buyerLng, label: parent.buyerAddress ?? 'Buyer location' }
        : null;
  const [loc, setLoc] = useState<{ lat: number; lng: number; label: string } | null>(parentLoc);
  const [locating, setLocating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function useMyLocation() {
    setLocating(true);
    setErr('');
    try {
      const pos = await getDevicePosition();
      setLoc({ ...pos, label: await reverseGeocode(pos) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  }

  const q = Number(qty) || 0;
  // Whichever field the user is typing drives the other one.
  const effUnit = mode === 'unit' ? Number(unitPrice) || 0 : q > 0 ? round2((Number(total) || 0) / q) : 0;
  const effTotal = mode === 'unit' ? round2(q * effUnit) : Number(total) || 0;
  const diffPct = listing.unitPrice > 0 ? ((effUnit - listing.unitPrice) / listing.unitPrice) * 100 : 0;
  const remaining = Math.max(maxQty - q, 0);

  async function send() {
    setErr('');
    if (!(q > 0)) return setErr('Enter a quantity.');
    if (q > maxQty) return setErr(`Only ${maxQty} ${listing.unit} available.`);
    if (!(effUnit > 0)) return setErr('Enter a price.');
    const scheduled = new Date(when);
    if (!when || Number.isNaN(scheduled.getTime())) return setErr(`Choose a date and time for the ${fulfillment === 'DELIVERY' ? 'delivery' : 'pickup'}.`);
    if (scheduled.getTime() < Date.now() - 5 * 60 * 1000) return setErr('That date and time has already passed.');
    if (mustSetLocation && !loc) {
      return setErr(
        listing.kind === 'BUY_REQUEST'
          ? fulfillment === 'DELIVERY'
            ? 'Set your location first, so the buyer knows where it is coming from.'
            : 'Set your location first, so we can work out the route and travel time for the pickup.'
          : fulfillment === 'DELIVERY'
            ? 'Set the delivery location so the seller knows where to bring it.'
            : 'Set your location so we can work out the route and travel time to the pickup.'
      );
    }
    if (!mustSetLocation && !loc) {
      return setErr(
        listing.kind === 'BUY_REQUEST'
          ? "This offer has no seller location, so it can't be countered. Ask the seller to send a new offer."
          : "This offer has no buyer location, so it can't be countered. Ask the buyer to send a new offer."
      );
    }
    setBusy(true);
    const { ok, data } = await api<object>(`/api/conversations/${detail.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'OFFER', quantity: q, unitPrice: effUnit, message: note, parentOfferId: parent?.id,
        fulfillment, scheduledAt: scheduled.toISOString(),
        ...(mustSetLocation && loc
          ? listing.kind === 'BUY_REQUEST'
            ? { sellerLat: loc.lat, sellerLng: loc.lng, sellerAddress: loc.label }
            : { buyerLat: loc.lat, buyerLng: loc.lng, buyerAddress: loc.label }
          : {}),
      }),
    });
    setBusy(false);
    if (!ok) return setErr(data.error ?? 'Could not send the offer.');
    onSent();
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.offerModal} role="dialog" aria-modal="true" aria-label={parent ? 'Counter offer' : 'Make an offer'}>
        <div className={styles.offerHead}>
          <div>
            <h3 className={styles.offerTitle}>{parent ? 'Counter Offer' : 'Make an Offer'}</h3>
            <div className={styles.muted}>{listing.title}</div>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        {!fixed && (
          <div className={styles.segment} role="group" aria-label="Offer type">
            <button type="button" className={mode === 'unit' ? styles.segOn : styles.seg} onClick={() => setMode('unit')}>
              Price per {listing.unit}
            </button>
            <button type="button" className={mode === 'total' ? styles.segOn : styles.seg} onClick={() => setMode('total')}>
              Total offer
            </button>
          </div>
        )}
        {fixed && <div className={styles.notice}>This listing has a fixed price of {peso(listing.unitPrice)} / {listing.unit}.</div>}

        <div className={styles.offerGrid}>
          <label className={styles.fieldCol}>
            <span className={styles.fieldLabel}>Quantity ({listing.unit})</span>
            <input className={styles.textInput} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ''))} />
          </label>
          {mode === 'unit' || fixed ? (
            <label className={styles.fieldCol}>
              <span className={styles.fieldLabel}>Offer price (₱ / {listing.unit})</span>
              <input
                className={styles.textInput}
                inputMode="decimal"
                disabled={fixed}
                value={fixed ? String(listing.unitPrice) : unitPrice}
                onChange={(e) => setUnitPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              />
            </label>
          ) : (
            <label className={styles.fieldCol}>
              <span className={styles.fieldLabel}>Total offer (₱)</span>
              <input className={styles.textInput} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^0-9.]/g, ''))} />
            </label>
          )}
        </div>

        <dl className={styles.calc}>
          <div><dt>Total offer</dt><dd>{peso(fixed ? round2(q * listing.unitPrice) : effTotal)}</dd></div>
          <div><dt>Equivalent price</dt><dd>{peso(fixed ? listing.unitPrice : effUnit)} / {listing.unit}</dd></div>
          <div><dt>Listed price</dt><dd>{peso(listing.unitPrice)} / {listing.unit}</dd></div>
          {!fixed && effUnit > 0 && (
            <div>
              <dt>Difference</dt>
              <dd>{Math.abs(diffPct) < 0.05 ? 'Same as listed' : `${Math.abs(diffPct).toFixed(1)}% ${diffPct < 0 ? 'below' : 'above'} listed`}</dd>
            </div>
          )}
          <div><dt>Listing quantity</dt><dd>{maxQty} {listing.unit}</dd></div>
          <div><dt>Remaining if accepted</dt><dd>{remaining} {listing.unit}</dd></div>
        </dl>

        <div className={styles.fieldCol}>
          <span className={styles.fieldLabel}>How will it get to the buyer?</span>
          {listing.fulfillment === 'BOTH' ? (
            <div className={styles.segment} role="group" aria-label="Delivery or pickup">
              <button type="button" className={fulfillment === 'PICKUP' ? styles.segOn : styles.seg} onClick={() => setFulfillment('PICKUP')}>
                Pickup <span className={styles.segSub}>buyer collects</span>
              </button>
              <button type="button" className={fulfillment === 'DELIVERY' ? styles.segOn : styles.seg} onClick={() => setFulfillment('DELIVERY')}>
                Delivery <span className={styles.segSub}>seller brings it</span>
              </button>
            </div>
          ) : (
            // The seller fixed this when they posted the product, so there is
            // nothing to decide here.
            <div className={styles.fixedFulfil}>
              {listing.fulfillment === 'PICKUP' ? 'Pickup only' : 'Delivery only'}
              <span className={styles.segSub}>
                {listing.fulfillment === 'PICKUP' ? 'the buyer collects it' : 'the seller brings it'} — set by the seller
              </span>
            </div>
          )}
        </div>

        <div className={styles.fieldCol}>
          <span className={styles.fieldLabel} id="offer-when-label">
            {fulfillment === 'DELIVERY' ? 'Delivery' : 'Pickup'} date and time
          </span>
          <DateTimePicker
            id="offer-when"
            value={when}
            onChange={setWhen}
            minDate={new Date()}
            placeholder={`Choose the ${fulfillment === 'DELIVERY' ? 'delivery' : 'pickup'} date and time`}
          />
        </div>

        <div className={styles.fieldCol}>
          <span className={styles.fieldLabel}>
            {fulfillment === 'DELIVERY' ? 'Delivery location *' : 'Where will you travel from? *'}
          </span>
          {mustSetLocation ? (
            <div className={styles.locBlock}>
              <div className={loc ? styles.locPicked : styles.locEmpty}>{loc ? loc.label : 'Not set yet — required'}</div>
              {!loc && (
                <div className={styles.locWhy}>
                  {listing.kind === 'BUY_REQUEST'
                    ? fulfillment === 'DELIVERY'
                      ? 'The buyer needs this to know where their order is coming from.'
                      : 'Used to show the route, distance and travel time for the pickup. It is shared only with the buyer of this request.'
                    : fulfillment === 'DELIVERY'
                      ? 'The seller needs this to bring your order to you.'
                      : 'Used to show the route, distance and travel time to the pickup. It is shared only with the seller of this listing.'}
                </div>
              )}
              <div className={styles.locBtns}>
                <button type="button" className={styles.ghostBtn} disabled={locating} onClick={useMyLocation}>
                  {locating ? 'Locating…' : 'Use my location'}
                </button>
                <button type="button" className={styles.ghostBtn} onClick={() => setPickerOpen(true)}>Choose on map</button>
              </div>
            </div>
          ) : (
            <div className={styles.locBlock}>
              <div className={loc ? styles.locPicked : styles.locEmpty}>
                {loc ? loc.label : listing.kind === 'BUY_REQUEST' ? "The seller didn't set a location" : "The buyer didn't set a location"}
              </div>
            </div>
          )}
        </div>

        <label className={styles.fieldCol}>
          <span className={styles.fieldLabel}>Message (optional)</span>
          <input className={styles.textInput} maxLength={300} placeholder="I can do this price for the whole lot." value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {err && <div className={styles.errBox}>{err}</div>}
        <button type="button" className={styles.primaryBtn} disabled={busy} onClick={send}>
          {busy ? 'Sending…' : parent ? 'Send Counter Offer' : 'Send Offer'}
        </button>
      </div>
      {pickerOpen && (
        <LocationPicker
          title={fulfillment === 'DELIVERY' ? 'Delivery location' : 'Where will you travel from?'}
          initial={loc}
          onCancel={() => setPickerOpen(false)}
          onConfirm={(picked) => {
            setLoc({ lat: picked.lat, lng: picked.lng, label: picked.label });
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------- offer card ---- */

const OFFER_STATUS_LABEL: Record<OfferData['status'], string> = {
  PENDING: 'Waiting for response',
  ACCEPTED: 'Accepted',
  REJECTED: 'Declined',
  COUNTERED: 'Countered',
  WITHDRAWN: 'Withdrawn',
  EXPIRED: 'Expired',
};

function OfferCard({
  offer,
  mine,
  listedPrice,
  onAct,
  onCounter,
}: {
  offer: OfferData;
  mine: boolean;
  listedPrice: number;
  onAct: (id: number, action: 'accept' | 'decline' | 'withdraw') => void;
  onCounter: (o: OfferData) => void;
}) {
  const label = offer.proposedBy === 'BUYER' ? 'Buyer offer' : 'Seller counter offer';
  const pending = offer.status === 'PENDING';
  return (
    <div className={`${styles.offerCard} ${mine ? styles.offerMine : ''}`}>
      <div className={styles.offerCardTop}>
        <span className={styles.offerKind}>{label}</span>
        <span className={pending ? styles.statusPending : offer.status === 'ACCEPTED' ? styles.statusOk : styles.statusOff}>
          {OFFER_STATUS_LABEL[offer.status]}
        </span>
      </div>
      <dl className={styles.offerRows}>
        <div><dt>Quantity</dt><dd>{offer.quantity} {offer.unit}</dd></div>
        <div><dt>Offer price</dt><dd>{peso(offer.unitPrice)} / {offer.unit}</dd></div>
        <div className={styles.offerTotalRow}><dt>Total offer</dt><dd>{peso(offer.totalAmount)}</dd></div>
        <div><dt>Listed price</dt><dd>{peso(listedPrice)} / {offer.unit}</dd></div>
        <div><dt>{offer.fulfillment === 'DELIVERY' ? 'Delivery' : 'Pickup'}</dt><dd>{fmtWhen(offer.scheduledAt)}</dd></div>
        {offer.buyerAddress && <div><dt>Buyer location</dt><dd>{offer.buyerAddress}</dd></div>}
        {offer.sellerAddress && <div><dt>Seller location</dt><dd>{offer.sellerAddress}</dd></div>}
      </dl>
      {offer.message && <p className={styles.offerNote}>“{offer.message}”</p>}
      {pending && !mine && (
        <div className={styles.offerActions}>
          <button type="button" className={styles.acceptBtn} onClick={() => onAct(offer.id, 'accept')}>Accept</button>
          <button type="button" className={styles.ghostBtn} onClick={() => onCounter(offer)}>Counter</button>
          <button type="button" className={styles.ghostBtn} onClick={() => onAct(offer.id, 'decline')}>Decline</button>
        </div>
      )}
      {pending && mine && (
        <div className={styles.offerActions}>
          <button type="button" className={styles.ghostBtn} onClick={() => onAct(offer.id, 'withdraw')}>Withdraw offer</button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- new chat ---- */

function NewChatModal({ onClose, onOpen }: { onClose: () => void; onOpen: (conversationId: number) => void }) {
  const [rows, setRows] = useState<MarketListing[] | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    api<{ listings: MarketListing[] }>('/api/listings').then(({ ok, data }) => {
      if (cancelled) return;
      if (ok) setRows(data.listings);
      else setErr(data.error ?? 'Could not load listings.');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function start(listingId: number) {
    const { ok, data } = await api<{ id: number }>('/api/conversations', { method: 'POST', body: JSON.stringify({ listingId }) });
    if (ok) onOpen(data.id);
    else setErr(data.error ?? 'Could not start the chat.');
  }

  const shown = (rows ?? []).filter((l) => (l.crop + ' ' + l.variety + ' ' + (l.seller?.name ?? '')).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.offerModal} role="dialog" aria-modal="true" aria-label="Start a chat">
        <div className={styles.offerHead}>
          <div>
            <h3 className={styles.offerTitle}>Start a chat</h3>
            <div className={styles.muted}>Pick a listing to chat with its seller.</div>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close">×</button>
        </div>
        <input className={styles.textInput} placeholder="Search crop or seller" value={q} onChange={(e) => setQ(e.target.value)} />
        {err && <div className={styles.errBox}>{err}</div>}
        <div className={styles.pickList}>
          {rows === null && !err && <div className={styles.muted}>Loading listings…</div>}
          {rows && shown.length === 0 && <div className={styles.muted}>No live listings from other sellers yet.</div>}
          {shown.map((l) => (
            <div key={l.id} className={styles.pickItem}>
              <div className={styles.pickText}>
                <div className={styles.pickTitle}>{l.crop} — {l.variety}</div>
                <div className={styles.muted}>
                  {l.availableQuantity} {l.unit} · {peso(l.unitPrice)}/{l.unit} · {l.location}
                </div>
                <div className={styles.pickSeller}>
                  {l.seller?.name} <VerifiedTag b={l.seller} /> <Stars b={l.seller} />
                </div>
                {l.paymentMethods.length > 0 && (
                  <div className={styles.muted}>Pays via {l.paymentMethods.map((p) => PAYMENT_LABEL[p] ?? p).join(', ')}</div>
                )}
              </div>
              <button type="button" className={styles.acceptBtn} onClick={() => start(l.id)}>Chat</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- page ---- */

/** Full-screen view of a picture from the chat. Closes with the X button, the
 * Escape key, or a click outside the picture — tapping it open used to load it
 * in a new browser tab with no way back. */
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Picture" onClick={onClose}>
      <button type="button" className={styles.lightboxX} aria-label="Close picture" onClick={onClose}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <path d="M5 5l10 10" />
          <path d="M15 5L5 15" />
        </svg>
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Sent picture" className={styles.lightboxImg} onClick={(e) => e.stopPropagation()} />
      <a className={styles.lightboxOpen} href={src} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        Open full size ↗
      </a>
    </div>
  );
}

export default function MessagesPage() {
  // useSearchParams needs a Suspense boundary during static rendering.
  return (
    <Suspense fallback={null}>
      <MessagesInner />
    </Suspense>
  );
}

function MessagesInner() {
  const [mini, setMini] = useState(false);
  const [convs, setConvs] = useState<ConversationRow[] | null>(null);
  // /messages?c=12 opens that chat (used by "Chat with seller" on the home feed).
  const startId = Number(useSearchParams().get('c')) || null;
  const [activeId, setActiveId] = useState<number | null>(startId);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'buying' | 'selling'>('all');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [pics, setPics] = useState<{ path: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(0);
  const [offerFor, setOfferFor] = useState<{ parent: OfferData | null } | null>(null);
  const [newChat, setNewChat] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    const { ok, data } = await api<{ conversations: ConversationRow[] }>('/api/conversations');
    if (ok) setConvs(data.conversations);
    else setConvs((c) => c ?? []);
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    const { ok, data } = await api<ConversationDetail>(`/api/conversations/${id}`);
    if (ok) setDetail(data);
  }, []);

  // Poll for new messages / offers (no websocket yet).
  useEffect(() => {
    const first = setTimeout(loadList, 0);
    const t = setInterval(loadList, 6000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadList]);

  useEffect(() => {
    if (activeId === null) return;
    const first = setTimeout(() => loadDetail(activeId), 0);
    const t = setInterval(() => loadDetail(activeId), 3500);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [activeId, loadDetail]);

  const lastMsgId = detail?.messages[detail.messages.length - 1]?.id;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lastMsgId, activeId]);

  function open(id: number) {
    setActiveId(id);
    setDetail((d) => (d?.id === id ? d : null));
    setNotice('');
  }

  async function refreshAll() {
    if (activeId !== null) await loadDetail(activeId);
    await loadList();
  }

  async function sendText() {
    const body = draft.trim();
    if ((!body && pics.length === 0) || activeId === null || uploading > 0) return;
    setSending(true);
    const { ok, data } = await api<object>(`/api/conversations/${activeId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ type: 'TEXT', body, images: pics.map((p) => p.path) }),
    });
    setSending(false);
    if (!ok) return setNotice(data.error ?? 'Message not sent.');
    setDraft('');
    setPics([]);
    setNotice('');
    refreshAll();
  }

  /** Uploads picked pictures one by one, so each shows up as soon as it is ready. */
  async function addPictures(files: FileList | null) {
    if (!files) return;
    const room = 4 - pics.length - uploading;
    if (room <= 0) return setNotice('You can send up to 4 pictures at once.');
    setNotice(files.length > room ? 'Only the first ' + room + ' pictures were added (4 per message).' : '');
    for (const file of Array.from(files).slice(0, room)) {
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
        setNotice(`${file.name}: only PNG, JPG or WEBP pictures.`);
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        setNotice(`${file.name} is over 5 MB.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/uploads', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'Upload failed.');
        setPics((list) => [...list, { path: data.path, url: data.url }]);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Upload failed.');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function act(offerId: number, action: 'accept' | 'decline' | 'withdraw') {
    const { ok, data } = await api<object>(`/api/offers/${offerId}`, { method: 'PATCH', body: JSON.stringify({ action }) });
    setNotice(ok ? '' : (data.error ?? 'That did not work.'));
    refreshAll();
  }

  const q = search.trim().toLowerCase();
  const visible = (convs ?? []).filter((c) => {
    if (filter === 'unread' && c.unread === 0) return false;
    if (filter === 'buying' && c.role !== 'BUYER') return false;
    if (filter === 'selling' && c.role !== 'SELLER') return false;
    return !q || (c.other?.name + ' ' + c.listing.title).toLowerCase().includes(q);
  });

  const hasPending = detail?.messages.some((m) => m.offer?.status === 'PENDING') ?? false;
  // A finished or cancelled deal doesn't block a new offer for whatever is still
  // for sale; only a live one does.
  const liveDeal = detail?.transaction?.status === 'ACTIVE';
  const canOffer = detail && !liveDeal && detail.listing.status === 'ACTIVE' && !hasPending;

  return (
    <div data-shell="" className={styles.shell} style={{ '--cols': mini ? '76px' : '246px' } as CSSProperties}>
      <AppSidebar active="messages" mini={mini} onToggle={() => setMini((m) => !m)} />

      <main className={styles.main}>
        {/* conversation list */}
        <section className={styles.listPane} aria-label="Conversations">
          <div className={styles.listHead}>
            <h1 className={styles.heading}>Messages</h1>
            <button type="button" className={styles.newBtn} onClick={() => setNewChat(true)}>+ New chat</button>
          </div>
          <input
            type="search"
            className={styles.textInput}
            placeholder="Search chats"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className={styles.filters} role="group" aria-label="Filter conversations">
            {(['all', 'unread', 'buying', 'selling'] as const).map((f) => (
              <button key={f} type="button" className={filter === f ? styles.filterOn : styles.filter} onClick={() => setFilter(f)}>
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div className={styles.convList}>
            {convs === null && <div className={styles.emptyList}>Loading…</div>}
            {convs && visible.length === 0 && (
              <div className={styles.emptyList}>
                {convs.length === 0 ? 'Conversations will appear here' : 'No chats match this filter'}
              </div>
            )}
            {visible.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => open(c.id)}
                className={c.id === activeId ? styles.convOn : styles.conv}
              >
                <Avatar b={c.other} />
                <span className={styles.convText}>
                  <span className={styles.convTop}>
                    <span className={styles.convName}>{c.other?.name ?? 'Unknown'}</span>
                    <span className={styles.convTime}>{timeAgo(c.lastMessageAt)}</span>
                  </span>
                  <span className={styles.convListing}>{c.listing.title}</span>
                  <span className={styles.convLast}>{c.lastMessage || 'No messages yet'}</span>
                </span>
                {c.unread > 0 && <span className={styles.unread}>{c.unread}</span>}
              </button>
            ))}
          </div>
        </section>

        {/* thread */}
        <section className={styles.threadPane} aria-label="Conversation">
          {activeId === null || !detail ? (
            <div className={styles.welcome}>
              <div className={styles.welcomeIcon}>
                <svg width="42" height="42" viewBox="0 0 20 20" fill="none" stroke="#2F6B45" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.4 5.2h13.2v8.4H8.6L5 16.6v-3H3.4z" />
                </svg>
              </div>
              <h2 className={styles.welcomeTitle}>{activeId === null ? 'Welcome to Messages' : 'Loading conversation…'}</h2>
              {activeId === null && (
                <>
                  <p className={styles.welcomeText}>Pick a listing, chat with its seller, make an offer and start a transaction once you agree.</p>
                  <button type="button" className={styles.primaryBtn} onClick={() => setNewChat(true)}>Start a chat</button>
                </>
              )}
            </div>
          ) : (
            <>
              <header className={styles.threadHead}>
                <Avatar b={detail.other} large />
                <div className={styles.threadWho}>
                  <div className={styles.threadName}>
                    {detail.other?.fullname ?? detail.other?.name} <VerifiedTag b={detail.other} />
                  </div>
                  {detail.other?.farmName && <div className={styles.farmLine}>{detail.other.farmName}</div>}
                  <div className={styles.muted}><Stars b={detail.other} /></div>
                </div>
                <div className={styles.listingChip}>
                  <div className={styles.chipTitle}>{detail.listing.title}</div>
                  <div className={styles.muted}>
                    {detail.listing.availableQuantity} {detail.listing.unit} left · {peso(detail.listing.unitPrice)}/{detail.listing.unit}
                    {detail.listing.priceType === 'FIXED' ? ' · Fixed' : ' · Negotiable'}
                  </div>
                  {detail.listing.paymentMethods.length > 0 && (
                    <div className={styles.muted}>Pays via {detail.listing.paymentMethods.map((p) => PAYMENT_LABEL[p] ?? p).join(', ')}</div>
                  )}
                </div>
              </header>

              {detail.transaction && (
                <div className={styles.txBanner}>
                  <div>
                    <strong>Transaction {detail.transaction.code}</strong> · {detail.transaction.quantity} {detail.transaction.unit} ×{' '}
                    {peso(detail.transaction.agreedUnitPrice)} = <strong>{peso(detail.transaction.totalAmount)}</strong>
                    {' · '}{detail.transaction.fulfillment === 'DELIVERY' ? 'Delivery' : 'Pickup'} {fmtWhen(detail.transaction.scheduledAt)}
                    {detail.transaction.status !== 'ACTIVE' && <> · <strong>{detail.transaction.status.toLowerCase()}</strong></>}
                  </div>
                  <Link href={`/deliveries?t=${detail.transaction.id}`} className={styles.txLink}>View delivery →</Link>
                </div>
              )}

              <div className={styles.messages}>
                {detail.messages.length === 0 && <div className={styles.emptyList}>Say hello or make an offer to get started.</div>}
                {detail.messages.map((m) =>
                  m.type === 'SYSTEM' ? (
                    <div key={m.id} className={styles.system}>{m.body}</div>
                  ) : m.type === 'OFFER' && m.offer ? (
                    <div key={m.id} className={m.mine ? styles.rowMine : styles.rowTheirs}>
                      <OfferCard
                        offer={m.offer}
                        mine={m.mine}
                        listedPrice={detail.listing.unitPrice}
                        onAct={act}
                        onCounter={(o) => setOfferFor({ parent: o })}
                      />
                      <span className={styles.time}>{timeShort(m.createdAt)}</span>
                    </div>
                  ) : (
                    <div key={m.id} className={m.mine ? styles.rowMine : styles.rowTheirs}>
                      {m.images.length > 0 && (
                        <div className={`${styles.msgImages} ${m.images.length === 1 ? styles.msgImagesOne : ''}`}>
                          {m.images.map((src) => (
                            <button
                              key={src}
                              type="button"
                              className={styles.msgImgBtn}
                              onClick={() => setLightbox(src)}
                              aria-label="View picture"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={src} alt="Sent picture" className={styles.msgImg} />
                            </button>
                          ))}
                        </div>
                      )}
                      {m.body && <div className={m.mine ? styles.bubbleMine : styles.bubbleTheirs}>{m.body}</div>}
                      <span className={styles.time}>{timeShort(m.createdAt)}</span>
                    </div>
                  )
                )}
                <div ref={endRef} />
              </div>

              {notice && <div className={styles.errBoxInline}>{notice}</div>}
              {(pics.length > 0 || uploading > 0) && (
                <div className={styles.previews}>
                  {pics.map((ph) => (
                    <div key={ph.path} className={styles.previewTile}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ph.url} alt="" className={styles.previewImg} />
                      <button type="button" className={styles.previewX} aria-label="Remove picture" onClick={() => setPics((l) => l.filter((x) => x.path !== ph.path))}>×</button>
                    </div>
                  ))}
                  {Array.from({ length: uploading }).map((_, i) => (
                    <div key={'u' + i} className={styles.previewTile}><span className={styles.miniSpin} /></div>
                  ))}
                </div>
              )}
              <div className={styles.composer}>
                <label className={styles.attachBtn} title="Attach pictures" aria-label="Attach pictures">
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7h3l1.2-2h5.6L14 7h3v9H3z" />
                    <circle cx="10" cy="11" r="2.6" />
                  </svg>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    hidden
                    onChange={(e) => {
                      addPictures(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
                <input
                  className={styles.composerInput}
                  placeholder="Type a message…"
                  value={draft}
                  maxLength={2000}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendText()}
                />
                {detail.transaction && liveDeal ? (
                  <Link href={`/deliveries?t=${detail.transaction.id}`} className={styles.offerBtn}>View delivery</Link>
                ) : (
                  <button
                    type="button"
                    className={styles.offerBtn}
                    disabled={!canOffer}
                    title={hasPending ? 'Answer the pending offer first' : undefined}
                    onClick={() => setOfferFor({ parent: null })}
                  >
                    Make Offer
                  </button>
                )}
                <button type="button" className={styles.sendBtn} disabled={sending || uploading > 0 || (!draft.trim() && pics.length === 0)} onClick={sendText}>Send</button>
              </div>
            </>
          )}
        </section>
      </main>

      {offerFor && detail && (
        <OfferModal
          detail={detail}
          parent={offerFor.parent}
          onClose={() => setOfferFor(null)}
          onSent={() => {
            setOfferFor(null);
            refreshAll();
          }}
        />
      )}
      {newChat && (
        <NewChatModal
          onClose={() => setNewChat(false)}
          onOpen={(id) => {
            setNewChat(false);
            open(id);
            loadList();
          }}
        />
      )}
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
