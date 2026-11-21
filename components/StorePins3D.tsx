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
  const overCard = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const pinEntities = useRef<Cesium.Entity[]>([]);
  const storeHeights = useRef(new Map<string, number>());
  const cancelClose = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const scheduleClose = () => {
    if (timer.current || pinned.current || overCard.current) return;
    timer.current = setTimeout(() => {
      if (!pinned.current && !overCard.current) setSelected(null);
      timer.current = null;
    }, 350);
  };
  useEffect(() => {
    const images = new Map<string, string>();
    const entities = stores.map(store => {
      if (!images.has(store.crop)) images.set(store.crop, pinImage(store.crop));
      return viewer.entities.add({ id: `store-${store.id}`, position: engine.Cartesian3.fromDegrees(store.lng, store.lat),
        billboard: { image: images.get(store.crop), width: 48, height: 54, verticalOrigin: engine.VerticalOrigin.BOTTOM,
          heightReference: engine.HeightReference.CLAMP_TO_3D_TILE, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    });
    pinEntities.current = entities;
    const handler = new engine.ScreenSpaceEventHandler(viewer.canvas);
    const find = (position: Cesium.Cartesian2) => {
      const id = viewer.scene.pick(position)?.id?.id;
      const store = stores.find(store => `store-${store.id}` === id);
      // Read the existing depth buffer once, never render terrain from inside
      // postRender. sampleHeight there caused extra offscreen renders on hover.
      if (store && !storeHeights.current.has(store.id) && viewer.scene.pickPositionSupported) {
        const point = viewer.scene.pickPosition(position);
        if (point) {
          const height = engine.Cartographic.fromCartesian(point).height;
          if (Number.isFinite(height)) storeHeights.current.set(store.id, height);
        }
      }
      return store;
    };
    let lastPick = 0;
    handler.setInputAction((event: { endPosition: Cesium.Cartesian2 }) => {
      if (performance.now() - lastPick < 80) return;
      lastPick = performance.now();
      const store = find(event.endPosition);
      if (store) { cancelClose(); setSelected(store); }
      else scheduleClose();
    }, engine.ScreenSpaceEventType.MOUSE_MOVE);
    handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
      const store = find(event.position);
      if (store) { cancelClose(); pinned.current = true; setSelected(store); }
    }, engine.ScreenSpaceEventType.LEFT_CLICK);
    viewer.scene.requestRender();
    return () => { cancelClose(); handler.destroy(); if (!viewer.isDestroyed()) { entities.forEach(entity => viewer.entities.remove(entity)); viewer.scene.requestRender(); } };
  }, [viewer, engine, stores]);
  useEffect(() => {
    if (viewer.isDestroyed()) return;
    const start = performance.now();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pins = pinEntities.current.map(entity => ({
      entity,
      from: entity.billboard?.scale?.getValue(viewer.clock.currentTime) ?? 1,
      to: entity.id === `store-${selected?.id}` ? 1.1 : 1,
    })).filter(pin => Math.abs(pin.from - pin.to) > 0.001);
    if (!pins.length) return;
    let frame = 0;
    const animate = (now: number) => {
      if (viewer.isDestroyed()) return;
      const progress = reducedMotion ? 1 : Math.min(1, (now - start) / 200);
      const eased = (1 - Math.cos(Math.PI * progress)) / 2;
      for (const pin of pins) if (pin.entity.billboard) {
        const scale = pin.from + (pin.to - pin.from) * eased;
        if (pin.entity.billboard.scale instanceof engine.ConstantProperty) pin.entity.billboard.scale.setValue(scale);
        else pin.entity.billboard.scale = new engine.ConstantProperty(scale);
      }
      viewer.scene.requestRender();
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [selected, viewer, engine, stores]);
  useEffect(() => {
    const panel = panelRef.current;
    if (!selected || !panel || viewer.isDestroyed()) return;
    const updatePosition = () => {
      const { scene } = viewer;
      const height = storeHeights.current.get(selected.id);
      const world = engine.Cartesian3.fromDegrees(selected.lng, selected.lat, height ?? 0);
      const point = engine.SceneTransforms.worldToWindowCoordinates(scene, world);
      const width = viewer.canvas.clientWidth, viewportHeight = viewer.canvas.clientHeight;
      if (!point || point.x < 0 || point.x > width || point.y < 0 || point.y > viewportHeight) {
        panel.style.visibility = 'hidden'; return;
      }
      panel.style.setProperty('--bubble-height', `${Math.max(160, viewportHeight - 120)}px`);
      const w = panel.offsetWidth, h = panel.offsetHeight;
      const x = point.x, y = point.y - 30;
      const gap = 36, margin = 12;
      const clamp = (value: number, max: number) => Math.max(margin, Math.min(value, max - margin));
      let left: number, top: number, side: string;
      if (x + gap + w < width - margin) {
        side = 'right'; left = x + gap; top = clamp(y - h / 2, viewportHeight - h);
      } else if (x - gap - w > margin) {
        side = 'left'; left = x - gap - w; top = clamp(y - h / 2, viewportHeight - h);
      } else {
        side = y > viewportHeight / 2 ? 'above' : 'below';
        left = clamp(x - w / 2, width - w);
        top = clamp(side === 'above' ? y - gap - h : y + gap, viewportHeight - h);
      }
      panel.dataset.side = side;
      panel.style.left = `${left}px`; panel.style.top = `${top}px`;
      panel.style.setProperty('--tail-y', `${Math.max(22, Math.min(h - 22, y - top))}px`);
      panel.style.setProperty('--tail-x', `${Math.max(22, Math.min(w - 22, x - left))}px`);
      panel.style.visibility = 'visible';
    };
    updatePosition();
    const remove = viewer.scene.postRender.addEventListener(updatePosition);
    const observer = new ResizeObserver(() => { updatePosition(); });
    observer.observe(panel);
    return () => { remove(); observer.disconnect(); };
  }, [selected, viewer, engine]);
  return <>
    <details className={styles.directory}><summary>Find a store ({stores.length})</summary><div>{stores.map(store =>
      <button type="button" key={store.id} onClick={() => { cancelClose(); pinned.current = true; setSelected(store); viewer.camera.flyTo({ destination: engine.Cartesian3.fromDegrees(store.lng, store.lat, 1800) }); }}>{CROP_ICONS[store.crop]} {store.name}</button>
    )}</div></details>
    {selected && <div ref={panelRef} className={styles.panel}
      onMouseEnter={() => { cancelClose(); overCard.current = true; }}
      onMouseLeave={() => { overCard.current = false; scheduleClose(); }}>
      <div key={selected.id} className={styles.bubble}>
        <StoreCard store={selected} onClose={() => { cancelClose(); pinned.current = false; overCard.current = false; setSelected(null); }} />
      </div>
    </div>}
  </>;
}
