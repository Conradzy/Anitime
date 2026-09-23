// Small browser-side helpers for the "farm location" picker.
// Place names come from OpenStreetMap's Nominatim service (free, no key; keep
// requests light — it is meant for occasional lookups, not bulk use).

export type PlacePoint = { lat: number; lng: number };
export type PickedLocation = PlacePoint & { label: string };

/** Asks the browser for the device's position (the browser shows its own
 * "allow location?" prompt). Requires https or localhost. */
export function getDevicePosition(): Promise<PlacePoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This browser does not support location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('Location is blocked. Allow it for this site in your browser settings, then try again.'));
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(new Error('Your device could not work out its location. Turn on location services and try again.'));
        } else {
          reject(new Error('Getting your location took too long. Please try again.'));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

type NominatimAddress = Record<string, string | undefined>;

function labelFromAddress(a: NominatimAddress | undefined, fallback: string): string {
  if (!a) return fallback;
  const place = a.city || a.town || a.village || a.municipality || a.suburb || a.county;
  const region = a.state || a.province || a.region;
  const parts = [place, region].filter(Boolean);
  return parts.length ? parts.join(', ') : fallback;
}

const coordLabel = (p: PlacePoint) => `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;

/** Turns a map point into a readable place name ("Tagum, Davao del Norte"). */
export async function reverseGeocode(p: PlacePoint): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=en&lat=${p.lat}&lon=${p.lng}`
    );
    if (!res.ok) return coordLabel(p);
    const data = (await res.json()) as { address?: NominatimAddress; display_name?: string };
    return labelFromAddress(data.address, data.display_name?.split(',').slice(0, 2).join(',') ?? coordLabel(p));
  } catch {
    return coordLabel(p);
  }
}

export type PlaceSuggestion = PickedLocation & {
  /** The rest of the address, shown under the name in the suggestion list. */
  detail: string;
};

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string; street?: string; housenumber?: string; district?: string; locality?: string;
    city?: string; county?: string; state?: string; postcode?: string; countrycode?: string;
  };
};

/** Suggestions from Photon (OpenStreetMap data, free, no key). Unlike a plain
 * search it matches PARTIAL words, so "davao cit" already finds Davao City —
 * which is what a type-as-you-go box needs. Limited to the Philippines. */
async function photonSearch(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const res = await fetch(
    `https://photon.komoot.io/api/?limit=6&lang=en&bbox=116,4,127.5,21.5&q=${encodeURIComponent(query)}`,
    { signal }
  );
  if (!res.ok) throw new Error('Place search is unavailable right now.');
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties;
    if (p.countrycode && p.countrycode !== 'PH') continue;
    const [lng, lat] = f.geometry.coordinates;
    const area = p.city || p.county || p.locality || p.district;
    const name = p.name || p.street || area;
    if (!name) continue;
    const line1 = [p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street, p.district && p.district !== name ? p.district : null]
      .filter(Boolean)
      .join(', ');
    const rest = [area && area !== name ? area : null, p.state].filter(Boolean).join(', ');
    const label = [name, rest].filter(Boolean).join(', ');
    // several map features share a name (roads split into segments): keep one per spot
    const key = `${label}|${lat.toFixed(2)}|${lng.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ lat, lng, label, detail: [line1, rest, p.postcode].filter(Boolean).join(' · ') || label });
  }
  return out;
}

/** Nominatim: fallback if Photon is unavailable. Only matches whole words. */
async function nominatimSearch(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=ph&accept-language=en&q=${encodeURIComponent(query)}`,
    { signal }
  );
  if (!res.ok) throw new Error('Place search is unavailable right now.');
  const rows = (await res.json()) as { lat: string; lon: string; display_name: string; name?: string; address?: NominatimAddress }[];
  return rows.map((r) => {
    const parts = r.display_name.split(',').map((x) => x.trim());
    const short = labelFromAddress(r.address, parts.slice(0, 2).join(', '));
    return {
      lat: Number(r.lat),
      lng: Number(r.lon),
      label: r.name && r.name !== parts[0] ? `${r.name}, ${short}` : short,
      detail: parts.slice(0, 5).join(', '),
    };
  });
}

/** Live "type to find it" search. Pass an AbortSignal so a newer keystroke can
 * cancel the previous request. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  try {
    return await photonSearch(query, signal);
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    return nominatimSearch(query, signal);
  }
}
