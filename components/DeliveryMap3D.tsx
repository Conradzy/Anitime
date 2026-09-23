'use client';

import 'cesium/Build/Cesium/Widgets/widgets.css';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type * as CesiumNS from 'cesium';
import type { DeliveryMapHandle, MapDelivery } from '@/components/DeliveryMap';
import styles from './DeliveryMap3D.module.css';

type CesiumModule = typeof CesiumNS;

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/** The camera is kept inside this box (the Philippines plus a margin). */
const PH_BOUNDS = { west: 116.0, south: 4.0, east: 127.5, north: 21.5 };
const MAX_CAMERA_HEIGHT = 1_500_000; // meters — roughly the whole archipelago in view
const MIN_CAMERA_DISTANCE = 40; // meters — how close you can zoom to the ground
const ROUTE_PITCH_DEG = -40;

type RouteData = {
  entity: CesiumNS.Entity;
  dir: 'in' | 'out';
  path: [number, number][]; // [lat, lng]
  positions: CesiumNS.Cartesian3[];
  cum: number[]; // cumulative distance (m) at each path point
  total: number;
};

type StopData = { entity: CesiumNS.Entity; normalUri: string; selectedUri: string; normalSize: number; selectedSize: number };

type TruckAnim = { route: RouteData; start: number; durationMs: number };

type SceneCtx = {
  Cesium: CesiumModule;
  viewer: CesiumNS.Viewer;
  routes: Map<string, RouteData>;
  stops: Map<string, StopData>;
  truck: CesiumNS.Entity;
  everything: CesiumNS.Cartesian3[];
  anim: TruckAnim | null;
  focusedId: string | null;
  orbitId: number; // bumped to cancel an in-progress tilt/rotate animation
};

function svgUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function dotSvg(color: string, size: number, halo?: string) {
  const total = size + 18;
  const c = total / 2;
  return {
    total,
    uri: svgUri(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" viewBox="0 0 ${total} ${total}">` +
        (halo ? `<circle cx="${c}" cy="${c}" r="${size / 2 + 8}" fill="${halo}"/>` : '') +
        `<circle cx="${c}" cy="${c}" r="${size / 2}" fill="${color}" stroke="#F6F5EF" stroke-width="2.5"/></svg>`
    ),
  };
}

const TRUCK_URI = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="46" height="42" viewBox="0 0 46 42">' +
    '<rect x="3" y="3" width="40" height="36" rx="12" fill="#062F24" stroke="#A7C641" stroke-width="2.5"/>' +
    '<g transform="translate(11 7.3) scale(1.2)" fill="none" stroke="#A7C641" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M2.6 13.4h11.2V6.2H2.6z"/><path d="M13.8 9h2.2l1.4 2.4v2h-3.6z"/>' +
    '<circle cx="6" cy="15.2" r="1.4"/><circle cx="14.6" cy="15.2" r="1.4"/></g></svg>'
);

function describeError(e: unknown): string {
  const err = e as { statusCode?: number; message?: string } | null;
  const msg = err?.message ?? '';
  if (err?.statusCode === 403 || /\b403\b/.test(msg)) {
    return "Google refused the request (403). Check that the API key is valid, the Map Tiles API is enabled with billing on the project, and the key's website restriction allows this address (for example http://localhost:3000/*).";
  }
  if (err?.statusCode === 400 || /API key not valid|\b400\b/.test(msg)) {
    return 'Google rejected the API key (400). Double-check NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env and restart the dev server.';
  }
  if (/webgl/i.test(msg)) return 'This browser or device does not support WebGL, which the 3D map needs.';
  return msg || 'The 3D map could not be loaded.';
}

function focusRoute(ctx: SceneCtx, id: string, duration: number) {
  const route = ctx.routes.get(id);
  if (!route) return;
  const { Cesium, viewer } = ctx;
  const sphere = Cesium.BoundingSphere.fromPoints(route.positions);
  cancelOrbit(ctx);
  viewer.camera.cancelFlight();
  viewer.camera.flyToBoundingSphere(sphere, {
    duration,
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(ROUTE_PITCH_DEG), Math.max(sphere.radius * 2.6, 2500)),
  });
}

