'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { CROPS, FULFILLMENT_OPTIONS, PAYMENT_METHODS, PLACE_TYPES, UNITS } from '@/lib/crops';
import type { CurrentUser } from '@/lib/use-current-user';
import { getDevicePosition, reverseGeocode } from '@/lib/geo';
import { LISTING_POSTED_EVENT } from '@/lib/post-produce';
import styles from './PostProduceModal.module.css';

// Leaflet needs the browser, and most people never open the map.
const LocationPicker = dynamic(() => import('./LocationPicker'), { ssr: false });

type Photo = { path: string; url: string };
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

type Item = {
  uid: number;
  crop: string;
  variety: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  priceType: 'NEGOTIABLE' | 'FIXED';
  photos: Photo[];
  uploading: number;
  photoError: string;
};

let nextUid = 1;
function newItem(cropName = CROPS[0].name): Item {
  const crop = CROPS.find((c) => c.name === cropName) ?? CROPS[0];
  return {
    uid: nextUid++,
    crop: crop.name,
    variety: crop.varieties[0].name,
    quantity: '',
    unit: 'kg',
    unitPrice: String(crop.varieties[0].price),
    priceType: 'NEGOTIABLE',
    photos: [],
    uploading: 0,
    photoError: '',
  };
}

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { maximumFractionDigits: 2 });

function itemError(it: Item): string | null {
  const q = Number(it.quantity);
  const p = Number(it.unitPrice);
  if (!(q > 0)) return 'Enter the quantity you have.';
  if (!(p > 0)) return 'Enter your expected price.';
  return null;
}

const EXIT_MS = 240;

