# Region XI routing data

Each `.json.gz` file enables one province (or Davao City) in the shared server routing graph. Files are generated from the user's local GeoJSON exports with:

```sh
node scripts/build-region-roads.mjs "davao del norte"
node scripts/test-region-routing.mjs
```

The generator reads `public/uploads/regionxi roads/<name>.geojson`, keeps drivable roads and original coordinates, excludes forbidden/private motor access, and records a SHA-256 of the source. Large raw exports remain local. Generated files are included in Next.js deployment traces; browsers receive only the resulting route.

Routing uses distance in kilometres as the edge weight and directed edges for one-way roads. Shared vertices join roads across province files. Crossings without shared vertices are not joined, avoiding invented bridge/tunnel junctions. This is a shortest-distance network, not live traffic or fastest-time routing. These exports do not include turn-restriction relations; vehicle dimensions and conditional restrictions are not modeled.

Endpoints snap to the nearest road vertex within 300 metres. Returned paths start and end on those road vertices. Disconnected networks, distant endpoints, or missing data fall back to OSRM and then the existing explicitly labeled straight-line estimate. No artificial links are inserted across gaps or water.

Listing previews and newly agreed deliveries use the network. Already stored delivery routes are preserved. Stores currently offers map exploration; it does not have a route-generation form.
