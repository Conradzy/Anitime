'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Store } from '@/lib/stores';
import styles from './StoreDrawer.module.css';

export default function StoreMessageAction({ store }: { store: Store }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function open() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/stores/${encodeURIComponent(store.id)}/conversation`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not open the store conversation.');
      router.push(`/messages?c=${data.id}`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.'); setBusy(false); }
  }
  return <div className={styles.actions}>
    <button type="button" className={styles.action} onClick={() => void open()} disabled={busy}>{busy ? 'Opening chat…' : 'Message store'}</button>
    <small>School-demo store account · offers, counteroffers and photos</small>
    {store.phone && !store.phoneIsDemo && <a className={`${styles.action} ${styles.secondary}`} href={`tel:${store.phone.replace(/[^+\d]/g, '')}`}>Call {store.phone}</a>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}
