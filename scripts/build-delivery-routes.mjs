// One-off data-prep script: turns the filtered road GeoJSON
// (data/davao-roads.geojson, produced by scripts/filter-roads.mjs) into a
// routable graph, runs Dijkstra's algorithm from the farm to each of the
// buyer towns, and writes the resulting real-road-network routes to
// lib/delivery-routes.generated.ts for the app to import directly.
//
// Precomputing here (instead of shipping the whole road graph to the
// browser and running Dijkstra on every page load) keeps the client bundle
// small — the graph can have tens of thousands of nodes, which is way more
// than a page needs to download just to show five fixed delivery routes.
// lib/dijkstra.ts still has the same algorithm this script uses, for
// reference/explanation — it's just not re-run live in the browser here.
//
// Run with: node scripts/build-delivery-routes.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const INPUT = path.join(ROOT, 'data', 'davao-roads.geojson');
const GRAPH_DEBUG_OUTPUT = path.join(ROOT, 'data', 'davao-roads-graph.json');
const ROUTES_OUTPUT = path.join(ROOT, 'lib', 'delivery-routes.generated.ts');

// Same points of interest as lib/delivery-graph.ts.
const POINTS = {
  farm: { name: 'Santos Family Farm', lat: 7.352, lng: 125.652 },
  panabo: { name: 'Panabo', lat: 7.3079, lng: 125.6844 },
  carmen: { name: 'Carmen', lat: 7.4103, lng: 125.6994 },
  tagum: { name: 'Tagum', lat: 7.4478, lng: 125.8078 },
  stoTomas: { name: 'Sto. Tomas', lat: 7.5388, lng: 125.6172 },
  davaoCity: { name: 'Davao City', lat: 7.0731, lng: 125.6128 },
  digos: { name: 'Digos', lat: 6.7496, lng: 125.3572 },
};

const PLACE_NAME_TO_ID = {
  'Davao City': 'davaoCity',
  Panabo: 'panabo',
  Tagum: 'tagum',
  Digos: 'digos',
  'Sto. Tomas': 'stoTomas',
};