function focusOverview(ctx: SceneCtx, duration: number) {
  const { Cesium, viewer } = ctx;
  if (ctx.everything.length === 0) return;
  const sphere = Cesium.BoundingSphere.fromPoints(ctx.everything);
  cancelOrbit(ctx);
  viewer.camera.cancelFlight();
  viewer.camera.flyToBoundingSphere(sphere, {
    duration,
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), Math.max(sphere.radius * 2.4, 5000)),
  });
}

/** Restyles the routes/markers for the selected delivery, starts the truck on
 * its route, and flies the camera to it (only when the selection changed). */
function applySelection(ctx: SceneCtx, selectedId: string, flyDuration: number) {
  const { Cesium } = ctx;

  for (const [id, r] of ctx.routes) {
    const on = id === selectedId;
    const color = Cesium.Color.fromCssColorString(on ? '#C3E04F' : r.dir === 'in' ? '#E0B341' : '#7C9184').withAlpha(on ? 1 : 0.65);
    const poly = r.entity.polyline;
    if (!poly) continue;
    poly.width = new Cesium.ConstantProperty(on ? 10 : 5);
    poly.material = new Cesium.ColorMaterialProperty(color);
    poly.zIndex = new Cesium.ConstantProperty(on ? 2 : 1);
  }

  for (const [id, s] of ctx.stops) {
    const on = id === selectedId;
    const bb = s.entity.billboard;
    if (!bb) continue;
    const size = on ? s.selectedSize : s.normalSize;
    bb.image = new Cesium.ConstantProperty(on ? s.selectedUri : s.normalUri);
    bb.width = new Cesium.ConstantProperty(size);
    bb.height = new Cesium.ConstantProperty(size);
  }

  const selected = ctx.routes.get(selectedId);
  if (selected) {
    // Pace the truck by route length so long trips don't look frantic.
    ctx.anim = { route: selected, start: performance.now(), durationMs: Math.max(9000, (selected.total / 1000) * 250) };
    ctx.truck.show = true;
  } else {
    ctx.anim = null;
    ctx.truck.show = false;
  }

  if (ctx.focusedId !== selectedId) {
    ctx.focusedId = selectedId;
    focusRoute(ctx, selectedId, flyDuration);
  }
}

/** Stops any tilt/rotate animation and hands the camera back to normal
 * world-space control (an orbit leaves it locked to a pivot frame). */
function cancelOrbit(ctx: SceneCtx) {
  ctx.orbitId++;
  ctx.viewer.camera.lookAtTransform(ctx.Cesium.Matrix4.IDENTITY);
}

/** Mouse wheel, trackpad two-finger scroll and trackpad pinch all reach the
 * browser as `wheel` events (pinch as ctrl+wheel), which Cesium's built-in
 * zoom ignores in some cases — so zoom is handled here, toward the cursor. */
function attachWheelZoom(ctx: SceneCtx): () => void {
  const { Cesium, viewer } = ctx;
  const canvas = viewer.canvas;

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    let dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    if (e.ctrlKey) dy *= 8; // pinch reports much smaller deltas than a scroll
    if (dy === 0) return;

    cancelOrbit(ctx);
    const cam = viewer.camera;
    cam.cancelFlight();

    const carto = cam.positionCartographic;
    const ground = viewer.scene.sampleHeightSupported ? viewer.scene.sampleHeight(carto) : undefined;
    const clearance = Math.max(ground === undefined ? carto.height : carto.height - ground, MIN_CAMERA_DISTANCE);

    const rect = canvas.getBoundingClientRect();
    const ray = cam.getPickRay(new Cesium.Cartesian2(e.clientX - rect.left, e.clientY - rect.top));
    if (!ray) return;

    const s = Math.min(Math.abs(dy) * 0.0018, 0.6);
    if (dy < 0) {
      const amount = Math.min(clearance * (1 - Math.exp(-s)), clearance - MIN_CAMERA_DISTANCE);
      if (amount > 0) cam.move(ray.direction, amount);
    } else {
      const amount = Math.min(clearance * (Math.exp(s) - 1), MAX_CAMERA_HEIGHT - carto.height);
      if (amount > 0) cam.move(ray.direction, -amount);
    }
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  return () => canvas.removeEventListener('wheel', onWheel);
}

