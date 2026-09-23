// One-off data-prep script: streams the 647MB nationwide roads GeoJSON
// (philippines_all_roads.geojson, dropped at the project root) and writes
// out only the road segments relevant to the delivery corridor — never
// loads the whole 647MB file into memory at once.
//
// Run with:  node scripts/filter-roads.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import streamChainPkg from 'stream-chain';
import streamJsonPkg from 'stream-json';
import pickPkg from 'stream-json/filters/Pick.js';
import streamArrayPkg from 'stream-json/streamers/StreamArray.js';

const { chain } = streamChainPkg;
const { parser } = streamJsonPkg;
const { pick } = pickPkg;
const { streamArray } = streamArrayPkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const INPUT = path.join(ROOT, 'philippines_all_roads.geojson');
const OUTPUT = path.join(ROOT, 'data', 'davao-roads.geojson');

// Bounding box around the farm + all 6 delivery towns, with some padding
// (min longitude, min latitude, max longitude, max latitude).
const BBOX = { minLng: 125.25, minLat: 6.6, maxLng: 125.95, maxLat: 7.65 };

// Road classes worth keeping for an intercity shortest-path demo. Leaves
// out residential/footway/service/track — those would balloon the feature
// count with roads inside towns that don't matter for farm-to-town routing.
const KEEP_CLASSES = new Set([
  'motorway', 'motorway_link',
  'trunk', 'trunk_link',
  'primary', 'primary_link',
  'secondary', 'secondary_link',
  'tertiary', 'tertiary_link',
]);

function lineIntersectsBbox(coords) {
  for (const [lng, lat] of coords) {
    if (lng >= BBOX.minLng && lng <= BBOX.maxLng && lat >= BBOX.minLat && lat <= BBOX.maxLat) {
      return true;
    }
  }
  return false;
}

async function main() {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

  const out = fs.createWriteStream(OUTPUT, { encoding: 'utf8' });
  out.write('{"type":"FeatureCollection","features":[\n');

  let seen = 0;
  let kept = 0;
  let firstWritten = false;

  const pipeline = chain([
    fs.createReadStream(INPUT),
    parser(),
    pick({ filter: 'features' }),
    streamArray(),
  ]);

  await new Promise((resolve, reject) => {
    pipeline.on('data', ({ value: feature }) => {
      seen++;
      if (seen % 200000 === 0) {
        console.log(`  scanned ${seen.toLocaleString()} features, kept ${kept.toLocaleString()}...`);
      }

      const fclass = feature?.properties?.fclass;
      const geom = feature?.geometry;
      if (!fclass || !KEEP_CLASSES.has(fclass) || !geom) return;

      const lines = geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : null;
      if (!lines) return;
      if (!lines.some(lineIntersectsBbox)) return;

      const slim = {
        type: 'Feature',
        geometry: geom,
        properties: {
          osm_id: feature.properties.osm_id,
          fclass,
          name: feature.properties.name,
        },
      };

      out.write((firstWritten ? ',\n' : '') + JSON.stringify(slim));
      firstWritten = true;
      kept++;
    });
    pipeline.on('end', resolve);
    pipeline.on('error', reject);
  });

  out.write('\n]}\n');
  out.end();

  console.log(`\nScanned ${seen.toLocaleString()} features total.`);
  console.log(`Kept ${kept.toLocaleString()} road segments within the Davao corridor.`);
  console.log(`Written to ${path.relative(ROOT, OUTPUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
