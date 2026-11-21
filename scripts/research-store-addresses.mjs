import fs from 'node:fs/promises';

// One-time reverse geocoding of the user-supplied shop pins; not a page-load request.
const results = [];
for (const file of (await fs.readdir('lib/stores')).filter(name => name.endsWith('.json')).sort()) {
  const store = JSON.parse(await fs.readFile(`lib/stores/${file}`, 'utf8'));
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${store.lat}&lon=${store.lng}&zoom=18&addressdetails=1&accept-language=en`;
  const response = await fetch(url, { headers: { 'User-Agent': 'AniTime-Store-Address-Research/1.0 (+https://github.com/Conradzy/Anitime)' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Reverse geocoder returned ${response.status}`);
  const data = await response.json();
  results.push({ id: store.id, query: { lat: store.lat, lng: store.lng }, source: url, address: data.address, displayName: data.display_name, osmType: data.osm_type, osmId: data.osm_id });
  console.log(JSON.stringify(results.at(-1)));
  await new Promise(resolve => setTimeout(resolve, 1100));
}
await fs.writeFile('lib/store-address-research.json', JSON.stringify({ attribution: '© OpenStreetMap contributors', results }, null, 2) + '\n');
