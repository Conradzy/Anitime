'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Store } from '@/lib/stores';
import { getDevicePosition, type PickedLocation } from '@/lib/geo';
import { fetchRoadRoute } from '@/lib/routing';
import type { MapDelivery } from './DeliveryMap';
import styles from './StoreDrawer.module.css';

const LocationPicker = dynamic(() => import('./LocationPicker'), { ssr: false });

export default function StoreRouteActions({ store, onRoute }: { store: Store; onRoute: (route: MapDelivery) => void }) {
  const [choosing, setChoosing] = useState(false);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function generate(start?: PickedLocation) {
    if (busy) return;
    const controller = new AbortController();
    request.current?.abort(); request.current = controller;
    setBusy(true); setError(''); setManual(false);
    try {
      const origin = start ?? { ...await getDevicePosition(), label: 'My current location' };
      if (controller.signal.aborted) return;
      const result = await fetchRoadRoute(origin, store, controller.signal);
      if (controller.signal.aborted) return;
      if (result.source !== 'road') throw new Error('No connected road route was found. Choose another starting point closer to a road.');
      onRoute({ id: `store-route-${store.id}`, dir: 'out', path: result.path, origin,
        dest: { lat: store.lat, lng: store.lng, label: store.address }, title: store.name, who: store.name,
        when: 'Route preview', cargo: store.crop, eta: 'Depends on traffic', distance: `${result.km.toFixed(1)} km`, total: '', status: 'Road route' });
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to generate route. Please try again.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  return <div className={styles.actions}>
    <button type="button" className={styles.action} disabled={busy} aria-expanded={choosing} onClick={() => setChoosing(value => !value)}>{busy ? 'Finding road route…' : 'Generate route'}</button>
    {choosing && <>
      <span>Where will you start your trip?</span>
      <button type="button" className={`${styles.action} ${styles.secondary}`} disabled={busy} onClick={() => void generate()}>Use my current location</button>
      <button type="button" className={`${styles.action} ${styles.secondary}`} disabled={busy} onClick={() => setManual(true)}>Choose starting point on map</button>
    </>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {manual && <LocationPicker title="Choose your trip's starting point" initial={{ lat: store.lat, lng: store.lng }} onCancel={() => setManual(false)} onConfirm={point => void generate(point)} />}
  </div>;
}
