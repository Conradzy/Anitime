'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Cesium from 'cesium';
import { CROP_ICONS, type Store } from '@/lib/stores';
import StoreCard from './StoreCard';
import styles from './StoreMap.module.css';

function pinImage(crop: string) {
  const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 112;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#062f24'; c.beginPath(); c.roundRect(4, 4, 88, 88, 20); c.fill();
  c.beginPath(); c.moveTo(35, 90); c.lineTo(48, 110); c.lineTo(61, 90); c.fill();
  c.fillStyle = '#f6f5ef'; c.fillRect(22, 34, 52, 38);
  c.fillStyle = '#a7c641'; c.beginPath(); c.moveTo(18, 34); c.lineTo(26, 20); c.lineTo(70, 20); c.lineTo(78, 34); c.closePath(); c.fill();
  c.fillStyle = '#062f24'; c.fillRect(29, 46, 14, 26);
  c.font = '32px sans-serif'; c.fillText(CROP_ICONS[crop] || '🌱', 45, 73);
  return canvas.toDataURL();
}

export default function StorePins3D({ viewer, engine, stores }: { viewer: Cesium.Viewer; engine: typeof Cesium; stores: Store[] }) {
  const [selected, setSelected] = useState<Store | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinned = useRef(false);
  const cancelClose = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => {
    const images = new Map<string, string>();
    const entities = stores.map(store => {
      if (!images.has(store.crop)) images.set(store.crop, pinImage(store.crop));
      return viewer.entities.add({ id: `store-${store.id}`, position: engine.Cartesian3.fromDegrees(store.lng, store.lat),
        billboard: { image: images.get(store.crop), width: 44, height: 52, verticalOrigin: engine.VerticalOrigin.BOTTOM,
          heightReference: engine.HeightReference.CLAMP_TO_3D_TILE, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    });
    const handler = new engine.ScreenSpaceEventHandler(viewer.canvas);
    const find = (position: Cesium.Cartesian2) => {
      const id = viewer.scene.pick(position)?.id?.id;
      return stores.find(store => `store-${store.id}` === id);
    };
    let lastPick = 0;
    handler.setInputAction((event: { endPosition: Cesium.Cartesian2 }) => {
      if (performance.now() - lastPick < 80 || pinned.current) return;
      lastPick = performance.now();
      const store = find(event.endPosition);
      if (store) { cancelClose(); setSelected(store); }
      else if (!timer.current) timer.current = setTimeout(() => { setSelected(null); timer.current = null; }, 450);
    }, engine.ScreenSpaceEventType.MOUSE_MOVE);
    handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
      const store = find(event.position);
      if (store) { cancelClose(); pinned.current = true; setSelected(store); }
    }, engine.ScreenSpaceEventType.LEFT_CLICK);
    viewer.scene.requestRender();
    return () => { cancelClose(); handler.destroy(); if (!viewer.isDestroyed()) { entities.forEach(entity => viewer.entities.remove(entity)); viewer.scene.requestRender(); } };
  }, [viewer, engine, stores]);
  return <>
    <details className={styles.directory}><summary>Find a store ({stores.length})</summary><div>{stores.map(store =>
      <button type="button" key={store.id} onClick={() => { cancelClose(); pinned.current = true; setSelected(store); viewer.camera.flyTo({ destination: engine.Cartesian3.fromDegrees(store.lng, store.lat, 1800) }); }}>{CROP_ICONS[store.crop]} {store.name}</button>
    )}</div></details>
    {selected && <div className={styles.panel} onMouseEnter={() => { cancelClose(); pinned.current = true; }}>
      <StoreCard store={selected} onClose={() => { cancelClose(); pinned.current = false; setSelected(null); }} />
    </div>}
  </>;
}