function haversineKm([lat1, lng1], [lat2, lng2]) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a1 = (lat1 * Math.PI) / 180;
  const a2 = (lat2 * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nodeKey(lng, lat) {
  // ~1.1m precision at this latitude — snaps genuinely-shared road
  // endpoints together without merging distinct nearby intersections.
  return `${lng.toFixed(5)},${lat.toFixed(5)}`;
}

// --- binary min-heap, for a proper O((V+E) log V) Dijkstra over a graph
// that can have tens of thousands of nodes (a linear scan would be too
// slow to comfortably re-run this script during development). ---
class MinHeap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent][0] <= a[i][0]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < a.length && a[l][0] < a[smallest][0]) smallest = l;
        if (r < a.length && a[r][0] < a[smallest][0]) smallest = r;
        if (smallest === i) break;
        [a[smallest], a[i]] = [a[i], a[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

function dijkstra(graph, start, end) {
  const dist = { [start]: 0 };
  const prev = {};
  const visited = new Set();
  const heap = new MinHeap();
  heap.push([0, start]);

  while (heap.size) {
    const [d, u] = heap.pop();
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === end) break;

    for (const [v, w] of Object.entries(graph[u] ?? {})) {
      const nd = d + w;
      if (dist[v] === undefined || nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        heap.push([nd, v]);
      }
    }
  }

  if (dist[end] === undefined) return null;
  const path = [];
  let node = end;
  while (node !== undefined) {
    path.unshift(node);
    node = prev[node];
  }
  return { path, totalDistance: dist[end] };
}

async function main() {
  console.log('Loading filtered roads...');
  const geojson = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  console.log(`  ${geojson.features.length.toLocaleString()} road segments`);

  const graph = {}; // nodeKey -> { neighborKey: weightKm }
  const nodeCoords = {}; // nodeKey -> [lat, lng]

  function addEdge(aKey, aLatLng, bKey, bLatLng) {
    const w = haversineKm(aLatLng, bLatLng);
    if (w === 0) return;
    graph[aKey] ??= {};
    graph[bKey] ??= {};
    if (graph[aKey][bKey] === undefined || w < graph[aKey][bKey]) graph[aKey][bKey] = w;
    if (graph[bKey][aKey] === undefined || w < graph[bKey][aKey]) graph[bKey][aKey] = w;
    nodeCoords[aKey] = aLatLng;
    nodeCoords[bKey] = bLatLng;
  }

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    const lines = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const [lng1, lat1] = line[i];
        const [lng2, lat2] = line[i + 1];
        addEdge(nodeKey(lng1, lat1), [lat1, lng1], nodeKey(lng2, lat2), [lat2, lng2]);
      }
    }
  }

  const nodeCount = Object.keys(graph).length;
  let edgeCount = 0;
  for (const n of Object.values(graph)) edgeCount += Object.keys(n).length;
  console.log(`Built graph: ${nodeCount.toLocaleString()} nodes, ${Math.round(edgeCount / 2).toLocaleString()} undirected edges`);

  function nearestNode(lat, lng) {
    let best = null;
    let bestDist = Infinity;
    for (const [key, coords] of Object.entries(nodeCoords)) {
      const d = haversineKm([lat, lng], coords);
      if (d < bestDist) {
        bestDist = d;
        best = key;
      }
    }
    return { key: best, distanceKm: bestDist };
  }

  console.log('\nSnapping points of interest to the road graph...');
  const snapped = {};
  for (const [id, p] of Object.entries(POINTS)) {
    const { key, distanceKm } = nearestNode(p.lat, p.lng);
    snapped[id] = key;
    console.log(`  ${p.name}: nearest road node is ${distanceKm.toFixed(2)} km away`);
  }

  console.log('\nRunning Dijkstra from the farm to each town...');
  const routes = {};
  for (const [placeName, placeId] of Object.entries(PLACE_NAME_TO_ID)) {
    const result = dijkstra(graph, snapped.farm, snapped[placeId]);
    if (!result) {
      console.log(`  ${placeName}: NOT REACHABLE — graph is disconnected between these points`);
      routes[placeName] = null;
      continue;
    }
    const path = result.path.map((key) => nodeCoords[key]);
    console.log(`  ${placeName}: ${result.totalDistance.toFixed(1)} km over ${result.path.length} road-graph nodes`);
    routes[placeName] = { path, distanceKm: Math.round(result.totalDistance * 10) / 10 };
  }

  const unreachable = Object.entries(routes).filter(([, r]) => r === null);
  if (unreachable.length) {
    console.log(
      `\n${unreachable.length} destination(s) unreachable: ${unreachable.map(([n]) => n).join(', ')}.` +
        ' The filtered road classes/bbox in scripts/filter-roads.mjs likely need widening.'
    );
  }

  fs.writeFileSync(
    ROUTES_OUTPUT,
    `// AUTO-GENERATED by scripts/build-delivery-routes.mjs — do not edit by hand.
// Real road-network shortest path (OpenStreetMap-derived roads, computed
// with Dijkstra's algorithm — see lib/dijkstra.ts for the same algorithm)
// from the farm to each buyer town. Regenerate with:
//   node scripts/filter-roads.mjs && node scripts/build-delivery-routes.mjs

export type DeliveryRoute = { path: [number, number][]; distanceKm: number };

export const DELIVERY_ROUTES: Record<string, DeliveryRoute | null> = ${JSON.stringify(routes, null, 2)};

export const FARM_LOCATION: [number, number] = [${POINTS.farm.lat}, ${POINTS.farm.lng}];
`
  );
  console.log(`\nWritten ${path.relative(ROOT, ROUTES_OUTPUT)}`);

  fs.writeFileSync(GRAPH_DEBUG_OUTPUT, JSON.stringify({ graph, nodeCoords }));
  console.log(`Full graph dumped to ${path.relative(ROOT, GRAPH_DEBUG_OUTPUT)} (for reference only, not imported by the app)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
