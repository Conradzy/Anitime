// Real driving routes for the "route to this product" map.
//
// Uses the public OSRM demo server (OpenStreetMap road data, no API key).
// It is meant for light use, which is what one route per opened listing is.
// If it can't find a road route (for example the two places are on different
// islands) or can't be reached, a straight-line estimate is returned and
// labelled as such, so the numbers are never silently wrong.

export type LatLng = { lat: number; lng: number };

export type RouteResult = {
  km: number;
  /** [lat, lng] points along the road, ready for a map polyline. */
  path: [number, number][];
  source: 'road' | 'straight';
};

const EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in kilometers. */
export function straightLineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

function straight(from: LatLng, to: LatLng): RouteResult {
  // Roads are longer than the crow flies; 1.3 is a common planning factor.
  return {
    km: straightLineKm(from, to) * 1.3,
    path: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ],
    source: 'straight',
  };
}

export async function fetchRoadRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<RouteResult> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return straight(from, to);
    const data = (await res.json()) as {
      code?: string;
      routes?: { distance: number; geometry: { coordinates: [number, number][] } }[];
    };
    const r = data.routes?.[0];
    if (data.code !== 'Ok' || !r) return straight(from, to);
    return {
      km: r.distance / 1000,
      path: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      source: 'road',
    };
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    return straight(from, to);
  }
}

/** Keeps at most `max` points of a long route (always the first and last), so
 * a stored route stays a few KB instead of hundreds. Shape is preserved. */
export function thinPath(path: [number, number][], max = 300): [number, number][] {
  if (path.length <= max) return path;
  const step = (path.length - 1) / (max - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < max - 1; i++) out.push(path[Math.round(i * step)]);
  out.push(path[path.length - 1]);
  return out;
}