/** Tilts/rotates the view around whatever is at the centre of the screen. */
function orbit(ctx: SceneCtx, dPitchDeg: number, dHeadingDeg: number) {
  const { Cesium, viewer } = ctx;
  const cam = viewer.camera;
  cam.cancelFlight();
  cancelOrbit(ctx);

  const centre = new Cesium.Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2);
  let pivot: CesiumNS.Cartesian3 | undefined = viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(centre) : undefined;
  if (!pivot) {
    const ray = cam.getPickRay(centre);
    const hit = ray ? Cesium.IntersectionTests.rayEllipsoid(ray, Cesium.Ellipsoid.WGS84) : undefined;
    if (ray && hit) pivot = Cesium.Ray.getPoint(ray, hit.start);
  }
  if (!pivot) return;

  const target = pivot;
  const range = Cesium.Cartesian3.distance(cam.position, target);
  const startPitch = cam.pitch; // radians; negative looks down at the ground
  const startHeading = cam.heading;
  const endPitch = Math.min(Math.max(startPitch + Cesium.Math.toRadians(dPitchDeg), Cesium.Math.toRadians(-85)), Cesium.Math.toRadians(-15));
  const endHeading = startHeading + Cesium.Math.toRadians(dHeadingDeg);

  const id = ++ctx.orbitId;
  const frames = 18;
  let i = 0;
  const step = () => {
    if (viewer.isDestroyed() || ctx.orbitId !== id) return; // superseded by another move
    i++;
    const t = 1 - Math.pow(1 - i / frames, 3);
    cam.lookAt(
      target,
      new Cesium.HeadingPitchRange(startHeading + (endHeading - startHeading) * t, startPitch + (endPitch - startPitch) * t, range)
    );
    if (i >= frames) {
      cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
      return;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function tweenZoom(ctx: SceneCtx, direction: 1 | -1) {
  const { viewer } = ctx;
  cancelOrbit(ctx);
  const h = viewer.camera.positionCartographic.height;
  const amount =
    direction === 1
      ? Math.min(h * 0.45, h - MIN_CAMERA_DISTANCE)
      : Math.min(h * 0.8 + 200, MAX_CAMERA_HEIGHT - h);
  if (!(amount > 0)) return;

  const frames = 14;
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  let i = 0;
  const step = () => {
    if (viewer.isDestroyed() || i >= frames) return;
    const d = amount * (ease((i + 1) / frames) - ease(i / frames));
    if (direction === 1) viewer.camera.zoomIn(d);
    else viewer.camera.zoomOut(d);
    i++;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ------------------------------------------------------------------------- *
 * Keep-alive
 *
 * Building the viewer (Cesium + Google's tiles) is the slow part, so it is
 * created once and kept in module scope. Leaving the page only detaches its
 * DOM and pauses rendering; coming back re-attaches the same viewer with the
 * tiles, camera and selection exactly as they were. It is released after
 * KEEP_ALIVE_MS away, or on a full page reload.
 * ------------------------------------------------------------------------- */

const KEEP_ALIVE_MS = 20 * 60 * 1000;

type Bridge = {
  onSelect: (id: string) => void;
  setHover: (id: string | null) => void;
  tip: HTMLElement | null;
  root: HTMLElement | null;
};

type Keeper = {
  Cesium: CesiumModule;
  viewer: CesiumNS.Viewer;
  ctx: SceneCtx;
  host: HTMLDivElement;
  credits: HTMLDivElement;
  sig: string; // which set of deliveries this viewer was built for
  status: 'loading' | 'ready' | 'error';
  errorMsg: string;
  listeners: Set<() => void>;
  bridge: Bridge;
  heartbeat: number | undefined;
  disposeTimer: number | undefined;
  detachWheel: () => void;
};

let keeper: Keeper | null = null;
let building: Promise<Keeper> | null = null;

const idleBridge = (): Bridge => ({ onSelect: () => {}, setHover: () => {}, tip: null, root: null });
const signatureOf = (deliveries: MapDelivery[]) => deliveries.map((d) => `${d.id}:${d.path.length}:${d.dest.label}`).join('|');
const notify = (k: Keeper) => k.listeners.forEach((fn) => fn());

// The truck is the only thing that animates on its own, so it gets a ~25 fps
// heartbeat; everything else renders only when something changes.
function startHeartbeat(k: Keeper) {
  if (k.heartbeat !== undefined) return;
  k.heartbeat = window.setInterval(() => {
    if (!document.hidden && !k.viewer.isDestroyed()) k.viewer.scene.requestRender();
  }, 40);
}

function stopHeartbeat(k: Keeper) {
  window.clearInterval(k.heartbeat);
  k.heartbeat = undefined;
}

function destroyKeeper(k: Keeper) {
  stopHeartbeat(k);
  window.clearTimeout(k.disposeTimer);
  k.detachWheel();
  k.host.remove();
  k.credits.remove();
  if (!k.viewer.isDestroyed()) k.viewer.destroy();
  if (keeper === k) keeper = null;
}

function attachKeeper(k: Keeper, root: HTMLElement, bridge: Bridge) {
  window.clearTimeout(k.disposeTimer);
  k.bridge = bridge;
  if (k.host.parentElement !== root) root.insertBefore(k.host, root.firstChild);
  if (k.credits.parentElement !== root) root.insertBefore(k.credits, k.host.nextSibling);
  k.viewer.useDefaultRenderLoop = true;
  k.viewer.resize();
  k.viewer.scene.requestRender();
  startHeartbeat(k);
}

function detachKeeper(k: Keeper) {
  k.bridge = idleBridge();
  k.host.remove();
  k.credits.remove();
  stopHeartbeat(k);
  if (!k.viewer.isDestroyed()) k.viewer.useDefaultRenderLoop = false; // stop drawing while away
  window.clearTimeout(k.disposeTimer);
  k.disposeTimer = window.setTimeout(() => destroyKeeper(k), KEEP_ALIVE_MS);
}

/** Draws every delivery's route line, its product-location marker and its
 * destination marker into the viewer. Called when the scene is built and again
 * whenever the set of deliveries changes (the deals load after the page does,
 * and new ones arrive while it is open), so the viewer itself is never rebuilt. */
function drawRoutes(
  Cesium: CesiumModule,
  v: CesiumNS.Viewer,
  deliveries: MapDelivery[],
  routes: Map<string, RouteData>,
  stops: Map<string, StopData>,
  everything: CesiumNS.Cartesian3[]
) {
  const clampRef = Cesium.HeightReference.CLAMP_TO_3D_TILE;


  for (const d of deliveries) {
    const route = { path: d.path };
    if (route.path.length < 2) continue;

    const positions = Cesium.Cartesian3.fromDegreesArray(route.path.flatMap(([lat, lng]) => [lng, lat]));
    const cum: number[] = [0];
    for (let i = 1; i < positions.length; i++) {
      cum.push(cum[i - 1] + Cesium.Cartesian3.distance(positions[i - 1], positions[i]));
    }
    everything.push(...positions);

    const entity = v.entities.add({
      id: `route-${d.id}`,
      polyline: {
        positions,
        width: 5,
        material: Cesium.Color.fromCssColorString('#7C9184'),
        clampToGround: true,
        classificationType: Cesium.ClassificationType.CESIUM_3D_TILE,
      },
    });
    routes.set(d.id, { entity, dir: d.dir, path: route.path, positions, cum, total: cum[cum.length - 1] || 1 });

    // Buyer stop marker + name label at the end of the route.
    const end = route.path[route.path.length - 1];
    const color = d.dir === 'in' ? '#E0B341' : '#8FB92E';
    const normal = dotSvg(color, 16);
    const selected = dotSvg(color, 24, 'rgba(167,198,65,.32)');
    const stopEntity = v.entities.add({
      id: `stop-${d.id}`,
      position: Cesium.Cartesian3.fromDegrees(end[1], end[0]),
      billboard: {
        image: normal.uri,
        width: normal.total,
        height: normal.total,
        heightReference: clampRef,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: d.dest.label.split(',')[0],
        font: '600 13px system-ui, sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#062F24'),
        showBackground: true,
        backgroundColor: Cesium.Color.WHITE.withAlpha(0.92),
        backgroundPadding: new Cesium.Cartesian2(8, 5),
        style: Cesium.LabelStyle.FILL,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -(selected.total / 2 + 2)),
        heightReference: clampRef,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    stops.set(d.id, {
      entity: stopEntity,
      normalUri: normal.uri,
      selectedUri: selected.uri,
      normalSize: normal.total,
      selectedSize: selected.total,
    });
  }

  // Where each product is (the seller's side of the route).
  for (const d of deliveries) {
    if (d.path.length < 2) continue;
    const origin = dotSvg('#A7C641', 20, 'rgba(167,198,65,.3)');
    v.entities.add({
      id: `origin-${d.id}`,
      position: Cesium.Cartesian3.fromDegrees(d.origin.lng, d.origin.lat),
      billboard: {
        image: origin.uri,
        width: origin.total,
        height: origin.total,
        heightReference: clampRef,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: d.origin.label.split(',')[0],
        font: '600 13px system-ui, sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#062F24'),
        showBackground: true,
        backgroundColor: Cesium.Color.WHITE.withAlpha(0.92),
        backgroundPadding: new Cesium.Cartesian2(8, 5),
        style: Cesium.LabelStyle.FILL,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -(origin.total / 2 + 2)),
        heightReference: clampRef,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }
}

/** Replaces the drawn routes with a new set, keeping the viewer (and its
 * loaded tiles) alive. */
function syncRoutes(ctx: SceneCtx, deliveries: MapDelivery[]) {
  const { Cesium, viewer } = ctx;
  for (const id of ctx.routes.keys()) {
    viewer.entities.removeById(`route-${id}`);
    viewer.entities.removeById(`stop-${id}`);
    viewer.entities.removeById(`origin-${id}`);
  }
  ctx.routes.clear();
  ctx.stops.clear();
  ctx.everything.length = 0;
  ctx.anim = null;
  ctx.focusedId = null; // so the next applySelection flies to the new route
  drawRoutes(Cesium, viewer, deliveries, ctx.routes, ctx.stops, ctx.everything);
  viewer.scene.requestRender();
}

async function buildKeeper(root: HTMLElement, deliveries: MapDelivery[], selectedId: string, sig: string): Promise<Keeper> {
  // Cesium loads its web workers, decoders and textures from here
  // (copied into public/cesium by scripts/copy-cesium-assets.mjs).
  (window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = '/cesium';
  const Cesium = await import('cesium');

  // These two elements live as long as the viewer, outside React's control.
  const host = document.createElement('div');
  host.className = styles.viewer;
  const credits = document.createElement('div');
  credits.className = styles.credits;
  root.insertBefore(host, root.firstChild);
  root.insertBefore(credits, host.nextSibling);

  const viewer = new Cesium.Viewer(host, {
    // Google's tiles already include terrain and imagery, so no globe,
    // no Cesium ion base layer, and no non-Google geocoder (Google's
    // terms only allow its own geocoder alongside these tiles).
    globe: false,
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    creditContainer: credits,
    creditViewport: host,
  });
  const v = viewer;

  // --- Performance -----------------------------------------------------
  // Render only when something changed (camera moves, tiles arrive,
  // selection restyles) instead of redrawing at the display's full refresh rate.
  const scene = v.scene;
  scene.requestRenderMode = true;
  scene.maximumRenderTimeChange = Number.POSITIVE_INFINITY;
  scene.msaaSamples = 1; // multisampling is expensive on photoreal tiles
  scene.fog.enabled = false;
  // Google's tile server speaks HTTP/2, so many more parallel tile
  // requests than Cesium's conservative default make loading much faster.
  Cesium.RequestScheduler.requestsByServer['tile.googleapis.com:443'] = 18;

  if (v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = true;

  // Drag pans. Wheel / trackpad scroll / trackpad pinch zoom through
  // attachWheelZoom; touch-screen pinch zooms via Cesium. Tilt and
  // rotate are on-screen buttons only, so gestures never tilt.
  const controller = v.scene.screenSpaceCameraController;
  controller.minimumZoomDistance = MIN_CAMERA_DISTANCE;
  controller.maximumZoomDistance = MAX_CAMERA_HEIGHT;
  controller.enableCollisionDetection = true;
  controller.enableTilt = false;
  controller.zoomEventTypes = [Cesium.CameraEventType.PINCH];

  // Keep the camera over the Philippines.
  v.scene.postRender.addEventListener(() => {
    const cam = v.camera;
    const c = cam.positionCartographic;
    const lng = Cesium.Math.toDegrees(c.longitude);
    const lat = Cesium.Math.toDegrees(c.latitude);
    const clampedLng = Math.min(Math.max(lng, PH_BOUNDS.west), PH_BOUNDS.east);
    const clampedLat = Math.min(Math.max(lat, PH_BOUNDS.south), PH_BOUNDS.north);
    const clampedHeight = Math.min(c.height, MAX_CAMERA_HEIGHT);
    if (clampedLng !== lng || clampedLat !== lat || clampedHeight !== c.height) {
      cam.setView({
        destination: Cesium.Cartesian3.fromDegrees(clampedLng, clampedLat, clampedHeight),
        orientation: { heading: cam.heading, pitch: cam.pitch, roll: cam.roll },
      });
    }
  });

  // Routes, drawn as lines draped over the 3D surface.
  const routes = new Map<string, RouteData>();
  const stops = new Map<string, StopData>();
  const everything: CesiumNS.Cartesian3[] = [];
  const clampRef = Cesium.HeightReference.CLAMP_TO_3D_TILE;
  drawRoutes(Cesium, v, deliveries, routes, stops, everything);

  // The truck: its position is recomputed every frame from the route
  // of the selected delivery.
  const truckPosition = new Cesium.Cartesian3();
  const truck = v.entities.add({
    id: 'truck',
    show: false,
    position: new Cesium.CallbackPositionProperty(() => truckPosition, false),
    billboard: {
      image: TRUCK_URI,
      width: 46,
      height: 42,
      heightReference: clampRef,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  if (everything.length === 0) {
    v.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(125.45, 6.2, 260000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
    });
  }

  const ctx: SceneCtx = { Cesium, viewer: v, routes, stops, truck, everything, anim: null, focusedId: null, orbitId: 0 };
  const k: Keeper = {
    Cesium, viewer: v, ctx, host, credits, sig,
    status: 'loading', errorMsg: '',
    listeners: new Set(), bridge: idleBridge(),
    heartbeat: undefined, disposeTimer: undefined,
    detachWheel: attachWheelZoom(ctx),
  };

  v.scene.preUpdate.addEventListener(() => {
    const a = ctx.anim;
    if (!a) return;
    const t = ((performance.now() - a.start) % a.durationMs) / a.durationMs;
    const target = t * a.route.total;
    const cum = a.route.cum;
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < target) i++;
    const seg = cum[i + 1] - cum[i] || 1;
    const s = (target - cum[i]) / seg;
    const [latA, lngA] = a.route.path[i];
    const [latB, lngB] = a.route.path[i + 1];
    Cesium.Cartesian3.fromDegrees(lngA + (lngB - lngA) * s, latA + (latB - latA) * s, 0, undefined, truckPosition);
  });

  // Click a route line or a stop to select that delivery. Double-click
  // would otherwise lock the camera onto the entity.
  v.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  v.screenSpaceEventHandler.setInputAction((movement: { position: CesiumNS.Cartesian2 }) => {
    const picked = v.scene.pick(movement.position);
    const pickedId = picked?.id?.id;
    if (typeof pickedId !== 'string') return;
    const match = /^(?:route|stop)-(.+)$/.exec(pickedId);
    if (match) k.bridge.onSelect(match[1]);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Hover a destination to see its details. Picking against photoreal
  // tiles isn't free, so it's throttled and skipped while dragging.
  let dragging = false;
  let lastPick = 0;
  let hoveredStop: string | null = null;
  v.screenSpaceEventHandler.setInputAction(() => { dragging = true; }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
  v.screenSpaceEventHandler.setInputAction(() => { dragging = false; }, Cesium.ScreenSpaceEventType.LEFT_UP);
  v.screenSpaceEventHandler.setInputAction((movement: { endPosition: CesiumNS.Cartesian2 }) => {
    const { x, y } = movement.endPosition;
    const { tip, root: mountRoot } = k.bridge;
    if (tip && mountRoot) {
      tip.style.left = Math.min(x + 16, mountRoot.clientWidth - 270) + 'px';
      tip.style.top = Math.min(y + 16, mountRoot.clientHeight - 150) + 'px';
    }
    const now = performance.now();
    if (dragging || now - lastPick < 90) return;
    lastPick = now;
    const pickedId = v.scene.pick(movement.endPosition)?.id?.id;
    const match = typeof pickedId === 'string' ? /^stop-(.+)$/.exec(pickedId) : null;
    const next = match ? match[1] : null;
    if (next !== hoveredStop) {
      hoveredStop = next;
      v.canvas.style.cursor = next ? 'pointer' : '';
      k.bridge.setHover(next);
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // Aim the camera at the selected delivery *before* the tiles start
  // loading, so only the Philippines gets requested instead of the
  // whole globe first.
  applySelection(ctx, selectedId, 0);
  keeper = k;

  // The tiles keep loading in the background; the map shows a status
  // overlay until the first ones are in.
  Cesium.createGooglePhotorealistic3DTileset(
    { key: API_KEY, onlyUsingWithGoogleGeocoder: true },
    {
      showCreditsOnScreen: true,
      // Slightly coarser than the default (16) — noticeably fewer tiles
      // to fetch and draw, with little visible loss at map distances.
      maximumScreenSpaceError: 22,
      dynamicScreenSpaceError: true,
      // Keep more tiles in memory so panning back over an area
      // doesn't re-download it.
      cacheBytes: 768 * 1024 * 1024,
      maximumCacheOverflowBytes: 512 * 1024 * 1024,
    }
  )
    .then((tileset) => {
      if (v.isDestroyed()) {
        tileset.destroy();
        return;
      }
      v.scene.primitives.add(tileset);
      tileset.initialTilesLoaded.addEventListener(() => {
        k.status = 'ready';
        notify(k);
      });
    })
    .catch((e) => {
      console.error('3D map failed to load', e);
      k.status = 'error';
      k.errorMsg = describeError(e);
      notify(k);
    });

  return k;
}

const DeliveryMap3D = forwardRef<
  DeliveryMapHandle,
  {
    deliveries: MapDelivery[];
    selectedId: string;
    onSelect: (id: string) => void;
  }
>(function DeliveryMap3D({ deliveries, selectedId, onSelect }, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<SceneCtx | null>(null);

  // Latest props for the async init and Cesium event callbacks, which outlive
  // any single render.
  const deliveriesRef = useRef(deliveries);
  const selectedIdRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    deliveriesRef.current = deliveries;
    selectedIdRef.current = selectedId;
    onSelectRef.current = onSelect;
  });

  // Coming back to a viewer that is still alive starts already "ready".
  const reusable = keeper && keeper.status !== 'error' && keeper.sig === signatureOf(deliveries) ? keeper : null;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(reusable?.status ?? 'loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [sceneReady, setSceneReady] = useState(Boolean(reusable));
  const [hoverId, setHoverId] = useState<string | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const hovered = hoverId ? deliveries.find((d) => d.id === hoverId) : undefined;

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      if (ctxRef.current) tweenZoom(ctxRef.current, 1);
    },
    zoomOut: () => {
      if (ctxRef.current) tweenZoom(ctxRef.current, -1);
    },
    reset: () => {
      if (ctxRef.current) focusOverview(ctxRef.current, 1.4);
    },
    tiltUp: () => ctxRef.current && orbit(ctxRef.current, 15, 0),
    tiltDown: () => ctxRef.current && orbit(ctxRef.current, -15, 0),
    rotateLeft: () => ctxRef.current && orbit(ctxRef.current, 0, -20),
    rotateRight: () => ctxRef.current && orbit(ctxRef.current, 0, 20),
  }));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let active: Keeper | null = null;
    const sig = signatureOf(deliveriesRef.current);

    const bridge: Bridge = {
      onSelect: (id) => onSelectRef.current(id),
      setHover: setHoverId,
      tip: tipRef.current,
      root,
    };
    const sync = () => {
      if (!active) return;
      setStatus(active.status);
      setErrorMsg(active.errorMsg);
    };
    const adopt = (k: Keeper) => {
      active = k;
      k.listeners.add(sync);
      ctxRef.current = k.ctx;
      attachKeeper(k, root, bridge);
      // Same selection as when we left → the camera stays where it was.
      applySelection(k.ctx, selectedIdRef.current, 0);
    };

    async function start() {
      if (!API_KEY) {
        setStatus('error');
        setErrorMsg('No Google Maps API key found. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env and restart the dev server.');
        return;
      }

      let k = keeper;
      if (k && (k.sig !== sig || k.status === 'error')) {
        destroyKeeper(k);
        k = null;
      }
      if (k) {
        adopt(k); // already built earlier: just put it back on screen
        return;
      }

      try {
        if (!building) {
          building = buildKeeper(root!, deliveriesRef.current, selectedIdRef.current, sig).finally(() => {
            building = null;
          });
        }
        k = await building;
      } catch (e) {
        console.error('3D map failed to load', e);
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(describeError(e));
        }
        return;
      }

      if (cancelled) {
        // Left the page while it was still building: keep it warm for a
        // return visit unless another mount has already picked it up.
        if (!k.host.isConnected) detachKeeper(k);
        return;
      }
      adopt(k);
      setSceneReady(true);
      setStatus(k.status);
      setErrorMsg(k.errorMsg);
    }

    start();

    return () => {
      cancelled = true;
      ctxRef.current = null;
      if (active) {
        active.listeners.delete(sync);
        detachKeeper(active);
      }
    };
  }, []);

  // The deals are fetched after this page mounts, and new ones arrive while it
  // is open, so the scene is redrawn whenever the set of routes changes. The
  // viewer (and its loaded tiles) is kept — only the lines and markers change.
  const sig = signatureOf(deliveries);
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!sceneReady || !ctx || ctx.viewer.isDestroyed()) return;
    if (keeper && keeper.ctx === ctx && keeper.sig !== sig) {
      syncRoutes(ctx, deliveriesRef.current);
      keeper.sig = sig;
    }
  }, [sceneReady, sig]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!sceneReady || !ctx || ctx.viewer.isDestroyed()) return;
    applySelection(ctx, selectedId, 1.6);
  }, [sceneReady, selectedId, sig]);

  return (
    <div ref={rootRef} className={styles.root}>
      <div ref={tipRef} className={hovered ? styles.tip : styles.tipHidden}>
        {hovered && (
          <>
            <div className={styles.tipTitle}>{hovered.title}</div>
            <div className={styles.tipSub}>
              {hovered.who} · {hovered.when}
            </div>
            <div className={styles.tipRow}>{hovered.cargo}</div>
            <div className={styles.tipRow}>
              {hovered.distance} · ETA {hovered.eta}
            </div>
            <div className={styles.tipFoot}>
              <span>{hovered.status}</span>
              <strong>{hovered.total}</strong>
            </div>
          </>
        )}
      </div>
      {status !== 'ready' && (
        <div className={styles.status}>
          <div className={status === 'error' ? styles.statusBoxError : styles.statusBox}>
            {status === 'error' ? errorMsg : 'Loading photorealistic 3D map…'}
          </div>
        </div>
      )}
    </div>
  );
});

export default DeliveryMap3D;
