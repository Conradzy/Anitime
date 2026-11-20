'use client';

import { useEffect, useState } from 'react';
import { GeoJSON } from 'react-leaflet';
import type { GeoJsonObject } from 'geojson';

export default function RegionBoundary() {
  const [data, setData] = useState<GeoJsonObject | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/region-xi-boundary.geojson', { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Boundary unavailable'); return response.json(); })
      .then(setData)
      .catch((error) => { if (error.name !== 'AbortError') console.error('Region XI boundary:', error); });
    return () => controller.abort();
  }, []);
  return data ? <GeoJSON data={data} interactive={false} style={{ color: '#A7C641', weight: 3, opacity: 0.9, fill: false }} /> : null;
}
