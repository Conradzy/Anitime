'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { getDevicePosition, reverseGeocode, searchPlaces, type PickedLocation, type PlacePoint, type PlaceSuggestion } from '@/lib/geo';
import styles from './LocationPicker.module.css';

const PH_CENTER: [number, number] = [12.8797, 121.774];

const pinIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#a7c641;border:3px solid #062f24;box-shadow:0 6px 12px -4px rgba(6,47,36,.6)"></span>',
  iconSize: [22, 22],
  iconAnchor: [3, 22],
});

function ClickToPlace({ onPlace }: { onPlace: (p: PlacePoint) => void }) {
  useMapEvents({ click: (e) => onPlace({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FlyTo({ point, zoom }: { point: PlacePoint | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.flyTo([point.lat, point.lng], zoom, { duration: 0.8 });
  }, [map, point, zoom]);
  return null;
}

/** Full-screen map overlay for choosing where the farm is: tap the map, drag
 * the pin, search a place, or use the device's current location. */
export default function LocationPicker({
  initial,
  onCancel,
  onConfirm,
  title = 'Select location',
}: {
  initial: { lat: number; lng: number } | null;
  onCancel: () => void;
  onConfirm: (loc: PickedLocation) => void;
  title?: string;
}) {
  const [point, setPoint] = useState<PlacePoint | null>(initial);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [flyZoom, setFlyZoom] = useState(13);
  const lookupId = useRef(0);

  // Live search: suggestions appear as you type. A short pause after the last
  // keystroke keeps this to about one request per burst of typing (the free
  // OpenStreetMap service asks for that), and a newer search cancels an older one.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      const reset = setTimeout(() => {
        setResults([]);
        setSearching(false);
      }, 0);
      return () => clearTimeout(reset);
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchPlaces(q, ctl.signal);
        setResults(found);
        setActive(-1);
        setErr(found.length === 0 ? 'No places found. Try a town, barangay or landmark.' : '');
      } catch (e) {
        if ((e as { name?: string })?.name !== 'AbortError') setErr('Search is unavailable right now. You can still tap the map.');
      } finally {
        if (!ctl.signal.aborted) setSearching(false);
      }
    }, 380);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query]);

  function choose(r: PlaceSuggestion) {
    place({ lat: r.lat, lng: r.lng }, r.label, 16);
    setQuery(r.label);
    setListOpen(false);
    setResults([]);
  }

  // Name the chosen spot; ignore answers for a pin that has since moved.
  async function place(p: PlacePoint, knownLabel?: string, zoom = 13) {
    setPoint(p);
    setFlyZoom(zoom);
    setErr('');
    if (knownLabel) {
      setLabel(knownLabel);
      return;
    }
    const id = ++lookupId.current;
    setLabel('Finding place name…');
    const name = await reverseGeocode(p);
    if (id === lookupId.current) setLabel(name);
  }

  async function useMyLocation() {
    setBusy(true);
    setErr('');
    try {
      await place(await getDevicePosition(), undefined, 16);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not get your location.');
    } finally {
      setBusy(false);
    }
  }

  const ready = point && label && label !== 'Finding place name…';

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.head}>
          <div>
            <h3 className={styles.title}>{title}</h3>
            <p className={styles.hint}>Type to search, then tap the map or drag the pin to fine-tune it. Or use your current location.</p>
          </div>
          <button type="button" className={styles.close} onClick={onCancel} aria-label="Close">×</button>
        </div>

        <div className={styles.tools}>
          <div className={styles.searchBox}>
            <div className={styles.searchRow}>
              <span className={styles.searchIcon} aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <circle cx="9" cy="9" r="5.6" />
                  <path d="M13.2 13.2 17 17" />
                </svg>
              </span>
              <input
                className={styles.searchInput}
                placeholder="Search a place — town, barangay, shop, landmark"
                value={query}
                role="combobox"
                aria-expanded={listOpen && results.length > 0}
                aria-controls="place-suggestions"
                aria-autocomplete="list"
                autoComplete="off"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setListOpen(true);
                }}
                onFocus={() => setListOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && results.length) {
                    e.preventDefault();
                    setActive((i) => (i + 1) % results.length);
                  } else if (e.key === 'ArrowUp' && results.length) {
                    e.preventDefault();
                    setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const pick = results[active >= 0 ? active : 0];
                    if (pick) choose(pick);
                  } else if (e.key === 'Escape' && listOpen) {
                    e.stopPropagation();
                    setListOpen(false);
                  }
                }}
              />
              {searching && <span className={styles.searchSpin} aria-label="Searching" />}
              {query && !searching && (
                <button
                  type="button"
                  className={styles.searchClear}
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery('');
                    setResults([]);
                  }}
                >
                  ×
                </button>
              )}
            </div>

            {listOpen && results.length > 0 && (
              <ul className={styles.suggest} id="place-suggestions" role="listbox">
                {results.map((r, i) => (
                  <li key={`${r.lat},${r.lng},${i}`} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      className={i === active ? styles.suggestOn : styles.suggestItem}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(r)}
                    >
                      <span className={styles.suggestPin} aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 18s6-5.2 6-9.6A6 6 0 0 0 4 8.4C4 12.8 10 18 10 18z" />
                          <circle cx="10" cy="8.4" r="2.2" />
                        </svg>
                      </span>
                      <span className={styles.suggestText}>
                        <span className={styles.suggestName}>{r.label}</span>
                        <span className={styles.suggestDetail}>{r.detail}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" className={styles.locate} onClick={useMyLocation} disabled={busy}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="10" cy="10" r="3" />
              <circle cx="10" cy="10" r="7" />
              <path d="M10 1.5v2.5M10 16v2.5M1.5 10H4M16 10h2.5" />
            </svg>
            Use my current location
          </button>
        </div>

        <div className={styles.mapBox}>
          <MapContainer center={initial ? [initial.lat, initial.lng] : PH_CENTER} zoom={initial ? 13 : 6} className={styles.map} zoomControl>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ClickToPlace onPlace={(p) => { setListOpen(false); place(p); }} />
            <FlyTo point={point} zoom={flyZoom} />
            {point && (
              <Marker
                position={[point.lat, point.lng]}
                icon={pinIcon}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const ll = (e.target as L.Marker).getLatLng();
                    place({ lat: ll.lat, lng: ll.lng });
                  },
                }}
              />
            )}
          </MapContainer>
        </div>

        {err && <div className={styles.err}>{err}</div>}

        <div className={styles.foot}>
          <div className={styles.picked}>
            {point ? (
              <>
                <div className={styles.pickedLabel}>{label}</div>
                <div className={styles.pickedCoords}>{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</div>
              </>
            ) : (
              <div className={styles.pickedCoords}>No location selected yet</div>
            )}
          </div>
          <button type="button" className={styles.ghost} onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className={styles.confirm}
            disabled={!ready}
            onClick={() => point && onConfirm({ ...point, label })}
          >
            Use this location
          </button>
        </div>
      </div>
    </div>
  );
}