export function PostProduceModal({
  open,
  onClose,
  seller,
  onPosted,
}: {
  open: boolean;
  onClose: () => void;
  seller: CurrentUser | null;
  onPosted?: () => void;
}) {
  // Keep the modal mounted while its exit animation plays, then unmount.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const closing = mounted && !open;

  useEffect(() => {
    if (open || !mounted) return;
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted, onClose]);

  const [items, setItems] = useState<Item[]>(() => [newItem()]);
  const [description, setDescription] = useState('');
  const [loc, setLoc] = useState<{ label: string; lat: number | null; lng: number | null }>({ label: 'Davao de Oro', lat: null, lng: null });
  const [placeType, setPlaceType] = useState<string>('FARM');
  const [fulfillment, setFulfillment] = useState<string>('BOTH');
  const [placeName, setPlaceName] = useState('');
  const [addressDetails, setAddressDetails] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const [payments, setPayments] = useState<string[]>(['CASH_ON_DELIVERY']);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState<'ACTIVE' | 'DRAFT' | null>(null);
  const [serverError, setServerError] = useState('');
  const [done, setDone] = useState<string | null>(null);

  if (!mounted) return null;

  const total = items.reduce((a, it) => a + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const invalid = items.some((it) => itemError(it)) || payments.length === 0 || !loc.label.trim() || items.some((it) => it.uploading > 0);

  function patch(uid: number, next: Partial<Item>) {
    setItems((list) => list.map((it) => (it.uid === uid ? { ...it, ...next } : it)));
  }

  function changeCrop(uid: number, cropName: string) {
    const crop = CROPS.find((c) => c.name === cropName)!;
    patch(uid, { crop: crop.name, variety: crop.varieties[0].name, unitPrice: String(crop.varieties[0].price) });
  }

  function changeVariety(uid: number, it: Item, variety: string) {
    const price = CROPS.find((c) => c.name === it.crop)?.varieties.find((v) => v.name === variety)?.price;
    patch(uid, { variety, ...(price ? { unitPrice: String(price) } : {}) });
  }

  function update(uid: number, fn: (it: Item) => Partial<Item>) {
    setItems((list) => list.map((it) => (it.uid === uid ? { ...it, ...fn(it) } : it)));
  }

  async function addPhotos(uid: number, files: FileList | null) {
    const current = items.find((i) => i.uid === uid);
    if (!files || !current) return;
    const room = MAX_PHOTOS - current.photos.length - current.uploading;
    const picked = Array.from(files).slice(0, Math.max(room, 0));
    update(uid, () => ({ photoError: files.length > room ? `You can add up to ${MAX_PHOTOS} photos per product.` : '' }));

    for (const file of picked) {
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
        update(uid, () => ({ photoError: `${file.name}: only PNG, JPG or WEBP photos.` }));
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        update(uid, () => ({ photoError: `${file.name} is over 5 MB.` }));
        continue;
      }
      update(uid, (it) => ({ uploading: it.uploading + 1 }));
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/uploads', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'Upload failed.');
        update(uid, (it) => ({ photos: [...it.photos, { path: data.path, url: data.url }] }));
      } catch (e) {
        update(uid, () => ({ photoError: e instanceof Error ? e.message : 'Upload failed.' }));
      } finally {
        update(uid, (it) => ({ uploading: it.uploading - 1 }));
      }
    }
  }

  async function useCurrentLocation() {
    setLocating(true);
    setLocError('');
    try {
      const p = await getDevicePosition();
      const label = await reverseGeocode(p);
      setLoc({ label, lat: p.lat, lng: p.lng });
    } catch (e) {
      setLocError(e instanceof Error ? e.message : 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  }

  async function submit(status: 'ACTIVE' | 'DRAFT') {
    setServerError('');
    if (status === 'ACTIVE' && invalid) {
      setShowErrors(true);
      return;
    }
    setSubmitting(status);
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          description,
          location: loc.label,
          placeType,
          fulfillment,
          placeName,
          addressDetails,
          latitude: loc.lat,
          longitude: loc.lng,
          paymentMethods: payments,
          items: items.map((it) => ({
            crop: it.crop, variety: it.variety, quantity: Number(it.quantity),
            unit: it.unit, unitPrice: Number(it.unitPrice), priceType: it.priceType,
            photos: it.photos.map((p) => p.path),
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setDone(status === 'ACTIVE' ? `${data.created} listing${data.created === 1 ? '' : 's'} published.` : 'Draft saved.');
      onPosted?.();
      window.dispatchEvent(new Event(LISTING_POSTED_EVENT));
      setTimeout(() => {
        setDone(null);
        setItems([newItem()]);
        setDescription('');
        setShowErrors(false);
        onClose();
      }, 1100);
    } catch {
      setServerError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(null);
    }
  }

  const n = items.length;
  const cls = (base: string, closingCls: string) => `${base} ${closing ? closingCls : ''}`;

  return createPortal(
    <div className={cls(styles.overlay, styles.overlayOut)} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cls(styles.modal, styles.modalOut)} role="dialog" aria-modal="true" aria-label="Post your produce">
        <header className={styles.head}>
          <span className={styles.logo}>
            <Image src="/brand/logo-128.png" alt="AniTime logo" width={34} height={34} />
          </span>
          <div className={styles.headText}>
            <h2 className={styles.title}>Post Your Produce</h2>
            <p className={styles.subtitle}>Add multiple items in one go. It only takes a few steps!</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.main}>
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h3 className={styles.cardTitle}>1. Add Your Produce</h3>
                  <p className={styles.cardHint}>Select the crops and varieties you have available. You can add more than one item.</p>
                </div>
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => setItems((l) => (l.length < 20 ? [...l, newItem()] : l))}
                >
                  + Add Another Produce
                </button>
              </div>

              {items.map((it, idx) => {
                const crop = CROPS.find((c) => c.name === it.crop)!;
                const err = showErrors ? itemError(it) : null;
                return (
                  <div key={it.uid} id={`produce-${it.uid}`} className={styles.item}>
                    <div className={styles.thumbWrap}>
                      {it.photos[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.photos[0].url} alt={`${crop.name} photo`} className={styles.thumb} />
                      ) : (
                        <Image src={crop.img} alt={crop.name} width={120} height={120} className={styles.thumb} />
                      )}
                      <span className={styles.thumbNum}>{idx + 1}</span>
                    </div>

                    <div className={styles.fields}>
                      <label className={styles.field}>
                        <span className={styles.label}>Crop *</span>
                        <select className={styles.input} value={it.crop} onChange={(e) => changeCrop(it.uid, e.target.value)}>
                          {CROPS.map((c) => (
                            <option key={c.key}>{c.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.field}>
                        <span className={styles.label}>Variety / Type *</span>
                        <select className={styles.input} value={it.variety} onChange={(e) => changeVariety(it.uid, it, e.target.value)}>
                          {crop.varieties.map((v) => (
                            <option key={v.name}>{v.name}</option>
                          ))}
                        </select>
                      </label>

                      <div className={styles.field}>
                        <span className={styles.label}>Quantity *</span>
                        <span className={styles.joined}>
                          <input
                            className={styles.joinedInput}
                            inputMode="decimal"
                            placeholder="0"
                            value={it.quantity}
                            onChange={(e) => patch(it.uid, { quantity: e.target.value.replace(/[^0-9.]/g, '') })}
                          />
                          <select className={styles.joinedSelect} value={it.unit} onChange={(e) => patch(it.uid, { unit: e.target.value })}>
                            {UNITS.map((u) => (
                              <option key={u}>{u}</option>
                            ))}
                          </select>
                        </span>
                      </div>
                      <div className={styles.field}>
                        <span className={styles.label}>Expected Price *</span>
                        <span className={styles.joined}>
                          <span className={styles.peso}>₱</span>
                          <input
                            className={styles.joinedInput}
                            inputMode="decimal"
                            value={it.unitPrice}
                            onChange={(e) => patch(it.uid, { unitPrice: e.target.value.replace(/[^0-9.]/g, '') })}
                          />
                          <span className={styles.per}>/ {it.unit}</span>
                        </span>
                      </div>

                      <div className={styles.photosRow}>
                        <span className={styles.label}>
                          Photos <span className={styles.optional}>(optional · up to {MAX_PHOTOS} · PNG, JPG, WEBP · max 5 MB)</span>
                        </span>
                        <div className={styles.photoStrip}>
                          {it.photos.map((ph, pi) => (
                            <div key={ph.path} className={styles.photoTile}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={ph.url} alt="" className={styles.photoImg} />
                              {pi === 0 && <span className={styles.mainTag}>Main</span>}
                              <button
                                type="button"
                                className={styles.photoX}
                                aria-label="Remove photo"
                                onClick={() => update(it.uid, (x) => ({ photos: x.photos.filter((y) => y.path !== ph.path) }))}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          {Array.from({ length: it.uploading }).map((_, k) => (
                            <div key={`u${k}`} className={styles.photoTile}>
                              <span className={styles.spinner} aria-label="Uploading" />
                            </div>
                          ))}
                          {it.photos.length + it.uploading < MAX_PHOTOS && (
                            <label className={styles.addPhoto}>
                              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 7h3l1.2-2h5.6L14 7h3v9H3z" />
                                <circle cx="10" cy="11" r="2.6" />
                              </svg>
                              <span>Add photos</span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                multiple
                                hidden
                                onChange={(e) => {
                                  addPhotos(it.uid, e.target.files);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          )}
                        </div>
                        {it.photoError && <span className={styles.err}>{it.photoError}</span>}
                      </div>

                      <div className={styles.priceTypeRow}>
                        {(['NEGOTIABLE', 'FIXED'] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => patch(it.uid, { priceType: t })}
                            className={it.priceType === t ? styles.pillOn : styles.pill}
                            aria-pressed={it.priceType === t}
                          >
                            {t === 'NEGOTIABLE' ? 'Negotiable' : 'Fixed price'}
                          </button>
                        ))}
                        {err && <span className={styles.err}>{err}</span>}
                      </div>
                    </div>

                    <button
                      type="button"
                      className={styles.trash}
                      aria-label={`Remove produce ${idx + 1}`}
                      disabled={n === 1}
                      onClick={() => setItems((l) => l.filter((x) => x.uid !== it.uid))}
                    >
                      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>
                2. Add a General Description <span className={styles.optional}>(Optional)</span>
              </h3>
              <p className={styles.cardHint}>This will be shown for all items in your post. You can still add specific notes per item later.</p>
              <textarea
                className={styles.textarea}
                maxLength={500}
                rows={3}
                placeholder="Fresh harvest from our farm this week. Bulk buyers are welcome."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <span className={styles.counter}>{description.length}/500</span>
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>3. Mode of Payment</h3>
              <p className={styles.cardHint}>Choose every way you are willing to be paid. Buyers see these on your listing.</p>
              <div className={styles.chips}>
                {PAYMENT_METHODS.map((p) => {
                  const on = payments.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={on}
                      className={on ? styles.chipOn : styles.chip}
                      onClick={() => setPayments((l) => (on ? l.filter((k) => k !== p.key) : [...l, p.key]))}
                    >
                      {on && <span aria-hidden="true">✓ </span>}
                      {p.label}
                    </button>
                  );
                })}
              </div>
              {showErrors && payments.length === 0 && <span className={styles.err}>Pick at least one payment method.</span>}
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>4. Where can buyers find it?</h3>
              <p className={styles.cardHint}>
                First, say how buyers get it — settling this now keeps offers simple. Then tell them where the produce
                is, so they can plan the trip. Add a pin on the map for the exact spot.
              </p>

              <div className={styles.placeTypes} role="radiogroup" aria-label="How buyers get it">
                {FULFILLMENT_OPTIONS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    role="radio"
                    aria-checked={fulfillment === f.key}
                    className={fulfillment === f.key ? styles.placeOn : styles.placeOff}
                    onClick={() => setFulfillment(f.key)}
                  >
                    <span className={styles.placeLabel}>{f.label}</span>
                    <span className={styles.placeHint}>{f.hint}</span>
                  </button>
                ))}
              </div>

              <div className={styles.placeTypes} role="radiogroup" aria-label="Type of place">
                {PLACE_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="radio"
                    aria-checked={placeType === t.key}
                    className={placeType === t.key ? styles.placeOn : styles.placeOff}
                    onClick={() => setPlaceType(t.key)}
                  >
                    <span className={styles.placeLabel}>{t.label}</span>
                    <span className={styles.placeHint}>{t.hint}</span>
                  </button>
                ))}
              </div>

              <div className={styles.placeFields}>
                <label className={styles.field}>
                  <span className={styles.label}>
                    {placeType === 'SHOP' ? 'Shop name' : placeType === 'STORAGE' ? 'Storage or warehouse name' : 'Farm name'}{' '}
                    <span className={styles.optional}>(optional)</span>
                  </span>
                  <input
                    className={styles.input}
                    maxLength={120}
                    placeholder={placeType === 'SHOP' ? 'Aling Rosa Fruit Stand' : placeType === 'STORAGE' ? 'Bajada Cold Storage' : 'Santos Family Farm'}
                    value={placeName}
                    onChange={(e) => setPlaceName(e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>
                    Street, barangay or landmark <span className={styles.optional}>(optional)</span>
                  </span>
                  <input
                    className={styles.input}
                    maxLength={240}
                    placeholder="Purok 3, Brgy. Magugpo, near the covered court"
                    value={addressDetails}
                    onChange={(e) => setAddressDetails(e.target.value)}
                  />
                </label>
              </div>

              <div className={styles.locRow}>
                <span className={styles.pin}>
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#2F6B45" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 18s6-5.2 6-9.6A6 6 0 0 0 4 8.4C4 12.8 10 18 10 18z" />
                    <circle cx="10" cy="8.4" r="2.2" />
                  </svg>
                </span>
                <div className={styles.locText}>
                  <div className={styles.locName}>{loc.lat !== null ? 'Pinned location' : 'Town or area (no pin yet)'}</div>
                  <div className={styles.locSub}>
                    {loc.label}
                    {loc.lat !== null && loc.lng !== null && (
                      <span className={styles.coords}> · {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className={styles.locActions}>
                <button type="button" className={styles.locBtnPrimary} onClick={useCurrentLocation} disabled={locating}>
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                    <circle cx="10" cy="10" r="3" />
                    <circle cx="10" cy="10" r="7" />
                    <path d="M10 1.5v2.5M10 16v2.5M1.5 10H4M16 10h2.5" />
                  </svg>
                  {locating ? 'Locating…' : 'Use current location'}
                </button>
                <button type="button" className={styles.ghostBtn} onClick={() => setPickerOpen(true)}>
                  Select on map
                </button>
              </div>
              {locError && <span className={styles.err}>{locError}</span>}
            </section>
          </div>

          <aside className={styles.side}>
            <section className={styles.sideCard}>
              <h3 className={styles.sideTitle}>Your Produce Summary</h3>
              <p className={styles.cardHint}>
                You are about to post <strong>{n}</strong> listing{n === 1 ? '' : 's'}.
              </p>
              <ul className={styles.sumList}>
                {items.map((it) => {
                  const crop = CROPS.find((c) => c.name === it.crop)!;
                  return (
                    <li key={it.uid} className={styles.sumItem}>
                      <Image src={crop.img} alt="" width={56} height={56} className={styles.sumThumb} />
                      <div className={styles.sumText}>
                        <div className={styles.sumName}>
                          {it.crop} <span className={styles.sumVar}>({it.variety})</span>
                        </div>
                        <div className={styles.sumMeta}>
                          {it.quantity || 0} {it.unit} · {peso(Number(it.unitPrice) || 0)}/{it.unit}
                        </div>
                        <button
                          type="button"
                          className={styles.editLink}
                          onClick={() => document.getElementById(`produce-${it.uid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                        >
                          Edit
                        </button>
                      </div>
                      {n > 1 && (
                        <button type="button" className={styles.sumRemove} aria-label="Remove" onClick={() => setItems((l) => l.filter((x) => x.uid !== it.uid))}>
                          ×
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className={styles.totalCard}>
              <div className={styles.totalLabel}>Estimated Total Value</div>
              <div className={styles.totalValue}>{peso(total)}</div>
              <div className={styles.totalHint}>(based on total quantity and price)</div>
            </section>

            <section className={styles.nextCard}>
              <div className={styles.nextTitle}>What happens next?</div>
              <p className={styles.nextText}>
                After publishing, each product becomes its own listing in the marketplace. Buyers chat with you about a specific listing, make offers, and you can accept, counter or decline.
              </p>
            </section>

            <footer className={styles.sellerFoot}>
              <span className={styles.avatar}>{(seller?.businessname || seller?.fullname || '?').slice(0, 1).toUpperCase()}</span>
              <div className={styles.sellerText}>
                <div className={styles.sellerName}>{seller?.businessname || seller?.fullname || 'Your account'}</div>
                <div className={styles.sellerMeta}>
                  {seller?.reviewCount ? (
                    <>
                      <span className={styles.starOn}>★</span> {seller.rating.toFixed(1)} ({seller.reviewCount})
                    </>
                  ) : (
                    <span className={styles.noReviews}>☆ No reviews yet</span>
                  )}
                </div>
              </div>
              <span className={seller?.sellerVerified ? styles.badgeVerified : styles.badgeUnverified}>
                {seller?.sellerVerified ? '✓ Verified' : 'Unverified'}
              </span>
            </footer>

            {(serverError || done) && <div className={done ? styles.ok : styles.serverErr}>{done ?? serverError}</div>}

            <div className={styles.actions}>
              <button type="button" className={styles.draftBtn} disabled={submitting !== null} onClick={() => submit('DRAFT')}>
                {submitting === 'DRAFT' ? 'Saving…' : 'Save Draft'}
              </button>
              <button type="button" className={styles.publishBtn} disabled={submitting !== null} onClick={() => submit('ACTIVE')}>
                {submitting === 'ACTIVE' ? 'Publishing…' : `Publish ${n} Listing${n === 1 ? '' : 's'}`}
              </button>
            </div>
          </aside>
        </div>
      </div>
      {pickerOpen && (
        <LocationPicker
          title={placeType === 'SHOP' ? 'Pin your shop' : placeType === 'STORAGE' ? 'Pin your storage room' : 'Pin your farm'}
          initial={loc.lat !== null && loc.lng !== null ? { lat: loc.lat, lng: loc.lng } : null}
          onCancel={() => setPickerOpen(false)}
          onConfirm={(picked) => {
            setLoc({ label: picked.label, lat: picked.lat, lng: picked.lng });
            setLocError('');
            setPickerOpen(false);
          }}
        />
      )}
    </div>,
    document.body
  );
}
