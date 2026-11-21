'use client';

import { useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { AppSidebar } from '@/components/AppSidebar';
import type { DeliveryMapHandle, MapDelivery } from '@/components/DeliveryMap';
import mapStyles from '../deliveries/page.module.css';
import styles from './page.module.css';
import { STORES, type Store } from '@/lib/stores';
import StoreDrawer from '@/components/StoreDrawer';

const Map3D = dynamic(() => import('@/components/DeliveryMap3D'), { ssr: false });
const Map2D = dynamic(() => import('@/components/DeliveryMap'), { ssr: false });
const HAS_3D = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
// Explore the map without displaying private delivery routes on the Stores page.
const EMPTY_ROUTES: MapDelivery[] = [];
const onSelect = () => {};
const CAMERA_CONTROLS = [
  ['tiltUp', 'Tilt up', 'M4 13l6-6 6 6'],
  ['tiltDown', 'Tilt down', 'M4 7l6 6 6-6'],
  ['rotateLeft', 'Rotate left', 'M12 4L6 10l6 6'],
  ['rotateRight', 'Rotate right', 'M8 4l6 6-6 6'],
] as const;

export default function StoresPage() {
  const [mini, setMini] = useState(false);
  const [store, setStore] = useState<Store | null>(null);
  const [layer, setLayer] = useState<'photo' | 'street'>(HAS_3D ? 'photo' : 'street');
  const mapRef = useRef<DeliveryMapHandle>(null);

  return (
    <div data-shell="" className={mapStyles.shell} style={{ '--cols': mini ? '76px' : '246px' } as CSSProperties}>
      <AppSidebar active="stores" mini={mini} onToggle={() => setMini((value) => !value)} />
      <main className={mapStyles.mainCol}>
        <div className={mapStyles.mapArea}>
          <div className={mapStyles.mapWrap}>
            {layer === 'photo' ? (
              <Map3D ref={mapRef} deliveries={EMPTY_ROUTES} selectedId="" onSelect={onSelect} stores={STORES} onViewStore={setStore} suspended={Boolean(store)} />
            ) : (
              <Map2D ref={mapRef} deliveries={EMPTY_ROUTES} selectedId="" onSelect={onSelect} />
            )}
          </div>
          <div className={styles.toolbox} aria-label="Map controls" role="group">
            {HAS_3D && (
              <div className={mapStyles.layerSwitch} role="group" aria-label="Map layer">
                <button type="button" onClick={() => setLayer('photo')} aria-pressed={layer === 'photo'} className={layer === 'photo' ? mapStyles.layerBtnOn : mapStyles.layerBtn}>Photorealistic</button>
                <button type="button" onClick={() => setLayer('street')} aria-pressed={layer === 'street'} className={layer === 'street' ? mapStyles.layerBtnOn : mapStyles.layerBtn}>Street map</button>
              </div>
            )}
            <div className={styles.buttons}>
              <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in" title="Zoom in" className={mapStyles.zoomBtn}>+</button>
              <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out" title="Zoom out" className={mapStyles.zoomBtn}>−</button>
              <button type="button" onClick={() => mapRef.current?.reset()} aria-label="Reset view" title="Reset view" className={mapStyles.resetBtn}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#062F24" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M4 10a6 6 0 1 1 2 4.4M4 6.4V10h3.4" /></svg>
              </button>
              {layer === 'photo' && CAMERA_CONTROLS.map(([action, label, path]) => (
                <button key={action} type="button" onClick={() => mapRef.current?.[action]?.()} aria-label={label} title={label} className={mapStyles.resetBtn}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#062F24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
      {store && <StoreDrawer key={store.id} store={store} onClose={() => setStore(null)} />}
    </div>
  );
}
