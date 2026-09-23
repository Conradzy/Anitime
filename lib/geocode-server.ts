import type { LatLng } from '@/lib/routing';

/** Finds coordinates for a Philippine place name, server-side.
 *
 * Uses OpenStreetMap's Nominatim, which asks for an identifying User-Agent and
 * at most about one request a second — fine for one lookup when a listing is
 * posted or a deal is agreed. Returns null when nothing matches. */
export async function geocodePlace(label: string): Promise<LatLng | null> {
  const parts = label.split(',').map((p) => p.trim()).filter(Boolean);
  const attempts = [label, parts.slice(0, 2).join(', '), parts[0]].filter((a, i, arr) => a && arr.indexOf(a) === i);
  for (const q of attempts) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': 'AniTime/1.0 (farm marketplace capstone)', Accept: 'application/json' }, signal: AbortSignal.timeout(6000) }
      );
      if (!res.ok) continue;
      const rows = (await res.json()) as { lat: string; lon: string }[];
      if (rows[0]) return { lat: Number(rows[0].lat), lng: Number(rows[0].lon) };
    } catch {
      // network hiccup: try the next, shorter query
    }
  }
  return null;
}
