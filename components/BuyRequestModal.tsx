'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { CROPS, FULFILLMENT_OPTIONS, PAYMENT_METHODS, UNITS } from '@/lib/crops';
import type { CurrentUser } from '@/lib/use-current-user';
import { getDevicePosition, reverseGeocode } from '@/lib/geo';
import { BUY_REQUEST_POSTED_EVENT } from '@/lib/post-produce';
// Same visual shell as "Post your produce" — buying and selling are the same
// kind of post, just pointed the other way.
import styles from './PostProduceModal.module.css';

const LocationPicker = dynamic(() => import('./LocationPicker'), { ssr: false });

type Photo = { path: string; url: string };
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { maximumFractionDigits: 2 });
const EXIT_MS = 240;

export function BuyRequestModal({
  open,
  onClose,
  buyer,
  onPosted,
}: {
  open: boolean;
  onClose: () => void;
  buyer: CurrentUser | null;
  onPosted?: () => void;
}) {
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

  const [crop, setCrop] = useState(CROPS[0].name);
  const [variety, setVariety] = useState(CROPS[0].varieties[0].name);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('kg');
  const [priceType, setPriceType] = useState<'NEGOTIABLE' | 'FIXED'>('NEGOTIABLE');
  const [targetPrice, setTargetPrice] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(0);
  const [photoError, setPhotoError] = useState('');
  const [description, setDescription] = useState('');
  const [payments, setPayments] = useState<string[]>(['CASH_ON_DELIVERY']);
  const [fulfillment, setFulfillment] = useState<string>('BOTH');
  const [loc, setLoc] = useState<{ label: string; lat: number | null; lng: number | null }>({ label: 'Davao de Oro', lat: null, lng: null });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [done, setDone] = useState<string | null>(null);

  if (!mounted) return null;

  const cropDef = CROPS.find((c) => c.name === crop)!;
  const qtyErr = !(Number(quantity) > 0) ? 'Enter how much you need.' : null;
  const priceErr = priceType === 'FIXED' && !(Number(targetPrice) > 0) ? 'Enter your budget.' : null;
  const invalid = Boolean(qtyErr) || Boolean(priceErr) || payments.length === 0 || !loc.label.trim() || uploading > 0;
  const estTotal = (Number(quantity) || 0) * (Number(targetPrice) || 0);

  function changeCrop(name: string) {
    const c = CROPS.find((x) => x.name === name)!;
    setCrop(c.name);
    setVariety(c.varieties[0].name);
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length - uploading;
    const picked = Array.from(files).slice(0, Math.max(room, 0));
    setPhotoError(files.length > room ? `You can add up to ${MAX_PHOTOS} photos.` : '');

    for (const file of picked) {
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
        setPhotoError(`${file.name}: only PNG, JPG or WEBP photos.`);
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setPhotoError(`${file.name} is over 5 MB.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/uploads', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'Upload failed.');
        setPhotos((p) => [...p, { path: data.path, url: data.url }]);
      } catch (e) {
        setPhotoError(e instanceof Error ? e.message : 'Upload failed.');
      } finally {
        setUploading((n) => n - 1);
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

  async function submit() {
    setServerError('');
    if (invalid) {
      setShowErrors(true);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/buy-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crop, variety, quantity: Number(quantity), unit,
          priceType, targetPrice: targetPrice ? Number(targetPrice) : null,
          neededBy: neededBy || null,
          description, paymentMethods: payments, fulfillment,
          location: loc.label, latitude: loc.lat, longitude: loc.lng,
          photos: photos.map((p) => p.path),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setDone('Your buying request is posted.');
      onPosted?.();
      window.dispatchEvent(new Event(BUY_REQUEST_POSTED_EVENT));
      setTimeout(() => {
        setDone(null);
        setQuantity('');
        setTargetPrice('');
        setDescription('');
        setPhotos([]);
        setShowErrors(false);
        onClose();
      }, 1100);
    } catch {
      setServerError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const cls = (base: string, closingCls: string) => `${base} ${closing ? closingCls : ''}`;

  return createPortal(
    <div className={cls(styles.overlay, styles.overlayOut)} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cls(styles.modal, styles.modalOut)} role="dialog" aria-modal="true" aria-label="Post a buying request">
        <header className={styles.head}>
          <span className={styles.logo}>
            <Image src="/brand/logo-128.png" alt="AniTime logo" width={34} height={34} />
          </span>
          <div className={styles.headText}>
            <h2 className={styles.title}>Post a Buying Request</h2>
            <p className={styles.subtitle}>Tell sellers what you need — they&rsquo;ll come to you with offers.</p>
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
                  <h3 className={styles.cardTitle}>1. What do you need?</h3>
                  <p className={styles.cardHint}>Pick the crop and how much you&rsquo;re after. Sellers who have it will offer a price.</p>
                </div>
              </div>

              <div className={styles.item}>
                <div className={styles.thumbWrap}>
                  {photos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photos[0].url} alt={`${cropDef.name} photo`} className={styles.thumb} />
                  ) : (
                    <Image src={cropDef.img} alt={cropDef.name} width={120} height={120} className={styles.thumb} />
                  )}
                </div>

                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span className={styles.label}>Crop *</span>
                    <select className={styles.input} value={crop} onChange={(e) => changeCrop(e.target.value)}>
                      {CROPS.map((c) => (
                        <option key={c.key}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Variety / Type *</span>
                    <select className={styles.input} value={variety} onChange={(e) => setVariety(e.target.value)}>
                      {cropDef.varieties.map((v) => (
                        <option key={v.name}>{v.name}</option>
                      ))}
                    </select>
                  </label>

                  <div className={styles.field}>
                    <span className={styles.label}>Quantity needed *</span>
                    <span className={styles.joined}>
                      <input
                        className={styles.joinedInput}
                        inputMode="decimal"
                        placeholder="0"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.]/g, ''))}
                      />
                      <select className={styles.joinedSelect} value={unit} onChange={(e) => setUnit(e.target.value)}>
                        {UNITS.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </span>
                  </div>
                  <div className={styles.field}>
                    <span className={styles.label}>
                      Your budget <span className={styles.optional}>(optional)</span>
                    </span>
                    <span className={styles.joined}>
                      <span className={styles.peso}>₱</span>
                      <input
                        className={styles.joinedInput}
                        inputMode="decimal"
                        placeholder="Open to quotes"
                        value={targetPrice}
                        onChange={(e) => setTargetPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                      />
                      <span className={styles.per}>/ {unit}</span>
                    </span>
                  </div>

                  <div className={styles.photosRow}>
                    <span className={styles.label}>
                      Reference photo <span className={styles.optional}>(optional · up to {MAX_PHOTOS} · PNG, JPG, WEBP · max 5 MB)</span>
                    </span>
                    <div className={styles.photoStrip}>
                      {photos.map((ph, pi) => (
                        <div key={ph.path} className={styles.photoTile}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={ph.url} alt="" className={styles.photoImg} />
                          {pi === 0 && <span className={styles.mainTag}>Main</span>}
                          <button
                            type="button"
                            className={styles.photoX}
                            aria-label="Remove photo"
                            onClick={() => setPhotos((p) => p.filter((y) => y.path !== ph.path))}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {Array.from({ length: uploading }).map((_, k) => (
                        <div key={`u${k}`} className={styles.photoTile}>
                          <span className={styles.spinner} aria-label="Uploading" />
                        </div>
                      ))}
                      {photos.length + uploading < MAX_PHOTOS && (
                        <label className={styles.addPhoto}>
                          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 7h3l1.2-2h5.6L14 7h3v9H3z" />
                            <circle cx="10" cy="11" r="2.6" />
                          </svg>
                          <span>Add photo</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            multiple
                            hidden
                            onChange={(e) => {
                              addPhotos(e.target.files);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {photoError && <span className={styles.err}>{photoError}</span>}
                  </div>

                  <div className={styles.priceTypeRow}>
                    {(['NEGOTIABLE', 'FIXED'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPriceType(t)}
                        className={priceType === t ? styles.pillOn : styles.pill}
                        aria-pressed={priceType === t}
                      >
                        {t === 'NEGOTIABLE' ? 'Open to quotes' : 'This is my max budget'}
                      </button>
                    ))}
                    {showErrors && (qtyErr || priceErr) && <span className={styles.err}>{qtyErr || priceErr}</span>}
                  </div>

                  <label className={styles.field} style={{ marginTop: 10 }}>
                    <span className={styles.label}>
                      Needed by <span className={styles.optional}>(optional)</span>
                    </span>
                    <input type="date" className={styles.input} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
                  </label>
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>
                2. Add Details <span className={styles.optional}>(Optional)</span>
              </h3>
              <p className={styles.cardHint}>Grade, harvest condition, anything sellers should know before they offer.</p>
              <textarea
                className={styles.textarea}
                maxLength={500}
                rows={3}
                placeholder="Looking for export-grade fruit, minimal blemishes."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <span className={styles.counter}>{description.length}/500</span>
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>3. How will you pay?</h3>
              <p className={styles.cardHint}>Choose every way you&rsquo;re willing to pay. Sellers see these on your request.</p>
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
              <h3 className={styles.cardTitle}>4. Where do you want it?</h3>
              <p className={styles.cardHint}>
                Say whether you&rsquo;ll collect it or need it delivered, and where — this is what sellers route to when they offer.
              </p>

              <div className={styles.placeTypes} role="radiogroup" aria-label="How you get it">
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
              <h3 className={styles.sideTitle}>Your Request Summary</h3>
              <ul className={styles.sumList}>
                <li className={styles.sumItem}>
                  <Image src={cropDef.img} alt="" width={56} height={56} className={styles.sumThumb} />
                  <div className={styles.sumText}>
                    <div className={styles.sumName}>
                      {crop} <span className={styles.sumVar}>({variety})</span>
                    </div>
                    <div className={styles.sumMeta}>
                      {quantity || 0} {unit}
                      {targetPrice && <> · {peso(Number(targetPrice))}/{unit}</>}
                    </div>
                  </div>
                </li>
              </ul>
            </section>

            {targetPrice && (
              <section className={styles.totalCard}>
                <div className={styles.totalLabel}>Estimated Budget</div>
                <div className={styles.totalValue}>{peso(estTotal)}</div>
                <div className={styles.totalHint}>(based on total quantity and budget)</div>
              </section>
            )}

            <section className={styles.nextCard}>
              <div className={styles.nextTitle}>What happens next?</div>
              <p className={styles.nextText}>
                Sellers who can fulfill part or all of it will chat with you and send an offer. You can accept several
                offers over time — the request stays open, showing what&rsquo;s still needed, until it&rsquo;s fully filled or you
                close it.
              </p>
            </section>

            <footer className={styles.sellerFoot}>
              <span className={styles.avatar}>{(buyer?.businessname || buyer?.fullname || '?').slice(0, 1).toUpperCase()}</span>
              <div className={styles.sellerText}>
                <div className={styles.sellerName}>{buyer?.businessname || buyer?.fullname || 'Your account'}</div>
                <div className={styles.sellerMeta}>
                  {buyer?.reviewCount ? (
                    <>
                      <span className={styles.starOn}>★</span> {buyer.rating.toFixed(1)} ({buyer.reviewCount})
                    </>
                  ) : (
                    <span className={styles.noReviews}>☆ No reviews yet</span>
                  )}
                </div>
              </div>
              <span className={buyer?.sellerVerified ? styles.badgeVerified : styles.badgeUnverified}>
                {buyer?.sellerVerified ? '✓ Verified' : 'Unverified'}
              </span>
            </footer>

            {(serverError || done) && <div className={done ? styles.ok : styles.serverErr}>{done ?? serverError}</div>}

            <div className={styles.actions}>
              <button type="button" className={styles.publishBtn} disabled={submitting} onClick={submit} style={{ flex: 1 }}>
                {submitting ? 'Posting…' : 'Post Buying Request'}
              </button>
            </div>
          </aside>
        </div>
      </div>
      {pickerOpen && (
        <LocationPicker
          title="Pin where you want it"
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
