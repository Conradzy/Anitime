import fs from 'node:fs';
import proj4 from 'proj4';

const source = JSON.parse(fs.readFileSync('public/uploads/regionxi roads/region xi boundary polygon.geojson', 'utf8'));
const rings = source.features.flatMap((feature) => feature.geometry.type === 'MultiPolygon'
  ? feature.geometry.coordinates.flat() : feature.geometry.coordinates);
// Reduce redundant survey vertices within 20 metres, retaining every island and hole.
function simplify(points) {
  const keep = new Set([0, points.length - 1]);
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    const [x, y] = points[start];
    const dx = points[end][0] - x, dy = points[end][1] - y;
    let furthest = -1, distance = 400;
    for (let i = start + 1; i < end; i++) {
      const t = Math.max(0, Math.min(1, ((points[i][0] - x) * dx + (points[i][1] - y) * dy) / (dx * dx + dy * dy || 1)));
      const d = (points[i][0] - x - t * dx) ** 2 + (points[i][1] - y - t * dy) ** 2;
      if (d > distance) { distance = d; furthest = i; }
    }
    if (furthest !== -1) { keep.add(furthest); stack.push([start, furthest], [furthest, end]); }
  }
  const result = [...keep].sort((a, b) => a - b).map((i) => points[i]);
  return result.length >= 4 ? result : points;
}
const coordinates = rings.map((ring) => simplify(ring).map((point) =>
  proj4('+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs', 'EPSG:4326', point).map((n) => Number(n.toFixed(6)))));
fs.writeFileSync('public/region-xi-boundary.geojson', JSON.stringify({ type: 'Feature', properties: { name: 'Region XI (Davao Region)' }, geometry: { type: 'MultiLineString', coordinates } }));
console.log(`Prepared ${coordinates.length} boundary rings.`);
