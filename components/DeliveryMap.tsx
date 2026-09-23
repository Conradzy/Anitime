'use client';

import 'leaflet/dist/leaflet.css';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import L, { type Map as LeafletMap } from 'leaflet';

export type MapPlace = { lat: number; lng: number; label: string };

/** One deal drawn on the map: the road between the product and the buyer. */
export type MapDelivery = {
  id: string;
  /** 'out': you are the seller · 'in': you are the buyer */
  dir: 'in' | 'out';
  /** [lat, lng] points along the road, at least two. */
  path: [number, number][];
  origin: MapPlace;
  dest: MapPlace;
  // Details shown when hovering the destination:
  title: string;
  who: string;
  when: string;
  cargo: string;
  eta: string;
  distance: string;
  total: string;
  status: string;
};

export type DeliveryMapHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  // Only the 3D map implements these; the flat map has no tilt.
  tiltUp?: () => void;
  tiltDown?: () => void;
  rotateLeft?: () => void;
  rotateRight?: () => void;
};

// Davao Region, where AniTime starts: the view when there is nothing to draw.
const DEFAULT_CENTER: [number, number] = [7.19, 125.45];
const DEFAULT_ZOOM = 8;

/** Small circular div-icon for the pins — sidesteps Leaflet's default marker
 * image and the well-known bundler-path issue that comes with it. */
function dotIcon(color: string, size: number, haloColor?: string) {
  const halo = haloColor ? `box-shadow:0 0 0 6px ${haloColor};` : '';
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #F6F5EF;${halo}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function truckIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:34px;height:30px;border-radius:11px;background:#062F24;border:2.5px solid #A7C641;display:grid;place-items:center;box-shadow:0 8px 14px -6px rgba(6,47,36,.6)">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#A7C641" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2.6 13.4h11.2V6.2H2.6z" />
        <path d="M13.8 9h2.2l1.4 2.4v2h-3.6z" />
        <circle cx="6" cy="15.2" r="1.4" />
        <circle cx="14.6" cy="15.2" r="1.4" />
      </svg>
    </div>`,
    iconSize: [34, 30],
    iconAnchor: [17, 15],
  });
}

const firstPart = (label: string) => label.split(',')[0];

function boundsOf(paths: [number, number][][]) {
  const pts = paths.flat();
  return pts.length ? L.latLngBounds(pts) : null;
}

/** Moves a truck marker back and forth along the selected delivery's road,
 * looping continuously. */
function TruckMarker({ path }: { path: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (path.length < 2) return;

    const marker = L.marker(path[0], { icon: truckIcon(), zIndexOffset: 1000, interactive: false }).addTo(map);

    // Cumulative distance (meters) along the route, so the truck can be
    // placed at any fraction 0..1 of the total trip.
    const cum: number[] = [0];
    for (let i = 1; i < path.length; i++) {
      cum.push(cum[i - 1] + L.latLng(path[i - 1]).distanceTo(L.latLng(path[i])));
    }
    const total = cum[cum.length - 1] || 1;

    let raf = 0;
    const durationMs = Math.max(9000, (total / 1000) * 250);
    const start = performance.now();

    function tick(now: number) {
      const t = ((now - start) % durationMs) / durationMs;
      const target = t * total;
      let seg = 0;
      while (seg < cum.length - 2 && cum[seg + 1] < target) seg++;
      const segLen = cum[seg + 1] - cum[seg] || 1;
      const segT = (target - cum[seg]) / segLen;
      const a = path[seg];
      const b = path[seg + 1];
      marker.setLatLng([a[0] + (b[0] - a[0]) * segT, a[1] + (b[1] - a[1]) * segT]);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      marker.remove();
    };
  }, [map, path]);

  return null;
}

/** Frames the whole set of deals whenever it changes, and the selected one
 * when the selection changes. */
function Framing({ deliveries, selectedId }: { deliveries: MapDelivery[]; selectedId: string }) {
  const map = useMap();
  const setKey = deliveries.map((d) => d.id).join(',');

  useEffect(() => {
    const sel = deliveries.find((d) => d.id === selectedId);
    const b = boundsOf(sel ? [sel.path] : deliveries.map((d) => d.path));
    if (b) map.fitBounds(b, { padding: [60, 60], maxZoom: 13, animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, setKey, selectedId]);

  return null;
}

const DeliveryMap = forwardRef<
  DeliveryMapHandle,
  {
    deliveries: MapDelivery[];
    selectedId: string;
    onSelect: (id: string) => void;
  }
>(function DeliveryMap({ deliveries, selectedId, onSelect }, ref) {
  const mapInstanceRef = useRef<LeafletMap | null>(null);

  const all = useMemo(() => boundsOf(deliveries.map((d) => d.path)), [deliveries]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => mapInstanceRef.current?.zoomIn(),
    zoomOut: () => mapInstanceRef.current?.zoomOut(),
    reset: () => {
      const map = mapInstanceRef.current;
      if (!map) return;
      if (all) map.fitBounds(all, { padding: [60, 60], maxZoom: 13 });
      else map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    },
  }));

  const selected = deliveries.find((d) => d.id === selectedId);

  return (
    <MapContainer
      ref={mapInstanceRef}
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      zoomControl={false}
      style={{ height: '100%', width: '100%', background: '#E9EEE0' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {deliveries.map((d) => {
        const on = d.id === selectedId;
        return (
          <Polyline
            key={d.id}
            positions={d.path}
            pathOptions={{
              color: on ? '#8FB92E' : d.dir === 'in' ? '#E0B341' : '#7C9184',
              weight: on ? 6 : 4,
              opacity: on ? 1 : 0.6,
              dashArray: on ? undefined : '6 8',
              lineCap: 'round',
            }}
            eventHandlers={{ click: () => onSelect(d.id) }}
          />
        );
      })}

      {deliveries.map((d) => {
        const on = d.id === selectedId;
        return (
          <Marker key={`o-${d.id}`} position={[d.origin.lat, d.origin.lng]} icon={dotIcon('#A7C641', on ? 22 : 16, on ? 'rgba(167,198,65,.3)' : undefined)}>
            <Tooltip direction="top" offset={[0, -10]} permanent={on}>
              {firstPart(d.origin.label)}
            </Tooltip>
          </Marker>
        );
      })}

      {deliveries.map((d) => {
        const on = d.id === selectedId;
        return (
          <Marker
            key={`d-${d.id}`}
            position={[d.dest.lat, d.dest.lng]}
            icon={dotIcon(d.dir === 'in' ? '#E0B341' : '#2F6B45', on ? 24 : 16, on ? 'rgba(167,198,65,.32)' : undefined)}
            eventHandlers={{
              click: () => onSelect(d.id),
              mouseover: (e) => e.target.openPopup(),
              mouseout: (e) => e.target.closePopup(),
            }}
          >
            <Tooltip direction="top" offset={[0, on ? -14 : -10]} permanent={on}>
              {firstPart(d.dest.label)}
            </Tooltip>
            <Popup closeButton={false} autoPan={false} offset={[0, -6]}>
              <strong>{d.title}</strong>
              <br />
              {d.who} · {d.when}
              <br />
              {d.cargo}
              <br />
              {d.distance} · ETA {d.eta} · {d.total}
              <br />
              <em>{d.status}</em>
            </Popup>
          </Marker>
        );
      })}

      {selected && selected.path.length > 1 && <TruckMarker path={selected.path} />}
      <Framing deliveries={deliveries} selectedId={selectedId} />
    </MapContainer>
  );
});

export default DeliveryMap;
