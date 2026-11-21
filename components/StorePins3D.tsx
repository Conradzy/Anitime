'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Cesium from 'cesium';
import { CROP_ICONS, type Store } from '@/lib/stores';
import StoreCard from './StoreCard';
import styles from './StoreMap.module.css';

function pinImage(crop: string) {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 144;
  const c = canvas.getContext('2d')!;
  c.shadowColor = '#062f2440'; c.shadowBlur = 10; c.shadowOffsetY = 4;
  c.fillStyle = '#f6f5ef'; c.beginPath(); c.roundRect(12, 8, 104, 104, 32); c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = '#062f24'; c.lineWidth = 3; c.stroke();
  c.fillStyle = '#062f24'; c.beginPath(); c.moveTo(52, 112); c.lineTo(64, 134); c.lineTo(76, 112); c.closePath(); c.fill();
  c.lineWidth = 5; c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeRect(35, 48, 56, 38);
  c.fillStyle = '#a7c641'; c.beginPath(); c.moveTo(30, 48); c.lineTo(39, 29); c.lineTo(87, 29); c.lineTo(96, 48); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(51, 31); c.lineTo(48, 48); c.moveTo(74, 31); c.lineTo(77, 48); c.moveTo(48, 85); c.lineTo(48, 63); c.lineTo(62, 63); c.lineTo(62, 85); c.stroke();
  c.fillStyle = '#e5edcd'; c.beginPath(); c.arc(96, 94, 24, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#f6f5ef'; c.lineWidth = 4; c.stroke();
  c.font = '28px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(CROP_ICONS[crop] || '🌱', 96, 95);
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
        billboard: { image: images.get(store.crop), width: 48, height: 54, verticalOrigin: engine.VerticalOrigin.BOTTOM,
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
