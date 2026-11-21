'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Store } from '@/lib/stores';
import { CROP_ICONS } from '@/lib/stores';
import { storePhotos } from '@/lib/store-photos';
import styles from './StoreDrawer.module.css';

export default function StoreDrawer({ store, onClose, children }: { store: Store; onClose: () => void; children?: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const [slide, setSlide] = useState(0);
  const photos = storePhotos(store);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  useEffect(() => {
    if (photos.length < 2 || closing) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setSlide(index => (index + 1) % photos.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [photos.length, closing]);
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onClose, 240);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);

  return <dialog ref={dialog} className={`${styles.dialog} ${closing ? styles.closing : ''}`}
    aria-labelledby="store-title" onCancel={event => { event.preventDefault(); setClosing(true); }}
    onClick={event => { if (event.target === event.currentTarget) setClosing(true); }}>
    <section className={styles.drawer}>
      <button autoFocus type="button" className={styles.close} aria-label="Close store" onClick={() => setClosing(true)}>×</button>
      <div className={styles.gallery} aria-label="Store photographs">
        {photos.map((photo, index) => <img key={photo} src={photo} alt={`${store.name}, photo ${index + 1}`} /* eslint-disable-line @next/next/no-img-element */
          className={index === slide ? styles.photoActive : styles.photo} aria-hidden={index !== slide} loading={index ? 'lazy' : 'eager'} />)}
        {photos.length > 1 && <div className={styles.dots}>{photos.map((_, index) => <button key={index} type="button" aria-label={`Show photo ${index + 1}`} aria-pressed={slide === index} onClick={() => setSlide(index)} />)}</div>}
      </div>
      <div className={styles.body}>
        <span className={styles.badge}>{CROP_ICONS[store.crop]} Buys {store.crop}</span>
        <h2 id="store-title">{store.name}</h2>
        <dl><dt>Location</dt><dd>{store.address}</dd><dt>Phone number</dt><dd>{store.phone || store.phoneExample || 'Not provided'}</dd></dl>
        {children}
      </div>
    </section>
  </dialog>;
}
