// CesiumJS loads its web workers, Draco/KTX2 decoders and default textures at
// runtime from a static folder (window.CESIUM_BASE_URL = '/cesium'). Bundlers
// don't copy those on their own, so this copies them into public/cesium.
// Runs automatically after `npm install` (see "postinstall" in package.json).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'node_modules', 'cesium', 'Build', 'Cesium');
const DEST = path.join(ROOT, 'public', 'cesium');
const MARKER = path.join(DEST, '.copied-version');

if (!fs.existsSync(SRC)) {
  console.log('[cesium] package not installed yet, skipping asset copy');
  process.exit(0);
}

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'cesium', 'package.json'), 'utf8')).version;
if (fs.existsSync(MARKER) && fs.readFileSync(MARKER, 'utf8') === version) {
  console.log(`[cesium] public/cesium already up to date (${version})`);
  process.exit(0);
}

fs.rmSync(DEST, { recursive: true, force: true });
for (const dir of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) {
  fs.cpSync(path.join(SRC, dir), path.join(DEST, dir), { recursive: true });
}
fs.writeFileSync(MARKER, version);
console.log(`[cesium] copied runtime assets to public/cesium (${version})`);
