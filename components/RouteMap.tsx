'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLng } from '@/lib/routing';

const dot = (color: string, size: number) =>
  L.divIcon({
    className: '',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #062f24;box-shadow:0 4px 10px -3px rgba(6,47,36,.6)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

function FitTo({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [34, 34], maxZoom: 15 });
    else if (points.length === 1) map.setView(points[0], 13);
  }, [map, points]);
  return null;
}

/** Road route between the user and a product, drawn on OpenStreetMap. */
export default function RouteMap({
  from,
  to,
  path,
  fromLabel,
  toLabel,
  approximate,
}: {
  from: LatLng;
  to: LatLng;
  path: [number, number][];
  fromLabel: string;
  toLabel: string;
  /** Straight-line fallback: draw it dashed so it isn't mistaken for a road. */
  approximate?: boolean;
}) {
  const points: [number, number][] = path.length > 1 ? path : [[from.lat, from.lng], [to.lat, to.lng]];

  return (
    <MapContainer
      center={[from.lat, from.lng]}
      zoom={10}
      style={{ height: '100%', width: '100%', background: '#eef1e6' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline
        positions={points}
        pathOptions={{
          color: '#2f6b45',
          weight: 5,
          opacity: 0.95,
          lineCap: 'round',
          dashArray: approximate ? '9 9' : undefined,
        }}
      />
      <Marker position={[from.lat, from.lng]} icon={dot('#a7c641', 20)}>
        <Tooltip permanent direction="top" offset={[0, -10]}>
          {fromLabel}
        </Tooltip>
      </Marker>
      <Marker position={[to.lat, to.lng]} icon={dot('#062f24', 20)}>
        <Tooltip permanent direction="top" offset={[0, -10]}>
          {toLabel}
        </Tooltip>
      </Marker>
      <FitTo points={points} />
    </MapContainer>
  );
}
