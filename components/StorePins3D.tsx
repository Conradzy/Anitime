'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Cesium from 'cesium';
import { CROP_ICONS, type Store } from '@/lib/stores';
import StoreCard from './StoreCard';
import styles from './StoreMap.module.css';

function pinImage(crop: string) {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const c = canvas.getContext('2d')!;
  // Reference style: solid forest-green tile, lime border and line artwork.
  c.fillStyle = '#174B28';
  c.strokeStyle = '#A7C641'; c.lineWidth = 7;
  c.beginPath(); c.roundRect(7, 7, 114, 114, 34); c.fill(); c.stroke();
  const storefront = new Path2D('M33 53L40 34H88L95 53Z M38 55V91H90V55 M51 36L48 53 M65 36V53 M78 36L82 53 M49 90V69H63V90');
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.lineWidth = 4; c.stroke(storefront);
  // Small monochrome crop emblem in the shop window keeps the palette uniform.
  const crops: Record<string, string> = {
    Banana: 'M73 65Q69 82 84 83Q89 80 87 76Q77 80 76 65 M73 65L76 65',
    Copra: 'M72 72Q78 63 86 72L86 79Q79 88 72 79Z M75 72Q79 76 83 72',
    Corn: 'M76 68Q80 62 84 68L84 80Q80 87 76 80Z M80 69V80 M73 74L76 82 M87 74L84 82',
    Pineapple: 'M75 73Q80 68 85 73L85 81Q80 87 75 81Z M80 70L75 64 M80 70V63 M80 70L85 64',
  };
  c.lineWidth = 2.5; c.stroke(new Path2D(crops[crop] || crops.Copra));
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
        billboard: { image: images.get(store.crop), width: 44, height: 44, verticalOrigin: engine.VerticalOrigin.BOTTOM,
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
    let moving = false;
    let dragging = false;
    const removeMoveStart = viewer.camera.moveStart.addEventListener(() => { moving = true; });
    const removeMoveEnd = viewer.camera.moveEnd.addEventListener(() => { moving = false; });
    handler.setInputAction(() => { dragging = true; }, engine.ScreenSpaceEventType.LEFT_DOWN);
    handler.setInputAction(() => { dragging = false; }, engine.ScreenSpaceEventType.LEFT_UP);
    handler.setInputAction((event: { endPosition: Cesium.Cartesian2 }) => {
      if (moving || dragging || performance.now() - lastPick < 100) return;
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
    return () => { cancelClose(); removeMoveStart(); removeMoveEnd(); handler.destroy(); if (!viewer.isDestroyed()) { entities.forEach(entity => viewer.entities.remove(entity)); viewer.scene.requestRender(); } };
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
    let lastLayout = '';
    const updatePosition = () => {
      const { scene } = viewer;
      const height = storeHeights.current.get(selected.id);
      const world = engine.Cartesian3.fromDegrees(selected.lng, selected.lat, height ?? 0);
      const point = engine.SceneTransforms.worldToWindowCoordinates(scene, world);
      const width = viewer.canvas.clientWidth, viewportHeight = viewer.canvas.clientHeight;
      if (!point || point.x < 0 || point.x > width || point.y < 0 || point.y > viewportHeight) {
        panel.style.visibility = 'hidden'; lastLayout = ''; return;
      }
      const maxHeight = `${Math.max(160, viewportHeight - 120)}px`;
      if (panel.style.getPropertyValue('--bubble-height') !== maxHeight) panel.style.setProperty('--bubble-height', maxHeight);
      const w = panel.offsetWidth, h = panel.offsetHeight;
      const layout = `${Math.round(point.x * 2)},${Math.round(point.y * 2)},${width},${viewportHeight},${w},${h}`;
      if (layout === lastLayout) return;
      lastLayout = layout;
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
