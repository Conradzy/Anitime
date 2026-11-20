import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const province = process.argv[2];
const allowed = ['davao del norte', 'davao city', 'davao del sur', 'davao de oro', 'davao occidental', 'davao oriental'];
if (!allowed.includes(province)) throw new Error(`Choose: ${allowed.join(', ')}`);
const raw = fs.readFileSync(`public/uploads/regionxi roads/${province}.geojson`);
const source = JSON.parse(raw);
if (!source.crs?.properties.name.endsWith('CRS84')) throw new Error('Expected WGS84 longitude/latitude');
const drivable = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'track', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
const roads = [];
for (const feature of source.features) {
  const p = feature.properties;
  if (!drivable.has(p.highway) || p.construction || p['disused:highway']) continue;
  const access = p.motorcar || p.motor_vehicle || p.vehicle || p.access;
  if (['no', 'private', 'agricultural', 'forestry'].includes(access)) continue;
  const one = String(p.oneway || '').toLowerCase();
  const direction = one === '-1' ? -1 : ['yes', '1', 'true'].includes(one) || (!one && p.junction === 'roundabout') ? 1 : 0;
  const lines = feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.type === 'MultiLineString' ? feature.geometry.coordinates : [];
  for (const line of lines) {
    if (line.length < 2 || line.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat) || lng < 120 || lng > 128 || lat < 4 || lat > 10)) throw new Error('Invalid road geometry');
    roads.push([direction, line.map(([lng, lat]) => [lng, lat])]);
  }
}
fs.mkdirSync('routing-data', { recursive: true });
const output = { province, sourceSha256: createHash('sha256').update(raw).digest('hex'), weight: 'distance-km', roads };
const file = `routing-data/${province.replaceAll(' ', '-')}.json.gz`;
fs.writeFileSync(file, gzipSync(JSON.stringify(output), { level: 9 }));
console.log(`${province}: ${roads.length} drivable road lines, ${fs.statSync(file).size} bytes`);
